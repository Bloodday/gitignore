// ────────────────────────────────────────────────────────────────────────────
//  Cámaras: rig con suavizado y vibración + controladores cinematográficos.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';

const V = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = camera.position.clone();
    this.look = new V(0, 1, 0);
    this.fov = 42;
    this.dPos = this.pos.clone();
    this.dLook = this.look.clone();
    this.dFov = 42;
    this.rate = 4;
    this.fovRate = 4;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.roll = 0;
    this.punch = 0;
    this._m = new THREE.Matrix4();
    this.enabled = true;
  }
  set(pos, look, fov, rate = 4) {
    this.dPos.copy(pos); this.dLook.copy(look); this.dFov = fov ?? this.dFov; this.rate = rate;
  }
  cut() { this.pos.copy(this.dPos); this.look.copy(this.dLook); this.fov = this.dFov; }
  shake(a) { this.shakeAmt = Math.min(1.6, Math.max(this.shakeAmt, a)); }
  fovPunch(v) { this.punch = Math.max(this.punch, v); }
  update(dt) {
    const k = 1 - Math.exp(-dt * this.rate);
    this.pos.lerp(this.dPos, k);
    this.look.lerp(this.dLook, 1 - Math.exp(-dt * this.rate * 1.3));
    this.fov += (this.dFov - this.fov) * (1 - Math.exp(-dt * this.fovRate));
    this.shakeT += dt * 38;
    const s = this.shakeAmt * this.shakeAmt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.6);
    this.punch *= Math.exp(-dt * 7);
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.position.x += Math.sin(this.shakeT * 1.3) * 0.12 * s; cam.position.y += Math.sin(this.shakeT * 1.7 + 2) * 0.1 * s; cam.position.z += Math.cos(this.shakeT * 1.1) * 0.12 * s;
    cam.lookAt(this.look);
    cam.rotateZ(Math.sin(this.shakeT * 0.9) * 0.012 * s);
    const f = this.fov - this.punch * 6;
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }
}

// ── cámara del ludus: órbita suave con arrastre del usuario ────────────────
export class LudusCam {
  constructor(rig, dom) {
    this.rig = rig;
    this.target = new V(0, 1.6, 110);
    this.yaw = 0.25; this.pitch = 0.36; this.dist = 32;
    this.focus = null; // {pos: V3}
    this.drag = null;
    this.idle = 0;
    this.auto = 0;
    this.enabled = false;
    dom.addEventListener('pointerdown', e => { if (!this.enabled || e.target !== dom.querySelector('canvas')) return; this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.idle = 0; });
    window.addEventListener('pointermove', e => {
      if (!this.drag) return;
      this.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.006;
      this.pitch = Math.min(1.1, Math.max(0.05, this.drag.pitch + (e.clientY - this.drag.y) * 0.004));
      this.idle = 0;
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    dom.addEventListener('wheel', e => { if (!this.enabled) return; this.dist = Math.min(34, Math.max(5, this.dist * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
  }
  setFocus(pos, dist = 6.5) { this.focus = pos ? { pos: pos.clone(), dist } : null; }
  update(dt, t) {
    if (!this.enabled) return;
    this.idle += dt;
    if (!this.drag && this.idle > 4) this.yaw += dt * 0.03 * (this.focus ? 2.4 : 1);
    const tg = this.focus ? this.focus.pos.clone().add(new V(0, 1.0, 0)) : this.target.clone().add(new V(0, Math.sin(t * 0.2) * 0.2, 0));
    const d = this.focus ? this.focus.dist : this.dist;
    if (this.panelOpen && window.innerWidth > 900 && !this.focus) tg.addScaledVector(new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), d * 0.2);
    const p = new V(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch) * (this.focus ? 0.55 : 1), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(d).add(tg);
    if (p.y < 0.6) p.y = 0.6;
    this.rig.set(p, tg, this.focus ? 32 : 40, this.focus ? 3.2 : 2.4);
  }
}

// ── director de la arena ────────────────────────────────────────────────────
export class ArenaDirector {
  constructor(rig) {
    this.rig = rig;
    this.theta = rnd(0, 6.28);
    this.shot = null;
    this.t = 0;
    this.impact = null;
    this.free = false;
    this.freeYaw = 0; this.freePitch = 0.35; this.freeDist = 22;
    this.tmp = new V();
    this.enabled = false;
    this.intro = null;
  }
  centroid(views) {
    const c = new V(); let n = 0;
    for (const v of views) if (v.f.alive) { c.x += v.f.x; c.z += v.f.z; n++; }
    if (!n) for (const v of views) { c.x += v.f.x; c.z += v.f.z; n++; }
    c.multiplyScalar(1 / Math.max(1, n)); return c;
  }
  spread(views, c) {
    let m = 0; for (const v of views) if (v.f.alive) m = Math.max(m, Math.hypot(v.f.x - c.x, v.f.z - c.z)); return m;
  }
  newShot(views) {
    const kinds = ['wide', 'low', 'duel', 'shoulder', 'high', 'crane', 'duel'];
    const alive = views.filter(v => v.f.alive);
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (alive.length < 2 && (kind === 'duel' || kind === 'shoulder')) kind = 'wide';
    this.shot = { kind, dur: rnd(3.2, 5.6), t: 0, dir: Math.random() < 0.5 ? 1 : -1, off: rnd(0, 6.28), pick: alive.length ? alive[Math.floor(Math.random() * alive.length)] : null };
  }
  /** cierre de impacto: acerca la cámara al punto brevemente */
  focusImpact(pos, dur = 0.9, strength = 1) {
    this.impact = { pos: pos.clone(), t: 0, dur, strength };
  }
  clampInside(p) {
    const r = Math.hypot(p.x, p.z);
    if (r > 16.2) { p.x *= 16.2 / r; p.z *= 16.2 / r; }
    if (p.y < 1.6) p.y = 1.6;
    return p;
  }
  update(dt, views, hype = 0) {
    if (!this.enabled) return;
    this.t += dt;
    const c = this.centroid(views);
    const sp = this.spread(views, c);
    if (!this.shot || this.shot.t > this.shot.dur) this.newShot(views);
    const S = this.shot; S.t += dt;
    this.theta += dt * 0.07 * S.dir;
    const pos = this.tmp; const look = new V(c.x, 1.5, c.z);
    let fov = 40, rate = 2.6;
    const th = this.theta + S.off;
    switch (S.kind) {
      case 'wide': pos.set(c.x + Math.sin(th) * (11 + sp * 1.3), 5.4 + sp * 0.3, c.z + Math.cos(th) * (11 + sp * 1.3)); fov = 42; look.y = 1.4; break;
      case 'high': pos.set(c.x + Math.sin(th) * (9 + sp * 0.8), 11.5 + sp * 0.4, c.z + Math.cos(th) * (9 + sp * 0.8)); fov = 38; look.y = 0.8; break;
      case 'low': pos.set(c.x + Math.sin(th) * (8.5 + sp * 1.1), 1.7, c.z + Math.cos(th) * (8.5 + sp * 1.1)); fov = 44; look.y = 2.1; break;
      case 'crane': { const k = S.t / S.dur; pos.set(c.x + Math.sin(th + k) * (10 + sp), 2.6 + k * 7, c.z + Math.cos(th + k) * (10 + sp)); fov = 40; look.y = 1.5; break; }
      case 'duel': {
        const a = S.pick?.f, bb = this.otherOf(S.pick, views);
        if (a && bb) {
          const mx = (a.x + bb.x) / 2, mz = (a.z + bb.z) / 2;
          const dx = bb.x - a.x, dz = bb.z - a.z, L = Math.hypot(dx, dz) || 1;
          const nx = -dz / L * S.dir, nz = dx / L * S.dir;
          pos.set(mx + nx * (6.2 + L * 0.9), 2.3, mz + nz * (6.2 + L * 0.9)); look.set(mx, 1.5, mz); fov = 38;
        } else { pos.set(c.x + Math.sin(th) * 8, 3, c.z + Math.cos(th) * 8); }
        break;
      }
      case 'shoulder': {
        const a = S.pick?.f, bb = this.otherOf(S.pick, views);
        if (a && bb) {
          const dx = bb.x - a.x, dz = bb.z - a.z, L = Math.hypot(dx, dz) || 1;
          pos.set(a.x - dx / L * 4.2 + (-dz / L) * 1.1, 2.6, a.z - dz / L * 4.2 + (dx / L) * 1.1); look.set(bb.x, 1.6, bb.z); fov = 40; rate = 4;
        } else pos.set(c.x + 7, 3, c.z + 7);
        break;
      }
    }
    // impacto: primer plano breve
    if (this.impact) {
      const I = this.impact; I.t += dt;
      if (I.t > I.dur) this.impact = null;
      else {
        const k = I.t / I.dur;
        const dir = new V(pos.x - I.pos.x, 0, pos.z - I.pos.z).normalize();
        const ip = new V(I.pos.x + dir.x * 4.4, 2.1, I.pos.z + dir.z * 4.4);
        const w = Math.sin(Math.min(1, k) * Math.PI) * I.strength;
        pos.lerp(ip, Math.min(0.85, w));
        look.lerp(new V(I.pos.x, 1.5, I.pos.z), Math.min(0.9, w));
        fov = fov + (34 - fov) * Math.min(1, w); rate = 6;
      }
    }
    if (this.free) {
      pos.set(Math.sin(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist, Math.sin(this.freePitch) * this.freeDist + 1, Math.cos(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist);
      look.set(c.x, 1, c.z); fov = 42; rate = 6;
    } else this.clampInside(pos);
    this.rig.set(pos, look, fov, rate);
  }
  otherOf(view, views) {
    if (!view) return null;
    let best = null, bd = 1e9;
    for (const v of views) if (v.f.alive && v.f.team !== view.f.team) { const d = Math.hypot(v.f.x - view.f.x, v.f.z - view.f.z); if (d < bd) { bd = d; best = v.f; } }
    return best;
  }
}
