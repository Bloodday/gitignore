// ────────────────────────────────────────────────────────────────────────────
//  Modelo procedural de gladiador: esqueleto de grupos + mallas generadas
//  por código (torsos de revolución, extrusiones, armas, cascos, escudos…).
//  Todo se funde por material para mantener bajo el número de draw-calls.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, glow } from './materials.js';
import { RARITY, BASES } from './data.js';

const V3 = THREE.Vector3;
const E = new THREE.Euler();
const Q = new THREE.Quaternion();
const M4 = new THREE.Matrix4();

// ── ensamblador de geometrías fundidas ──────────────────────────────────────
export class Part {
  constructor() { this.map = new Map(); }
  add(geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], order = 'XYZ') {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    Q.setFromEuler(E.set(rot[0], rot[1], rot[2], order));
    M4.compose(new V3(pos[0], pos[1], pos[2]), Q, new V3(scl[0], scl[1], scl[2]));
    g.applyMatrix4(M4);
    if (!this.map.has(material)) this.map.set(material, []);
    this.map.get(material).push(g);
    return this;
  }
  build({ cast = true, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const [material, geos] of this.map) {
      const merged = mergeGeometries(geos, false);
      const m = new THREE.Mesh(merged, material);
      m.castShadow = cast; m.receiveShadow = receive;
      grp.add(m);
    }
    return grp;
  }
}

// ── geometrías base ─────────────────────────────────────────────────────────
const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

/** Miembro con taper y abultamiento muscular. Origen en la articulación, extiende hacia -Y */
function limbGeo(len, r0, r1, bulge = 0.012, seg = 10, radial = 14) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const r = r0 + (r1 - r0) * t + bulge * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.3;
    pts.push(new THREE.Vector2(Math.max(0.004, r), -len * t));
  }
  pts.reverse(); // de abajo hacia arriba: normales hacia fuera
  return new THREE.LatheGeometry(pts, radial);
}
function latheProfile(pts, radial = 24) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), radial);
}

function bladeShape(len, w, tipK = 0.78) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(-w / 2, len * tipK);
  s.quadraticCurveTo(-w / 2 * 0.6, len * 0.95, 0, len);
  s.quadraticCurveTo(w / 2 * 0.6, len * 0.95, w / 2, len * tipK);
  s.lineTo(w / 2, 0); s.closePath();
  return s;
}
function extrude(shape, depth, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function sicaShape(len, w, curve) {
  const s = new THREE.Shape();
  const n = 14;
  const back = [], front = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = t * len;
    const x = curve * t * t; // curva hacia +x
    const ww = w * (1 - t * 0.85) * 0.5;
    back.push([x - ww, y]); front.push([x + ww + 0.012 * (1 - t), y]);
  }
  s.moveTo(back[0][0], back[0][1]);
  for (const p of back) s.lineTo(p[0], p[1]);
  for (let i = front.length - 1; i >= 0; i--) s.lineTo(front[i][0], front[i][1]);
  s.closePath();
  return s;
}

// ── dimensiones ─────────────────────────────────────────────────────────────
const H = { hip: 0.98, thigh: 0.49, shin: 0.48, spine: 0.06, chestY: 0.30, shoulderY: 0.24, neckY: 0.27, upper: 0.32, fore: 0.29 };

/** Construye el esqueleto como jerarquía de Groups. */
function buildRig() {
  const g = (name, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Group(); root.name = 'root';
  const B = { root };
  B.hips = g('hips', root, 0, H.hip, 0);
  B.spine = g('spine', B.hips, 0, H.spine, 0);
  B.chest = g('chest', B.spine, 0, H.chestY, 0);
  B.neck = g('neck', B.chest, 0, H.neckY, 0);
  B.head = g('head', B.neck, 0, 0.03, 0);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    B['sh' + s] = g('sh' + s, B.chest, sx * 0.31, H.shoulderY, 0);
    B['el' + s] = g('el' + s, B['sh' + s], 0, -H.upper, 0);
    B['hand' + s] = g('hand' + s, B['el' + s], 0, -H.fore, 0);
    B['hip' + s] = g('hip' + s, B.hips, sx * 0.095, -0.02, 0);
    B['knee' + s] = g('knee' + s, B['hip' + s], 0, -H.thigh, 0);
    B['ankle' + s] = g('ankle' + s, B['knee' + s], 0, -H.shin, 0);
  }
  return B;
}

const tmpColor = new THREE.Color();

// ── Avatar ──────────────────────────────────────────────────────────────────
export class Avatar {
  /**
   * @param {object} g datos del gladiador
   * @param {object} opts { boss, scale }
   */
  constructor(g, opts = {}) {
    this.g = g;
    this.look = g.look;
    this.boss = g.isBoss ? g.isBoss.id : null;
    this.sizeMul = opts.scale || (g.isBoss ? g.isBoss.size : 1);
    this.bones = buildRig();
    this.root = new THREE.Group();
    this.root.add(this.bones.root);
    this.dyn = []; // grupos de equipo reemplazables
    this.tips = {}; // puntas de arma para estelas
    this.glowMats = [];
    this.buildBody();
    this.buildEquipment();
    const h = this.look.height * this.sizeMul;
    this.bones.root.scale.setScalar(h);
    this.hipBase = H.hip;
    this.height = 1.95 * h;
    this.root.traverse(o => { if (o.isMesh) { o.frustumCulled = true; } });
  }

  clearDyn() {
    for (const d of this.dyn) { d.parent?.remove(d); d.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.dyn = [];
    this.tips = {};
  }
  attach(bone, obj) { bone.add(obj); this.dyn.push(obj); return obj; }

  // ── cuerpo base ──────────────────────────────────────────────────────────
  buildBody() {
    const L = this.look, B = this.bones, boss = this.boss;
    const f = L.female;
    const bw = L.build * (f ? 0.92 : 1);
    let skinCol = L.skin;
    if (boss === 'cyclops') skinCol = '#8c9a78';
    if (boss === 'minotaur') skinCol = '#5e3a26';
    if (boss === 'golem') skinCol = '#8e8376';
    const skin = boss === 'golem' ? mat('rock', '#9b8f80') : mat('skin', skinCol);
    this.skinMat = skin;
    const body = new Part();

    // torso de revolución (pelvis → cuello), escala elíptica
    const sw = (f ? 0.92 : 1.08) * bw, hw = (f ? 1.06 : 0.98) * bw;
    const torso = latheProfile([
      [0.075, 0.0], [0.135, 0.01], [0.145, 0.05], [0.128, 0.14], [0.14, 0.22], [0.175, 0.31], [0.205, 0.39], [0.212, 0.46], [0.16, 0.53], [0.075, 0.575], [0.001, 0.58],
    ], 32);
    torso.scale(1.52 * sw, 1, 0.84 * (f ? 0.94 : 1));
    // pelvis
    const pelvis = latheProfile([[0.001, -0.14], [0.11, -0.12], [0.17, -0.04], [0.17, 0.05], [0.14, 0.09], [0.001, 0.1]], 20);
    pelvis.scale(1.38 * hw, 1, 0.86);
    body.add(pelvis, skin, [0, 0, 0]);
    const spinePart = new Part();
    spinePart.add(torso, skin, [0, 0.0, 0]);
    // pectorales y abdomen marcados
    if (!f) {
      for (const s of [-1, 1]) spinePart.add(sphere(0.085, 14, 10), skin, [s * 0.078 * sw * 1.1, 0.41 - H.chestY + 0.3, 0.092], [0, 0, 0], [1.15, 0.85, 0.6]);
      for (let r = 0; r < 3; r++) for (const s of [-1, 1]) spinePart.add(sphere(0.042, 10, 8), skin, [s * 0.04, 0.15 + r * 0.055, 0.118], [0, 0, 0], [1, 0.75, 0.5]);
    } else {
      for (const s of [-1, 1]) spinePart.add(sphere(0.062, 14, 10), skin, [s * 0.07, 0.385, 0.1], [0, 0, 0], [1, 0.95, 0.75]);
    }
    // surcos de musculatura (abdominales y pectorales)
    {
      const dk = new THREE.Color(skinCol).multiplyScalar(0.62).getStyle();
      const gm = mat('skin', new THREE.Color(skinCol).multiplyScalar(0.62).getHexString().padStart(6, '0').replace(/^/, '#'));
      if (!f) {
        spinePart.add(box(0.008, 0.22, 0.012), gm, [0, 0.2, 0.131]);
        for (let r = 0; r < 4; r++) spinePart.add(box(0.11, 0.008, 0.012), gm, [0, 0.11 + r * 0.055, 0.132]);
        for (const sd of [-1, 1]) spinePart.add(box(0.16, 0.009, 0.012), gm, [sd * 0.1, 0.355, 0.12], [0, 0, sd * 0.12]);
      }
    }
    // cuello y trapecios
    const neckPart = new Part();
    neckPart.add(cyl(0.05, 0.065, 0.12, 12), skin, [0, 0.04, 0]);
    for (const sd of [-1, 1]) neckPart.add(sphere(0.09, 12, 8), skin, [sd * 0.11, -0.03, -0.01], [0, 0, sd * -0.5], [1.6, 0.6, 1.1]);
    // cabeza
    const head = new Part();
    const hr = 0.105;
    head.add(sphere(hr, 24, 16), skin, [0, 0.1, 0], [0, 0, 0], [0.92, 1.08, 1.0]);
    head.add(sphere(0.07, 12, 10), skin, [0, 0.03, 0.045], [0, 0, 0], [1.05, 0.85, 1.0]); // mandíbula
    head.add(box(0.05, 0.03, 0.03), skin, [0, 0.08, 0.098], [0.25, 0, 0]); // nariz
    for (const s of [-1, 1]) {
      head.add(sphere(0.022, 8, 6), skin, [s * 0.098, 0.095, -0.005], [0, 0, 0], [0.5, 1, 0.8]); // orejas
      head.add(sphere(0.019, 8, 6), mat('dark'), [s * 0.04, 0.117, 0.088]); // ojos
      head.add(box(0.05, 0.008, 0.012), mat('hair', L.hairColor), [s * 0.038, 0.14, 0.09], [0, 0, -s * 0.12]); // cejas
    }
    if (L.scar) head.add(box(0.008, 0.06, 0.004), mat('skin', '#b87a6a'), [-0.04, 0.12, 0.099], [0, 0, 0.3]);
    this.addHairAndBeard(head, boss);
    if (boss) this.addBossHead(head, boss);

    const spineG = spinePart.build();
    B.spine.add(spineG);
    const pg = body.build(); B.hips.add(pg);
    const ng = neckPart.build(); B.neck.add(ng);
    const hg = head.build(); B.head.add(hg);
    this.headGroup = hg;
    if (boss && boss !== 'cyclops') hg.visible = false;

    const lb = bw * 1.22, lg = bw * 1.36;
    // extremidades
    const sr = f ? 0.92 : 1;
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const arm = new Part();
      arm.add(sphere(0.085 * lb * sr, 16, 12), skin, [0, -0.01, 0], [0, 0, 0], [1, 1.1, 1]);
      arm.add(limbGeo(H.upper, 0.058 * lb * sr, 0.042 * lb * sr, 0.026 * lb), skin);
      B['sh' + s].add(arm.build());
      const fore = new Part();
      fore.add(sphere(0.046 * lb * sr, 12, 8), skin, [0, 0, 0]);
      fore.add(limbGeo(H.fore, 0.046 * lb * sr, 0.034 * lb * sr, 0.012 * lb), skin);
      B['el' + s].add(fore.build());
      const hand = new Part();
      hand.add(sphere(0.05, 12, 8), skin, [0, -0.045, 0], [0, 0, 0], [1, 1.15, 0.8]);
      hand.add(box(0.05, 0.02, 0.012), skin, [sx * 0.0, -0.085, 0.022]);
      B['hand' + s].add(hand.build());
      // pierna
      const thigh = new Part();
      thigh.add(sphere(0.088 * lg * sr * (f ? 1.04 : 1), 14, 10), skin, [0, 0.0, 0]);
      thigh.add(limbGeo(H.thigh, 0.086 * lg * sr * (f ? 1.04 : 1), 0.056 * lg * sr, 0.036 * lg), skin);
      B['hip' + s].add(thigh.build());
      const shin = new Part();
      shin.add(sphere(0.06 * lg * sr, 12, 8), skin, [0, 0, 0]);
      shin.add(limbGeo(H.shin, 0.058 * lg * sr, 0.038 * lg * sr, 0.036 * lg), skin);
      B['knee' + s].add(shin.build());
      const foot = new Part();
      foot.add(box(0.09, 0.04, 0.2), skin, [0, -0.02, 0.05]);
      const sole = mat('leather', '#5a3820');
      foot.add(box(0.1, 0.018, 0.25), sole, [0, -0.05, 0.06]);
      for (let i = 0; i < 4; i++) foot.add(new THREE.TorusGeometry(0.05, 0.007, 5, 12), sole, [0, -0.015, -0.02 + i * 0.05], [0, Math.PI / 2, 0], [1, 1, 1.3]);
      foot.add(new THREE.TorusGeometry(0.052, 0.008, 5, 12), sole, [0, 0.03, -0.03], [Math.PI / 2, 0, 0]);
      B['ankle' + s].add(foot.build());
    }
    for (const sd of ['L', 'R']) { B['hand' + sd].scale.setScalar(1.18); B['ankle' + sd].scale.setScalar(1.12); }
    B.head.scale.setScalar(1.12);
    // taparrabos
    const cloth = mat('cloth', L.tunic);
    const loin = new Part();
    loin.add(box(0.24, 0.3, 0.012), cloth, [0, -0.15, 0.135], [-0.05, 0, 0]);
    loin.add(box(0.24, 0.26, 0.012), cloth, [0, -0.13, -0.125], [0.05, 0, 0]);
    loin.add(cyl(0.175, 0.17, 0.05, 20), mat('leather', '#3d2412'), [0, 0.02, 0], [0, 0, 0], [1.22, 1, 0.84]);
    loin.add(cyl(0.025, 0.025, 0.012, 12), mat('bronze'), [0, 0.02, 0.145 * 0.84 + 0.045], [Math.PI / 2, 0, 0]);
    B.hips.add(loin.build());
  }

  addHairAndBeard(head, boss) {
    if (boss) return;
    const L = this.look;
    const hair = mat('hair', L.hairColor);
    const helmless = true;
    this.hairPart = new Part();
    // el pelo se añade aparte para poder ocultarlo bajo cascos cerrados
    const hp = this.hairPart;
    switch (L.hair) {
      case 1: hp.add(new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, [0, 0.105, -0.004], [0, 0, 0], [0.94, 1.08, 1.04]); break;
      case 2:
        hp.add(new THREE.SphereGeometry(0.114, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, [0, 0.105, -0.004], [0, 0, 0], [0.96, 1.08, 1.06]);
        hp.add(limbGeo(0.3, 0.085, 0.05, 0.0), hair, [0, 0.12, -0.085], [0, 0, 0], [1.1, 1, 0.55]);
        break;
      case 3:
        for (let i = 0; i < 7; i++) hp.add(box(0.03, 0.06 - Math.abs(i - 3) * 0.006, 0.05), hair, [0, 0.205 + Math.abs(i - 3) * -0.004, 0.08 - i * 0.027], [0.0, 0, 0]);
        hp.add(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), hair, [0, 0.11, -0.003], [0, 0, 0], [0.92, 1.05, 1.02]);
        break;
      case 4:
        hp.add(new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.105, -0.004], [0, 0, 0], [0.94, 1.08, 1.04]);
        hp.add(sphere(0.055, 12, 8), hair, [0, 0.19, -0.075]);
        hp.add(limbGeo(0.22, 0.03, 0.012, 0.0), hair, [0, 0.14, -0.12], [0, 0, 0]);
        break;
      default: break;
    }
    const beardMat = mat('hair', L.hairColor);
    if (L.beard === 1) hp.add(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), mat('hair', L.hairColor), [0, 0.065, 0.012], [0, 0, 0], [0.96, 1.0, 1.0]);
    if (L.beard === 2) { hp.add(new THREE.SphereGeometry(0.104, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.42), beardMat, [0, 0.058, 0.015], [0, 0, 0], [0.98, 1.2, 1.05]); }
    if (L.beard === 3) hp.add(sphere(0.04, 10, 8), beardMat, [0, 0.03, 0.095], [0, 0, 0], [0.8, 1.6, 0.8]);
    this.hairGroup = hp.build();
    this.bones.head.add(this.hairGroup);
  }

  addBossHead(head, boss) {
    const B = this.bones;
    const p = new Part();
    if (boss === 'minotaur') {
      const fur = mat('skin', '#4a2a1a');
      p.add(sphere(0.125, 16, 12), fur, [0, 0.1, 0.03], [0, 0, 0], [1, 1.05, 1.15]);
      p.add(box(0.11, 0.1, 0.17), mat('skin', '#6a4028'), [0, 0.06, 0.14], [0.15, 0, 0]);
      p.add(sphere(0.022, 8, 6), mat('dark'), [-0.03, 0.065, 0.225]); p.add(sphere(0.022, 8, 6), mat('dark'), [0.03, 0.065, 0.225]);
      p.add(new THREE.TorusGeometry(0.03, 0.007, 8, 14), mat('gold'), [0, 0.03, 0.225], [0, 0, 0]);
      for (const s of [-1, 1]) {
        p.add(new THREE.TorusGeometry(0.13, 0.022, 8, 18, Math.PI * 0.85), mat('bone'), [s * 0.12, 0.18, 0.0], [0, s * 0.2, s > 0 ? 0.35 : Math.PI - 0.35 - Math.PI * 0.85 + 0.0]);
        p.add(new THREE.ConeGeometry(0.022, 0.12, 8), mat('bone'), [s * 0.265, 0.3, 0.0], [0, 0, -s * 0.35]);
        p.add(sphere(0.035, 8, 6), fur, [s * 0.11, 0.2, -0.04], [0, 0, 0], [1, 1.6, 0.6]);
      }
    } else if (boss === 'cyclops') {
      p.add(sphere(0.052, 14, 10), mat('white'), [0, 0.135, 0.085], [0, 0, 0], [1.2, 1, 0.6]);
      p.add(sphere(0.026, 12, 8), glow('#ffa040', 2.5), [0, 0.135, 0.108]);
      p.add(box(0.14, 0.03, 0.05), mat('skin', '#6e7c5e'), [0, 0.185, 0.085], [0.25, 0, 0]);
      p.add(box(0.11, 0.05, 0.06), mat('skin', '#7a8868'), [0, 0.02, 0.085]);
    } else if (boss === 'golem') {
      const rock = mat('rock', '#a29684');
      p.add(box(0.18, 0.16, 0.17), rock, [0, 0.11, 0.0], [0.1, 0.2, 0]);
      p.add(box(0.12, 0.08, 0.13), mat('rock', '#7a6f62'), [0.04, 0.2, 0.02], [0.3, 0.6, 0.2]);
      p.add(box(0.12, 0.02, 0.02), glow('#ffb060', 4), [0, 0.12, 0.085]);
      p.add(box(0.03, 0.03, 0.02), glow('#ffb060', 5), [-0.04, 0.125, 0.092]); p.add(box(0.03, 0.03, 0.02), glow('#ffb060', 5), [0.04, 0.125, 0.092]);
    }
    // oculta el modelado humano y el pelo
    const hg = p.build(); B.head.add(hg);
  }

  // ── equipo ───────────────────────────────────────────────────────────────
  rebuild() {
    this.clearDyn();
    this.buildEquipment();
  }

  buildEquipment() {
    const eq = this.g.equip || {};
    const B = this.bones;
    const L = this.look;
    const f = L.female;
    const bw = L.build * (f ? 0.92 : 1);
    const boss = this.boss;
    const rar = it => (it ? RARITY[it.rarity] : RARITY[0]);

    // ─ armadura de torso
    const armor = eq.armor;
    if (armor && !boss) this.attach(B.spine, this.buildArmor(armor, L, bw));
    // ─ yelmo
    const helm = eq.helm;
    let hidHair = false;
    if (helm && !boss) { this.attach(B.head, this.buildHelm(helm, L)); hidHair = ['secutor', 'thracia', 'galea', 'cassis'].includes(helm.base); }
    if (this.hairGroup) this.hairGroup.visible = !(hidHair && ['secutor', 'thracia'].includes(helm?.base)) && !(helm && ['cassis', 'galea'].includes(helm.base) && L.hair >= 3);
    // ─ grebas y manica
    const gr = eq.greaves;
    if (gr) this.attach(B.root, this.buildGreaves(gr, bw));
    // ─ amuleto
    if (eq.charm) this.attach(B.spine, this.buildCharm(eq.charm));
    // ─ armas
    const w = eq.weapon;
    const wb = w ? BASES.weapon[w.base] : null;
    if (boss && wb) this.attach(B.handR, this.buildWeapon(w, 'R', boss));
    else if (w) {
      this.attach(B.handR, this.buildWeapon(w, 'R'));
      if (wb.dual) this.attach(B.handL, this.buildWeapon(w, 'L'));
    }
    if (eq.offhand && wb && wb.hands === 1 && !boss) this.attach(B.elL, this.buildOffhand(eq.offhand, L));
    // pauldron para reciarios (sin yelmo)
    if (this.g.cls === 'retiarius' && !boss) this.attach(B.shL, this.buildGalerus(L));
    if (boss) this.buildBossBody();
  }

  metalFor(it) {
    const r = it?.rarity ?? 0;
    return r >= 4 ? mat('gold') : r >= 3 ? mat('steel', '#d8d2e8') : r >= 2 ? mat('steel') : mat('bronze');
  }
  trimFor(it) { return it && it.rarity >= 2 ? mat('gold') : mat('bronze', '#a8742f'); }

  accent(L) { return { '#8a1f25': '#c8782a', '#1f4a8a': '#d8a040', '#2f6a3a': '#c8782a', '#7a5a1a': '#8a1f25', '#4a2a6a': '#d8a040', '#b0a08a': '#8a1f25', '#2a2a30': '#9a1d2a', '#9a4a1a': '#2f5a8a' }[L.tunic] || '#c8782a'; }

  buildArmor(it, L, bw) {
    const P = new Part();
    const f = L.female;
    const sw = (f ? 0.92 : 1.08) * bw, hw = (f ? 1.06 : 0.98) * bw;
    const metal = this.metalFor(it), trim = this.trimFor(it);
    const enamel = it.rarity >= 1 ? mat('enamel') : mat('leather', '#5d3a20');
    const leather = mat('leather', '#6d4225'), dark = mat('leather', '#3a2312');
    const c1 = mat('cloth', L.tunic), c2 = mat('cloth', this.accent(L));
    const R = 0.212, cx = 1.52 * sw, cz = 0.84;
    const prof = [[0.145, 0.05], [0.128, 0.14], [0.14, 0.22], [0.175, 0.31], [0.205, 0.39], [0.212, 0.46], [0.16, 0.53]];
    const shell = (k, m) => { const g = latheProfile(prof.map(([r, y]) => [r * k, y]), 32); g.scale(cx, 1, cz); P.add(g, m); };
    // punto en la superficie del torso a una altura/ancho dados
    const surf = (x, y) => { const t = Math.min(0.97, Math.abs(x) / (R * cx)); return R * cz * Math.sqrt(1 - t * t) + 0.012; };
    switch (it.base) {
      case 'cuero':
        shell(1.05, leather);
        for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) P.add(sphere(0.012, 6, 6), trim, [sd * 0.05, 0.14 + i * 0.07, surf(0.05, 0) + 0.012]);
        // cuello de piel
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.add(sphere(0.06, 8, 6), mat('leather', '#7a5a38'), [Math.sin(a) * 0.17 * cx / 1.5, 0.56, Math.cos(a) * 0.12], [0, 0, 0], [1, 0.7, 1]); }
        break;
      case 'segmentata':
        for (let i = 0; i < 7; i++) {
          const y = 0.1 + i * 0.065, t = Math.min(1, (y - 0.02) / 0.5);
          const rr = (0.14 + (0.212 - 0.14) * Math.sin(t * Math.PI * 0.75)) * 1.06;
          const g = new THREE.CylinderGeometry(rr * 1.03, rr, 0.072, 32, 1, true); g.scale(cx, 1, cz);
          P.add(g, i % 2 ? metal : enamel, [0, y, 0]);
        }
        break;
      case 'muscular': {
        shell(1.05, metal);
        for (const sd of [-1, 1]) P.add(sphere(0.09, 14, 10), metal, [sd * 0.085 * sw * 1.3, 0.41, surf(0.09, 0) - 0.03], [0, 0, 0], [1.2, 0.9, 0.6]);
        for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) P.add(sphere(0.046, 10, 8), metal, [sd * 0.045, 0.12 + k * 0.058, surf(0.045, 0) - 0.02], [0, 0, 0], [1.05, 0.72, 0.5]);
        P.add(new THREE.TorusGeometry(0.07, 0.008, 8, 20), trim, [0, 0.47, surf(0, 0) - 0.03], [0, 0, 0], [1, 0.6, 1]);
        break;
      }
      default: // tunica: torso desnudo con arnés
        break;
    }
    // correas cruzadas
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const t = i / 8 * 2 - 1, x = sd * t * 0.2, y = 0.31 - t * 0.2 * (sd > 0 ? 1 : -1) * 1.0 + 0.0;
        P.add(box(0.075, 0.06, 0.018), dark, [x, 0.3 + t * 0.19, surf(x, y) + 0.004], [0, 0, sd * 0.66 * -1], [1, 1, 1]);
      }
    }
    P.add(cyl(0.04, 0.04, 0.02, 16), trim, [0, 0.3, surf(0, 0) + 0.015], [Math.PI / 2, 0, 0]);
    P.add(sphere(0.022, 10, 8), it.rarity >= 2 ? glow(RARITY[it.rarity].color, 2.5) : mat('crimson'), [0, 0.3, surf(0, 0) + 0.03]);
    // cinturón ancho con hebilla en forma de cabeza de león
    const beltG = new THREE.CylinderGeometry(0.165, 0.16, 0.1, 32); beltG.scale(1.36 * hw, 1, 0.92);
    P.add(beltG, dark, [0, 0.02, 0]);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; P.add(sphere(0.011, 6, 6), trim, [Math.sin(a) * 0.224 * hw, 0.02, Math.cos(a) * 0.15]); }
    const bz = 0.152;
    P.add(cyl(0.085, 0.085, 0.03, 20), trim, [0, 0.02, bz], [Math.PI / 2, 0, 0]);
    P.add(new THREE.TorusGeometry(0.085, 0.012, 8, 24), metal, [0, 0.02, bz + 0.015]);
    P.add(sphere(0.05, 12, 10), trim, [0, 0.02, bz + 0.03], [0, 0, 0], [1, 1, 0.6]);
    for (const sd of [-1, 1]) { P.add(new THREE.ConeGeometry(0.02, 0.05, 6), trim, [sd * 0.05, 0.065, bz + 0.03], [0, 0, -sd * 0.6]); P.add(sphere(0.011, 6, 6), mat('dark'), [sd * 0.02, 0.03, bz + 0.072]); }
    // faldellín: dos hileras de tiras (pteruges) + tabardo
    const rows = [{ n: 16, y: -0.06, len: 0.2, w: 0.072, rx: 0.232, rz: 0.158, tilt: 0.14 }, { n: 16, y: -0.22, len: 0.27, w: 0.078, rx: 0.25, rz: 0.17, tilt: 0.2, off: 0.5 }];
    rows.forEach((r, ri) => {
      for (let i = 0; i < r.n; i++) {
        const a = (i + (r.off || 0)) / r.n * Math.PI * 2;
        const m = ri === 0 ? (i % 2 ? leather : dark) : (i % 3 === 0 ? c2 : i % 3 === 1 ? c1 : leather);
        P.add(box(r.w, r.len, 0.012), m, [Math.sin(a) * r.rx * hw, r.y, Math.cos(a) * r.rz], [r.tilt, a, 0], [1, 1, 1], 'YXZ');
        P.add(box(r.w * 0.6, 0.012, 0.016), trim, [Math.sin(a) * (r.rx + 0.006) * hw, r.y - r.len / 2 + 0.01, Math.cos(a) * (r.rz + 0.008)], [r.tilt, a, 0], [1, 1, 1], 'YXZ');
      }
    });
    P.add(box(0.22 * hw, 0.44, 0.012), c1, [0, -0.2, 0.192], [0.12, 0, 0]);
    P.add(box(0.22 * hw, 0.03, 0.016), trim, [0, -0.41, 0.216], [0.12, 0, 0]);
    P.add(box(0.05, 0.3, 0.016), c2, [0, -0.17, 0.197], [0.12, 0, 0]);
    // hombreras ornamentadas (capas + espiral + pincho)
    for (const sd of [-1, 1]) {
      if (it.base === 'tunica' && sd === 1 && it.rarity < 2) continue; // asimétrica en las básicas
      for (let k = 0; k < 3; k++) P.add(new THREE.SphereGeometry(0.15 - k * 0.02, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), k === 1 ? metal : enamel, [sd * (0.32 + k * 0.014), 0.535 - k * 0.05, 0], [0, 0, sd * (0.5 + k * 0.17)], [1.15, 0.8, 1.2]);
      P.add(new THREE.TorusGeometry(0.15, 0.013, 8, 26), trim, [sd * 0.33, 0.52, 0], [Math.PI / 2, 0, sd * 0.5], [1.05, 1.15, 1]);
      P.add(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI * 1.6), trim, [sd * 0.37, 0.6, 0.05], [0, 0, 0]);
      if (it.rarity >= 1) P.add(new THREE.ConeGeometry(0.024, 0.1, 8), trim, [sd * 0.33, 0.64, 0], [0, 0, -sd * 0.5]);
      P.add(sphere(0.028, 10, 8), it.rarity >= 2 ? glow(RARITY[it.rarity].color, 2) : trim, [sd * 0.37, 0.55, 0.13]);
    }
    const grp = P.build();
    if (it.rarity >= 1 || it.base === 'muscular') {
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.05, 4, 10).translate(0, -0.52, 0), mat('cape', L.tunic));
      cape.position.set(0, 0.58, -0.2); cape.rotation.x = -0.1; cape.castShadow = true;
      grp.add(cape);
    }
    return grp;
  }

  buildHelm(it, L) {
    const P = new Part();
    const m = this.metalFor(it), trim = this.trimFor(it), enamel = it.rarity >= 1 ? mat('enamel') : m;
    const plume = mat('cloth', it.base === 'secutor' ? '#2a2a30' : (it.rarity >= 3 ? '#e8b040' : L.tunic));
    const plume2 = mat('cloth', this.accent(L));
    const dome = (r, phi) => new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, phi);
    const crest = (len, h, n = 15, z0 = 0.13) => {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), hh = h * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.85));
        P.add(box(0.03, hh, 0.032), i % 3 ? plume : plume2, [0, 0.24 + hh / 2 - 0.01 - Math.pow(t, 3) * 0.05, z0 - t * len], [-0.25 * t, 0, 0]);
      }
      P.add(box(0.014, 0.03, len + 0.04), trim, [0, 0.235, z0 - len / 2]);
    };
    // calota
    P.add(dome(0.128, Math.PI * 0.58), m, [0, 0.105, -0.004], [0, 0, 0], [0.98, 1.1, 1.1]);
    P.add(new THREE.TorusGeometry(0.118, 0.011, 8, 30), trim, [0, 0.105, -0.004], [Math.PI / 2, 0, 0], [1.0, 1.08, 1]);
    // protección de nuca
    P.add(new THREE.CylinderGeometry(0.13, 0.16, 0.08, 24, 1, true, Math.PI * 0.65, Math.PI * 0.7), m, [0, 0.04, -0.05], [0.1, 0, 0]);
    if (it.base === 'cassis') { // abierto, con cresta corta
      for (const s of [-1, 1]) P.add(box(0.014, 0.1, 0.09), m, [s * 0.112, 0.045, 0.02]);
      P.add(box(0.15, 0.012, 0.03), trim, [0, 0.15, 0.12]);
      crest(0.18, 0.11, 9, 0.08);
    } else {
      // carrilleras tipo corintio con pestañas decoradas y guarda nasal
      for (const s of [-1, 1]) {
        P.add(box(0.016, 0.15, 0.12), m, [s * 0.108, 0.035, 0.05], [0, -s * 0.22, 0]);
        P.add(box(0.014, 0.08, 0.05), enamel, [s * 0.1, -0.02, 0.1], [0, -s * 0.5, 0]);
        P.add(new THREE.TorusGeometry(0.03, 0.006, 6, 14), trim, [s * 0.113, 0.06, 0.06], [0, Math.PI / 2, 0]);
      }
      if (it.base === 'secutor') {
        P.add(new THREE.SphereGeometry(0.128, 24, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.3), m, [0, 0.105, 0.0], [0, 0, 0], [0.98, 1.1, 1.1]);
        for (const s of [-1, 1]) P.add(cyl(0.013, 0.013, 0.006, 10), mat('dark'), [s * 0.04, 0.115, 0.134], [Math.PI / 2, 0, 0]);
        for (let i = 0; i < 6; i++) P.add(sphere(0.008, 6, 6), mat('dark'), [(i - 2.5) * 0.02, 0.065, 0.13]);
        crest(0.26, 0.09, 12, 0.11);
      } else {
        P.add(box(0.026, 0.13, 0.03), m, [0, 0.085, 0.126], [0.06, 0, 0]);   // nasal
        P.add(box(0.15, 0.014, 0.02), trim, [0, 0.135, 0.122]);              // ceja
        P.add(box(0.012, 0.03, 0.012), mat('dark'), [0, 0.11, 0.13]);
        if (it.base === 'thracia') {
          P.add(new THREE.CylinderGeometry(0.2, 0.16, 0.022, 28), m, [0, 0.07, 0.0], [0, 0, 0], [1, 1, 1.08]);
          const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.quadraticCurveTo(0.1, 0.06, 0.2, 0.22); wing.quadraticCurveTo(0.12, 0.17, 0.09, 0.2); wing.quadraticCurveTo(0.07, 0.14, 0.03, 0.15); wing.lineTo(0, 0.08); wing.closePath();
          for (const s of [-1, 1]) P.add(extrude(wing, 0.012, 0.002), trim, [s * 0.12, 0.17, -0.02], [0, s * Math.PI / 2 * 0 + 0, s * -0.3], [s, 1, 1]);
          crest(0.3, 0.2, 18, 0.14);
        } else crest(0.3, 0.17, 16, 0.12);
      }
    }
    if (it.rarity >= 2) P.add(sphere(0.016, 8, 6), glow(RARITY[it.rarity].color, 3.5), [0, 0.19, 0.125]);
    return P.build();
  }

  buildGreaves(it, bw) {
    const m = it.base === 'cuero' ? mat('leather', '#5d3a20') : it.base === 'acero' ? mat('steel', '#c8ccd2') : this.metalFor(it);
    const trim = this.trimFor(it), enamel = it.rarity >= 1 ? mat('enamel') : m;
    const B = this.bones, lb = bw * 1.22;
    const grp = new THREE.Group();
    for (const s of ['L', 'R']) {
      const p = new Part();
      // espinilla: media caña con nervio central + rodillera abultada y ornamentada
      const prof = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.066 * lb + 0.012 - t * 0.026 + Math.sin(t * Math.PI) * 0.014, -0.06 - t * 0.33)); }
      prof.reverse();
      const gg = new THREE.LatheGeometry(prof, 20, -Math.PI * 0.42, Math.PI * 0.84);
      gg.rotateY(Math.PI / 2 - Math.PI / 2);
      p.add(gg, m, [0, 0, 0], [0, Math.PI / 2, 0]);
      p.add(box(0.014, 0.32, 0.02), trim, [0, -0.22, 0.072 * lb]);
      p.add(new THREE.SphereGeometry(0.085 * lb, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), enamel, [0, -0.01, 0.03], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
      p.add(new THREE.TorusGeometry(0.075 * lb, 0.012, 8, 22), trim, [0, -0.01, 0.06], [0, 0, 0]);
      p.add(sphere(0.022, 8, 6), it.rarity >= 2 ? glow(RARITY[it.rarity].color, 2.5) : trim, [0, -0.01, 0.125 * lb]);
      for (let i = 0; i < 3; i++) p.add(new THREE.TorusGeometry(0.052 * lb - i * 0.004, 0.007, 6, 18), mat('leather', '#6d4225'), [0, -0.3 - i * 0.03, 0], [Math.PI / 2, 0, 0]);
      this.attach(B['knee' + s], p.build());
      // antebrazales: manica ornamentada en ambos brazos
      const a = new Part();
      const pr2 = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pr2.push(new THREE.Vector2(0.056 * lb + 0.008 - t * 0.014 + Math.sin(t * Math.PI) * 0.01, -0.015 - t * 0.255)); }
      pr2.reverse();
      a.add(new THREE.LatheGeometry(pr2, 18), m);
      for (let i = 0; i < 3; i++) a.add(new THREE.TorusGeometry(0.052 * lb - i * 0.003, 0.008, 6, 18), trim, [0, -0.05 - i * 0.085, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2; a.add(sphere(0.009, 6, 6), trim, [Math.sin(an) * 0.063 * lb, -0.14, Math.cos(an) * 0.063 * lb]); }
      a.add(sphere(0.03, 10, 8), enamel, [0, -0.12, 0.06 * lb], [0, 0, 0], [1, 1.3, 0.6]);
      this.attach(B['el' + s], a.build());
    }
    return grp;
  }

  buildCharm(it) {
    const P = new Part();
    const col = RARITY[it.rarity].color;
    P.add(new THREE.TorusGeometry(0.07, 0.004, 6, 24, Math.PI), mat('leather', '#2a1a0e'), [0, 0.5, 0.06], [0, 0, Math.PI], [1.0, 1.4, 1]);
    const gem = it.rarity >= 1 ? glow(col, 1.5 + it.rarity * 1.5) : mat('bronze');
    if (it.base === 'garra') P.add(new THREE.ConeGeometry(0.014, 0.06, 8), mat('bone'), [0, 0.39, 0.15], [Math.PI, 0, 0]);
    else if (it.base === 'laurel') P.add(new THREE.TorusGeometry(0.02, 0.005, 6, 14), mat('gold'), [0, 0.4, 0.15]);
    else P.add(sphere(0.022, 10, 8), mat('gold'), [0, 0.4, 0.15]);
    P.add(sphere(0.012, 10, 8), gem, [0, 0.4, 0.17]);
    return P.build({ cast: false });
  }

  buildGalerus(L) {
    const P = new Part();
    const m = mat('bronze');
    P.add(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m, [0.03, 0.02, 0], [0, 0, -0.35], [1.25, 1, 1.15]);
    P.add(box(0.012, 0.22, 0.13), m, [0.11, 0.1, 0], [0, 0, -0.15]);
    P.add(new THREE.TorusGeometry(0.12, 0.007, 6, 20), mat('gold'), [0.03, 0.0, 0], [Math.PI / 2, 0, 0], [1.2, 1.1, 1]);
    return P.build();
  }

  buildBossBody() {
    const B = this.bones, boss = this.boss;
    const P = new Part();
    if (boss === 'golem') {
      const rock = mat('rock', '#a39685');
      // bloques adicionales y grietas de lava
      for (const s of [-1, 1]) {
        P.add(box(0.2, 0.12, 0.2), rock, [s * 0.26, 0.5, 0], [0.2, s * 0.3, s * 0.3]);
        P.add(box(0.14, 0.1, 0.16), mat('rock', '#7d7264'), [s * 0.3, 0.44, 0.03], [0.4, s * 0.2, 0]);
      }
      for (let i = 0; i < 6; i++) P.add(box(0.008, 0.08 + (i % 3) * 0.04, 0.006), glow('#ff9a40', 4), [(Math.random() - 0.5) * 0.3, 0.12 + Math.random() * 0.36, 0.145 + 0.0], [0, 0, (Math.random() - 0.5) * 1.2]);
      B.spine.add(P.build());
    } else if (boss === 'minotaur') {
      const fur = mat('skin', '#4a2a1a');
      P.add(sphere(0.2, 14, 10), fur, [0, 0.48, -0.02], [0, 0, 0], [1.25, 0.55, 0.9]);
      P.add(new THREE.TorusGeometry(0.16, 0.014, 8, 26), mat('iron'), [0, 0.52, 0.03], [Math.PI / 2 * 1.0, 0, 0], [1.3, 1, 1]);
      B.spine.add(P.build());
    } else if (boss === 'cyclops') {
      P.add(new THREE.CylinderGeometry(0.16, 0.15, 0.06, 20), mat('leather', '#3a2a18'), [0, 0.04, 0], [0, 0, 0], [1.3, 1, 0.9]);
      B.spine.add(P.build());
    }
    this.dyn.push(B.spine.children[B.spine.children.length - 1]);
  }

  // ── armas ────────────────────────────────────────────────────────────────
  buildWeapon(it, side, boss = null) {
    const P = new Part();
    const wb = BASES.weapon[it.base];
    const m = this.metalFor(it);
    const trim = this.trimFor(it);
    const wood = mat('wood');
    const leather = mat('leather', '#3d2412');
    const glowC = it.rarity >= 2 ? glow(RARITY[it.rarity].color, 1 + it.rarity * 1.1) : null;
    let tip = 0.9, base = 0;
    const big = boss ? 1.0 : 1;
    switch (it.base) {
      case 'gladius':
        P.add(cyl(0.017, 0.017, 0.11, 10), leather, [0, 0.03, 0]);
        P.add(sphere(0.026, 10, 8), trim, [0, -0.03, 0]);
        P.add(box(0.17, 0.024, 0.034), trim, [0, 0.09, 0]);
        for (const sd of [-1, 1]) P.add(sphere(0.022, 8, 6), trim, [sd * 0.085, 0.09, 0]);
        P.add(extrude(bladeShape(0.6, 0.072, 0.8), 0.012, 0.002), m, [0, 0.1, 0]);
        P.add(box(0.008, 0.46, 0.014), mat('steel', '#e4e6ea'), [0, 0.35, 0]);
        if (glowC) P.add(box(0.004, 0.4, 0.016), glowC, [0, 0.36, 0]);
        tip = 0.66; break;
      case 'sica': case 'sicae': {
        P.add(cyl(0.017, 0.017, 0.12, 10), leather, [0, 0.03, 0]);
        P.add(sphere(0.026, 10, 8), trim, [0, -0.04, 0]);
        P.add(box(0.07, 0.016, 0.03), trim, [0, 0.095, 0]);
        const flip = side === 'L' ? -1 : 1;
        P.add(extrude(sicaShape(0.5, 0.07, 0.16 * flip), 0.011, 0.002), m, [0, 0.1, 0]);
        if (glowC) P.add(box(0.004, 0.36, 0.016), glowC, [0.06 * flip, 0.36, 0]);
        tip = 0.6; break;
      }
      case 'hasta':
        P.add(cyl(0.017, 0.019, 2.05, 10), wood, [0, 0.5, 0]);
        P.add(new THREE.ConeGeometry(0.02, 0.1, 8), trim, [0, -0.55, 0], [Math.PI, 0, 0]);
        P.add(cyl(0.025, 0.025, 0.06, 10), trim, [0, 1.46, 0]);
        P.add(extrude(bladeShape(0.3, 0.075, 0.55), 0.012, 0.002), m, [0, 1.48, 0]);
        P.add(box(0.008, 0.26, 0.016), mat('steel', '#e8eaee'), [0, 1.64, 0]);
        if (glowC) P.add(box(0.005, 0.22, 0.018), glowC, [0, 1.66, 0]);
        P.add(cyl(0.022, 0.022, 0.16, 10), leather, [0, 0.0, 0]);
        tip = 1.78; base = 0.6; break;
      case 'tridens': {
        P.add(cyl(0.017, 0.02, 2.0, 10), mat('wood', '#5d3f24'), [0, 0.5, 0]);
        P.add(new THREE.ConeGeometry(0.02, 0.1, 8), trim, [0, -0.55, 0], [Math.PI, 0, 0]);
        P.add(cyl(0.028, 0.028, 0.08, 10), trim, [0, 1.46, 0]);
        // tres puntas
        const prong = (x, len, curve) => { const s = new THREE.Shape(); s.moveTo(-0.012, 0); s.lineTo(-0.012 + curve * 0.3, len * 0.8); s.lineTo(curve * 0.4, len); s.lineTo(0.012 + curve * 0.3, len * 0.8); s.lineTo(0.012, 0); s.closePath(); return s; };
        P.add(extrude(prong(0, 0.4, 0), 0.016, 0.002), m, [0, 1.5, 0]);
        P.add(extrude(prong(0, 0.3, 0.06), 0.016, 0.002), m, [0.06, 1.5, 0], [0, 0, -0.05]);
        P.add(extrude(prong(0, 0.3, -0.06), 0.016, 0.002), m, [-0.06, 1.5, 0], [0, 0, 0.05]);
        P.add(box(0.14, 0.022, 0.022), m, [0, 1.5, 0]);
        if (glowC) P.add(box(0.006, 0.3, 0.02), glowC, [0, 1.68, 0]);
        tip = 1.9; base = 0.6; break;
      }
      case 'bipennis': {
        P.add(cyl(0.02, 0.022, 1.35, 10), wood, [0, 0.3, 0]);
        P.add(sphere(0.03, 10, 8), trim, [0, -0.4, 0]);
        P.add(cyl(0.032, 0.032, 0.12, 10), trim, [0, 0.85, 0]);
        const blade = (dir) => { const s = new THREE.Shape(); s.moveTo(0, -0.12); s.quadraticCurveTo(dir * 0.26, -0.16, dir * 0.27, 0.0); s.quadraticCurveTo(dir * 0.26, 0.16, 0, 0.12); s.lineTo(0, -0.12); return s; };
        P.add(extrude(blade(1), 0.014, 0.003), m, [0, 0.84, 0]);
        P.add(extrude(blade(-1), 0.014, 0.003), m, [0, 0.84, 0]);
        P.add(new THREE.ConeGeometry(0.022, 0.1, 8), trim, [0, 0.98, 0]);
        if (glowC) { P.add(box(0.3, 0.008, 0.016), glowC, [0.14, 0.84, 0]); P.add(box(0.3, 0.008, 0.016), glowC, [-0.14, 0.84, 0]); }
        tip = 1.1; base = 0.6; break;
      }
      case 'malleus':
        P.add(cyl(0.022, 0.026, 0.78, 10), wood, [0, 0.25, 0]);
        P.add(sphere(0.03, 10, 8), trim, [0, -0.15, 0]);
        P.add(box(0.15, 0.15, 0.27), mat('iron'), [0, 0.68, 0]);
        P.add(box(0.17, 0.05, 0.29), m, [0, 0.6, 0]); P.add(box(0.17, 0.05, 0.29), m, [0, 0.76, 0]);
        for (let i = 0; i < 4; i++) P.add(sphere(0.012, 6, 6), trim, [0.0, 0.68, -0.1 + i * 0.066 + 0.0], [0, 0, 0], [1, 1, 1]);
        for (const s of [-1, 1]) P.add(new THREE.ConeGeometry(0.03, 0.06, 6), mat('iron'), [0, 0.68, s * 0.165], [s * Math.PI / 2, 0, 0]);
        if (glowC) P.add(box(0.154, 0.01, 0.2), glowC, [0, 0.68, 0]);
        tip = 0.84; base = 0.45; break;
    }
    if (boss) {
      const k = this.bossWeaponScale(boss);
      const grp = P.build();
      grp.scale.setScalar(k);
      grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return this.wrapMount(grp, it, side, tip * k, base * k);
    }
    const grp = P.build();
    grp.scale.setScalar(1.18);
    return this.wrapMount(grp, it, side, tip * 1.18, base * 1.18);
  }
  bossWeaponScale(boss) { return boss === 'cyclops' ? 1.35 : boss === 'golem' ? 1.25 : 1.1; }

  wrapMount(grp, it, side, tip, base) {
    const mount = new THREE.Group();
    mount.rotation.x = Math.PI / 2;
    mount.position.set(0, -0.07, 0.01);
    mount.add(grp);
    const tipObj = new THREE.Object3D(); tipObj.position.set(0, tip, 0); grp.add(tipObj);
    const baseObj = new THREE.Object3D(); baseObj.position.set(0, base || tip * 0.45, 0); grp.add(baseObj);
    this.tips['weapon' + side] = { tip: tipObj, base: baseObj };
    this.weaponMount = this.weaponMount || {};
    this.weaponMount[side] = mount;
    return mount;
  }

  buildOffhand(it, L) {
    const P = new Part();
    const m = this.metalFor(it), trim = this.trimFor(it), enamel = it.rarity >= 1 ? mat('enamel') : mat('leather', '#5d3a20');
    const field = mat('cloth', L.tunic);
    const grp = new THREE.Group();
    const r = it.rarity;
    const glowM = r >= 2 ? glow(RARITY[r].color, 1.2 + r) : trim;
    const round = (R) => {
      const cap = new THREE.SphereGeometry(R, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.24); cap.rotateX(Math.PI / 2); cap.translate(0, 0, -R * 0.95);
      P.add(cap, enamel);
      P.add(new THREE.TorusGeometry(R * 0.97, 0.026, 10, 48), m, [0, 0, 0.0]);
      P.add(new THREE.TorusGeometry(R * 0.8, 0.014, 8, 48), trim, [0, 0, R * 0.045]);
      P.add(new THREE.TorusGeometry(R * 0.58, 0.012, 8, 40), field, [0, 0, R * 0.075]);
      P.add(new THREE.TorusGeometry(R * 0.36, 0.014, 8, 36), trim, [0, 0, R * 0.1]);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.add(box(0.03, R * 0.28, 0.012), i % 2 ? trim : field, [Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, R * 0.06], [0, 0, a - Math.PI / 2]); }
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; P.add(sphere(0.016, 6, 6), trim, [Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, 0.02]); }
      // umbo con rostro
      P.add(new THREE.SphereGeometry(R * 0.24, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), trim, [0, 0, R * 0.09], [Math.PI / 2, 0, 0], [1, 1, 1]);
      P.add(sphere(R * 0.11, 12, 10), m, [0, 0, R * 0.3]);
      for (const sd of [-1, 1]) { P.add(new THREE.ConeGeometry(R * 0.05, R * 0.14, 6), trim, [sd * R * 0.11, R * 0.1, R * 0.27], [0, 0, -sd * 0.7]); P.add(sphere(R * 0.022, 6, 6), mat('dark'), [sd * R * 0.04, R * 0.02, R * 0.4]); }
      P.add(new THREE.TorusGeometry(R * 0.985, 0.006, 6, 48), glowM, [0, 0, 0.012]);
    };
    if (it.base === 'scutum') {
      round(0.37);
      grp.add(P.build());
      grp.position.set(0.05, -0.1, 0.26); grp.rotation.set(0, 0.25, 0);
      this.shieldCenter = grp;
    } else if (it.base === 'parma') {
      round(0.28);
      grp.add(P.build());
      grp.position.set(0.05, -0.12, 0.22); grp.rotation.set(0, 0.2, 0);
      this.shieldCenter = grp;
    } else if (it.base === 'rete') {
      const rope = mat('leather', '#b8a27a');
      for (let i = -5; i <= 5; i++) P.add(cyl(0.005, 0.005, 0.62, 4), rope, [i * 0.045, -0.32, 0.06 + Math.sin(i * 0.6) * 0.012], [0, 0, 0.03 * i]);
      for (let j = 0; j < 8; j++) P.add(cyl(0.005, 0.005, 0.5, 4), rope, [0, -0.1 - j * 0.075, 0.06], [0, 0, Math.PI / 2]);
      for (let i = -4; i <= 4; i += 2) P.add(sphere(0.02, 6, 6), mat('iron'), [i * 0.055, -0.64, 0.06]);
      P.add(new THREE.TorusGeometry(0.05, 0.012, 8, 16), trim, [0, -0.02, 0.05], [Math.PI / 2, 0, 0]);
      grp.add(P.build({ cast: false }));
      grp.position.set(0.0, -0.2, 0.02);
    }
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  // ── utilidades visuales ─────────────────────────────────────────────────
  setShadows(on) { this.root.traverse(o => { if (o.isMesh) o.castShadow = on; }); }
  dispose() { this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
