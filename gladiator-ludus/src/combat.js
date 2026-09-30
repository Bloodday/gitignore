// ────────────────────────────────────────────────────────────────────────────
//  Núcleo de combate automático. Sin dependencias de render: emite eventos
//  que la capa visual (arena.js) traduce en animaciones, partículas y sonido.
// ────────────────────────────────────────────────────────────────────────────
import { SKILLS } from './data.js';
import { combatStats, rand, clamp } from './game.js';

export const ARENA_R = 14;
const TAU = Math.PI * 2;

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Definición de habilidades activas: duración total, instante del efecto y ejecución.
const SK = {
  bash:   { dur: 0.75, fx: 0.42, dash: true },
  whirl:  { dur: 1.45, ticks: [0.35, 0.65, 0.95] },
  net:    { dur: 0.65, fx: 0.32 },
  dirt:   { dur: 0.55, fx: 0.28 },
  cry:    { dur: 0.95, fx: 0.42 },
  leap:   { dur: 1.15, fx: 0.80, air: [0.28, 0.80] },
  pierce: { dur: 0.7,  fx: 0.34, dash: true },
  frenzy: { dur: 0.85, fx: 0.32 },
  pray:   { dur: 1.1,  fx: 0.4 },
  quake:  { dur: 1.1,  fx: 0.6 },
  jove:   { dur: 1.7,  fx: 0.9 },
  blade:  { dur: 1.55, ticks: [0.35, 0.5, 0.65, 0.8, 0.95] },
  taunt:  { dur: 0.8,  fx: 0.35 },
};

export class Fighter {
  constructor(battle, def, team, idx) {
    this.battle = battle;
    this.id = battle.nextId++;
    this.def = def; // datos del gladiador (g)
    this.g = def;
    this.team = team;
    this.idx = idx;
    this.name = def.name;
    this.level = def.level;
    const cs = combatStats(def);
    const boss = def.isBoss;
    if (boss) { cs.hp *= boss.hpMul; cs.dmgMin *= boss.dmgMul; cs.dmgMax *= boss.dmgMul; cs.armor *= 1.2; cs.moveSpeed *= 0.9; }
    if (def.handicap) { const h = def.handicap; cs.hp *= h; cs.dmgMin *= h; cs.dmgMax *= h; cs.armor *= h; }
    // táctica elegida por el jugador (sólo su equipo)
    const tac = team === 0 ? battle.tactic : null;
    if (tac === 'aggressive') { cs.dmgMin *= 1.2; cs.dmgMax *= 1.2; cs.armor *= 0.85; cs.moveSpeed *= 1.1; cs.interval *= 0.92; }
    if (tac === 'defensive') { cs.armor *= 1.25; cs.dmgMin *= 0.88; cs.dmgMax *= 0.88; if (cs.block) cs.block = Math.min(0.6, cs.block + 0.08); else cs.dodge = Math.min(0.45, cs.dodge + 0.05); }
    this.cs = cs;
    this.size = boss ? boss.size : 1;
    this.radius = 0.42 * this.size;
    this.maxHp = cs.hp;
    this.hp = cs.hp * (def._hpFrac ?? 1);
    this.x = 0; this.z = 0; this.yaw = 0; this.h = 0;
    this.vx = 0; this.vz = 0;
    this.state = 'idle'; this.t = 0;
    this.alive = true;
    this.target = null;
    this.buffs = [];
    this.cds = {};
    for (const s of cs.skills) this.cds[s.id] = SKILLS[s.id].cd * rand(0.25, 0.75);
    this.atk = null; // {dur, windT, hit:false, hand}
    this.cast = null;
    this.hand = 0;
    this.thinkT = rand(0, 0.2);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.aggr = rand(0.85, 1.15);
    this.attackCd = rand(0.2, 0.6);
    this.usedWind = false; this.revived = false;
    this.stat = { dealt: 0, taken: 0, kills: 0, crits: 0, healed: 0, skills: 0 };
  }

  has(type) { return this.buffs.some(b => b.type === type); }
  buffVal(type, def = 0) { let v = def; for (const b of this.buffs) if (b.type === type) v = Math.max(v, b.v ?? 1); return v; }
  addBuff(type, t, v = 1, src = null) {
    const ex = this.buffs.find(b => b.type === type);
    if (ex) { ex.t = Math.max(ex.t, t); ex.v = Math.max(ex.v ?? 0, v); ex.src = src || ex.src; }
    else this.buffs.push({ type, t, v, src });
    this.battle.emit({ t: 'buff', f: this, type, dur: t });
  }
  get hpFrac() { return this.hp / this.maxHp; }
  get armor() { return this.cs.armor * (1 + this.buffVal('armorUp', 0)); }
  get canAct() { return this.alive && !this.has('stun') && this.state !== 'cast'; }
}

export class Battle {
  /**
   * @param {object[][]} teams listas de gladiadores (datos) por equipo
   */
  constructor(teams, opts = {}) {
    this.nextId = 1;
    this.events = [];
    this.time = 0;
    this.hype = opts.hype ?? 0.2;
    this.tactic = opts.tactic || null;
    this.fighters = [];
    this.teams = teams.map((list, ti) => list.map((g, i) => {
      const f = new Fighter(this, g, ti, i);
      this.fighters.push(f);
      return f;
    }));
    this.started = false;
    this.winner = null;
    this.endT = 0;
    this.layout();
  }

  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  layout() {
    const R = 9.5;
    this.teams.forEach((list, ti) => {
      const base = ti === 0 ? Math.PI : 0; // equipo 0 a la izquierda (-x), equipo 1 a la derecha (+x)
      const n = list.length;
      list.forEach((f, i) => {
        const spread = n > 1 ? (i - (n - 1) / 2) * 0.42 : 0;
        const a = base + spread;
        f.x = Math.cos(a) * R; f.z = Math.sin(a) * R * 0.9;
        f.yaw = Math.atan2(-f.x, -f.z) * 0 + Math.atan2(-(f.x), -(f.z));
        f.yaw = Math.atan2(0 - f.x, 0 - f.z);
      });
    });
  }

  enemiesOf(f) { return this.fighters.filter(o => o.alive && o.team !== f.team); }
  alliesOf(f) { return this.fighters.filter(o => o.alive && o.team === f.team); }

  start() { this.started = true; this.emit({ t: 'start' }); }

  // ── bucle ──────────────────────────────────────────────────────────────
  step(dt) {
    if (this.winner != null) { this.endT += dt; for (const f of this.fighters) this.updateFighter(f, dt, true); return; }
    this.time += dt;
    this.hype = Math.max(0.05, this.hype - dt * 0.012);
    for (const f of this.fighters) this.updateFighter(f, dt, !this.started);
    if (this.started) this.resolveSeparation(dt);
    // ¿fin?
    const alive = this.teams.map(l => l.some(f => f.alive));
    if (this.started && (!alive[0] || !alive[1])) {
      this.winner = alive[0] ? 0 : alive[1] ? 1 : -1;
      this.emit({ t: 'end', winner: this.winner });
      for (const f of this.fighters) if (f.alive) { f.state = 'victory'; f.t = 0; f.atk = null; f.cast = null; }
    }
  }

  updateFighter(f, dt, frozen) {
    f.t += dt;
    if (!f.alive) { f.h = Math.max(0, f.h - dt * 9); this.applyVelocity(f, dt); return; }
    // buffs
    for (let i = f.buffs.length - 1; i >= 0; i--) {
      const b = f.buffs[i];
      b.t -= dt;
      if (b.type === 'regen') { const amt = f.maxHp * b.v * dt; f.hp = Math.min(f.maxHp, f.hp + amt); f.stat.healed += amt; }
      if (b.t <= 0) f.buffs.splice(i, 1);
    }
    for (const k in f.cds) if (f.cds[k] > 0) f.cds[k] -= dt;
    f.attackCd -= dt;
    this.applyVelocity(f, dt);
    if (frozen || f.state === 'victory') return;

    // estados con duración
    if (f.has('stun')) { if (f.state !== 'stun') { f.state = 'stun'; f.t = 0; f.atk = null; f.cast = null; } return; }
    if (f.state === 'stun') { f.state = 'idle'; f.t = 0; }

    if (f.state === 'cast') return this.updateCast(f, dt);
    if (f.state === 'windup' || f.state === 'strike' || f.state === 'recover') return this.updateAttack(f, dt);

    // decisiones
    f.thinkT -= dt;
    if (!f.target || !f.target.alive || f.thinkT <= 0) {
      f.thinkT = 0.25 + Math.random() * 0.2;
      this.acquireTarget(f);
      if (f.target && this.tryCastSkill(f)) return;
    }
    const tgt = f.target;
    if (!tgt) { f.state = 'idle'; return; }

    const d = dist2(f, tgt) - f.radius - tgt.radius;
    const reach = f.cs.reach * (f.size > 1 ? 1.25 : 1);
    this.faceTo(f, tgt.x - f.x, tgt.z - f.z, dt, 10);
    if (d <= reach * 0.92) {
      if (f.attackCd <= 0) this.beginAttack(f);
      else {
        // pequeño paso lateral mientras espera
        f.state = 'idle';
        if (!f.has('root')) {
          f.strafeT -= dt; if (f.strafeT < 0) { f.strafe *= -1; f.strafeT = rand(1.4, 3.2); }
          const dx = tgt.x - f.x, dz = tgt.z - f.z, L = Math.hypot(dx, dz) || 1;
          const sp = f.cs.moveSpeed * 0.55 * this.slowMul(f);
          f.x += (-dz / L) * f.strafe * sp * dt; f.z += (dx / L) * f.strafe * sp * dt;
          // retroceso si está demasiado cerca con arma larga
          if (d < reach * 0.4 && f.cs.style === 'thrust') { f.x -= (dx / L) * sp * 1.2 * dt; f.z -= (dz / L) * sp * 1.2 * dt; }
        }
      }
    } else if (!f.has('root')) {
      f.state = 'move';
      const dx = tgt.x - f.x, dz = tgt.z - f.z, L = Math.hypot(dx, dz) || 1;
      const sprint = d > 5 ? 1.45 : 1;
      const sp = f.cs.moveSpeed * this.slowMul(f) * f.aggr * sprint * (f.has('frenzy') ? 1.15 : 1);
      // ligera trayectoria curva
      const cx = -dz / L * f.strafe * 0.25;
      const cz = dx / L * f.strafe * 0.25;
      f.x += ((dx / L) + cx) * sp * dt; f.z += ((dz / L) + cz) * sp * dt;
      f.speedNow = sp;
    } else f.state = 'idle';
    if (f.state !== 'move') f.speedNow = 0;
    this.clampArena(f);
  }

  slowMul(f) { return f.has('slow') ? 1 - f.buffVal('slow', 0.35) : 1; }

  applyVelocity(f, dt) {
    if (Math.abs(f.vx) + Math.abs(f.vz) > 0.01) {
      f.x += f.vx * dt; f.z += f.vz * dt;
      const k = Math.exp(-dt * 7);
      f.vx *= k; f.vz *= k;
      this.clampArena(f);
    }
  }
  clampArena(f) {
    const r = Math.hypot(f.x, f.z), max = ARENA_R - f.radius;
    if (r > max) { f.x *= max / r; f.z *= max / r; }
  }

  faceTo(f, dx, dz, dt, rate) {
    const want = Math.atan2(dx, dz);
    let d = want - f.yaw;
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    f.yaw += d * Math.min(1, dt * rate);
  }

  resolveSeparation(dt) {
    const fs = this.fighters.filter(f => f.alive && f.h < 0.3 && f.state !== 'cast');
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.001;
      const min = (a.radius + b.radius) * 1.05;
      if (d < min) {
        const push = (min - d) * 0.5 * Math.min(1, dt * 12);
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      }
    }
  }

  acquireTarget(f) {
    const foes = this.enemiesOf(f);
    if (!foes.length) { f.target = null; return; }
    const taunt = f.buffs.find(b => b.type === 'taunted' && b.src?.alive);
    if (taunt) { f.target = taunt.src; return; }
    // pondera distancia y vida restante; mantiene objetivo un tiempo para no oscilar
    if (f.target && f.target.alive && Math.random() < 0.7) return;
    let best = null, bs = Infinity;
    for (const e of foes) {
      const s = dist2(f, e) * (0.75 + e.hpFrac * 0.5) + Math.random() * 1.5;
      if (s < bs) { bs = s; best = e; }
    }
    f.target = best;
  }

  // ── ataque básico ──────────────────────────────────────────────────────
  beginAttack(f, opts = {}) {
    const cs = f.cs;
    let interval = cs.interval;
    const haste = 1 + f.buffVal('haste', 0) + f.buffVal('frenzy', 0);
    interval /= haste;
    if (this.time - (f.lastAtk ?? -9) > 2.2) f.combo = 0;
    const heavy = !opts.dur && (f.combo || 0) >= 2 && f.size < 1.3;
    if (heavy) interval *= 1.35;
    const dur = opts.dur || interval;
    const windT = opts.dur ? dur * 0.45 : Math.min(cs.wind * (heavy ? 1.5 : 1) / Math.sqrt(haste), dur * 0.62);
    f.atk = { dur, windT, hit: false, hand: f.hand, t: 0, style: cs.style, riposte: !!opts.riposte, heavy };
    f.lastAtk = this.time;
    f.hand = 1 - f.hand;
    f.state = 'windup'; f.t = 0;
    f.attackCd = interval;
    this.emit({ t: 'attack', f, target: f.target, dur, windT, hand: f.atk.hand, style: cs.style, heavy });
  }

  updateAttack(f, dt) {
    const a = f.atk;
    if (!a) { f.state = 'idle'; return; }
    a.t += dt;
    // sigue orientándose al objetivo durante el amago
    if (f.target?.alive && a.t < a.windT) this.faceTo(f, f.target.x - f.x, f.target.z - f.z, dt, 14);
    if (!a.hit && a.t >= a.windT) {
      a.hit = true;
      f.state = 'strike';
      const tgt = f.target;
      if (tgt && tgt.alive) {
        const d = dist2(f, tgt) - f.radius - tgt.radius;
        if (d <= f.cs.reach * 1.25) this.basicHit(f, tgt);
        else this.emit({ t: 'whiff', f });
      }
      // avance con el golpe
      { const L = a.heavy ? 4.2 : f.cs.style === 'thrust' ? 2.4 : 2.8; f.vx += Math.sin(f.yaw) * L; f.vz += Math.cos(f.yaw) * L; }
    }
    if (a.t >= a.windT + 0.12 && f.state === 'strike') f.state = 'recover';
    if (a.t >= a.dur) {
      // a veces se retira de un salto tras golpear, para reposicionarse
      if (!a.riposte && !a.heavy && f.size < 1.3 && Math.random() < 0.28 && f.target?.alive) {
        f.vx -= Math.sin(f.yaw) * 6.2; f.vz -= Math.cos(f.yaw) * 6.2; this.emit({ t: 'hop', f });
      }
      f.state = 'idle'; f.atk = null; f.t = 0;
    }
  }

  rollDamage(f, pct = 1, forceCrit = false) {
    const cs = f.cs;
    let d = (cs.dmgMin + Math.random() * (cs.dmgMax - cs.dmgMin)) * pct;
    d *= 1 + f.buffVal('dmgUp', 0);
    if (cs.berserk) d *= 1 + cs.berserk * (1 - f.hpFrac);
    if (cs.fav) d *= 1 + cs.fav * 0.05 * this.hype;
    if (f.has('weak')) d *= 0.8;
    const crit = forceCrit || Math.random() < cs.crit;
    if (crit) d *= cs.critMult;
    return { d, crit };
  }

  basicHit(f, tgt, extra = {}) {
    if (f.has('blind') && Math.random() < f.buffVal('blind', 0.45)) { this.emit({ t: 'miss', f, tgt, kind: 'blind' }); return; }
    if (!extra.noAvoid) {
      if (Math.random() < tgt.cs.dodge) {
        this.emit({ t: 'miss', f, tgt, kind: 'dodge' });
        { const side = Math.random() < 0.5 ? 1 : -1; tgt.vx += Math.cos(f.yaw) * 5.2 * side; tgt.vz -= Math.sin(f.yaw) * 5.2 * side; }
        this.addHype(0.01);
        this.maybeRiposte(tgt, f);
        return;
      }
    }
    const heavy = !!f.atk?.heavy && !extra.skill;
    const { d, crit } = this.rollDamage(f, (extra.pct || 1) * (heavy ? 1.7 : 1));
    let blocked = false, dmg = d;
    if (!extra.noAvoid && Math.random() < tgt.cs.block) { blocked = true; dmg *= 1 - tgt.cs.blockAbsorb; this.maybeRiposte(tgt, f); }
    this.applyDamage(f, tgt, dmg, { crit, blocked, basic: true, heavy, knock: heavy ? 6.5 : undefined, ignoreArmor: extra.ignoreArmor, skill: extra.skill });
    f.combo = heavy ? 0 : (f.combo || 0) + 1;
    if (heavy && !blocked && tgt.alive && tgt.size < 1.3) tgt.addBuff('stun', 0.45, 1, f);
  }

  maybeRiposte(tgt, atk) {
    if (tgt.cs.riposte && tgt.alive && !tgt.atk && tgt.state !== 'cast' && Math.random() < tgt.cs.riposte) {
      tgt.target = atk;
      const d = dist2(tgt, atk) - tgt.radius - atk.radius;
      if (d < tgt.cs.reach * 1.4) { tgt.attackCd = 0; this.beginAttack(tgt, { dur: 0.4, riposte: true }); this.emit({ t: 'riposte', f: tgt }); }
    }
  }

  addHype(v) { this.hype = clamp(this.hype + v, 0, 1); }

  applyDamage(src, dst, dmg, o = {}) {
    if (!dst.alive) return 0;
    const ign = o.ignoreArmor || 0;
    const armor = dst.armor * (1 - ign);
    const red = armor / (armor + 45 + src.level * 10);
    let final = dmg * (1 - red);
    if (dst.has('frenzy')) final *= 1.15;
    if (src.cs.execBonus && dst.hpFrac < 0.35) final *= 1 + src.cs.execBonus;
    final = Math.max(1, final);
    dst.hp -= final;
    src.stat.dealt += final; dst.stat.taken += final;
    if (o.crit) src.stat.crits++;
    // robo de vida
    const ls = src.cs.lifesteal + src.buffVal('lifesteal', 0);
    if (ls > 0) { const h = Math.min(src.maxHp - src.hp, final * ls); if (h > 0) { src.hp += h; src.stat.healed += h; } }
    // espinas
    if (dst.cs.thorns > 0 && o.basic && src.alive) { const th = final * dst.cs.thorns; src.hp -= th; dst.stat.dealt += th; if (src.hp <= 0) this.kill(src, dst); }
    // reacción
    const dirx = dst.x - src.x, dirz = dst.z - src.z, L = Math.hypot(dirx, dirz) || 1;
    if (!o.noKnock) { const kb = (o.knock ?? (o.crit ? 2.6 : 1.1)) / Math.max(1, dst.size * dst.size); dst.vx += (dirx / L) * kb; dst.vz += (dirz / L) * kb; }
    this.emit({ t: 'hit', src, dst, dmg: final, crit: !!o.crit, blocked: !!o.blocked, skill: o.skill || null, basic: !!o.basic, heavy: !!o.heavy });
    this.addHype(o.crit ? 0.05 : 0.012 + final / dst.maxHp * 0.15);
    // interrumpe ataques con golpes críticos/bloqueos no
    if (dst.alive && dst.hp > 0 && (o.crit && dst.size < 1.3) && dst.state === 'windup' && Math.random() < 0.5) { dst.state = 'idle'; dst.atk = null; dst.attackCd = 0.25; }
    // segundo aliento
    if (dst.hp > 0 && dst.cs.wind && !dst.usedWind && dst.hpFrac < 0.3) {
      dst.usedWind = true;
      const h = dst.maxHp * (0.18 + dst.cs.wind * 0.05);
      dst.hp = Math.min(dst.maxHp, dst.hp + h); dst.stat.healed += h;
      this.emit({ t: 'heal', f: dst, amt: h, kind: 'wind' });
    }
    if (dst.hp <= 0) this.kill(dst, src);
    return final;
  }

  kill(dst, killer) {
    if (!dst.alive) return;
    if (dst.cs.phoenix && !dst.revived) {
      dst.revived = true;
      dst.hp = dst.maxHp * (0.35 + dst.cs.phoenix * 0.08);
      dst.buffs = []; dst.state = 'idle'; dst.atk = null; dst.cast = null;
      this.emit({ t: 'revive', f: dst });
      for (const e of this.enemiesOf(dst)) if (dist2(dst, e) < 5) this.applyDamage(dst, e, dst.cs.dmgMax * 2, { knock: 6, skill: 'phoenix' });
      this.addHype(0.25);
      return;
    }
    dst.alive = false; dst.hp = 0; dst.state = 'dead'; dst.t = 0; dst.atk = null; dst.cast = null;
    if (killer) killer.stat.kills++;
    this.emit({ t: 'death', f: dst, killer });
    this.addHype(0.22);
    for (const o of this.fighters) if (o.target === dst) o.target = null;
  }

  // ── habilidades ────────────────────────────────────────────────────────
  tryCastSkill(f) {
    if (!f.canAct || f.state === 'cast') return false;
    const tgt = f.target;
    if (!tgt) return false;
    const d = dist2(f, tgt) - f.radius - tgt.radius;
    const foes = this.enemiesOf(f);
    const near = (r) => foes.filter(e => dist2(f, e) - e.radius < r).length;
    const cands = [];
    for (const s of f.cs.skills) {
      if ((f.cds[s.id] ?? 0) > 0) continue;
      const def = SKILLS[s.id];
      let ok = false, w = 1;
      switch (s.id) {
        case 'bash': ok = d < 4.5 && d > 0.6; break;
        case 'whirl': ok = near(2.7) >= 1; w = near(2.7) >= 2 ? 2 : 1; break;
        case 'net': ok = d > 2 && d < 7 && !tgt.has('root'); break;
        case 'dirt': ok = d < 3.2 && !tgt.has('blind'); break;
        case 'cry': ok = d < 11; break;
        case 'leap': ok = d > 3.5 && d < 9.5; w = 2; break;
        case 'pierce': ok = d < 3.2; break;
        case 'frenzy': ok = d < 7 && tgt.hpFrac > 0.25; break;
        case 'pray': ok = f.hpFrac < 0.6; w = 3; break;
        case 'quake': ok = near(3.8) >= 1; break;
        case 'jove': ok = true; w = 1.5; break;
        case 'blade': ok = d < 6.5; break;
        case 'taunt': ok = near(8) >= 1 && this.alliesOf(f).length > 1 || near(8) >= 2; break;
      }
      if (ok) cands.push({ s, w });
    }
    if (!cands.length) return false;
    if (Math.random() > 0.8) return false;
    let tot = 0; cands.forEach(c => tot += c.w);
    let r = Math.random() * tot, pick = cands[0];
    for (const c of cands) { r -= c.w; if (r <= 0) { pick = c; break; } }
    this.castSkill(f, pick.s.id, pick.s.rank, tgt);
    return true;
  }

  castSkill(f, id, rank, tgt) {
    const def = SKILLS[id], spec = SK[id];
    f.cds[id] = def.cd * (1 - f.cs.cdr);
    f.state = 'cast'; f.t = 0; f.atk = null;
    f.cast = { id, rank, t: 0, dur: spec.dur, fx: spec.fx, tgt, done: false, ticks: spec.ticks ? spec.ticks.map(t => ({ t, done: false })) : null, from: { x: f.x, z: f.z }, dest: null, hits: 0 };
    f.stat.skills++;
    // objetivo de destino para saltos/cargas
    if (id === 'leap' && tgt) {
      const dx = tgt.x - f.x, dz = tgt.z - f.z, L = Math.hypot(dx, dz) || 1;
      const stop = Math.max(0, L - f.radius - tgt.radius - 0.9);
      f.cast.dest = { x: f.x + dx / L * stop, z: f.z + dz / L * stop };
    }
    if (id === 'jove') {
      const foes = this.enemiesOf(f).sort(() => Math.random() - 0.5).slice(0, Math.min(3, 1 + Math.floor(rank / 2) + 1));
      f.cast.targets = foes;
    }
    this.emit({ t: 'skill', f, id, rank, target: tgt, dur: spec.dur, fx: spec.fx });
    this.addHype(0.04);
  }

  updateCast(f, dt) {
    const c = f.cast;
    if (!c) { f.state = 'idle'; return; }
    c.t += dt;
    const spec = SK[c.id];
    const tgt = c.tgt && c.tgt.alive ? c.tgt : null;
    if (tgt) this.faceTo(f, tgt.x - f.x, tgt.z - f.z, dt, 12);
    // movimiento propio de cada habilidad
    if (c.id === 'bash' || c.id === 'pierce') {
      if (tgt && c.t < c.fx) {
        const d = dist2(f, tgt) - f.radius - tgt.radius;
        if (d > 0.7) { const dx = tgt.x - f.x, dz = tgt.z - f.z, L = Math.hypot(dx, dz) || 1; const sp = (c.id === 'bash' ? 11 : 5); f.x += dx / L * sp * dt; f.z += dz / L * sp * dt; }
      }
    } else if (c.id === 'leap' && c.dest) {
      const [a, b] = spec.air;
      if (c.t >= a && c.t <= b) {
        const k = (c.t - a) / (b - a);
        f.x = c.from.x + (c.dest.x - c.from.x) * k; f.z = c.from.z + (c.dest.z - c.from.z) * k;
        f.h = Math.sin(k * Math.PI) * 3.2;
      } else if (c.t > b) { f.x = c.dest.x; f.z = c.dest.z; f.h = 0; }
    } else if (c.id === 'blade' && tgt) {
      const k = clamp((c.t - 0.2) / 0.85, 0, 1);
      const ang = k * TAU * 1.5 + c.from.x;
      const rr = f.radius + tgt.radius + 0.9;
      if (c.t > 0.2 && c.t < 1.15) { f.x = tgt.x + Math.cos(ang) * rr; f.z = tgt.z + Math.sin(ang) * rr; f.yaw = Math.atan2(tgt.x - f.x, tgt.z - f.z); }
    } else if (c.id === 'whirl') {
      if (tgt) { const d = dist2(f, tgt); if (d > 2) { const dx = tgt.x - f.x, dz = tgt.z - f.z, L = Math.hypot(dx, dz) || 1; f.x += dx / L * 2.2 * dt; f.z += dz / L * 2.2 * dt; } }
    }
    this.clampArena(f);

    if (spec.fx != null && !c.done && c.t >= spec.fx) { c.done = true; this.execSkill(f, c, tgt); }
    if (c.ticks) for (const tk of c.ticks) if (!tk.done && c.t >= tk.t) { tk.done = true; c.hits++; this.execTick(f, c, tgt, c.hits); }
    if (c.t >= c.dur) { f.state = 'idle'; f.cast = null; f.h = 0; f.t = 0; f.attackCd = Math.max(f.attackCd, 0.25); }
  }

  skillDmg(f, pct, rank, o = {}) {
    const { d, crit } = this.rollDamage(f, pct);
    return { d: d * (1 + (f.cs.skillPower - 1) * 0.6), crit: crit && o.canCrit !== false };
  }

  execSkill(f, c, tgt) {
    const { id, rank } = c;
    const foes = this.enemiesOf(f);
    const sp = f.cs.skillPower;
    switch (id) {
      case 'bash': {
        if (!tgt) break;
        if (dist2(f, tgt) - f.radius - tgt.radius < 2.0) {
          const { d } = this.skillDmg(f, 1.1 + rank * 0.12, rank);
          this.applyDamage(f, tgt, d, { skill: 'bash', knock: 4.5 });
          if (tgt.alive) tgt.addBuff('stun', (0.8 + rank * 0.12) * (tgt.size > 1.3 ? 0.4 : 1), 1, f);
        }
        this.emit({ t: 'fx', id: 'bash', f, at: tgt });
        break;
      }
      case 'net': if (tgt) { tgt.addBuff('root', 1.8 + rank * 0.3, 1, f); this.emit({ t: 'fx', id: 'net', f, at: tgt }); } break;
      case 'dirt': if (tgt) { tgt.addBuff('blind', 2.4 + rank * 0.4, 0.45 + rank * 0.03, f); this.emit({ t: 'fx', id: 'dirt', f, at: tgt }); } break;
      case 'cry':
        for (const a of this.alliesOf(f)) { a.addBuff('dmgUp', 6, (0.14 + rank * 0.04) * sp, f); a.addBuff('haste', 6, (0.14 + rank * 0.04) * sp, f); }
        this.emit({ t: 'fx', id: 'cry', f }); this.addHype(0.08); break;
      case 'leap': {
        this.emit({ t: 'fx', id: 'leapLand', f });
        for (const e of foes) if (dist2(f, e) - e.radius < 2.8) {
          const { d } = this.skillDmg(f, 1.6 + rank * 0.2, rank);
          this.applyDamage(f, e, d, { skill: 'leap', knock: 5 });
          if (e.alive) e.addBuff('stun', 0.6 * (e.size > 1.3 ? 0.4 : 1), 1, f);
        }
        break;
      }
      case 'pierce': {
        if (tgt && dist2(f, tgt) - f.radius - tgt.radius < 3.4) {
          const { d, crit } = this.skillDmg(f, 1.7 + rank * 0.25, rank);
          this.applyDamage(f, tgt, d, { skill: 'pierce', ignoreArmor: 0.6, crit, knock: 3 });
        }
        this.emit({ t: 'fx', id: 'pierce', f, at: tgt });
        break;
      }
      case 'frenzy':
        f.addBuff('frenzy', 7, (0.4 + rank * 0.06) * sp, f); f.addBuff('lifesteal', 7, 0.1 + rank * 0.03, f);
        this.emit({ t: 'fx', id: 'frenzy', f }); this.addHype(0.06); break;
      case 'pray':
        f.addBuff('regen', 4, (0.24 + rank * 0.04) * sp / 4, f);
        f.buffs = f.buffs.filter(b => !['blind', 'slow', 'root', 'weak'].includes(b.type));
        this.emit({ t: 'fx', id: 'pray', f }); break;
      case 'quake': {
        this.emit({ t: 'fx', id: 'quake', f });
        for (const e of foes) if (dist2(f, e) - e.radius < 4.5) {
          const { d } = this.skillDmg(f, 0.9 + rank * 0.12, rank);
          this.applyDamage(f, e, d, { skill: 'quake', knock: 5.5 });
          if (e.alive) e.addBuff('slow', 3, 0.4, f);
        }
        this.addHype(0.06);
        break;
      }
      case 'jove': {
        const list = (c.targets || []).filter(e => e.alive);
        for (const e of list) {
          this.emit({ t: 'fx', id: 'bolt', f, at: e });
          const { d } = this.skillDmg(f, 2.2 + rank * 0.35, rank);
          this.applyDamage(f, e, d, { skill: 'jove', knock: 3, ignoreArmor: 0.3 });
          if (e.alive) e.addBuff('stun', 1.0 * (e.size > 1.3 ? 0.4 : 1), 1, f);
        }
        this.addHype(0.15);
        break;
      }
      case 'taunt':
        for (const e of foes) if (dist2(f, e) < 9) e.addBuff('taunted', 4, 1, f);
        f.addBuff('armorUp', 5, (0.25 + rank * 0.05), f);
        this.emit({ t: 'fx', id: 'taunt', f }); break;
    }
  }

  execTick(f, c, tgt, n) {
    const { id, rank } = c;
    if (id === 'whirl') {
      this.emit({ t: 'fx', id: 'whirlTick', f, n });
      for (const e of this.enemiesOf(f)) if (dist2(f, e) - e.radius < 2.9) {
        const { d, crit } = this.skillDmg(f, 0.65 + rank * 0.08, rank);
        this.applyDamage(f, e, d, { skill: 'whirl', crit, knock: 2.0 });
      }
    } else if (id === 'blade') {
      if (tgt && tgt.alive) {
        const { d, crit } = this.skillDmg(f, 0.58 + rank * 0.07, rank);
        this.emit({ t: 'fx', id: 'bladeTick', f, at: tgt, n });
        this.applyDamage(f, tgt, d, { skill: 'blade', crit, knock: 0.6 });
      }
    }
  }
}

// ── estimación Monte Carlo de la probabilidad de victoria ──────────────────
export function estimateWin(teamA, teamB, n = 10, opts = {}) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const b = new Battle([teamA.map(g => ({ ...g, _hpFrac: g._hpFrac ?? 1 })), teamB.map(g => ({ ...g }))], opts);
    b.start();
    let guard = 0;
    while (b.winner == null && guard++ < 4000) { b.step(0.05); b.events.length = 0; }
    if (b.winner === 0) wins++;
  }
  return wins / n;
}
