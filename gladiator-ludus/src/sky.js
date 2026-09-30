// Cúpula de cielo procedural dirigida artísticamente (atardecer romano).
import * as THREE from 'three/webgpu';
import { positionLocal, normalize, dot, uniform, mix, smoothstep, pow, max, vec2, vec3, texture, time, float, clamp, abs } from 'three/tsl';
import { cloudTex } from './textures.js';

export function makeSkyMaterial(sunDir, { disc = true } = {}) {
  const dir = normalize(positionLocal);
  const h = dir.y;
  const u = {
    zenith: uniform(new THREE.Color('#1d2f63')),
    mid: uniform(new THREE.Color('#b0607a')),
    horizon: uniform(new THREE.Color('#ffb070')),
    ground: uniform(new THREE.Color('#3a2a22')),
    sunColor: uniform(new THREE.Color('#ffc890')),
    cloudLit: uniform(new THREE.Color('#ffd0a0')),
    cloudDark: uniform(new THREE.Color('#5a3450')),
    sunDir: uniform(sunDir.clone()),
    cover: uniform(0.5),
  };
  const sd = max(dot(dir, u.sunDir), 0);
  const up = clamp(h, 0, 1);
  let col = mix(u.horizon, u.mid, smoothstep(0.0, 0.22, up));
  col = mix(col, u.zenith, smoothstep(0.16, 0.85, up));
  // halo solar
  col = col.add(u.sunColor.mul(pow(sd, 6).mul(0.45).add(pow(sd, 40).mul(0.7))));
  if (disc) col = col.add(u.sunColor.mul(smoothstep(0.9990, 0.9996, sd).mul(40)));
  // nubes proyectadas sobre un plano alto
  const cuv = dir.xz.div(up.add(0.18)).mul(0.35);
  const tex = cloudTex();
  const c1 = texture(tex, cuv.add(vec2(time.mul(0.004), 0))).r;
  const c2 = texture(tex, cuv.mul(2.3).add(vec2(time.mul(-0.006), 0.37))).r;
  const dens = clamp(c1.mul(0.75).add(c2.mul(0.45)).sub(float(1).sub(u.cover).mul(0.6)), 0, 1).mul(smoothstep(0.0, 0.12, up));
  const sunSide = pow(sd, 3);
  const cloudCol = mix(u.cloudDark, u.cloudLit, clamp(sunSide.mul(1.4).add(c2.mul(0.25)), 0, 1)).mul(1.15);
  col = mix(col, cloudCol, dens.mul(0.85));
  // bajo el horizonte
  col = mix(col, u.ground, smoothstep(0.0, -0.06, h));
  const mat = new THREE.NodeMaterial();
  mat.colorNode = col;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.fog = false;
  mat.toneMapped = true;
  return { mat, u };
}
