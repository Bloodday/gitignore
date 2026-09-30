// ────────────────────────────────────────────────────────────────────────────
//  Capa de presentación del combate: traduce los eventos del núcleo en
//  animación, partículas, cámara, sonido y HUD.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';
import { Battle, ARENA_R } from './combat.js';
import { Avatar } from './model.js';
import { Animator } from './animator.js';
import { Trail } from './fx.js';
import { SKILLS, CLASSES, RARITY } from './data.js';
import { ArenaDirector } from './camera.js';

const V = THREE.Vector3;
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const SKILL_TRAIL = { whirl: '#b8d8ff', blade: '#ff9ad0', pierce: '#ffe6a0', bash: '#ffd28a', leap: '#ffd28a', frenzy: '#ff5a4a' };

class FighterView {
  constructor(arena, f) {
    this.arena = arena; this.f = f;
    this.avatar = new Avatar(f.g);
    this.anim = new Animator(this.avatar);
    this.avatar.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    arena.scene.add(this.avatar.root);
    const w = f.g.equip?.weapon;
    const col = w && w.rarity >= 2 ? RARITY[w.rarity].color : '#e8f0ff';
    this.trails = { weaponR: new Trail(arena.scene, col, 18), weaponL: new Trail(arena.scene, col, 18) };
    this.timers = [];
    this.stepAcc = 0; this.statusT = 0; this.prevPos = new V(f.x, 0, f.z);
    this.lastHp = f.hp; this.ghostHp = f.hp;
    this.tipA = new V(); this.tipB = new V();
    this.net = null;
    this.buildBar();
    this.dead = false;
    this.trailOn = { weaponR: false, weaponL: false };
    this.introStart = null;
  }
  buildBar() {
    const el = document.createElement('div');
    el.className = 'fbar team' + this.f.team + (this.f.g.isBoss ? ' boss' : '');
    el.innerHTML = `<div class="fn"><span class="fl">${this.f.level}</span><span class="nm">${this.f.name}</span><span class="st"></span></div><div class="hp"><div class="ghost"></div><div class="fill"></div></div>`;
    this.arena.barsLayer.appendChild(el);
    this.el = el; this.elFill = el.querySelector('.fill'); this.elGhost = el.querySelector('.ghost'); this.elSt = el.querySelector('.st');
  }
  schedule(t, fn) { this.timers.push({ t, fn }); }
  setTrail(key, on) { this.trailOn[key] = on; const tr = this.trails[key]; on ? tr.begin() : tr.end(); }
  get headPos() { return new V(this.f.x, (this.avatar.height || 1.8) + 0.25, this.f.z); }
  get chestPos() { return new V(this.f.x, (this.avatar.height || 1.8) * 0.65, this.f.z); }
  update(dt, realDt, camera, w, h) {
    const f = this.f, av = this.avatar, B = av.bones;
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    // transformación
    if (!this.override) {
      av.root.position.set(f.x, f.h, f.z);
      av.root.rotation.y = f.yaw;
    }
    const sp = f.state === 'move' ? (f.speedNow || 0) : 0;
    this.anim.stun(f.state === 'stun');
    this.anim.update(dt, this.override ? this.overrideSpeed : sp);
    av.root.updateMatrixWorld(true);
    // estelas
    for (const key of ['weaponR', 'weaponL']) {
      const t = av.tips[key]; const tr = this.trails[key];
      if (t) { t.tip.getWorldPosition(this.tipA); t.base.getWorldPosition(this.tipB); tr.update(dt, this.tipA, this.tipB); } else tr.update(dt, null, null);
    }
    // pasos
    if (f.alive && f.state === 'move' && f.h < 0.1) {
      const dx = f.x - this.prevPos.x, dz = f.z - this.prevPos.z;
      this.stepAcc += Math.hypot(dx, dz);
      if (this.stepAcc > 0.9) {
        this.stepAcc = 0;
        this.arena.colo.decals.foot(f.x - Math.sin(f.yaw) * 0.1 + Math.cos(f.yaw) * 0.1 * (Math.random() < 0.5 ? 1 : -1), f.z - Math.cos(f.yaw) * 0.1, f.yaw);
        this.arena.fx.dust(new V(f.x, 0, f.z), 2, 0.6, 0.45);
      }
    }
    this.prevPos.set(f.x, 0, f.z);
    // estados
    this.updateStatus(dt, f);
    this.updateBar(dt, camera, w, h);
    if (this.net) { this.net.visible = f.alive && f.has('root'); if (this.net.visible) { this.net.position.set(f.x, 0.05, f.z); this.net.rotation.y += dt * 0.0; } }
  }
  updateStatus(dt, f) {
    if (!f.alive) return;
    this.statusT += dt;
    if (this.statusT < 0.1) return;
    this.statusT = 0;
    const fx = this.arena.fx, head = this.headPos;
    if (f.has('stun')) {
      const a = this.arena.time * 9;
      fx.spark(new V(head.x + Math.cos(a) * 0.35, head.y - 0.05, head.z + Math.sin(a) * 0.35), new V(0, 0, 0), { life: 0.35, s0: 0.16, s1: 0.04, color: '#ffe680', grav: 0 });
    }
    if (f.has('regen')) fx.spark(new V(f.x + (Math.random() - 0.5), 0.2, f.z + (Math.random() - 0.5)), new V(0, 2.2, 0), { life: 0.9, s0: 0.13, s1: 0, color: '#8aff9a', grav: -0.3 });
    if (f.has('frenzy')) fx.spark(new V(f.x + (Math.random() - 0.5) * 0.6, 0.3, f.z + (Math.random() - 0.5) * 0.6), new V(0, 2.4, 0), { life: 0.7, s0: 0.12, s1: 0, color: '#ff4030', grav: -0.3 });
    if (f.has('dmgUp')) fx.spark(new V(f.x + (Math.random() - 0.5) * 0.6, 0.3, f.z + (Math.random() - 0.5) * 0.6), new V(0, 1.8, 0), { life: 0.6, s0: 0.1, s1: 0, color: '#ffb040', grav: -0.3 });
    if (f.has('armorUp')) fx.spark(new V(f.x + (Math.random() - 0.5) * 0.6, 0.3, f.z + (Math.random() - 0.5) * 0.6), new V(0, 1.6, 0), { life: 0.6, s0: 0.1, s1: 0, color: '#8ac4ff', grav: -0.3 });
    if (f.has('blind')) fx.puff(new V(head.x, head.y - 0.12, head.z), new V((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4), { life: 0.6, s0: 0.15, s1: 0.4, color: '#d6b88a', alpha: 0.5 });
    if (f.has('slow')) fx.puff(new V(f.x, 0.1, f.z), new V(0, 0.2, 0), { life: 0.6, s0: 0.3, s1: 0.8, color: '#9a8a7a', alpha: 0.3 });
    if (f.has('taunted')) fx.spark(new V(head.x, head.y + 0.1, head.z), new V(0, 1.2, 0), { life: 0.5, s0: 0.14, s1: 0, color: '#ff5a5a', grav: 0 });
    // iconos de estado
    const icons = [];
    if (f.has('stun')) icons.push('💫'); if (f.has('root')) icons.push('🕸️'); if (f.has('blind')) icons.push('🏜️'); if (f.has('regen')) icons.push('✨');
    if (f.has('frenzy')) icons.push('🩸'); if (f.has('dmgUp')) icons.push('📯'); if (f.has('armorUp')) icons.push('🛡️'); if (f.has('slow')) icons.push('🐌'); if (f.has('taunted')) icons.push('😡');
    const s = icons.join('');
    if (this._icons !== s) { this._icons = s; this.elSt.textContent = s; }
  }
  updateBar(dt, cam, w, h) {
    const f = this.f;
    const frac = Math.max(0, f.hp / f.maxHp);
    this.ghostHp += (f.hp - this.ghostHp) * Math.min(1, dt * 2.2);
    this.elFill.style.width = (frac * 100).toFixed(1) + '%';
    this.elGhost.style.width = (Math.max(0, this.ghostHp / f.maxHp) * 100).toFixed(1) + '%';
    if (frac < 0.3) this.el.classList.add('low'); else this.el.classList.remove('low');
    const p = this.headPos;
    p.project(cam);
    const vis = p.z < 1 && f.alive;
    this.el.style.opacity = vis ? (this.arena.phase === 'fight' || this.arena.phase === 'outro' ? 1 : 0) : 0;
    this.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h - 4}px) translate(-50%, -100%)`;
  }
  dispose() {
    this.arena.scene.remove(this.avatar.root);
    this.avatar.dispose();
    for (const k in this.trails) this.trails[k].dispose(this.arena.scene);
    this.el.remove();
    if (this.net) { this.arena.scene.remove(this.net); }
  }
}

export class ArenaView {
  constructor({ engine, colo, fx, audio, rig, hud }) {
    this.eng = engine; this.scene = engine.scene; this.colo = colo; this.fx = fx; this.audio = audio; this.rig = rig; this.hud = hud;
    this.director = new ArenaDirector(rig);
    this.barsLayer = document.getElementById('bars-layer');
    this.views = [];
    this.battle = null;
    this.phase = 'idle';
    this.time = 0;
    this.speed = 1;
    this.slow = 1; this.slowT = 0; this.hitStop = 0;
    this.settings = { blood: true, shake: true };
    this.netGeo = new THREE.IcosahedronGeometry(1, 1);
    this.netMat = new THREE.MeshBasicNodeMaterial({ color: '#d8c090', wireframe: true });
    const cv = this.eng.renderer.domElement;
    cv.addEventListener('pointerdown', e => { if (!this.director.free) return; this.drag = { x: e.clientX, y: e.clientY, yaw: this.director.freeYaw, pitch: this.director.freePitch }; });
    window.addEventListener('pointermove', e => { if (!this.drag) return; this.director.freeYaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.006; this.director.freePitch = Math.min(1.25, Math.max(0.05, this.drag.pitch + (e.clientY - this.drag.y) * 0.004)); });
    window.addEventListener('pointerup', () => { this.drag = null; });
    cv.addEventListener('wheel', e => { if (this.director.free) { this.director.freeDist = Math.min(40, Math.max(6, this.director.freeDist * (1 + e.deltaY * 0.001))); e.preventDefault(); } }, { passive: false });
  }

  viewOf(f) { return this.views.find(v => v.f === f); }

  clear() {
    this.lingering = false;
    for (const v of this.views) v.dispose();
    this.views = [];
    this.barsLayer.innerHTML = '';
  }

  // ── flujo principal del combate ─────────────────────────────────────────
  /** cfg: { squad: [g], rounds: [[enemyG...]], venue, modeName } */
  runMatch(cfg) {
    return new Promise(resolve => {
      this.cfg = cfg; this.resolve = resolve;
      this.roundIdx = 0; this.carry = new Map();
      this.result = { won: false, rounds: 0, stats: new Map(), hype: 0, kills: new Map() };
      this.director.enabled = true; this.director.free = false;
      this.startRound();
    });
  }

  startRound() {
    this.clear();
    const cfg = this.cfg;
    const squad = cfg.squad.filter(g => !(this.carry.get(g.id)?.dead));
    const foes = cfg.rounds[this.roundIdx];
    for (const g of squad) { g._hpFrac = this.carry.get(g.id)?.frac ?? 1; }
    for (const g of foes) g._hpFrac = 1;
    this.battle = new Battle([squad, foes], { hype: 0.15 });
    this.battle.views = this.views;
    for (const f of this.battle.fighters) this.views.push(new FighterView(this, f));
    for (const v of this.views) {
      const n = new THREE.Mesh(this.netGeo, this.netMat); n.scale.setScalar(0.85 * v.f.size); n.position.y = 0.75 * v.f.size;
      const g = new THREE.Group(); g.add(n); g.visible = false; this.scene.add(g); v.net = g;
    }
    // entrada desde las puertas
    const gates = this.colo.gates;
    this.phase = 'intro'; this.introT = 0;
    this.views.forEach((v, i) => {
      const f = v.f;
      const gate = gates.find(g => Math.abs(Math.sin(g.angle) * (f.team === 0 ? -1 : 1) - 1) < 0.01) || gates[0];
      v.introFrom = new V(gate.inner.x, 0, gate.inner.z);
      v.introTo = new V(f.x, 0, f.z);
      v.introDelay = 0.3 + (i % 3) * 0.35;
      v.override = true; v.overrideSpeed = 0;
      v.avatar.root.position.copy(v.introFrom);
    });
    this.hud.fightShow(true, this.cfg, this.roundIdx);
    this.audio.setMode('arena');
    this.audio.setCrowd(0.3);
    this.audio.horn();
    this.hud.banner(this.cfg.rounds.length > 1 ? `Ronda ${this.roundIdx + 1} de ${this.cfg.rounds.length}` : this.cfg.venue.name, this.cfg.modeName, 2.6);
    this.colo.decals.clear();
  }

  update(realDt, w, h) {
    this.time += realDt;
    const dtBase = Math.min(realDt, 0.05);
    let scale = this.speed;
    // slow-mo y hit-stop
    if (this.hitStop > 0) { this.hitStop -= realDt; scale *= 0.04; }
    if (this.slowT > 0) { this.slowT -= realDt; scale *= this.slow; }
    const dt = dtBase * scale;

    if (this.phase === 'intro') this.updateIntro(dtBase);
    else if (this.phase === 'fight' || this.phase === 'outro') {
      const n = Math.max(1, Math.ceil(dt / (1 / 40)));
      for (let i = 0; i < n; i++) this.battle.step(dt / n);
      this.processEvents();
      if (this.phase === 'outro') {
        this.outroT += dtBase;
        if (this.outroT > 3.4) this.endRound();
      }
    }
    for (const v of this.views) v.update(this.phase === 'idle' && !this.lingering ? 0 : (this.phase === 'idle' ? realDt : dt), realDt, this.eng.camera, w, h);
    if (this.battle) {
      this.colo.update(realDt, this.time, this.battle.hype, this.cfg?.venue);
      this.audio.hype = this.battle.hype;
      this.audio.setCrowd(0.18 + this.battle.hype * 0.75 * this.cfg.venue.crowd);
    }
    if (this.phase !== 'idle' || this.lingering) this.director.update(realDt, this.views, this.battle?.hype || 0);
    if (this.phase !== 'idle' || this.lingering) this.hud.fightUpdate(this.battle, this.views);
    this.fx.update(dt, w, h, realDt);
  }

  updateIntro(dt) {
    this.introT += dt;
    const T = this.introT;
    const dur = 4.2;
    for (const v of this.views) {
      const k = Math.min(1, Math.max(0, (T - v.introDelay) / 2.6));
      const e = ease(k);
      const p = new V().lerpVectors(v.introFrom, v.introTo, e);
      v.avatar.root.position.set(p.x, 0, p.z);
      const dir = new V().subVectors(v.introTo, v.introFrom);
      v.avatar.root.rotation.y = k < 0.97 ? Math.atan2(dir.x, dir.z) : v.f.yaw;
      v.overrideSpeed = k > 0 && k < 0.97 ? 2.4 : 0;
      if (k > 0.96 && !v.f._posed) { v.f._posed = true; v.anim.playCast('taunt', 0.9); }
      v.f.x = v.introTo.x; v.f.z = v.introTo.z;
      if (k >= 0.97) { v.avatar.root.rotation.y += ((v.f.yaw - v.avatar.root.rotation.y) * Math.min(1, dt * 6)); }
    }
    // cámara de presentación
    const a = Math.min(1, T / 3.6);
    const pos = new V(Math.sin(0.6 + a * 1.2) * (30 - a * 18), 24 - a * 19, Math.cos(0.6 + a * 1.2) * (30 - a * 18));
    this.rig.set(pos, new V(0, 1.4, 0), 46 - a * 8, 6);
    if (T > dur) {
      this.phase = 'fight';
      for (const v of this.views) { v.override = false; v.f._posed = false; }
      this.battle.start();
      this.hud.banner('¡A LUCHAR!', '', 1.3, 'fight');
      this.audio.roar(1.2, 2.2);
      this.audio.drum(1, 0);
      this.director.shot = null;
      this.rig.shake(0.5);
    }
  }

  processEvents() {
    const evs = this.battle.drain();
    const fx = this.fx, au = this.audio, rig = this.rig;
    for (const e of evs) {
      switch (e.t) {
        case 'attack': {
          const v = this.viewOf(e.f); if (!v) break;
          v.anim.playAttack({ dur: e.dur, windT: e.windT, hand: e.hand });
          const key = e.style === 'flurry' && e.hand === 1 ? 'weaponL' : 'weaponR';
          v.schedule(Math.max(0, e.windT - 0.14), () => { v.setTrail(key, true); au.swoosh(e.style === 'cleave' ? 1.4 : 1); });
          v.schedule(e.windT + 0.22, () => v.setTrail(key, false));
          break;
        }
        case 'whiff': break;
        case 'hit': this.onHit(e); break;
        case 'miss': {
          const vv = this.viewOf(e.tgt); if (!vv) break;
          if (e.kind === 'dodge') { vv.anim.playReact('dodge'); fx.float('Esquiva', vv.headPos, 'dodge'); fx.dust(new V(e.tgt.x, 0, e.tgt.z), 3, 1, 0.5); au.swoosh(0.7); }
          else { fx.float('Fallo', vv.headPos, 'dodge'); }
          break;
        }
        case 'riposte': { const v = this.viewOf(e.f); if (v) fx.float('¡Réplica!', v.headPos, 'skillname'); break; }
        case 'skill': this.onSkill(e); break;
        case 'fx': this.onFx(e); break;
        case 'buff': if (e.type === 'stun') { au.stun(); } break;
        case 'heal': { const v = this.viewOf(e.f); if (v) { fx.float('+' + Math.round(e.amt), v.headPos, 'heal'); fx.magic(new V(e.f.x, 0.1, e.f.z), '#8aff9a', 18, 0.7); if (e.kind === 'wind') fx.float('Segundo aliento', new V(e.f.x, v.headPos.y + 0.4, e.f.z), 'skillname'); } break; }
        case 'death': this.onDeath(e); break;
        case 'revive': {
          const v = this.viewOf(e.f); if (!v) break;
          v.anim.revive(); v.dead = false; v.avatar.bones.root.rotation.set(0, 0, 0); v.avatar.bones.root.position.y = 0;
          fx.column(new V(e.f.x, 0, e.f.z), '#ff8a30', 1.6, 9, 1.2); fx.ring(e.f, 6, '#ff9a40', 0.9, 0.5); fx.dust(new V(e.f.x, 0, e.f.z), 12, 4, 1.4);
          for (let i = 0; i < 40; i++) fx.spark(new V(e.f.x, 0.4, e.f.z), new V((Math.random() - 0.5) * 9, Math.random() * 9, (Math.random() - 0.5) * 9), { life: 1, s0: 0.2, s1: 0, color: '#ff9a40', grav: 6 });
          fx.float('¡RENACE!', v.headPos, 'skillname big'); au.cast('cry'); rig.shake(0.9);
          this.director.focusImpact(new V(e.f.x, 1, e.f.z), 1.1, 1);
          break;
        }
        case 'end': this.onEnd(e); break;
      }
    }
  }

  onHit(e) {
    const { src, dst, dmg, crit, blocked, skill } = e;
    const vs = this.viewOf(src), vd = this.viewOf(dst);
    const fx = this.fx, au = this.audio, rig = this.rig;
    if (!vd) return;
    const p = new V(dst.x, (vd.avatar.height || 1.8) * 0.62, dst.z);
    const dir = new V(dst.x - src.x, 0, dst.z - src.z).normalize();
    p.addScaledVector(dir, -0.25);
    const frac = dmg / dst.maxHp;
    if (blocked) {
      fx.clang(p, dir); au.clang(1); vd.anim.playReact('block');
      fx.float('Bloqueo ' + Math.round(dmg), vd.headPos, 'block');
    } else {
      fx.hitSparks(p, dir, crit || frac > 0.12, crit ? '#ffb347' : '#ffd6a0');
      if (this.settings.blood) { fx.blood(p, dir, crit ? 14 : 6); if (frac > 0.06) this.colo.decals.stain(dst.x + dir.x * 0.6, dst.z + dir.z * 0.6, 6 + frac * 40); }
      au.hit(0.6 + Math.min(1, frac * 4), crit);
      if (vd.f.size < 1.3 || crit) vd.anim.hit(crit ? 1.3 : 0.8);
      const team = dst.team === 0 ? 'mine' : 'foe';
      fx.float(String(Math.round(dmg)) + (crit ? '!' : ''), vd.headPos, (crit ? 'crit ' : '') + team + (skill ? ' skillhit' : ''));
    }
    if (this.settings.shake) rig.shake(Math.min(0.9, 0.12 + frac * 2.4 + (crit ? 0.3 : 0)) * (blocked ? 0.5 : 1));
    if (crit) { rig.fovPunch(1); this.hitStop = Math.max(this.hitStop, 0.085); this.director.focusImpact(new V(dst.x, 1.2, dst.z), 0.7, 0.8); }
    else if (frac > 0.1) this.hitStop = Math.max(this.hitStop, 0.04);
    if (skill && skill !== 'phoenix') { vd.anim.hit(1.4); }
  }

  onSkill(e) {
    const v = this.viewOf(e.f); if (!v) return;
    const def = SKILLS[e.id], fx = this.fx, au = this.audio;
    v.anim.playCast(e.id, e.dur);
    au.cast(e.id);
    fx.float(def.name, v.headPos, 'skillname');
    this.hud.log(`<b>${e.f.name}</b> usa <i>${def.icon} ${def.name}</i>`, e.f.team);
    const trailKey = 'weaponR';
    if (SKILL_TRAIL[e.id]) {
      v.trails.weaponR.setColor(SKILL_TRAIL[e.id]);
      v.trails.weaponL.setColor(SKILL_TRAIL[e.id]);
      const on = e.id === 'whirl' ? [0.25, 1.35] : e.id === 'blade' ? [0.3, 1.2] : e.id === 'pierce' ? [0.12, 0.45] : e.id === 'leap' ? [0.6, 0.95] : e.id === 'bash' ? [0.3, 0.6] : [0.1, 0.9];
      v.schedule(on[0], () => { v.setTrail('weaponR', true); if (e.f.cs.dual) v.setTrail('weaponL', true); });
      v.schedule(on[1], () => { v.setTrail('weaponR', false); v.setTrail('weaponL', false); });
    }
    if (e.id === 'leap') { fx.dust(new V(e.f.x, 0, e.f.z), 8, 2, 1.0); }
    if (e.id === 'jove') {
      const tg = e.f.cast?.targets || [];
      for (const t of tg) { fx.ring(t, 2.0, '#9ac8ff', 0.85, 0.3); fx.column(new V(t.x, 0, t.z), '#7ab0ff', 1.0, 3, 0.85); }
      fx.magic(new V(e.f.x, 0, e.f.z), '#b8d8ff', 24, 1.2, 4);
      this.rig.shake(0.3);
    }
    if (e.id === 'quake' || e.id === 'frenzy' || e.id === 'pray' || e.id === 'cry') this.director.focusImpact(new V(e.f.x, 1.2, e.f.z), 1.0, 0.7);
    if (e.id === 'pierce' || e.id === 'bash') this.audio.swoosh(1.3);
    // caída de la estela de tiempo: skills épicas generan slow-mo corto
    if (def.rarity === 'legendary') { this.slow = 0.35; this.slowT = 0.5; }
  }

  onFx(e) {
    const fx = this.fx, au = this.audio, rig = this.rig;
    const f = e.f, at = e.at;
    const fpos = new V(f.x, 0, f.z);
    switch (e.id) {
      case 'bash': if (at) { const p = new V(at.x, 1.2, at.z); fx.clang(p, new V(at.x - f.x, 0, at.z - f.z).normalize()); fx.ring(at, 2, '#ffe0a0', 0.4, 0.3); au.clang(1.4); rig.shake(0.5); } break;
      case 'net': if (at) {
        const v = this.viewOf(at);
        for (let i = 0; i < 20; i++) { const k = i / 20; fx.spark(new V(f.x + (at.x - f.x) * k, 1.3, f.z + (at.z - f.z) * k), new V((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2), { life: 0.5, s0: 0.12, s1: 0, color: '#e8d6a8', grav: 2 }); }
        fx.dust(new V(at.x, 0, at.z), 5, 1.5, 0.7);
      } break;
      case 'dirt': if (at) {
        for (let i = 0; i < 28; i++) { const k = Math.random(); fx.puff(new V(f.x + (at.x - f.x) * k * 0.4, 0.9 + Math.random() * 0.4, f.z + (at.z - f.z) * k * 0.4), new V((at.x - f.x) * 1.8 + (Math.random() - 0.5) * 2, Math.random() * 0.6, (at.z - f.z) * 1.8 + (Math.random() - 0.5) * 2), { life: 0.7 + Math.random() * 0.4, s0: 0.1, s1: 0.5, color: '#d6b070', alpha: 0.7 }); }
      } break;
      case 'cry':
        fx.ring(fpos, 9, '#ffd060', 0.9, 0.5); fx.ring(fpos, 6, '#ff9a40', 0.7, 0.3); fx.column(fpos, '#ffd060', 0.9, 4, 0.8);
        fx.dust(fpos, 10, 4, 1.2); rig.shake(0.5); this.audio.roar(0.8, 1.5);
        for (const a of this.battle.alliesOf(f)) fx.magic(new V(a.x, 0, a.z), '#ffb040', 14, 0.6, 3);
        break;
      case 'leapLand': fx.ring(fpos, 5.5, '#ffd28a', 0.6, 0.5); fx.dust(fpos, 22, 5, 1.6); for (let i = 0; i < 16; i++) fx.spark(new V(f.x, 0.2, f.z), new V((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12), { life: 0.6, s0: 0.14, s1: 0, color: '#ffcf90', grav: 14 }); rig.shake(0.9); au.thud(); this.hitStop = Math.max(this.hitStop, 0.06); break;
      case 'pierce': if (at) { const p = new V(at.x, 1.2, at.z); fx.hitSparks(p, new V(at.x - f.x, 0, at.z - f.z).normalize(), true, '#fff0c0'); } break;
      case 'frenzy': fx.ring(fpos, 4, '#ff4030', 0.7, 0.4); fx.column(fpos, '#ff3020', 0.8, 4, 0.9); fx.dust(fpos, 8, 3, 1.0); rig.shake(0.4); break;
      case 'pray': fx.column(fpos, '#fff0a0', 1.0, 8, 1.4); fx.ring(fpos, 3.2, '#fff0a0', 1.0, 0.3); fx.magic(fpos, '#fff0a0', 30, 1.0, 3.5); break;
      case 'quake':
        fx.ring(fpos, 9, '#ffcf8a', 0.75, 0.5); fx.ring(fpos, 5, '#ffffff', 0.5, 0.3); fx.dust(fpos, 34, 8, 2.0);
        for (let i = 0; i < 26; i++) fx.spark(new V(f.x + (Math.random() - 0.5) * 6, 0.2, f.z + (Math.random() - 0.5) * 6), new V((Math.random() - 0.5) * 4, 5 + Math.random() * 8, (Math.random() - 0.5) * 4), { life: 0.9, s0: 0.2, s1: 0.05, color: '#b89a6a', grav: 18 });
        rig.shake(1.25); this.hitStop = Math.max(this.hitStop, 0.08); au.cast('quake'); break;
      case 'bolt': if (at) { fx.bolt(at); au.bolt(); rig.shake(1.0); this.hud.flash('#b8d8ff', 0.35); this.hitStop = Math.max(this.hitStop, 0.07); this.colo.decals.scuff(at.x, at.z, 70, 0.5); } break;
      case 'taunt': fx.ring(fpos, 8, '#ff5a4a', 0.8, 0.5); fx.column(fpos, '#ff5a4a', 0.7, 3, 0.7); au.horn(); break;
      case 'whirlTick': fx.ring(fpos, 3.2, '#d8ecff', 0.35, 1.4); fx.dust(fpos, 5, 3, 0.9); for (let i = 0; i < 8; i++) fx.spark(new V(f.x, 1.0, f.z), new V(Math.cos(i) * 7, 1, Math.sin(i) * 7), { life: 0.3, s0: 0.12, s1: 0, color: '#d8ecff', grav: 0 }); au.swoosh(1.2); break;
      case 'bladeTick': if (at) { const p = new V(at.x, 1.2, at.z); fx.hitSparks(p, new V(Math.random() - 0.5, 0, Math.random() - 0.5), false, '#ff9ad0'); au.swoosh(1); } break;
    }
  }

  onDeath(e) {
    const v = this.viewOf(e.f); if (!v) return;
    const fx = this.fx, au = this.audio;
    v.anim.die(); v.dead = true;
    for (const k of ['weaponR', 'weaponL']) v.setTrail(k, false);
    au.death(); au.roar(1.1, 2.4);
    fx.dust(new V(e.f.x, 0, e.f.z), 18, 3.5, 1.3);
    fx.ring(e.f, 3.4, '#ffe0b0', 0.6, 0.3);
    fx.float('¡Derrotado!', v.headPos, 'skillname big');
    this.hud.log(`💀 <b>${e.f.name}</b> cae derrotado${e.killer ? ' ante ' + e.killer.name : ''}`, e.f.team === 0 ? 1 : 0);
    if (this.settings.blood) this.colo.decals.stain(e.f.x, e.f.z, 16, '80,14,12', 0.4);
    this.director.focusImpact(new V(e.f.x, 1.2, e.f.z), 1.3, 1);
    this.slow = 0.22; this.slowT = 0.85;
    this.rig.shake(0.8); this.rig.fovPunch(1.4);
    this.hud.flash('#ffffff', 0.25);
  }

  onEnd(e) {
    this.phase = 'outro'; this.outroT = 0;
    const won = e.winner === 0;
    this.lastWinner = e.winner;
    for (const v of this.views) if (v.f.alive) { v.anim.victory(); }
    const c = new V(0, 1, 0); let n = 0;
    for (const v of this.views) if (v.f.alive) { c.x += v.f.x; c.z += v.f.z; n++; }
    if (n) { c.x /= n; c.z /= n; }
    this.fx.confetti(new V(c.x, 3, c.z), won ? 70 : 20);
    this.audio[won ? 'victory' : 'defeat']();
    this.hud.banner(won ? '¡VICTORIA!' : 'DERROTA', won ? 'El pueblo ruge tu nombre' : 'La arena ha hablado', 3, won ? 'win' : 'lose');
    this.slow = 0.4; this.slowT = 1.2;
    this.director.shot = { kind: 'crane', dur: 9, t: 0, dir: 1, off: 0, pick: null };
    this.director.impact = null;
  }

  endRound() {
    const b = this.battle;
    // recopilar estadísticas
    for (const f of b.fighters) {
      if (f.team !== 0) continue;
      const prev = this.result.stats.get(f.g.id) || { dealt: 0, taken: 0, kills: 0, crits: 0, healed: 0, skills: 0 };
      for (const k in prev) prev[k] += f.stat[k];
      this.result.stats.set(f.g.id, prev);
      this.carry.set(f.g.id, { frac: f.alive ? Math.min(1, f.hp / f.maxHp + 0.3) : 0, dead: !f.alive });
    }
    this.result.hype = Math.max(this.result.hype, b.hype);
    this.result.rounds++;
    const won = b.winner === 0;
    this.result.lastWinner = b.winner;
    if (won && this.roundIdx < this.cfg.rounds.length - 1) {
      this.roundIdx++;
      this.startRound();
      return;
    }
    this.result.won = won;
    this.finish();
  }

  finish() {
    this.phase = 'idle';
    this.lingering = true;
    this.hud.fightShow(false);
    const r = this.result;
    const res = this.resolve; this.resolve = null;
    // deja las mallas un instante y limpia después de la transición
    res(r);
  }

  /** Salto rápido: acelera la simulación hasta el final */
  skip() { this.speed = 8; }
  setSpeed(s) { this.speed = s; }
}
