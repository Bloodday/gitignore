// ────────────────────────────────────────────────────────────────────────────
//  Motor de render: WebGPURenderer + pipeline de postproceso TSL
//  (bloom HDR, aberración cromática, viñeta, gradación de color, grano).
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';
import {
  pass, uniform, float, vec2, vec3, vec4, screenUV, smoothstep, mix, luminance, length, pow, max, min, time, clamp,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { makeSkyMaterial } from './sky.js';

export const QUALITY = [
  { name: 'Baja', pr: 1, shadow: 1024, bloom: true, crowd: 0.45, ao: false },
  { name: 'Media', pr: 1.5, shadow: 2048, bloom: true, crowd: 0.75, ao: false },
  { name: 'Alta', pr: 2, shadow: 4096, bloom: true, crowd: 1, ao: false },
];

export class Engine {
  async init(canvasParent, quality = 1) {
    this.quality = quality;
    this.canvasParent = canvasParent;
    const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: new URLSearchParams(location.search).has('webgl') });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    canvasParent.appendChild(renderer.domElement);
    await renderer.init();
    this.backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2500);
    this.camera.position.set(0, 6, 20);
    this.scene.add(this.camera);

    this.setupSky();
    this.setupLights();
    this.setupPost();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    this.resize();
    const Q = QUALITY[q];
    if (this.sun) {
      this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  resize() {
    const Q = QUALITY[this.quality];
    const w = this.canvasParent.clientWidth || window.innerWidth;
    const h = this.canvasParent.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
  }

  // ── cielo + iluminación basada en imagen ────────────────────────────────
  setupSky() {
    this.sunDir = new THREE.Vector3(0, 0.3, -1).normalize();
    const { mat, u } = makeSkyMaterial(this.sunDir, { disc: true });
    this.skyU = u;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.sky.scale.setScalar(1500);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envScene = new THREE.Scene();
    const env = makeSkyMaterial(this.sunDir, { disc: false });
    this.envU = env.u;
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), env.mat);
    this.envSky.scale.setScalar(100);
    this.envScene.add(this.envSky);
  }

  /** elevation: 0..1 (fracción de 90º), azimuth en grados */
  setSun(elevation = 0.25, azimuth = 215, tint = '#ffb878', palette = null) {
    const phi = THREE.MathUtils.degToRad(90 - elevation * 90);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.sun.color.set(tint);
    this.sunTint = new THREE.Color(tint);
    const pal = palette || {};
    for (const U of [this.skyU, this.envU]) {
      U.sunDir.value.copy(this.sunDir);
      U.sunColor.value.set(tint);
      if (pal.zenith) U.zenith.value.set(pal.zenith);
      if (pal.mid) U.mid.value.set(pal.mid);
      if (pal.horizon) U.horizon.value.set(pal.horizon);
    }
    if (pal.fog) this.fog.color.set(pal.fog);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.9;
  }

  setupLights() {
    const sun = new THREE.DirectionalLight(0xffc088, 4.2);
    sun.castShadow = true;
    const Q = QUALITY[this.quality];
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    const s = 34;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 220 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunFocus = new THREE.Vector3();
    this.hemi = new THREE.HemisphereLight(0x9bb4d8, 0x5a4330, 0.55);
    this.scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xd9b48c, 0.0016);
    this.scene.fog = this.fog;
  }

  updateSun(focus) {
    this.sunFocus.lerp(focus, 0.1);
    this.sun.target.position.copy(this.sunFocus);
    this.sun.position.copy(this.sunFocus).addScaledVector(this.sunDir, 110);
  }

  // ── postproceso ─────────────────────────────────────────────────────────
  setupPost() {
    this.u = {
      flash: uniform(0),
      flashColor: uniform(new THREE.Color(1, 1, 1)),
      aberration: uniform(0.0006),
      vignette: uniform(0.55),
      desat: uniform(0),
      red: uniform(0),
      exposure: uniform(1),
      bloomStrength: uniform(0.42),
      blur: uniform(0),
    };
    const u = this.u;
    const scenePass = pass(this.scene, this.camera);
    const col = scenePass.getTextureNode('output');
    const bl = bloom(col, 0.3, 0.5, 1.0);
    this.bloomNode = bl;
    bl.strength = u.bloomStrength;
    let out = col.add(bl);
    // aberración cromática (aumenta con impactos)
    const shifted = rgbShift(out, u.aberration, 0.6);
    out = shifted;
    // gradación de color cinematográfica: sombras frías, luces cálidas, saturación variable
    const lum = luminance(out.rgb);
    let rgb = out.rgb;
    rgb = mix(vec3(lum), rgb, float(1.12).sub(u.desat.mul(0.9)));
    const shadowsTint = vec3(0.92, 0.97, 1.06), lightsTint = vec3(1.06, 1.0, 0.92);
    rgb = rgb.mul(mix(shadowsTint, lightsTint, smoothstep(0.0, 1.2, lum)));
    // viñeta
    const d = length(screenUV.sub(0.5)).mul(1.35);
    const vig = float(1).sub(smoothstep(0.35, 1.05, d).mul(u.vignette));
    rgb = rgb.mul(vig).mul(u.exposure);
    // destello de impacto / velo rojo
    rgb = mix(rgb, u.flashColor.mul(1.6), u.flash.clamp(0, 1));
    rgb = rgb.add(vec3(0.35, 0.0, 0.02).mul(u.red).mul(smoothstep(0.3, 1.0, d)));
    let final = vec4(rgb, 1);
    final = film(final, 0.14);
    this.post = new THREE.RenderPipeline(this.renderer);
    this.post.outputNode = final;
    this.scenePass = scenePass;
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.post.render();
  }
}
