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
  add(geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    Q.setFromEuler(E.set(rot[0], rot[1], rot[2]));
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
const H = { hip: 0.93, thigh: 0.46, shin: 0.45, spine: 0.06, chestY: 0.30, shoulderY: 0.2, neckY: 0.27, upper: 0.30, fore: 0.27 };

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
    B['sh' + s] = g('sh' + s, B.chest, sx * 0.215, H.shoulderY, 0);
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
    this.height = 1.8 * h;
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
      [0.075, 0.0], [0.15, 0.01], [0.165, 0.05], [0.150, 0.14], [0.152, 0.22], [0.172, 0.31], [0.19, 0.39], [0.192, 0.46], [0.15, 0.53], [0.072, 0.575], [0.001, 0.58],
    ], 28);
    torso.scale(1.28 * sw, 1, 0.80 * (f ? 0.94 : 1));
    // pelvis
    const pelvis = latheProfile([[0.001, -0.14], [0.11, -0.12], [0.17, -0.04], [0.17, 0.05], [0.14, 0.09], [0.001, 0.1]], 20);
    pelvis.scale(1.22 * hw, 1, 0.82);
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
    // cuello y trapecios
    const neckPart = new Part();
    neckPart.add(cyl(0.048, 0.06, 0.12, 12), skin, [0, 0.04, 0]);
    // cabeza
    const head = new Part();
    const hr = 0.105;
    head.add(sphere(hr, 24, 16), skin, [0, 0.1, 0], [0, 0, 0], [0.92, 1.08, 1.0]);
    head.add(sphere(0.07, 12, 10), skin, [0, 0.03, 0.045], [0, 0, 0], [1.05, 0.85, 1.0]); // mandíbula
    head.add(box(0.05, 0.03, 0.03), skin, [0, 0.08, 0.098], [0.25, 0, 0]); // nariz
    for (const s of [-1, 1]) {
      head.add(sphere(0.022, 8, 6), skin, [s * 0.098, 0.095, -0.005], [0, 0, 0], [0.5, 1, 0.8]); // orejas
      head.add(sphere(0.012, 8, 6), mat('dark'), [s * 0.038, 0.117, 0.088]); // ojos
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

    // extremidades
    const sr = f ? 0.92 : 1;
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const arm = new Part();
      arm.add(sphere(0.062 * bw * sr, 14, 10), skin, [0, 0, 0]);
      arm.add(limbGeo(H.upper, 0.058 * bw * sr, 0.045 * bw * sr, 0.016 * bw), skin);
      B['sh' + s].add(arm.build());
      const fore = new Part();
      fore.add(sphere(0.046 * bw * sr, 12, 8), skin, [0, 0, 0]);
      fore.add(limbGeo(H.fore, 0.046 * bw * sr, 0.034 * bw * sr, 0.012 * bw), skin);
      B['el' + s].add(fore.build());
      const hand = new Part();
      hand.add(sphere(0.04, 12, 8), skin, [0, -0.045, 0], [0, 0, 0], [1, 1.15, 0.8]);
      hand.add(box(0.05, 0.02, 0.012), skin, [sx * 0.0, -0.085, 0.022]);
      B['hand' + s].add(hand.build());
      // pierna
      const thigh = new Part();
      thigh.add(sphere(0.085 * bw * sr * (f ? 1.04 : 1), 14, 10), skin, [0, 0.0, 0]);
      thigh.add(limbGeo(H.thigh, 0.084 * bw * sr * (f ? 1.04 : 1), 0.058 * bw * sr, 0.02 * bw), skin);
      B['hip' + s].add(thigh.build());
      const shin = new Part();
      shin.add(sphere(0.06 * bw * sr, 12, 8), skin, [0, 0, 0]);
      shin.add(limbGeo(H.shin, 0.058 * bw * sr, 0.04 * bw * sr, 0.022 * bw), skin);
      B['knee' + s].add(shin.build());
      const foot = new Part();
      foot.add(box(0.085, 0.045, 0.2), skin, [0, -0.02, 0.05]);
      foot.add(box(0.09, 0.012, 0.22), mat('leather', '#5a3820'), [0, -0.047, 0.055]); // suela
      for (let i = 0; i < 3; i++) foot.add(cyl(0.048, 0.048, 0.008, 8), mat('leather', '#5a3820'), [0, -0.0 + i * 0.0, 0.0 + i * 0.05 - 0.02], [Math.PI / 2, 0, 0], [1, 1, 1.0]);
      B['ankle' + s].add(foot.build());
    }
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

  buildArmor(it, L, bw) {
    const P = new Part();
    const f = L.female;
    const sw = (f ? 0.92 : 1.08) * bw;
    const grow = 1.07;
    const prof = [[0.16, 0.02], [0.152, 0.14], [0.154, 0.22], [0.174, 0.31], [0.192, 0.39], [0.194, 0.46], [0.152, 0.53]];
    const shell = (scaleR, m, y0 = 0, y1 = 1) => {
      const pts = prof.map(([r, y]) => [r * scaleR, y]);
      const g = latheProfile(pts, 28); g.scale(1.28 * sw, 1, 0.8);
      P.add(g, m);
    };
    const trim = this.trimFor(it);
    const col = L.tunic;
    const r = it.rarity;
    switch (it.base) {
      case 'tunica':
        shell(1.05, mat('cloth', col));
        P.add(box(0.06, 0.36, 0.02), mat('leather'), [0.05, 0.3, 0.165], [0, 0, 0.5]); // tirante
        P.add(box(0.06, 0.36, 0.02), mat('leather'), [-0.05, 0.3, 0.165], [0, 0, -0.5]);
        break;
      case 'cuero':
        shell(1.07, mat('leather', '#6d4225'));
        for (let i = 0; i < 4; i++) P.add(cyl(0.012, 0.012, 0.004, 8), trim, [0, 0.15 + i * 0.09, 0.13 + (i % 2) * 0.005], [Math.PI / 2, 0, 0]);
        P.add(box(0.26, 0.05, 0.02), mat('leather', '#3d2412'), [0, 0.28, 0.152]);
        break;
      case 'segmentata': {
        const m = this.metalFor(it);
        for (let i = 0; i < 6; i++) {
          const y = 0.12 + i * 0.065;
          const t = Math.min(1, (y - 0.02) / 0.5);
          const rr = (0.152 + (0.192 - 0.152) * Math.sin(t * Math.PI * 0.7)) * 1.08;
          const g = new THREE.CylinderGeometry(rr * 1.03, rr, 0.07, 28, 1, true); g.scale(1.28 * sw, 1, 0.8);
          P.add(g, m, [0, y, 0]);
        }
        // hombreras
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.add(new THREE.SphereGeometry(0.095 - k * 0.012, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), m, [s * 0.225 * 1.03, 0.52 - k * 0.028, 0], [0, 0, s * (0.25 + k * 0.08)], [1.1, 1, 1.1]);
        P.add(box(0.26, 0.05, 0.02), mat('leather', '#3d2412'), [0, 0.12, 0.155]);
        break;
      }
      case 'muscular': {
        const m = this.metalFor(it);
        shell(1.06, m);
        for (const s of [-1, 1]) P.add(sphere(0.088, 14, 10), m, [s * 0.078 * sw * 1.1, 0.41, 0.102], [0, 0, 0], [1.18, 0.9, 0.62]);
        for (let k = 0; k < 3; k++) for (const s of [-1, 1]) P.add(sphere(0.045, 10, 8), m, [s * 0.04, 0.15 + k * 0.058, 0.128], [0, 0, 0], [1, 0.75, 0.5]);
        for (const s of [-1, 1]) P.add(new THREE.SphereGeometry(0.095, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m, [s * 0.225, 0.515, 0], [0, 0, s * 0.3], [1.1, 1, 1.1]);
        P.add(new THREE.TorusGeometry(0.06, 0.008, 8, 20), trim, [0, 0.47, 0.11], [0, 0, 0], [1, 0.6, 1]);
        break;
      }
    }
    // cinturón + faldellín de tiras (pteruges)
    P.add(new THREE.CylinderGeometry(0.155, 0.152, 0.055, 24), mat('leather', '#3a2312'), [0, 0.03, 0], [0, 0, 0], [1.2 * sw, 1, 0.85]);
    P.add(cyl(0.03, 0.03, 0.012, 14), trim, [0, 0.03, 0.17 * 0.85 + 0.135 * 0.0 + 0.01], [Math.PI / 2, 0, 0]);
    const strip = it.base === 'tunica' ? mat('cloth', col) : mat('leather', '#6d4225');
    const n = it.base === 'tunica' ? 0 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      P.add(box(0.05, 0.17, 0.008), strip, [Math.sin(a) * 0.205 * sw * 0.96, -0.06, Math.cos(a) * 0.14], [0.12 * Math.cos(a), a, 0]);
    }
    const grp = P.build();
    return grp;
  }

  buildHelm(it, L) {
    const P = new Part();
    const m = this.metalFor(it);
    const trim = this.trimFor(it);
    const plume = mat('cloth', it.rarity >= 3 ? '#e8c050' : (L.tunic));
    const dome = (r, phi, sy = 1.08) => new THREE.SphereGeometry(r, 26, 14, 0, Math.PI * 2, 0, phi);
    switch (it.base) {
      case 'cassis':
        P.add(dome(0.118, Math.PI * 0.52), m, [0, 0.105, -0.004], [0, 0, 0], [0.95, 1.08, 1.05]);
        P.add(new THREE.TorusGeometry(0.108, 0.008, 6, 26), trim, [0, 0.11, -0.004], [Math.PI / 2, 0, 0], [0.95, 1.05, 1]);
        for (const s of [-1, 1]) P.add(box(0.012, 0.09, 0.07), m, [s * 0.108, 0.05, 0.0]);
        P.add(box(0.012, 0.03, 0.22), trim, [0, 0.225, 0]);
        break;
      case 'galea':
        P.add(dome(0.12, Math.PI * 0.56), m, [0, 0.105, -0.004], [0, 0, 0], [0.96, 1.08, 1.06]);
        P.add(new THREE.TorusGeometry(0.11, 0.009, 6, 26), trim, [0, 0.105, -0.004], [Math.PI / 2, 0, 0], [0.95, 1.05, 1]);
        for (const s of [-1, 1]) P.add(box(0.012, 0.12, 0.085), m, [s * 0.108, 0.04, 0.03], [0, 0, 0]);
        P.add(box(0.2, 0.02, 0.06), m, [0, 0.0, -0.11], [0.35, 0, 0]);  // cubrenuca
        P.add(box(0.012, 0.04, 0.23), trim, [0, 0.232, 0]);
        // cimera con penacho
        for (let i = 0; i < 9; i++) { const t = i / 8; P.add(box(0.03, 0.09 + Math.sin(t * Math.PI) * 0.05, 0.03), plume, [0, 0.27 + Math.sin(t * Math.PI) * 0.03, 0.1 - t * 0.22], [0, 0, 0]); }
        break;
      case 'thracia': {
        P.add(dome(0.122, Math.PI * 0.56), m, [0, 0.105, -0.004], [0, 0, 0], [0.97, 1.08, 1.08]);
        P.add(new THREE.CylinderGeometry(0.19, 0.15, 0.02, 26), m, [0, 0.05, 0.0], [0, 0, 0], [1, 1, 1.05]); // ala
        // visera rejilla
        for (let i = -3; i <= 3; i++) P.add(box(0.008, 0.11, 0.008), trim, [i * 0.024, 0.085, 0.125 - Math.abs(i) * 0.004]);
        P.add(box(0.17, 0.008, 0.01), trim, [0, 0.12, 0.122]);
        P.add(box(0.17, 0.008, 0.01), trim, [0, 0.05, 0.122]);
        // grifo en la cresta
        const g = new THREE.Shape();
        g.moveTo(-0.11, 0); g.lineTo(-0.1, 0.12); g.quadraticCurveTo(-0.04, 0.22, 0.05, 0.16); g.lineTo(0.14, 0.2); g.lineTo(0.1, 0.1); g.lineTo(0.12, 0); g.closePath();
        P.add(extrude(g, 0.018, 0.003), trim, [0, 0.19, 0], [0, -Math.PI / 2, 0], [1, 1, 1]);
        for (let i = 0; i < 6; i++) P.add(box(0.012, 0.11 - i * 0.008, 0.012), plume, [0, 0.35 - i * 0.004, -0.04 - i * 0.022], [0.3, 0, 0]);
        break;
      }
      case 'secutor': {
        P.add(dome(0.125, Math.PI * 0.62), m, [0, 0.105, -0.004], [0, 0, 0], [0.98, 1.1, 1.08]);
        P.add(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.32), m, [0, 0.105, 0.0], [0, 0, 0], [0.98, 1.1, 1.08]);
        P.add(box(0.2, 0.018, 0.012), mat('dark'), [0, 0.115, 0.125]);
        for (const s of [-1, 1]) P.add(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10), mat('dark'), [s * 0.04, 0.115, 0.13], [Math.PI / 2, 0, 0]);
        for (let i = 0; i < 5; i++) P.add(sphere(0.008, 6, 6), mat('dark'), [(i - 2) * 0.02, 0.07, 0.122]);
        P.add(box(0.014, 0.05, 0.25), trim, [0, 0.245, 0]);
        P.add(new THREE.TorusGeometry(0.115, 0.008, 6, 26), trim, [0, 0.03, 0], [Math.PI / 2, 0, 0], [1, 1.05, 1]);
        break;
      }
    }
    if (it.rarity >= 3) {
      const gem = glow(RARITY[it.rarity].color, 3.5);
      P.add(sphere(0.012, 8, 6), gem, [0, 0.2, 0.113]);
    }
    return P.build();
  }

  buildGreaves(it, bw) {
    const P = new Part();
    const m = it.base === 'cuero' ? mat('leather', '#5d3a20') : it.base === 'acero' ? mat('steel', '#c8ccd2') : this.metalFor(it);
    const trim = this.trimFor(it);
    const B = this.bones;
    const grp = new THREE.Group();
    // las grebas deben seguir a las piernas; se cuelgan de cada rodilla
    for (const s of ['L', 'R']) {
      const p = new Part();
      const prof = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.066 * bw - t * 0.022 + Math.sin(t * Math.PI) * 0.012, -0.05 - t * 0.33)); }
      prof.reverse();
      const gg = new THREE.LatheGeometry(prof, 16, 0.6, Math.PI * 1.5 * 0.92);
      gg.rotateY(-0.3 + Math.PI * 0.0);
      p.add(gg, m, [0, 0, 0], [0, Math.PI * 0.1, 0]);
      p.add(new THREE.SphereGeometry(0.07 * bw, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m, [0, -0.02, 0.028], [Math.PI * 0.5, 0, 0], [1, 0.6, 1]);
      p.add(new THREE.TorusGeometry(0.062 * bw, 0.006, 6, 18), trim, [0, -0.06, 0], [Math.PI / 2, 0, 0]);
      p.add(new THREE.TorusGeometry(0.046 * bw, 0.006, 6, 18), trim, [0, -0.36, 0], [Math.PI / 2, 0, 0]);
      this.attach(B['knee' + s], p.build());
      // manica (protector de brazo) en el brazo de la espada
      if (s === 'R') {
        const a = new Part();
        const prof2 = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; prof2.push(new THREE.Vector2(0.056 * bw - t * 0.016 + Math.sin(t * Math.PI) * 0.008, -0.02 - t * 0.23)); }
        prof2.reverse();
        a.add(new THREE.LatheGeometry(prof2, 14), m);
        for (let i = 0; i < 4; i++) a.add(new THREE.TorusGeometry(0.052 * bw - i * 0.004, 0.005, 6, 16), trim, [0, -0.05 - i * 0.055, 0], [Math.PI / 2, 0, 0]);
        this.attach(B.elR, a.build());
      }
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
        P.add(box(0.12, 0.018, 0.028), trim, [0, 0.09, 0]);
        P.add(extrude(bladeShape(0.56, 0.058, 0.8), 0.011, 0.002), m, [0, 0.1, 0]);
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
    return this.wrapMount(grp, it, side, tip, base);
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
    const m = this.metalFor(it);
    const trim = this.trimFor(it);
    const col = mat('cloth', L.tunic);
    const grp = new THREE.Group();
    const r = it.rarity;
    if (it.base === 'scutum') {
      // rectángulo curvo
      const body = new THREE.CylinderGeometry(0.42, 0.42, 0.98, 20, 1, true, -0.52, 1.04);
      body.translate(0, 0, -0.42);
      P.add(body, mat('leather', '#6b2a1f'), [0, 0, 0]);
      const rim = new THREE.CylinderGeometry(0.425, 0.425, 1.0, 20, 1, true, -0.535, 1.07);
      rim.translate(0, 0, -0.42);
      P.add(rim, m, [0, 0, 0], [0, 0, 0], [1.0, 1.0, 1.0]);
      P.add(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), trim, [0, 0.0, 0.0], [Math.PI / 2, 0, 0], [1, 0.6, 1]);
      // alas y rayos (emblema)
      const glowM = r >= 2 ? glow(RARITY[r].color, 1.2 + r) : trim;
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.add(box(0.14 - i * 0.02, 0.012, 0.006), trim, [s * (0.08 + i * 0.02), 0.06 + i * 0.045, 0.004], [0, 0, s * (0.35 + i * 0.05)]);
      P.add(box(0.012, 0.3, 0.006), glowM, [0, 0, 0.004]);
      grp.add(P.build());
      grp.position.set(0.05, -0.12, 0.26); grp.rotation.set(0.0, 0.25, 0); grp.scale.setScalar(0.92);
      grp.children[0].children.forEach(c => c.castShadow = true);
      this.shieldCenter = grp;
    } else if (it.base === 'parma') {
      const disc = new THREE.SphereGeometry(0.3, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.2);
      disc.rotateX(Math.PI / 2);
      P.add(disc, col, [0, 0, 0.04], [0, 0, 0], [1, 1, 1.0]);
      P.add(new THREE.TorusGeometry(0.29, 0.014, 6, 30), m, [0, 0, 0.03]);
      P.add(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), trim, [0, 0, 0.055], [Math.PI / 2, 0, 0], [1, 0.8, 1]);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.add(box(0.012, 0.11, 0.005), trim, [Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.05], [0, 0, a - Math.PI / 2]); }
      grp.add(P.build());
      grp.position.set(0.04, -0.14, 0.14); grp.rotation.set(0, 0.2, 0);
      this.shieldCenter = grp;
    } else if (it.base === 'rete') {
      // red: rejilla de cuerda colgando + plomos
      const rope = mat('leather', '#b8a27a');
      for (let i = -4; i <= 4; i++) {
        P.add(cyl(0.004, 0.004, 0.55, 4), rope, [i * 0.045, -0.3, 0.05 + Math.sin(i * 0.6) * 0.01], [0, 0, 0.03 * i]);
      }
      for (let j = 0; j < 7; j++) P.add(cyl(0.004, 0.004, 0.42, 4), rope, [0, -0.1 - j * 0.07, 0.05], [0, 0, Math.PI / 2]);
      for (let i = -4; i <= 4; i += 2) P.add(sphere(0.016, 6, 6), mat('iron'), [i * 0.05, -0.57, 0.05]);
      grp.add(P.build({ cast: false }));
      grp.position.set(0.0, -0.22, 0.02);
    }
    return grp;
  }

  // ── utilidades visuales ─────────────────────────────────────────────────
  setShadows(on) { this.root.traverse(o => { if (o.isMesh) o.castShadow = on; }); }
  dispose() { this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
