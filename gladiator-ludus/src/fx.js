// ────────────────────────────────────────────────────────────────────────────
//  Efectos visuales: partículas (aditivas y normales), estelas de arma,
//  anillos de choque, rayos, columnas de luz y números flotantes.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import { softCircle, smokePuff, ringTex, streakTex } from './textures.js';

const V = THREE.Vector3;
const tmpO = new THREE.Object3D();
const tmpC = new THREE.Color();

class Pool {
  constructor(scene, max, additive, tex) {
    this.max = max; this.additive = additive;
    const mat = new THREE.SpriteNodeMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    mat.fog = !additive;
    if (!additive) {
      this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
      mat.opacityNode = attribute('aAlpha', 'float');
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    if (!additive) geo.setAttribute('aAlpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = max;
    for (let i = 0; i < max; i++) { tmpO.position.set(0, -999, 0); tmpO.scale.setScalar(0.0001); tmpO.updateMatrix(); this.mesh.setMatrixAt(i, tmpO.matrix); this.mesh.setColorAt(i, tmpC.set('#fff')); }
    this.mesh.renderOrder = additive ? 6 : 5;
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false, pos: new V(), vel: new V(), life: 0, max: 1, s0: 1, s1: 1, col: new THREE.Color(), a0: 1, grav: 0, drag: 0, rot: 0, rotV: 0, fade: 'out' });
    this.cursor = 0;
  }
  spawn(o) {
    for (let k = 0; k < this.max; k++) {
      const i = (this.cursor + k) % this.max;
      const p = this.p[i];
      if (!p.alive) { this.cursor = (i + 1) % this.max; return this.init(p, o); }
    }
    // pool lleno: reciclar el más antiguo
    const p = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.max; return this.init(p, o);
  }
  init(p, o) {
    p.alive = true; p.pos.copy(o.pos); p.vel.copy(o.vel || ZERO); p.life = 0; p.max = o.life || 1;
    p.s0 = o.s0 ?? 0.3; p.s1 = o.s1 ?? p.s0; p.col.set(o.color || '#fff'); p.a0 = o.alpha ?? 1; p.grav = o.grav ?? 0; p.drag = o.drag ?? 0;
    p.fade = o.fade || 'out';
    return p;
  }
  update(dt, cam) {
    const m = this.mesh;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false; tmpO.position.set(0, -999, 0); tmpO.scale.setScalar(0.0001); tmpO.updateMatrix(); m.setMatrixAt(i, tmpO.matrix);
        if (!this.additive) this.alpha.setX(i, 0);
        continue;
      }
      const t = p.life / p.max;
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03 && p.grav > 0) { p.pos.y = 0.03; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; }
      const s = p.s0 + (p.s1 - p.s0) * t;
      const fade = p.fade === 'out' ? (1 - t) * Math.min(1, t * 12) : p.fade === 'pop' ? Math.sin(t * Math.PI) : (1 - t * t);
      tmpO.position.copy(p.pos); tmpO.scale.set(s, s, s); tmpO.updateMatrix();
      m.setMatrixAt(i, tmpO.matrix);
      if (this.additive) { tmpC.copy(p.col).multiplyScalar(fade * p.a0); m.setColorAt(i, tmpC); }
      else { this.alpha.setX(i, fade * p.a0); m.setColorAt(i, p.col); }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (!this.additive) this.alpha.needsUpdate = true;
  }
}
const ZERO = new V();

// Estela de arma (cinta con historial de posiciones)
export class Trail {
  constructor(scene, color = '#ffffff', n = 16) {
    this.n = n;
    this.color = new THREE.Color(color);
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    m.fog = false;
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    this.hist = []; // [{a: V3, b: V3}]
    this.active = false; this.fade = 0; this.strength = 1;
  }
  setColor(c) { this.color.set(c); }
  begin() { this.active = true; }
  end() { this.active = false; }
  update(dt, tip, base) {
    if (this.active && tip) {
      this.hist.unshift({ a: tip.clone(), b: base.clone() });
      if (this.hist.length > this.n) this.hist.pop();
    } else if (this.hist.length) {
      this.hist.pop(); this.hist.pop();
    }
    const h = this.hist;
    for (let i = 0; i < this.n; i++) {
      const s = h[Math.min(i, h.length - 1)];
      const k = h.length ? Math.max(0, 1 - i / Math.max(1, h.length)) : 0;
      const w = i < h.length ? k * k * this.strength : 0;
      if (s) {
        this.pos[i * 6] = s.a.x; this.pos[i * 6 + 1] = s.a.y; this.pos[i * 6 + 2] = s.a.z;
        this.pos[i * 6 + 3] = s.b.x; this.pos[i * 6 + 4] = s.b.y; this.pos[i * 6 + 5] = s.b.z;
      }
      this.col[i * 6] = this.color.r * w; this.col[i * 6 + 1] = this.color.g * w; this.col[i * 6 + 2] = this.color.b * w;
      this.col[i * 6 + 3] = this.color.r * w * 0.15; this.col[i * 6 + 4] = this.color.g * w * 0.15; this.col[i * 6 + 5] = this.color.b * w * 0.15;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = h.length > 1;
  }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.add = new Pool(scene, 1800, true, softCircle(64));
    this.smoke = new Pool(scene, 900, false, smokePuff(96));
    this.rings = [];
    this.ringTexture = ringTex(256);
    this.ringMat = (c) => { const m = new THREE.MeshBasicNodeMaterial({ map: this.ringTexture, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); m.fog = false; return m; };
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ringMat('#ffffff'));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 6; scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, r0: 0, r1: 1, on: false, col: new THREE.Color() });
    }
    this.columns = [];
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); colGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(colGeo, new THREE.MeshBasicNodeMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 6; scene.add(m);
      this.columns.push({ mesh: m, t: 0, dur: 1, on: false, r: 1, h: 5, col: new THREE.Color() });
    }
    this.bolts = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BufferGeometry();
      const n = 14;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = []; for (let k = 0; k < n - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial({ color: '#cfe4ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 8; scene.add(m);
      this.bolts.push({ mesh: m, n, t: 0, dur: 0.4, on: false, top: new V(), bottom: new V() });
    }
    this.light = new THREE.PointLight('#ffd090', 0, 14, 1.8);
    scene.add(this.light);
    this.lightT = 0; this.lightI = 0;
    this.motes = 0;
    this.dmgLayer = document.getElementById('dmg-layer');
    this.dmgPool = [];
  }

  // ── primitivas ───────────────────────────────────────────────────────────
  spark(pos, vel, o = {}) { return this.add.spawn({ pos, vel, life: o.life ?? 0.5, s0: o.s0 ?? 0.1, s1: o.s1 ?? 0.02, color: o.color ?? '#ffcf80', grav: o.grav ?? 9, drag: o.drag ?? 0.6, alpha: o.alpha ?? 1 }); }
  glow(pos, o = {}) { return this.add.spawn({ pos, vel: o.vel, life: o.life ?? 0.3, s0: o.s0 ?? 0.6, s1: o.s1 ?? 1.6, color: o.color ?? '#ffd8a0', alpha: o.alpha ?? 1, fade: 'out' }); }
  puff(pos, vel, o = {}) { return this.smoke.spawn({ pos, vel, life: o.life ?? 1.0, s0: o.s0 ?? 0.6, s1: o.s1 ?? 1.8, color: o.color ?? '#cdb08a', alpha: o.alpha ?? 0.5, grav: o.grav ?? -0.2, drag: o.drag ?? 1.5, fade: o.fade ?? 'out' }); }

  // ── ráfagas con nombre ───────────────────────────────────────────────────
  hitSparks(pos, dir, big = false, color = '#ffd28a') {
    const n = big ? 26 : 12;
    for (let i = 0; i < n; i++) {
      const v = new V((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6).addScaledVector(dir, 4 + Math.random() * 5);
      this.spark(pos, v, { life: 0.3 + Math.random() * 0.4, s0: 0.12 + Math.random() * 0.06, s1: 0.0, color, grav: 10 });
    }
    this.glow(pos, { s0: big ? 1.4 : 0.8, s1: big ? 3.4 : 1.8, life: 0.18, color: '#fff2d0' });
    this.flash(pos, big ? 26 : 12, 0.12, '#ffd9a0');
  }
  clang(pos, dir) {
    for (let i = 0; i < 18; i++) {
      const v = new V((Math.random() - 0.5) * 8, Math.random() * 4 + 0.5, (Math.random() - 0.5) * 8).addScaledVector(dir, 2);
      this.spark(pos, v, { life: 0.25 + Math.random() * 0.3, s0: 0.1, s1: 0, color: '#cfe8ff', grav: 8 });
    }
    this.glow(pos, { s0: 1.0, s1: 2.6, life: 0.14, color: '#d8ecff' });
    this.flash(pos, 14, 0.1, '#d8ecff');
  }
  dust(pos, n = 10, spread = 1, size = 0.9, color = '#d6b88a') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = (0.4 + Math.random()) * spread;
      this.puff(new V(pos.x + Math.cos(a) * 0.2, 0.1, pos.z + Math.sin(a) * 0.2), new V(Math.cos(a) * sp, 0.3 + Math.random() * 0.8, Math.sin(a) * sp), { life: 0.9 + Math.random() * 0.7, s0: size * 0.5, s1: size * 1.8, color, alpha: 0.45 });
    }
  }
  blood(pos, dir, n = 8) {
    for (let i = 0; i < n; i++) {
      const v = new V((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3).addScaledVector(dir, 2 + Math.random() * 3);
      this.smoke.spawn({ pos, vel: v, life: 0.5 + Math.random() * 0.4, s0: 0.1, s1: 0.06, color: '#6a0f10', alpha: 0.9, grav: 12, drag: 0.4 });
    }
  }
  embers(pos, n = 6, color = '#ff9a40') {
    for (let i = 0; i < n; i++) this.spark(new V(pos.x + (Math.random() - 0.5) * 0.5, pos.y, pos.z + (Math.random() - 0.5) * 0.5), new V((Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2), { life: 1.2 + Math.random() * 1.5, s0: 0.07, s1: 0.0, color, grav: -0.5, drag: 0.4 });
  }
  magic(pos, color = '#ffe08a', n = 20, radius = 1.0, up = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.random() * radius;
      this.spark(new V(pos.x + Math.cos(a) * r, pos.y + Math.random() * 0.3, pos.z + Math.sin(a) * r), new V(0, up * (0.5 + Math.random()), 0), { life: 0.8 + Math.random() * 0.8, s0: 0.14, s1: 0.0, color, grav: -0.5, drag: 0.5 });
    }
  }
  confetti(pos, n = 40) {
    const cols = ['#ffd24a', '#e04040', '#ffffff', '#4ab0ff'];
    for (let i = 0; i < n; i++) this.spark(pos, new V((Math.random() - 0.5) * 10, 6 + Math.random() * 6, (Math.random() - 0.5) * 10), { life: 1.6 + Math.random(), s0: 0.14, s1: 0.1, color: cols[i % 4], grav: 7, drag: 0.8 });
  }

  ring(pos, r1, color = '#ffd28a', dur = 0.6, r0 = 0.3) {
    const r = this.rings.find(x => !x.on) || this.rings[0];
    r.on = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.col.set(color);
    r.mesh.position.set(pos.x, 0.06, pos.z); r.mesh.visible = true; r.mesh.material.color.copy(r.col);
  }
  column(pos, color = '#ffe08a', radius = 0.9, height = 6, dur = 1.0) {
    const c = this.columns.find(x => !x.on) || this.columns[0];
    c.on = true; c.t = 0; c.dur = dur; c.r = radius; c.h = height; c.col.set(color);
    c.mesh.position.set(pos.x, pos.y ?? 0, pos.z); c.mesh.visible = true; c.mesh.material.color.copy(c.col);
  }
  bolt(target, height = 26) {
    const b = this.bolts.find(x => !x.on) || this.bolts[0];
    b.on = true; b.t = 0; b.dur = 0.45; b.bottom.set(target.x, 0, target.z); b.top.set(target.x + (Math.random() - 0.5) * 3, height, target.z + (Math.random() - 0.5) * 3);
    b.mesh.visible = true; this.rebuildBolt(b);
    this.flash(new V(target.x, 3, target.z), 140, 0.3, '#b8d8ff');
    for (let i = 0; i < 30; i++) this.spark(new V(target.x, 0.2, target.z), new V((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12), { life: 0.4 + Math.random() * 0.4, s0: 0.14, s1: 0, color: '#b8d8ff', grav: 14 });
    this.ring(target, 3.4, '#b8d8ff', 0.5, 0.4);
    this.dust(target, 8, 3, 1.4);
  }
  rebuildBolt(b) {
    const a = b.mesh.geometry.attributes.position;
    const dir = new V().subVectors(b.top, b.bottom);
    const side = new V(dir.z, 0, -dir.x).normalize();
    const side2 = new V(1, 0, 0);
    for (let i = 0; i < b.n; i++) {
      const t = i / (b.n - 1);
      const p = new V().lerpVectors(b.bottom, b.top, t);
      const amp = Math.sin(t * Math.PI) * 1.4 + 0.15;
      if (i > 0 && i < b.n - 1) { p.x += (Math.random() - 0.5) * amp * 1.4; p.z += (Math.random() - 0.5) * amp * 1.4; }
      const w = 0.22 * (1 - t * 0.5);
      a.setXYZ(i * 2, p.x - w, p.y, p.z); a.setXYZ(i * 2 + 1, p.x + w, p.y, p.z);
    }
    a.needsUpdate = true;
  }
  flash(pos, intensity = 20, dur = 0.12, color = '#ffd9a0') {
    if (intensity < this.lightI * (1 - this.lightT / Math.max(0.001, this.lightDur || 1))) return;
    this.light.position.copy(pos); this.light.position.y = Math.max(pos.y, 1.2); this.light.color.set(color);
    this.lightI = intensity; this.lightT = 0; this.lightDur = dur;
  }

  // ── números flotantes ────────────────────────────────────────────────────
  float(text, worldPos, cls = '') {
    if (!this.dmgLayer) return;
    let el = this.dmgPool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'dmg'; }
    el.className = 'dmg ' + cls;
    el.textContent = text;
    el._w = worldPos.clone(); el._t = 0; el._dx = (Math.random() - 0.5) * 60;
    this.dmgLayer.appendChild(el);
    (this.floating ||= []).push(el);
  }
  updateFloat(dt, w, h) {
    if (!this.floating) return;
    const v = new V();
    for (let i = this.floating.length - 1; i >= 0; i--) {
      const el = this.floating[i];
      el._t += dt;
      const T = el.classList.contains('crit') ? 1.5 : 1.1;
      if (el._t > T) { el.remove(); this.dmgPool.push(el); this.floating.splice(i, 1); continue; }
      v.copy(el._w); v.y += el._t * 1.4;
      v.project(this.camera);
      const vis = v.z < 1;
      const x = (v.x * 0.5 + 0.5) * w + el._dx * Math.min(1, el._t * 2), y = (-v.y * 0.5 + 0.5) * h;
      const k = el._t / T;
      const sc = el.classList.contains('crit') ? (k < 0.15 ? 0.6 + k / 0.15 * 0.9 : 1.5 - (k - 0.15) * 0.4) : 1;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${sc})`;
      el.style.opacity = vis ? String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) : '0';
    }
  }

  update(dt, w, h) {
    this.add.update(dt, this.camera);
    this.smoke.update(dt, this.camera);
    for (const r of this.rings) if (r.on) {
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { r.on = false; r.mesh.visible = false; continue; }
      const s = (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 3)) * 2;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.color.copy(r.col).multiplyScalar(1 - k);
    }
    for (const c of this.columns) if (c.on) {
      c.t += dt; const k = c.t / c.dur;
      if (k >= 1) { c.on = false; c.mesh.visible = false; continue; }
      const e = Math.min(1, k * 5);
      c.mesh.scale.set(c.r * (1 - k * 0.4), c.h * e, c.r * (1 - k * 0.4));
      c.mesh.material.color.copy(c.col).multiplyScalar((1 - k) * 0.9);
    }
    for (const b of this.bolts) if (b.on) {
      b.t += dt; const k = b.t / b.dur;
      if (k >= 1) { b.on = false; b.mesh.visible = false; continue; }
      if (Math.random() < 0.5) this.rebuildBolt(b);
      b.mesh.material.color.set('#dcecff').multiplyScalar((1 - k) * (0.6 + Math.random() * 0.6) * 3);
    }
    if (this.lightI > 0) {
      this.lightT += dt; const k = this.lightT / this.lightDur;
      this.light.intensity = k >= 1 ? 0 : this.lightI * (1 - k) ** 2;
      if (k >= 1) this.lightI = 0;
    }
    this.updateFloat(dt, w, h);
  }
}
