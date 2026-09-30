// ────────────────────────────────────────────────────────────────────────────
//  El Coliseo: arena de arena, graderío escalonado, fachada con arcos,
//  público animado (instanciado + vértices TSL), antorchas, estandartes, velarium.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';
import { attribute, positionLocal, sin, cos, time, uniform, vec3, float, vec2, uv, mix, texture, max, pow, abs, Fn, smoothstep } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneTex, sandTex, plasterTex, clothTex, flameTex, softCircle, SandDecals } from './textures.js';
import { mat, T } from './materials.js';

export const ARENA = { floorR: 18, podiumR: 18.6, podiumH: 2.7, seatR0: 18.8, rows: 32, rise: 0.62, tread: 0.82, outerR: 50, rimY: 26 };

function worldUV(geo, profile, segs, scale, closeSeam = true) {
  const n = profile.length;
  const L = [0];
  for (let j = 1; j < n; j++) L[j] = L[j - 1] + Math.hypot(profile[j].x - profile[j - 1].x, profile[j].y - profile[j - 1].y);
  const uvs = geo.attributes.uv;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) {
    const idx = i * n + j;
    uvs.setXY(idx, (i / segs) * Math.PI * 2 * profile[j].x * scale, L[j] * scale);
  }
  uvs.needsUpdate = true;
}
function rep(t, x = 1, y = 1) { const c = t.clone(); c.repeat.set(x, y); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; }

export class Colosseum {
  constructor(scene, quality = 1) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'colosseum';
    scene.add(this.group);
    this.u = { excite: uniform(0.3), wave: uniform(0), time: uniform(0) };
    this.torches = [];
    this.lights = [];
    this.quality = quality;
    this.banners = [];
    this.buildFloor();
    this.buildPodium();
    this.buildCavea();
    this.buildFacade();
    this.buildGates();
    this.buildImperialBox();
    this.buildCrowd();
    this.buildTorches();
    this.buildBanners();
    this.buildVelarium();
    this.buildSurroundings();
  }

  // ── suelo de arena ───────────────────────────────────────────────────────
  buildFloor() {
    const T0 = sandTex(512, '#e2bb86');
    const map = rep(T0.map, 7, 7), nm = rep(T0.normalMap, 7, 7);
    const m = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', map, normalMap: nm, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA.floorR + 0.8, 96), m);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);
    // decals dinámicos (huellas y manchas)
    this.decals = new SandDecals(1024, ARENA.floorR * 2);
    const dm = new THREE.MeshBasicNodeMaterial({ map: this.decals.texture, transparent: true, depthWrite: false });
    dm.polygonOffset = true; dm.polygonOffsetFactor = -2;
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.floorR * 2, ARENA.floorR * 2), dm);
    dec.rotation.x = -Math.PI / 2; dec.position.y = 0.012; dec.renderOrder = 1;
    this.group.add(dec);
    // banda exterior de arena más oscura y húmeda
    const ring = new THREE.Mesh(new THREE.RingGeometry(ARENA.floorR - 1.4, ARENA.floorR + 0.8, 96), new THREE.MeshStandardNodeMaterial({ color: '#b08a5c', map, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.008; this.group.add(ring);
    // círculo ritual en el centro
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(120,80,40,0.35)'; g.lineWidth = 6;
    for (const r of [200, 150, 60]) { g.beginPath(); g.arc(256, 256, r, 0, 7); g.stroke(); }
    g.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.moveTo(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150); g.lineTo(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200); g.stroke(); }
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace;
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicNodeMaterial({ map: ct, transparent: true, depthWrite: false }));
    cm.rotation.x = -Math.PI / 2; cm.position.y = 0.01; this.group.add(cm);
  }

  // ── podio ────────────────────────────────────────────────────────────────
  buildPodium() {
    const H = ARENA.podiumH, r0 = ARENA.floorR + 0.8, r1 = ARENA.podiumR;
    const prof = [[r0, -0.2], [r0, 0.0], [r0, H - 0.25], [r0 + 0.06, H - 0.25], [r0 + 0.06, H], [r1 + 0.3, H], [r1 + 0.3, H - 0.05]].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 96);
    worldUV(geo, prof, 96, 0.22);
    const t = stoneTex(512, { block: [3, 3], tint: '#d9c6a0', dark: 0.65 });
    const m = new THREE.MeshStandardNodeMaterial({ color: '#fff', map: t.map, normalMap: t.normalMap, roughness: 0.9, side: THREE.DoubleSide });
    const podium = new THREE.Mesh(geo, m); podium.castShadow = true; podium.receiveShadow = true;
    this.group.add(podium);
    // friso dorado / rojo
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.03, r0 + 0.03, 0.25, 96, 1, true), new THREE.MeshStandardNodeMaterial({ color: '#7a1a20', roughness: 0.7, side: THREE.DoubleSide }));
    band.position.y = H - 0.6; this.group.add(band);
    const goldBand = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.04, r0 + 0.04, 0.06, 96, 1, true), mat('gold'));
    goldBand.material = new THREE.MeshStandardNodeMaterial({ color: '#d4a640', metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
    goldBand.position.y = H - 0.4; this.group.add(goldBand);
    // barandilla en lo alto del podio
    const railMat = new THREE.MeshStandardNodeMaterial({ color: '#2a2622', metalness: 0.8, roughness: 0.5 });
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r1 + 0.05, 0.05, 6, 96), railMat); rail.rotation.x = Math.PI / 2; rail.position.y = H + 0.95; this.group.add(rail);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6), railMat, 144);
    const dm = new THREE.Object3D();
    for (let i = 0; i < 144; i++) { const a = i / 144 * Math.PI * 2; dm.position.set(Math.cos(a) * (r1 + 0.05), H + 0.48, Math.sin(a) * (r1 + 0.05)); dm.updateMatrix(); posts.setMatrixAt(i, dm.matrix); }
    this.group.add(posts);
  }

  // ── graderío ─────────────────────────────────────────────────────────────
  buildCavea() {
    const { seatR0, rows, rise, tread, podiumH } = ARENA;
    const pts = [[seatR0, podiumH]];
    let r = seatR0, y = podiumH;
    this.rowInfo = [];
    for (let i = 0; i < rows; i++) {
      // pasillos horizontales (praecinctio) cada 11 filas
      const land = (i === 11 || i === 22) ? 2.6 : 0;
      y += rise; pts.push([r, y]);
      if (land) { r += land; pts.push([r, y]); }
      r += tread; pts.push([r, y]);
      this.rowInfo.push({ r: r - tread * 0.5 - (land ? 0 : 0), y, land });
    }
    // muro trasero del graderío
    pts.push([r, y + 1.6]); pts.push([r + 1.6, y + 1.6]);
    this.cavR = r; this.cavY = y;
    const prof = pts.map(([rr, yy]) => new THREE.Vector2(rr, yy));
    const geo = new THREE.LatheGeometry(prof, 120);
    worldUV(geo, prof, 120, 0.24);
    const t = stoneTex(512, { block: [2, 4], tint: '#dcc9a2', dark: 0.7 });
    const m = new THREE.MeshStandardNodeMaterial({ color: '#fff', map: t.map, normalMap: t.normalMap, roughness: 0.92, side: THREE.DoubleSide });
    const cav = new THREE.Mesh(geo, m); cav.receiveShadow = true; cav.castShadow = true;
    this.group.add(cav);
    // pasillos radiales (vomitorios): ángulos libres de público
    this.aisles = [];
    for (let i = 0; i < 16; i++) this.aisles.push((i / 16) * Math.PI * 2 + Math.PI / 16);
  }

  // ── fachada con arcos ────────────────────────────────────────────────────
  buildFacade() {
    const R = ARENA.outerR, bays = 80;
    const bayW = (2 * Math.PI * R) / bays;
    const floors = 3, fh = 10.5, top = 7.5;
    const t = stoneTex(512, { block: [2, 3], tint: '#e0cfa8', dark: 0.7 });
    const tm = new THREE.MeshStandardNodeMaterial({ color: '#fff', map: rep(t.map, 1, 1), normalMap: rep(t.normalMap, 1, 1), roughness: 0.95, side: THREE.DoubleSide });
    // pared-arco: Shape con agujero en arco
    const shape = new THREE.Shape();
    shape.moveTo(-bayW / 2, 0); shape.lineTo(bayW / 2, 0); shape.lineTo(bayW / 2, fh); shape.lineTo(-bayW / 2, fh); shape.closePath();
    const hole = new THREE.Path();
    const aw = bayW * 0.62, ah = fh * 0.72;
    hole.moveTo(-aw / 2, 0.0); hole.lineTo(aw / 2, 0.0); hole.lineTo(aw / 2, ah - aw / 2);
    hole.absarc(0, ah - aw / 2, aw / 2, 0, Math.PI, false);
    hole.lineTo(-aw / 2, 0.0);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -1.2);
    // UV world
    const pos = geo.attributes.position, uvs = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uvs.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.18, pos.getY(i) * 0.18);
    const inst = new THREE.InstancedMesh(geo, tm, bays * floors);
    const o = new THREE.Object3D();
    let k = 0;
    for (let f = 0; f < floors; f++) for (let i = 0; i < bays; i++) {
      const a = (i + 0.5) / bays * Math.PI * 2;
      o.position.set(Math.sin(a) * R, f * fh, Math.cos(a) * R);
      o.rotation.set(0, a, 0);
      o.scale.set(1.005, 1, 1);
      o.updateMatrix(); inst.setMatrixAt(k++, o.matrix);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    this.group.add(inst);
    // cornisas y semicolumnas
    const cm = new THREE.MeshStandardNodeMaterial({ color: '#ead9b4', map: t.map, roughness: 0.9 });
    for (let f = 1; f <= floors; f++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.6, R + 1.3, 0.7, 120, 1, true), cm);
      c.material.side = THREE.DoubleSide;
      c.position.y = f * fh; c.castShadow = true; this.group.add(c);
    }
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, fh - 0.5, 12), cm, bays * floors);
    k = 0;
    for (let f = 0; f < floors; f++) for (let i = 0; i < bays; i++) {
      const a = i / bays * Math.PI * 2;
      o.position.set(Math.sin(a) * (R + 1.35), f * fh + fh / 2, Math.cos(a) * (R + 1.35)); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
      o.updateMatrix(); cols.setMatrixAt(k++, o.matrix);
    }
    cols.castShadow = true; this.group.add(cols);
    // ático: muro liso con ventanas
    const atticGeo = new THREE.CylinderGeometry(R + 1.3, R + 1.3, top, 120, 1, true);
    const am = new THREE.MeshStandardNodeMaterial({ color: '#fff', map: rep(t.map, 40, 1), normalMap: rep(t.normalMap, 40, 1), roughness: 0.92, side: THREE.DoubleSide });
    const attic = new THREE.Mesh(atticGeo, am); attic.position.y = floors * fh + top / 2; attic.castShadow = true; attic.receiveShadow = true;
    this.group.add(attic);
    const wins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 2.4, 0.8), new THREE.MeshStandardNodeMaterial({ color: '#2a2018', roughness: 1 }), bays);
    for (let i = 0; i < bays; i++) { const a = (i + 0.5) / bays * Math.PI * 2; o.position.set(Math.sin(a) * (R + 1.3), floors * fh + top / 2, Math.cos(a) * (R + 1.3)); o.rotation.set(0, a, 0); o.updateMatrix(); wins.setMatrixAt(i, o.matrix); }
    this.group.add(wins);
    // corona superior
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.2, R + 1.5, 1.1, 120, 1, true), cm);
    crown.material.side = THREE.DoubleSide; crown.position.y = floors * fh + top + 0.3; crown.castShadow = true; this.group.add(crown);
    // muro interior del graderío sube hasta la corona (cierra el anillo)
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 2.5, R - 2.5, floors * fh + top - this.cavY + 1, 120, 1, true), new THREE.MeshStandardNodeMaterial({ color: '#fff', map: rep(t.map, 40, 2), normalMap: rep(t.normalMap, 40, 2), roughness: 0.95, side: THREE.DoubleSide }));
    inner.position.y = this.cavY + (floors * fh + top - this.cavY) / 2; inner.receiveShadow = true; inner.castShadow = true; this.group.add(inner);
    // anillo de techo entre graderío y fachada (corredor superior)
    const deckProf = [[this.cavR + 1.6, this.cavY + 1.6], [R - 2.5, this.cavY + 1.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const deck = new THREE.Mesh(new THREE.RingGeometry(this.cavR + 1.6, R - 2.5, 96), new THREE.MeshStandardNodeMaterial({ color: '#b9a688', roughness: 1, side: THREE.DoubleSide }));
    deck.rotation.x = -Math.PI / 2; deck.position.y = this.cavY + 1.6; this.group.add(deck);
    this.facadeTopY = floors * fh + top;
  }

  // ── puertas ──────────────────────────────────────────────────────────────
  buildGates() {
    const r = ARENA.floorR + 0.78, H = ARENA.podiumH;
    const gateMat = new THREE.MeshStandardNodeMaterial({ color: '#0a0706', roughness: 1, side: THREE.DoubleSide });
    const iron = new THREE.MeshStandardNodeMaterial({ color: '#2b2824', metalness: 0.9, roughness: 0.45 });
    const stone = mat('stone');
    this.gates = [];
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const grp = new THREE.Group();
      grp.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      grp.rotation.y = a;
      // vano oscuro
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.6), gateMat); dark.position.set(0, 1.3, 0.05); grp.add(dark);
      const arch = new THREE.Mesh(new THREE.CircleGeometry(1.65, 20, 0, Math.PI), gateMat); arch.position.set(0, 2.6, 0.05); grp.add(arch);
      // túnel profundo
      const tun = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 8), gateMat); tun.position.set(0, 1.8, 4); grp.add(tun);
      // jambas y dintel
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.6, 0.9), stone); p.position.set(s * 2.0, 2.3, 0.1); p.castShadow = true; grp.add(p); }
      const lint = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.8, 1), stone); lint.position.set(0, 4.35, 0.1); lint.castShadow = true; grp.add(lint);
      // reja levadiza
      for (let i = -4; i <= 4; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6), iron); b.position.set(i * 0.36, 4.1, 0.25); grp.add(b); }
      for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 0.05), iron); b.position.set(0, 2.9 + j * 0.45, 0.25); grp.add(b); }
      grp.position.y = 0;
      this.group.add(grp);
      this.gates.push({ angle: a, pos: new THREE.Vector3(Math.sin(a) * (r + 3), 0, Math.cos(a) * (r + 3)), inner: new THREE.Vector3(Math.sin(a) * (r - 1.5), 0, Math.cos(a) * (r - 1.5)) });
    }
  }

  // ── palco imperial ───────────────────────────────────────────────────────
  buildImperialBox() {
    const r = ARENA.podiumR + 1.4, H = ARENA.podiumH;
    const g = new THREE.Group();
    const a = Math.PI; // palco en el lado -z… usamos ángulo con sin→x, cos→z
    g.position.set(0, H, -r - 1.5);
    g.rotation.y = Math.PI;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 6), mat('stone')); floor.position.y = 0.0; g.add(floor);
    const red = new THREE.MeshStandardNodeMaterial({ color: '#8a1420', roughness: 0.8, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardNodeMaterial({ color: '#e0b040', metalness: 1, roughness: 0.25 });
    for (const x of [-5, -1.7, 1.7, 5]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5.5, 14), mat('stone')); c.position.set(x, 3, 2.4); c.castShadow = true; g.add(c); const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), gold); cap.position.set(x, 5.8, 2.4); g.add(cap); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.4, 6.4), red); roof.position.set(0, 6.1, 0); roof.castShadow = true; g.add(roof);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.18, 6.6), gold); trim.position.set(0, 5.88, 0); g.add(trim);
    // águila dorada
    const eagle = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 8), gold); body.position.y = 0.3; eagle.add(body);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.6), gold); w.position.set(s * 0.8, 0.7, 0); w.rotation.z = s * 0.35; eagle.add(w); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), gold); head.position.y = 0.95; eagle.add(head);
    eagle.position.set(0, 6.9, 0); g.add(eagle);
    // cortinas laterales
    for (const s of [-1, 1]) { const cu = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5), red); cu.position.set(s * 4.9, 3.0, -2.6); g.add(cu); }
    // trono + asientos
    const thr = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.9), new THREE.MeshStandardNodeMaterial({ color: '#f0ead8', roughness: 0.6 })); thr.position.set(0, 1.0, -1.6); g.add(thr);
    this.group.add(g);
    this.imperial = g;
    // tribuna "emperor" cámara hacia -z: guardamos posición para la cámara
    this.imperialPos = new THREE.Vector3(0, H + 3.4, -r - 1.5);
  }

  // ── público ──────────────────────────────────────────────────────────────
  buildCrowd() {
    const Q = this.quality;
    const density = [0.5, 0.78, 1][Q] ?? 0.8;
    const positions = [];
    const rows = this.rowInfo;
    const aisleW = 0.028; // fracción angular
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const r = row.r;
      if (row.land) continue;
      const spacing = 0.78;
      const n = Math.floor((2 * Math.PI * r) / spacing);
      for (let i = 0; i < n; i++) {
        const a = (i + (ri % 2) * 0.5) / n * Math.PI * 2;
        // pasillos
        let skip = false;
        const hw = 0.9 / r;
        for (const aa of this.aisles) { const d = Math.abs(((a - aa + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (d < hw) { skip = true; break; } }
        if (skip) continue;
        // hueco para el palco imperial
        const dx = Math.sin(a), dz = Math.cos(a);
        if (ri < 4 && dz < -0.9 && Math.abs(dx) < 0.3) continue;
        positions.push([r, row.y, a, ri]);
      }
    }
    // selección aleatoria (llenar más hacia abajo)
    const N = positions.length;
    this.spectators = positions;
    const data = [];
    for (const p of positions) {
      if (Math.random() > density) continue;
      data.push(p);
    }
    const count = data.length;
    this.crowdCount = count;
    // geometrías: cuerpo (torso + falda) y cabeza
    const body = new THREE.LatheGeometry([[0.001, 0.0], [0.17, 0.02], [0.2, 0.25], [0.19, 0.42], [0.13, 0.52], [0.06, 0.56], [0.001, 0.57]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
    body.scale(1.0, 1.0, 0.75);
    const arms = new THREE.CylinderGeometry(0.05, 0.05, 0.36, 5); arms.translate(0.22, 0.46, 0); arms.rotateZ(0);
    const arms2 = arms.clone().scale(-1, 1, 1);
    const bodyG = mergeGeometries([body.index ? body.toNonIndexed() : body, arms.toNonIndexed(), arms2.toNonIndexed()]);
    const headG = new THREE.SphereGeometry(0.11, 8, 6); headG.translate(0, 0.66, 0);
    const mkMat = (colored) => {
      const m = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.9 });
      const phase = attribute('aPhase', 'vec2');
      const hop = sin(time.mul(phase.x.mul(2.0).add(3.0)).add(phase.x.mul(40.0))).abs().mul(0.14).mul(this.u.excite);
      const wv = max(sin(phase.y.mul(4.0).sub(this.u.time.mul(2.2))), 0).pow(2.0).mul(0.3).mul(this.u.wave);
      const arm = positionLocal.y.mul(0.0);
      m.positionNode = positionLocal.add(vec3(0, hop.add(wv), 0));
      return m;
    };
    const bodyM = mkMat(true), headM = mkMat(false);
    const bm = new THREE.InstancedMesh(bodyG, bodyM, count);
    const hm = new THREE.InstancedMesh(headG, headM, count);
    const ph = new Float32Array(count * 2);
    const o = new THREE.Object3D();
    const palette = ['#e8dcc0', '#d9c59a', '#b84a3a', '#8a2a2a', '#3a5c8a', '#4a7a4a', '#c8a050', '#6a4a30', '#e0d0b0', '#f0e6d0', '#7a5a8a', '#d08a3a'].map(c => new THREE.Color(c));
    const skins = ['#f0c8a0', '#e3b088', '#d09a6c', '#b87a50', '#94603c', '#6e4428'].map(c => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const [r, y, a] = data[i];
      o.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      o.rotation.set(0, a + Math.PI + (Math.random() - 0.5) * 0.3, 0);
      const s = 0.9 + Math.random() * 0.25;
      o.scale.set(s, s * (0.92 + Math.random() * 0.16), s);
      o.updateMatrix();
      bm.setMatrixAt(i, o.matrix); hm.setMatrixAt(i, o.matrix);
      bm.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
      hm.setColorAt(i, skins[Math.floor(Math.random() * skins.length)]);
      ph[i * 2] = Math.random(); ph[i * 2 + 1] = a;
    }
    bodyG.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 2));
    headG.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 2));
    bm.castShadow = false; hm.castShadow = false; bm.receiveShadow = true; hm.receiveShadow = true;
    bm.frustumCulled = false; hm.frustumCulled = false;
    this.group.add(bm, hm);
    this.crowdMeshes = [bm, hm];
  }

  // ── antorchas / pebeteros ───────────────────────────────────────────────
  buildTorches() {
    const r = ARENA.podiumR + 0.5, H = ARENA.podiumH;
    const ft = flameTex(128);
    const fm = new THREE.SpriteNodeMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    fm.fog = false;
    const glowT = softCircle(64);
    const gm = new THREE.SpriteNodeMaterial({ map: glowT, color: '#ff8a30', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    gm.fog = false;
    const stand = new THREE.MeshStandardNodeMaterial({ color: '#2a2420', metalness: 0.8, roughness: 0.5 });
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.PI / n;
      // evita las puertas
      const grp = new THREE.Group();
      grp.position.set(Math.sin(a) * r, H, Math.cos(a) * r);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.5, 8), stand); post.position.y = 0.75; post.castShadow = true; grp.add(post);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.24, 12, 1, true), stand); bowl.material.side = THREE.DoubleSide; bowl.position.y = 1.55; grp.add(bowl);
      const fl = new THREE.Sprite(fm); fl.scale.set(1.3, 1.9, 1); fl.position.y = 2.25; grp.add(fl);
      const gl = new THREE.Sprite(gm); gl.scale.set(4.5, 4.5, 1); gl.position.y = 2.0; grp.add(gl);
      this.group.add(grp);
      this.torches.push({ fl, gl, phase: Math.random() * 10, base: new THREE.Vector3(Math.sin(a) * r, H + 2.2, Math.cos(a) * r) });
    }
    // luces puntuales reales junto a las puertas (pocas para rendimiento)
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const pl = new THREE.PointLight('#ff8a3c', 40, 26, 1.6);
      pl.position.set(Math.sin(a) * (r - 0.6), H + 2.4, Math.cos(a) * (r - 0.6));
      this.group.add(pl); this.lights.push(pl);
    }
  }

  // ── estandartes ──────────────────────────────────────────────────────────
  buildBanners() {
    const n = 16;
    const T0 = clothTex(128, '#ffffff');
    // textura con emblema SPQR-like
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 512);
    g.fillStyle = 'rgba(0,0,0,0)';
    g.strokeStyle = '#f2c84a'; g.lineWidth = 10; g.strokeRect(14, 14, 228, 484);
    g.fillStyle = '#f2c84a'; g.font = 'bold 120px serif'; g.textAlign = 'center'; g.fillText('SPQR', 128, 300 + 0);
    g.font = 'bold 70px serif';
    g.beginPath(); g.moveTo(128, 70); g.lineTo(180, 200); g.lineTo(128, 170); g.lineTo(76, 200); g.closePath(); g.fill();
    g.fillRect(40, 420, 176, 10);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.bannerMat = new THREE.MeshStandardNodeMaterial({ map: tex, color: '#8a1420', roughness: 0.8, side: THREE.DoubleSide });
    // ondulación en el vértice
    const swing = sin(time.mul(1.6).add(positionLocal.y.mul(0.9)).add(positionLocal.x.mul(2.0))).mul(0.12).mul(float(1).sub(uv().y));
    this.bannerMat.positionNode = positionLocal.add(vec3(0, 0, swing.mul(2.0)));
    const geo = new THREE.PlaneGeometry(3.2, 9, 4, 12);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const r = ARENA.outerR - 3.4;
      const m = new THREE.Mesh(geo, this.bannerMat);
      m.position.set(Math.sin(a) * r, 40, Math.cos(a) * r);
      m.rotation.y = a + Math.PI;
      m.castShadow = false;
      this.group.add(m);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 6), mat('iron'));
      rod.rotation.z = Math.PI / 2; rod.rotation.y = a + Math.PI;
      rod.position.set(Math.sin(a) * r, 44.6, Math.cos(a) * r); this.group.add(rod);
    }
  }

  // ── velarium ─────────────────────────────────────────────────────────────
  buildVelarium() {
    const Rin = 38, Rout = ARENA.outerR - 3, yOut = this.facadeTopY - 1.5, yIn = yOut - 1.5;
    const count = 40;
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f0e4c8' : '#a8202a'; g.fillRect(i * 32, 0, 32, 64); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, transparent: false });
    const geo = new THREE.BufferGeometry();
    const verts = [], uvs = [], idx = [];
    // sección: sector anular hundido hacia el centro (catenaria)
    const seg = 3, step = 6;
    for (let i = 0; i <= step; i++) {
      const t = i / step;
      const r = Rout + (Rin - Rout) * t;
      const y = yOut + (yIn - yOut) * t - Math.sin(t * Math.PI) * 1.2;
      for (let j = 0; j <= seg; j++) {
        const a0 = (j / seg - 0.5) * (Math.PI * 2 / count) * 0.96;
        verts.push(Math.sin(a0) * r, y, Math.cos(a0) * r); uvs.push(j / seg, t);
      }
    }
    for (let i = 0; i < step; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + 1, cc = a + seg + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    // colocar sólo en el lado que da sombra al público lateral (mitad de las velas) para dejar el centro iluminado
    this.velarium = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const mesh = new THREE.Mesh(geo, m);
      mesh.rotation.y = a; mesh.castShadow = false; mesh.receiveShadow = false;
      this.velarium.add(mesh);
    }
    this.group.add(this.velarium);
  }

  // ── entorno exterior ─────────────────────────────────────────────────────
  buildSurroundings() {
    const gt = T().grass;
    const dirt = sandTex(512, '#b89868');
    const m = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', map: rep(gt.map, 90, 90), normalMap: rep(gt.normalMap, 90, 90), roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), m);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
    this.group.add(ground);
    // explanada de piedra/tierra alrededor del coliseo
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(ARENA.outerR + 16, 96), new THREE.MeshStandardNodeMaterial({ color: '#ffffff', map: rep(dirt.map, 40, 40), normalMap: rep(dirt.normalMap, 40, 40), roughness: 1 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = -0.02; plaza.receiveShadow = true; this.group.add(plaza);
    // cipreses instanciados
    const tree = new THREE.ConeGeometry(1.1, 9, 7); tree.translate(0, 4.5, 0);
    const trunk = new THREE.CylinderGeometry(0.15, 0.2, 1, 5); trunk.translate(0, 0.5, 0);
    const tm = new THREE.MeshStandardNodeMaterial({ color: '#2f4a2a', roughness: 0.95 });
    const N = 160;
    const im = new THREE.InstancedMesh(tree, tm, N);
    const o = new THREE.Object3D();
    let placed = 0;
    let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    while (placed < N) {
      const a = rnd() * Math.PI * 2, r = ARENA.outerR + 14 + rnd() * 260;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      // deja libre el camino hacia el ludus (z>0 estrecho)
      if (z > 40 && Math.abs(x) < 30) continue;
      o.position.set(x, 0, z); const sc = 0.8 + rnd() * 1.1; o.scale.set(sc, sc * (0.9 + rnd() * 0.5), sc); o.rotation.y = rnd() * 6; o.updateMatrix();
      im.setMatrixAt(placed++, o.matrix);
    }
    im.castShadow = true; im.receiveShadow = true; this.group.add(im);
    // colinas lejanas
    const hm = new THREE.MeshStandardNodeMaterial({ color: '#7c7450', roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + 0.2;
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm);
      h.scale.set(260 + (i * 37) % 140, 38 + (i * 53) % 60, 200);
      h.position.set(Math.sin(a) * 1050, -2, Math.cos(a) * 1050);
      h.rotation.y = a;
      this.group.add(h);
    }
  }

  // ── actualización por frame ──────────────────────────────────────────────
  update(dt, t, hype, venue) {
    this.u.time.value = t;
    const target = 0.18 + hype * 0.9;
    this.u.excite.value += (target - this.u.excite.value) * Math.min(1, dt * 2);
    const w = hype > 0.55 ? (hype - 0.55) * 2.2 : 0;
    this.u.wave.value += (w - this.u.wave.value) * Math.min(1, dt);
    for (const tc of this.torches) {
      const f = 0.9 + Math.sin(t * 11 + tc.phase) * 0.06 + Math.sin(t * 23 + tc.phase * 2) * 0.05;
      tc.fl.scale.set(1.25 * f, 1.9 * (0.92 + Math.sin(t * 9 + tc.phase) * 0.12), 1);
      tc.gl.material.opacity = 0.5 + Math.sin(t * 7 + tc.phase) * 0.1;
    }
    this.lights.forEach((l, i) => { l.intensity = 40 * (0.9 + Math.sin(t * 10 + i * 3) * 0.08 + Math.sin(t * 27 + i) * 0.04); });
    this.decals.flush();
  }
}
