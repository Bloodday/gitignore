// ────────────────────────────────────────────────────────────────────────────
//  El Ludus: patio de entrenamiento con estaciones, y el controlador que
//  coloca y anima a cada gladiador según su actividad.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';
import { Avatar } from './model.js';
import { Animator } from './animator.js';
import { mat, T } from './materials.js';
import { sandTex, flameTex, softCircle } from './textures.js';
import { STATS } from './data.js';

const V = THREE.Vector3;
export const LUDUS_Z = 112;
export const LUDUS_CENTER = new V(0, 0, LUDUS_Z);

function rep(t, x, y) { const c = t.clone(); c.repeat.set(x, y); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; }

// posiciones de las estaciones en coordenadas locales
export const STATIONS = {
  str: { pos: new V(-11.5, 0, -3.5), face: Math.PI * 0.5 },
  agi: { pos: new V(11, 0, -4.5), face: 0 },
  vit: { pos: new V(-12.5, 0, 6.5), face: Math.PI * 0.5 },
  tec: { pos: new V(11.5, 0, 6.5), face: -Math.PI * 0.5 },
  wil: { pos: new V(0, 0, -10.5), face: 0 },
  rest: { pos: new V(0, 0, 9.5), face: Math.PI },
};

export class LudusWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(0, 0, LUDUS_Z);
    scene.add(this.group);
    this.flames = [];
    this.lights = [];
    this.buildGround();
    this.buildPorticos();
    this.buildBackWall();
    this.buildStations();
    this.buildDecor();
    this.buildRoad();
  }
  add(o) { this.group.add(o); return o; }

  buildGround() {
    const sand = sandTex(512, '#cfa878');
    const m = new THREE.MeshStandardNodeMaterial({ color: '#fff', map: rep(sand.map, 9, 7), normalMap: rep(sand.normalMap, 9, 7), roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 34), m);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; this.add(floor);
    // losas de piedra bajo el santuario
    const st = mat('stone');
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.18, 32), new THREE.MeshStandardNodeMaterial({ color: '#d9c9a8', map: T().stone.map, normalMap: T().stone.normalMap, roughness: 0.9 }));
    slab.position.set(0, 0.09, -10.5); slab.receiveShadow = true; this.add(slab);
    // borde
    const curb = new THREE.Mesh(new THREE.BoxGeometry(46.6, 0.3, 0.4), st);
    for (const z of [17.2]) { const c = curb.clone(); c.position.set(0, 0.15, z); this.add(c); }
    // camino de arena compacta hacia la puerta
    const path = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), new THREE.MeshStandardNodeMaterial({ color: '#b89566', map: rep(sand.map, 2, 10), roughness: 1 }));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.03, -34); path.receiveShadow = true; this.add(path);
  }

  buildPorticos() {
    const stone = mat('stone');
    const tile = this.tileMaterial();
    const plaster = mat('plaster');
    for (const side of [-1, 1]) {
      const x = side * 21;
      // muro de barracones con puertas
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.6, 34), plaster); wall.position.set(side * 24.2, 2.8, 0); wall.castShadow = true; wall.receiveShadow = true; this.add(wall);
      for (let i = 0; i < 6; i++) {
        const z = -13.5 + i * 5.4;
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.0, 1.9), mat('wood', '#4a2e18')); door.position.set(side * 23.5, 1.5, z); this.add(door);
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 14, 1, false, 0, Math.PI), mat('wood', '#4a2e18')); arch.rotation.set(0, 0, Math.PI / 2); arch.rotation.y = 0; arch.position.set(side * 23.5, 3.0, z); arch.rotation.set(Math.PI / 2, 0, Math.PI / 2); this.add(arch);
      }
      // columnas
      for (let i = 0; i < 9; i++) {
        const z = -16 + i * 4;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 4.6, 14), stone); c.position.set(side * 20.6, 2.3, z); c.castShadow = true; c.receiveShadow = true; this.add(c);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 1.0), stone); cap.position.set(side * 20.6, 4.75, z); cap.castShadow = true; this.add(cap);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), stone); base.position.set(side * 20.6, 0.15, z); this.add(base);
      }
      // arquitrabe y tejado inclinado
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 34), stone); beam.position.set(side * 20.6, 5.1, 0); beam.castShadow = true; this.add(beam);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.25, 35), tile);
      roof.position.set(side * 22.4, 5.9, 0); roof.rotation.z = -side * 0.26; roof.castShadow = true; roof.receiveShadow = true; this.add(roof);
      // bancos bajo el pórtico
      for (let i = 0; i < 3; i++) { const b = this.bench(); b.position.set(side * 22.6, 0, -8 + i * 8); b.rotation.y = side * Math.PI / 2; this.add(b); }
    }
  }

  tileMaterial() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#b5552f'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a24a28' : '#c2643a'; g.fillRect(i * 16, 0, 14, 128); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * 16 + 14, 0, 2, 128); }
    for (let j = 0; j < 8; j++) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, j * 16, 128, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 10);
    return new THREE.MeshStandardNodeMaterial({ map: t, roughness: 0.85 });
  }

  bench() {
    const g = new THREE.Group();
    const w = mat('wood', '#6a4a2a');
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.6), w); seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
    for (const x of [-1.3, 1.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.5), w); l.position.set(x, 0.25, 0); l.castShadow = true; g.add(l); }
    return g;
  }

  buildBackWall() {
    // muro hacia el coliseo con gran puerta
    const stone = mat('stone');
    const z = -17.5;
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(18, 3.6, 1.4), stone); w.position.set(side * 13.8, 1.8, z); w.castShadow = true; w.receiveShadow = true; this.add(w);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.4, 1.4), stone); lintel.position.set(0, 4.3, z); lintel.castShadow = true; this.add(lintel);
    // arco de medio punto sobre la puerta
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.4, 8, 28, Math.PI), stone); arch.position.set(0, 3.6, z + 0.3); arch.castShadow = true; this.add(arch);
    // torres
    for (const side of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 6.6, 18), stone); t.position.set(side * 5.8, 3.3, z); t.castShadow = true; t.receiveShadow = true; this.add(t);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.1, 0.8, 18), stone); top.position.set(side * 5.8, 7.0, z); top.castShadow = true; this.add(top);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), stone); m.position.set(side * 5.8 + Math.cos(a) * 2.3, 7.8, z + Math.sin(a) * 2.3); this.add(m); }
    }
    // reja de la puerta
    const iron = new THREE.MeshStandardNodeMaterial({ color: '#2b2824', metalness: 0.9, roughness: 0.5 });
    for (let i = -3; i <= 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), iron); b.position.set(i * 1.05, 4.2, z + 0.2); this.add(b); }
    // estandartes
    const cloth = mat('cloth', '#8a1420');
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), cloth); b.position.set(side * 8.4, 2.0, z + 0.78); b.castShadow = true; this.add(b);
      const gold = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.1), mat('gold')); gold.position.set(side * 8.4, 3.65, z + 0.8); this.add(gold);
    }
    // antorchas
    for (const side of [-1, 1]) this.torch(side * 3.6, 0, z + 1.6);
  }

  torch(x, y, z, h = 2.6) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 8), new THREE.MeshStandardNodeMaterial({ color: '#2a2420', metalness: 0.8, roughness: 0.5 }));
    stand.position.set(x, y + h / 2, z); stand.castShadow = true; this.add(stand);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.14, 0.26, 12, 1, true), stand.material); bowl.material.side = THREE.DoubleSide; bowl.position.set(x, y + h, z); this.add(bowl);
    const fm = this.flameMat || (this.flameMat = new THREE.SpriteNodeMaterial({ map: flameTex(128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flameMat.fog = false;
    const sp = new THREE.Sprite(fm); sp.scale.set(1.2, 1.8, 1); sp.position.set(x, y + h + 0.8, z); this.add(sp);
    const gm = this.glowMat || (this.glowMat = new THREE.SpriteNodeMaterial({ map: softCircle(64), color: '#ff8a30', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glowMat.fog = false;
    const gl = new THREE.Sprite(gm); gl.scale.set(4.2, 4.2, 1); gl.position.set(x, y + h + 0.7, z); this.add(gl);
    this.flames.push({ sp, gl, ph: Math.random() * 10 });
  }

  buildStations() {
    const stone = mat('stone'), wood = mat('wood'), iron = mat('iron');
    const S = STATIONS;
    // STR: rack de piedras y pesas
    {
      const g = new THREE.Group(); g.position.copy(S.str.pos);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 5), wood); rack.position.set(-2.4, 0.3, 0); rack.castShadow = true; g.add(rack);
      [0.5, 0.65, 0.8, 0.55].forEach((r, i) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r * 0.75, 14, 10), mat('rock', '#9b8f80')); s.position.set(-2.4, 0.6 + r * 0.72, -1.8 + i * 1.3); s.castShadow = true; g.add(s); });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), iron); bar.rotation.z = Math.PI / 2; bar.position.set(2.3, 0.24, 2.0); g.add(bar);
      for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 16), iron); d.rotation.z = Math.PI / 2; d.position.set(2.3 + s * 0.95, 0.4, 2.0); d.castShadow = true; g.add(d); }
      this.add(g);
    }
    // AGI: vallas y escalera de suelo
    {
      const g = new THREE.Group(); g.position.copy(S.agi.pos);
      for (let i = 0; i < 4; i++) {
        const a = -0.6 + i * 0.52, r = 4.2;
        for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), wood); p.position.set(Math.cos(a * 2.6 + 4.7) * r + s * 0.6, 0.45, Math.sin(a * 2.6 + 4.7) * r); g.add(p); }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), mat('cloth', i % 2 ? '#f0e4c8' : '#a8202a')); bar.position.set(Math.cos(a * 2.6 + 4.7) * r, 0.8, Math.sin(a * 2.6 + 4.7) * r); bar.rotation.y = -(a * 2.6 + 4.7) + Math.PI / 2; bar.castShadow = true; g.add(bar);
      }
      for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.12), wood); r.position.set(0.0, 0.06, -1.5 + i * 0.6); g.add(r); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.5, 48), new THREE.MeshBasicNodeMaterial({ color: '#f0e4c8', transparent: true, opacity: 0.35 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
      this.add(g);
    }
    // VIT: sacos y barriles
    {
      const g = new THREE.Group(); g.position.copy(S.vit.pos);
      const sack = new THREE.MeshStandardNodeMaterial({ color: '#b39a6a', roughness: 1, map: T().cloth.map });
      for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), sack); s.scale.set(1, 0.75, 0.8); s.position.set(-2.8 + (i % 3) * 0.9, 0.4 + Math.floor(i / 3) * 0.55, -1.5 + (i % 2) * 0.4); s.rotation.y = i; s.castShadow = true; g.add(s); }
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 1.0, 12), wood); b.position.set(-3.0 + i * 1.0, 0.5, 2.2); b.castShadow = true; g.add(b); for (const y of [0.25, 0.75]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 6, 16), iron); r.rotation.x = Math.PI / 2; r.position.set(-3.0 + i * 1.0, y, 2.2); g.add(r); } }
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.9, 16, 1, true), stone); well.material.side = THREE.DoubleSide; well.position.set(2.6, 0.45, -2.4); well.castShadow = true; g.add(well);
      const wat = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), new THREE.MeshStandardNodeMaterial({ color: '#2a5a7a', roughness: 0.1, metalness: 0.2 })); wat.rotation.x = -Math.PI / 2; wat.position.set(2.6, 0.7, -2.4); g.add(wat);
      this.add(g);
    }
    // TEC: palus y maniquíes
    {
      const g = new THREE.Group(); g.position.copy(S.tec.pos);
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Group(); p.position.set(3.4, 0, -3.6 + i * 2.4);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.1, 10), wood); post.position.y = 1.05; post.castShadow = true; p.add(post);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), wood); arm.rotation.z = Math.PI / 2; arm.position.y = 1.55; p.add(arm);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardNodeMaterial({ color: '#c8b27a', roughness: 1 })); head.position.y = 2.0; head.castShadow = true; p.add(head);
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.9, 10), new THREE.MeshStandardNodeMaterial({ color: '#b89c62', roughness: 1, map: T().cloth.map })); torso.position.y = 1.45; p.add(torso);
        g.add(p);
      }
      // estante de armas
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 3), wood); rack.position.set(-2.4, 0.7, 0); g.add(rack);
      for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.1), mat('wood', '#c8a878')); s.position.set(-2.2, 1.0, -1.1 + i * 0.7); s.rotation.z = 0.15; g.add(s); }
      this.add(g);
    }
    // WIL: santuario de Némesis
    {
      const g = new THREE.Group(); g.position.copy(S.wil.pos);
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 3.2), stone); base.position.set(0, 0.25, -2.4); base.castShadow = true; g.add(base);
      for (const x of [-1.2, 1.2]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.4, 12), stone); c.position.set(x, 2.2, -2.4); c.castShadow = true; g.add(c); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 1.2), stone); top.position.set(0, 4.1, -2.4); top.castShadow = true; g.add(top);
      const ped = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 3), stone); ped.rotation.set(0, Math.PI / 2, Math.PI / 2); ped.scale.set(1, 1, 0.3); ped.position.set(0, 4.65, -2.4); g.add(ped);
      // estatua de Némesis (dorada)
      const gold = mat('gold');
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 1.7, 10), gold); body.position.set(0, 1.4, -2.4); body.castShadow = true; g.add(body);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), gold); hd.position.set(0, 2.45, -2.4); g.add(hd);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.7), gold); w.position.set(s * 0.5, 2.0, -2.6); w.rotation.z = s * 0.35; g.add(w); }
      // esteras y pebetero
      for (const x of [-2.2, 0, 2.2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 1.4), mat('cloth', '#3a4a7a')); m.position.set(x, 0.05, 0.8); m.rotation.y = 0.1 * x; m.receiveShadow = true; g.add(m); }
      this.add(g);
      this.torch(S.wil.pos.x - 3.3, 0, S.wil.pos.z - 0.4, 2.0); this.torch(S.wil.pos.x + 3.3, 0, S.wil.pos.z - 0.4, 2.0);
    }
    // REST: bancos y abrevadero + toldo
    {
      const g = new THREE.Group(); g.position.copy(S.rest.pos);
      for (const x of [-3.2, 3.2]) { const b = this.bench(); b.position.set(x, 0, 0.5); g.add(b); }
      const tr = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 0.9), wood); tr.position.set(0, 0.3, 2.6); tr.castShadow = true; g.add(tr);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshStandardNodeMaterial({ color: '#2a6a8a', roughness: 0.05, metalness: 0.3 })); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.58, 2.6); g.add(water);
      this.add(g);
    }
  }

  buildDecor() {
    // fuente central-izquierda
    const stone = mat('stone');
    // cipreses alrededor
    const tm = new THREE.MeshStandardNodeMaterial({ color: '#2e4a2a', roughness: 0.95 });
    const tree = new THREE.ConeGeometry(0.9, 7, 7); tree.translate(0, 3.5, 0);
    const im = new THREE.InstancedMesh(tree, tm, 26);
    const o = new THREE.Object3D();
    let i = 0;
    for (const side of [-1, 1]) for (let k = 0; k < 11; k++) { o.position.set(side * (27 + (k % 2) * 3), 0, -18 + k * 3.6 + (k % 3)); o.scale.setScalar(0.8 + (k % 4) * 0.2); o.updateMatrix(); im.setMatrixAt(i++, o.matrix); }
    for (let k = 0; k < 4; k++) { o.position.set(-14 + k * 9, 0, 21); o.scale.setScalar(1.1 + k * 0.1); o.updateMatrix(); im.setMatrixAt(i++, o.matrix); }
    im.castShadow = true; this.add(im);
    // antorchas en el patio
    for (const [x, z] of [[-17, -12], [17, -12], [-17, 12], [17, 12], [0, 15]]) this.torch(x, 0, z, 2.6);
    // carro de heno
    const wood = mat('wood');
    const cart = new THREE.Group(); cart.position.set(-17, 0, 13);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 1.8), wood); bed.position.y = 0.9; cart.add(bed);
    for (const z of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 16), wood); w.rotation.x = Math.PI / 2; w.position.set(0, 0.75, z * 1.0); cart.add(w); }
    const hay = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 1.5), new THREE.MeshStandardNodeMaterial({ color: '#d8b860', roughness: 1 })); hay.position.y = 1.55; cart.add(hay);
    cart.rotation.y = 0.5; cart.traverse(m => { if (m.isMesh) m.castShadow = true; }); this.add(cart);
    // pancartas
    const banner = mat('cloth', '#7a1a22');
    for (const [x, z] of [[-24, -17.4], [24, -17.4]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(2, 6), banner); b.position.set(x, 5.2, z + 0.8); this.add(b); }
    // hierba exterior
    const gt = T().grass;
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardNodeMaterial({ color: '#fff', map: rep(gt.map, 100, 100), normalMap: rep(gt.normalMap, 100, 100), roughness: 1 }));
    gr.rotation.x = -Math.PI / 2; gr.position.y = -0.03; gr.receiveShadow = true; this.add(gr);
  }

  buildRoad() {
    // camino empedrado entre el ludus y el coliseo (en coordenadas de mundo)
    const sand = sandTex(512, '#bf9a6a');
    const m = new THREE.MeshStandardNodeMaterial({ color: '#fff', map: rep(sand.map, 3, 30), normalMap: rep(sand.normalMap, 3, 30), roughness: 1 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 62), m);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, 52 + 0); road.receiveShadow = true; this.scene.add(road);
    // hitos de piedra con llama
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 8), mat('stone')); p.position.set(s * 5.2, 0.8, 26 + k * 10); p.castShadow = true; this.scene.add(p);
    }
  }

  update(dt, t) {
    for (const f of this.flames) {
      const k = 0.92 + Math.sin(t * 11 + f.ph) * 0.07 + Math.sin(t * 23 + f.ph * 2) * 0.05;
      f.sp.scale.set(1.15 * k, 1.8 * (0.9 + Math.sin(t * 9 + f.ph) * 0.12), 1);
    }
  }
}

// ── controlador de gladiadores en el patio ──────────────────────────────────
export class LudusCrowd {
  constructor(engine, world, fx, audio) {
    this.eng = engine; this.world = world; this.fx = fx; this.audio = audio;
    this.entries = new Map();
    this.tagsLayer = document.getElementById('tags-layer');
    this.onSelect = null;
    this.selected = null;
    this.time = 0;
    this.props = {};
    this.buildProps();
  }
  buildProps() {
    // objetos que se acoplan a los gladiadores según la actividad
    this.stoneGeo = new THREE.SphereGeometry(0.3, 14, 10);
    this.stoneMat = mat('rock', '#9b8f80');
    this.sackGeo = new THREE.SphereGeometry(0.3, 10, 8);
    this.sackMat = new THREE.MeshStandardNodeMaterial({ color: '#b39a6a', roughness: 1 });
  }

  worldPos(local) { return new V(local.x, 0, local.z + LUDUS_Z); }

  sync(gladiators, game) {
    const ids = new Set(gladiators.map(g => g.id));
    for (const [id, e] of this.entries) if (!ids.has(id)) { this.removeEntry(e); this.entries.delete(id); }
    for (const g of gladiators) {
      let e = this.entries.get(g.id);
      if (!e) { e = this.createEntry(g); this.entries.set(g.id, e); }
      e.g = g;
    }
    // asigna ranuras por estación
    const counts = {};
    for (const g of gladiators) {
      const act = g.wounded > 0 ? 'rest' : g.activity;
      const e = this.entries.get(g.id);
      const n = (counts[act] = (counts[act] ?? -1) + 1);
      e.act = act; e.slot = n;
      e.target = this.slotPos(act, n, gladiators.filter(x => (x.wounded > 0 ? 'rest' : x.activity) === act).length);
    }
  }

  slotPos(act, n, total) {
    const st = STATIONS[act] || STATIONS.rest;
    const p = st.pos.clone();
    let face = st.face;
    const spread = 2.4;
    switch (act) {
      case 'str': p.x += 0.3; p.z += (n - (total - 1) / 2) * spread; face = -Math.PI * 0.5 * -1; face = Math.PI * 0.5; break;
      case 'agi': p.copy(st.pos); face = 0; break; // corren en círculo
      case 'vit': p.x += -0.2; p.z += (n - (total - 1) / 2) * spread + 0.3; face = 0; break;
      case 'tec': p.x += 1.9; p.z += -3.6 + n * 2.4; face = Math.PI * 0.5; p.x = st.pos.x + 3.4 - 1.35; break;
      case 'wil': p.x += (n - (total - 1) / 2) * 2.2; p.z += 1.5; face = Math.PI; break;
      default: p.x += (n - (total - 1) / 2) * 1.8; p.z += -0.4; face = Math.PI + (n % 2 ? 0.4 : -0.4); break;
    }
    return { pos: this.worldPos(p), face, station: this.worldPos(st.pos), n, total };
  }

  createEntry(g) {
    const avatar = new Avatar(g);
    const anim = new Animator(avatar);
    anim.mode = 'display';
    avatar.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.eng.scene.add(avatar.root);
    const spawn = this.worldPos(new V((Math.random() - 0.5) * 6, 0, 14));
    avatar.root.position.copy(spawn);
    const el = document.createElement('div');
    el.className = 'gtag';
    el.innerHTML = `<div class="gn"></div><div class="gb"><div class="gbf"></div></div>`;
    el.addEventListener('click', () => this.select(g.id));
    this.tagsLayer.appendChild(el);
    return { g, avatar, anim, el, name: el.querySelector('.gn'), bar: el.querySelector('.gbf'), pos: spawn.clone(), yaw: Math.PI, act: 'rest', mode: '', stone: null, sack: null, runA: Math.random() * 6, appear: 0 };
  }
  removeEntry(e) {
    this.eng.scene.remove(e.avatar.root); e.avatar.dispose(); e.el.remove();
  }
  rebuild(id) {
    const e = this.entries.get(id); if (!e) return;
    e.avatar.g = e.g; e.avatar.rebuild(); e.anim.setLoadout();
    e.avatar.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    e.stone = null; e.sack = null;
  }
  select(id) { this.selected = id; if (this.onSelect) this.onSelect(id); }
  getEntry(id) { return this.entries.get(id); }

  pick(ev, camera, dom) {
    const r = dom.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 2 - 1, y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), camera);
    let best = null, bd = 1e9;
    for (const [id, e] of this.entries) {
      const c = e.avatar.root.position.clone(); c.y += 0.9;
      const sp = new THREE.Sphere(c, 0.95);
      const hit = ray.ray.intersectSphere(sp, new V());
      if (hit) { const d = hit.distanceTo(camera.position); if (d < bd) { bd = d; best = id; } }
    }
    return best;
  }

  update(dt, t, camera, w, h, game) {
    this.time = t;
    const tmp = new V();
    for (const [id, e] of this.entries) {
      const g = e.g, av = e.avatar, an = e.anim, tgt = e.target;
      if (!tgt) continue;
      e.appear = Math.min(1, e.appear + dt * 1.2);
      // movimiento hacia la ranura
      let wantPos = tgt.pos.clone(); let wantYaw = tgt.face;
      const moving = e.pos.distanceTo(wantPos) > 0.25 && !(e.act === 'agi' && e.pos.distanceTo(tgt.station) < 4.6 && e.runMode);
      if (e.act === 'agi') {
        // carrera circular alrededor de la estación
        const c = tgt.station; const R = 3.6; const inRing = Math.abs(e.pos.distanceTo(c) - R) < 0.6;
        if (inRing || e.runMode) {
          e.runMode = true; e.runA += dt * (0.75 + (g.stats.agi * 0.004));
          wantPos.set(c.x + Math.cos(e.runA + tgt.n * 2) * R, 0, c.z + Math.sin(e.runA + tgt.n * 2) * R);
          const ahead = new V(c.x + Math.cos(e.runA + tgt.n * 2 + 0.3) * R, 0, c.z + Math.sin(e.runA + tgt.n * 2 + 0.3) * R);
          wantYaw = Math.atan2(ahead.x - wantPos.x, ahead.z - wantPos.z) + 0;
          e.pos.lerp(wantPos, Math.min(1, dt * 8));
          e.yaw = wantYaw;
          an.mode = 'train:agi';
        } else { e.runMode = false; }
      } else e.runMode = false;
      if (!e.runMode || e.act !== 'agi') {
        const d = tmp.subVectors(wantPos, e.pos); const dist = d.length();
        if (dist > 0.15) {
          const sp = Math.min(dist, 3.0 * dt * (dist > 6 ? 1.4 : 1));
          d.normalize().multiplyScalar(sp);
          e.pos.add(d);
          const ty = Math.atan2(d.x, d.z);
          let dy = ty - e.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
          e.yaw += dy * Math.min(1, dt * 8);
        } else {
          let dy = wantYaw - e.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
          e.yaw += dy * Math.min(1, dt * 5);
        }
      }
      const arrived = e.pos.distanceTo(wantPos) <= 0.3 || e.runMode;
      // modo de animación
      let mode;
      if (!arrived) mode = 'combat';
      else if (g.wounded > 0) mode = 'train:wil';
      else mode = g.activity === 'rest' ? 'train:rest' : 'train:' + g.activity;
      if (an.mode !== mode) { an.mode = mode; an.t = 0; }
      av.root.position.set(e.pos.x, 0, e.pos.z);
      av.root.rotation.y = e.yaw;
      const spd = !arrived ? 2.2 : 0;
      an.update(dt, spd);
      // accesorios
      this.updateProps(e, arrived, t);
      // partículas de ambiente por actividad
      if (arrived && Math.random() < dt * 1.6) this.ambientFx(e);
      // etiqueta
      this.updateTag(e, camera, w, h, game);
    }
  }

  updateProps(e, arrived, t) {
    const B = e.avatar.bones;
    const act = arrived && e.g.wounded <= 0 ? e.g.activity : 'none';
    if (act === 'str') {
      if (!e.stone) { e.stone = new THREE.Mesh(this.stoneGeo, this.stoneMat); e.stone.castShadow = true; B.chest.add(e.stone); }
      const k = (Math.sin(e.anim.t * 1.7) + 1) / 2, ee = k * k * (3 - 2 * k);
      e.stone.visible = true; e.stone.scale.setScalar(1.25);
      e.stone.position.set(0, 0.3 - 0.95 + ee * 1.55, 0.36 - ee * 0.26);
    } else if (e.stone) e.stone.visible = false;
    if (act === 'vit') {
      if (!e.sack) { e.sack = new THREE.Mesh(this.sackGeo, this.sackMat); e.sack.scale.set(1.2, 0.8, 0.9); e.sack.castShadow = true; B.chest.add(e.sack); }
      e.sack.visible = true; e.sack.position.set(0, 0.06, 0.3);
    } else if (e.sack) e.sack.visible = false;
  }

  ambientFx(e) {
    const p = e.avatar.root.position, fx = this.fx;
    switch (e.g.wounded > 0 ? 'w' : e.g.activity) {
      case 'str': fx.dust(new V(p.x, 0, p.z), 1, 0.4, 0.4); break;
      case 'agi': fx.dust(new V(p.x, 0, p.z), 1, 0.6, 0.5); break;
      case 'tec': fx.spark(new V(p.x + Math.sin(e.yaw) * 1.3, 1.3, p.z + Math.cos(e.yaw) * 1.3), new V((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), { life: 0.3, s0: 0.1, s1: 0, color: '#ffe0a0', grav: 6 }); break;
      case 'wil': fx.spark(new V(p.x + (Math.random() - 0.5) * 0.6, 0.8, p.z + (Math.random() - 0.5) * 0.6), new V(0, 0.8, 0), { life: 1.6, s0: 0.12, s1: 0, color: '#c8a0ff', grav: -0.2 }); break;
      case 'w': fx.spark(new V(p.x, 1.9, p.z), new V(0, 0.5, 0), { life: 1.2, s0: 0.16, s1: 0, color: '#ff6a6a', grav: -0.1 }); break;
      default: break;
    }
  }

  updateTag(e, camera, w, h, game) {
    const g = e.g;
    const p = new V(e.pos.x, (e.avatar.height || 1.8) + 0.3, e.pos.z);
    p.project(camera);
    const vis = p.z < 1 && p.z > 0 && this.visible;
    e.el.style.display = vis ? '' : 'none';
    if (!vis) return;
    e.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    const act = g.wounded > 0 ? 'w' : g.activity;
    const icons = { str: '💪', agi: '🏃', vit: '❤️', tec: '🎯', wil: '🔥', rest: '💤', w: '🩹' };
    const label = `${icons[act]} ${g.name}`;
    if (e._label !== label + g.level) { e._label = label + g.level; e.name.innerHTML = `<span class="lv">${g.level}</span>${label}`; }
    let prog = 0;
    if (g.wounded > 0) prog = 1 - Math.min(1, g.wounded / 120);
    else if (g.activity !== 'rest') prog = g.prog[g.activity];
    else prog = 1 - g.fatigue / 100;
    e.bar.style.width = (Math.min(1, prog) * 100).toFixed(0) + '%';
    e.bar.style.background = g.wounded > 0 ? '#e0566a' : g.activity === 'rest' ? '#6fd18a' : '';
    e.el.classList.toggle('sel', this.selected === g.id);
    e.el.classList.toggle('tired', g.fatigue > 70 && g.activity !== 'rest');
  }

  setVisible(v) {
    this.visible = v;
    for (const e of this.entries.values()) { e.avatar.root.visible = v; if (!v) e.el.style.display = 'none'; }
  }
}
