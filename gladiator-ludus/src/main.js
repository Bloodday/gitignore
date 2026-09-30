import './gpu-shim.js';
import './style.css';
import * as THREE from 'three/webgpu';
import { Engine } from './engine.js';
import { Colosseum } from './colosseum.js';
import { LudusWorld, LudusCrowd, LUDUS_Z } from './ludus.js';
import { FX } from './fx.js';
import { GameAudio } from './audio.js';
import { CameraRig, LudusCam } from './camera.js';
import { ArenaView } from './arenaview.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import {
  GAME, fmt, grantXp, rewardFor, rollLoot, buildFoes, powerOf, combatStats, pick, rand, clamp,
} from './game.js';
import { VENUES, MODES, CLASSES } from './data.js';

const TIPS = [
  'Los gladiadores entrenan incluso cuando no miras: vuelve más tarde y verás cuánto han crecido.',
  'Cada nivel puede regalar una habilidad aleatoria… o mejorar una que ya conoces.',
  'La fatiga reduce el rendimiento: alterna entrenamiento y descanso.',
  'El favor de la multitud aumenta el oro que ganas: pelea con espectáculo.',
  'Manumite a tus veteranos para ganar Rudis: bonos permanentes.',
  'Un equipo de Melé 3v3 multiplica el botín… y el riesgo.',
];
document.getElementById('ld-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

const V = THREE.Vector3;
const PAL_DAY = { zenith: '#2a58a8', mid: '#8fb0da', horizon: '#f7dcb4', fog: '#d9c6a2' };
const PAL_DUSK = { zenith: '#22336b', mid: '#b6687c', horizon: '#ffb070', fog: '#d9a982' };
const lerpHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

class App {
  async boot() {
    const game = this.game = GAME;
    game.load();
    const st = game.state;
    // motor
    const eng = this.eng = new Engine();
    try {
      await eng.init(document.getElementById('app'), st.settings.quality);
    } catch (err) {
      console.error(err);
      const n = document.getElementById('nogpu');
      n.classList.remove('hidden');
      n.innerHTML = '<div><h2 style="font-family:Cinzel,serif;color:#e3b55a">No se pudo iniciar el render</h2><p>Este juego usa WebGPU (con respaldo WebGL2). Prueba con una versión reciente de Chrome, Edge, Safari o Firefox.</p></div>';
      return;
    }
    this.audio = new GameAudio();
    this.audio.enabled = st.settings.sound; this.audio.musicOn = st.settings.music;
    this.fx = new FX(eng.scene, eng.camera);
    this.colo = new Colosseum(eng.scene, st.settings.quality);
    this.world = new LudusWorld(eng.scene);
    this.rig = new CameraRig(eng.camera, document.getElementById('app'));
    this.ludusCam = new LudusCam(this.rig, document.getElementById('app'));
    this.hud = new HUD();
    this.crowd = new LudusCrowd(eng, this.world, this.fx, this.audio);
    this.arena = new ArenaView({ engine: eng, colo: this.colo, fx: this.fx, audio: this.audio, rig: this.rig, hud: this.hud });
    this.arena.settings = { blood: st.settings.blood !== false, shake: st.settings.shake !== false };
    this.mode = 'ludus';
    this.pendingLevelEvents = [];
    this.time = 0;
    this.lastSave = 0; this.uiT = 0;

    // interfaz
    const hooks = {
      audio: this.audio,
      backend: () => eng.backend,
      threeVersion: THREE.REVISION,
      startFight: cfg => this.startFight(cfg),
      setSpeed: s => { this.arena.setSpeed(s); },
      skipFight: () => this.arena.skip(),
      toggleFreeCam: () => { const d = this.arena.director; d.free = !d.free; return d.free; },
      selectGladiator: id => this.onSelect(id),
      rebuildAvatar: id => this.crowd.rebuild(id),
      rebuildAll: () => this.st.gladiators.forEach(g => this.crowd.rebuild(g.id)),
      onRosterChange: () => this.syncCrowd(),
      applySettings: () => this.applySettings(),
      reload: () => location.reload(),
      onTab: tab => this.onTab(tab),
      onBuild: () => {},
      levelFx: g => { const e = this.crowd.getEntry(g.id); if (e && this.mode === 'ludus') { this.fx.column(e.avatar.root.position, '#ffe08a', 0.9, 7, 1.2); this.fx.ring(e.avatar.root.position, 3, '#ffe08a', 0.9); this.fx.magic(e.avatar.root.position, '#ffe08a', 26, 0.8, 4); this.audio.init(); } },
      resultClosed: v => this.onResultClosed(v),
    };
    this.ui = new UI(game, hooks);
    this.ui.refreshTools();
    this.crowd.onSelect = id => { this.ui.selected = id; this.ui._rosterKey = null; this.onSelect(id); this.ui.openTabForce('ludus'); };
    game.on('level', ev => { if (this.mode === 'ludus') this.ui.onLevel(ev); else this.pendingLevelEvents.push(ev); });

    // interacción con el ludus
    const dom = document.getElementById('app');
    let down = null;
    dom.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.audio.init(); });
    dom.addEventListener('pointerup', e => {
      if (!down || this.mode !== 'ludus') return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 6) { const id = this.crowd.pick(e, eng.camera, dom); if (id) { this.audio.click(); this.crowd.select(id); } }
      down = null;
    });
    document.addEventListener('pointerdown', () => this.audio.init(), { once: false });

    this.applyVenueLook(0, true);
    this.syncCrowd();
    this.crowd.setVisible(true);
    this.ludusCam.enabled = true;
    this.ludusCam.dist = 32; this.ludusCam.yaw = 0.25; this.ludusCam.pitch = 0.36;
    this.ludusCam.update(0.016, 0);
    this.rig.cut();
    this.colo.group.visible = true;

    // precompila pipelines antes de mostrar
    try { await eng.renderer.compileAsync(eng.scene, eng.camera); } catch (e) { /* no crítico */ }
    eng.renderer.setAnimationLoop(() => this.frame());
    document.getElementById('ui').classList.remove('hidden');
    setTimeout(() => { document.getElementById('loading').classList.add('done'); setTimeout(() => document.getElementById('loading').remove(), 1000); }, 500);
    window.addEventListener('beforeunload', () => game.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
    this.applySettings();
    this.welcome();
    window.__app = this;
  }

  get st() { return this.game.state; }

  welcome() {
    const st = this.st, off = this.game.offline;
    if (off && off.seconds > 60) {
      const h = Math.floor(off.seconds / 3600), m = Math.floor((off.seconds % 3600) / 60);
      this.ui.showModal(`<div class="modal"><h1 style="font-size:24px">Bienvenido de vuelta</h1><div class="sub">Tu ludus trabajó durante ${h ? h + ' h ' : ''}${m} min</div>
        <div class="rew"><div><b>🪙 ${fmt(off.gold)}</b><span>Denarios</span></div><div><b>⬆ ${off.levels}</b><span>Niveles</span></div><div><b>✨ ${off.skills}</b><span>Habilidades</span></div></div>
        <div class="row" style="justify-content:center"><button class="btn big" data-m="ok">Continuar</button></div></div>`, true);
      // resumen de eventos para no saturar de ventanas
    }
    if (!st.tutorial.intro) {
      st.tutorial.intro = true;
      setTimeout(() => {
        this.ui.openTab('ludus');
        this.ui.hint('Elige un atributo para entrenar. Con los primeros denarios, mejora el ludus o recluta más gladiadores. Cuando estés listo, ¡entra a la arena!', 9000);
      }, 900);
    }
  }

  applySettings() {
    const s = this.st.settings;
    this.eng.setQuality(s.quality);
    this.arena.settings = { blood: s.blood !== false, shake: s.shake !== false };
    this.audio.setEnabled(s.sound); this.audio.setMusic(s.music);
    this.colo.crowdMeshes.forEach(m => { m.count = Math.floor(this.colo.crowdCount * 1); });
  }

  onTab(tab) {
    // la cámara del ludus se centra ligeramente a la izquierda cuando hay panel abierto
    this.ludusCam.panelOpen = !!tab;
  }
  onSelect(id) {
    this.selectedId = id;
  }

  syncCrowd() { this.crowd.sync(this.st.gladiators, this.game); }

  // ── apariencia de la sede (hora del día, público, colores) ───────────────
  applyVenueLook(vi, force = false) {
    if (!force && this.venueLook === vi) return;
    this.venueLook = vi;
    const v = VENUES[vi];
    const t = clamp(vi / 6, 0, 1);
    const elev = 0.62 - t * 0.27;
    const pal = {
      zenith: lerpHex(PAL_DAY.zenith, PAL_DUSK.zenith, t), mid: lerpHex(PAL_DAY.mid, PAL_DUSK.mid, t),
      horizon: lerpHex(PAL_DAY.horizon, PAL_DUSK.horizon, t), fog: lerpHex(PAL_DAY.fog, PAL_DUSK.fog, t),
    };
    this.eng.setSun(elev, 300 - t * 40, lerpHex('#fff0d8', v.tint, 0.5 + t * 0.4), pal);
    this.eng.sun.intensity = 3.6 - t * 0.5;
    this.colo.bannerMat.color.set(v.banner);
    const cnt = Math.floor(this.colo.crowdCount * (0.45 + 0.55 * v.crowd));
    this.colo.crowdMeshes.forEach(m => { m.count = cnt; });
    this.colo.velarium.visible = vi >= 2;
  }

  // ── combate ──────────────────────────────────────────────────────────────
  async startFight(cfg) {
    if (this.mode !== 'ludus') return;
    const st = this.st;
    this.mode = 'flying';
    const venue = VENUES[cfg.venueIdx], mode = MODES[cfg.modeId];
    this.cfg = cfg;
    document.getElementById('ui').classList.add('hidden');
    this.applyVenueLook(cfg.venueIdx);
    this.crowd.setVisible(false);
    this.ludusCam.enabled = false;
    this.audio.setMode('arena');
    this.audio.roar(0.6, 2.5);
    this.game.save();
    // rondas: si el torneo trae varias, `foes` ya es una lista por ronda
    const rounds = cfg.foes;
    const match = { squad: cfg.squad, rounds, venue, modeName: mode.name };
    await this.flyTo(() => ({ pos: new V(Math.sin(0.6) * 30, 24, Math.cos(0.6) * 30), look: new V(0, 2, 0), fov: 46 }), 3.2, [new V(0, 14, 86), new V(0, 40, 62), new V(6, 38, 46)]);
    this.mode = 'arena';
    const res = await this.arena.runMatch(match);
    this.mode = 'result';
    this.fightResult = res;
    const sum = this.resolveFight(cfg, res);
    this.lastSummary = sum;
    this.showResult(sum);
  }

  flyTo(endFn, dur, via = []) {
    return new Promise(resolve => {
      const start = { pos: this.eng.camera.position.clone(), look: this.rig.look.clone(), fov: this.eng.camera.fov };
      const end = endFn();
      const pts = [start.pos, ...via, end.pos];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this.flight = { t: 0, dur, curve, start, end, resolve };
    });
  }
  updateFlight(dt) {
    const F = this.flight; if (!F) return;
    F.t += dt;
    const k = Math.min(1, F.t / F.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const p = F.curve.getPoint(e);
    const look = new V().lerpVectors(F.start.look, F.end.look, e);
    this.rig.dPos.copy(p); this.rig.dLook.copy(look); this.rig.dFov = F.start.fov + (F.end.fov - F.start.fov) * e;
    this.rig.pos.copy(p); this.rig.look.copy(look); this.rig.fov = this.rig.dFov;
    if (k >= 1) { const r = F.resolve; this.flight = null; r(); }
  }

  resolveFight(cfg, res) {
    const game = this.game, st = this.st;
    const venue = VENUES[cfg.venueIdx], mode = MODES[cfg.modeId];
    const won = res.won;
    const squad = cfg.squad;
    const allFoes = cfg.foes.flat();
    const roundsWon = won ? cfg.foes.length : Math.max(0, res.rounds - 1);
    const rw = rewardFor(cfg.venueIdx, cfg.modeId, allFoes, won || roundsWon > 0, res.hype, squad);
    let mult = won ? cfg.foes.length : Math.max(0.2, roundsWon);
    if (!won && roundsWon === 0) mult = 1;
    let gold = rw.gold * (won ? (mode.rounds || 1) : (roundsWon ? roundsWon : 1));
    let fame = rw.fame * (won ? (mode.rounds || 1) : (roundsWon ? roundsWon : 1));
    let xp = rw.xp * (won ? (mode.rounds || 1) : (roundsWon ? roundsWon : 1));
    if (!won && roundsWon === 0) { gold = rw.gold; fame = rw.fame; xp = rw.xp; }
    const cs = squad.map(g => combatStats(g));
    const goldBonus = cs.reduce((a, c) => a + c.goldPct, 0);
    gold *= (1 + goldBonus) * game.legacy;
    fame *= 1 + st.b.stands * 0.05;
    xp *= 1 + st.rudis * 0.06;
    const hypeBonus = res.hype * 0.5;
    st.gold += gold; st.stats.gold += gold; st.fame += fame;
    st.stats.fights++; if (won) { st.stats.wins++; st.stats.bestVenue = Math.max(st.stats.bestVenue, cfg.venueIdx); if (venue.endless) st.stats.eternal = (st.stats.eternal || 0) + 1; }
    const levelEvents = [];
    const wounded = [];
    let mvp = null;
    const infirm = 1;
    for (const g of squad) {
      const s = res.stats.get(g.id) || { dealt: 0, kills: 0, taken: 0 };
      if (!mvp || s.dealt > mvp.dealt) mvp = { name: g.name, dealt: s.dealt };
      g.kills += s.kills; st.stats.kills += s.kills;
      if (won) { g.wins++; g.streak++; } else { g.losses++; g.streak = 0; }
      const evs = grantXp(g, xp * (s.dealt === mvp?.dealt ? 1.15 : 1), game);
      levelEvents.push(...evs);
      g.fatigue = Math.min(100, g.fatigue + 25);
      const carry = this.arena.carry.get(g.id);
      let wnd = 0;
      if (!carry || carry.dead) wnd = 40 + g.level * 5;
      else if (carry.frac < 0.5) wnd = (1 - carry.frac) * (16 + g.level * 2);
      if (wnd > 0) { g.wounded = Math.max(g.wounded, wnd); wounded.push(g); }
      if (g.wounded > 0) g.activity = 'rest';
    }
    const avgLv = allFoes.reduce((a, f) => a + f.level, 0) / allFoes.length;
    const loot = rollLoot(game, cfg.venueIdx, cfg.modeId, avgLv, won || roundsWon > 0, cfg.boss);
    for (const it of loot) game.addItem(it);
    game.recalc();
    game.save();
    return { won, gold, fame, xp, loot, levelEvents, wounded, mvp, venue, modeName: mode.name, hypeBonus, cfg };
  }

  showResult(sum) {
    const auto = this.st.settings.auto && sum.won;
    this.ui.hint('', 1);
    document.getElementById('ui').classList.remove('hidden');
    if (auto) {
      // modo automático: resumen en toasts y nueva batalla
      this.ui.toast('🏆', `Victoria en ${sum.venue.name}: +${fmt(sum.gold)} 🪙, +${fmt(sum.fame)} ⭐`, 'gold');
      for (const ev of sum.levelEvents) this.ui.onLevel(ev);
      this.pendingLevelEvents.forEach(ev => this.ui.onLevel(ev)); this.pendingLevelEvents = [];
      this.autoTimer = setTimeout(() => this.onResultClosed('auto'), 1800);
      this.mode = 'result';
    } else {
      document.getElementById('ui').classList.add('hidden');
      document.getElementById('ui').classList.remove('hidden');
      this.ui.showResult(sum);
      this.audio.setMode('arena');
    }
    this.ui.renderRoster();
  }

  async onResultClosed(v) {
    if (this.mode === 'returning' || this.mode === 'ludus') return;
    clearTimeout(this.autoTimer);
    const setup = this.lastSummary.cfg;
    const again = (v === 'again' || v === 'auto');
    // ¿repetir?
    if (again) {
      const squad = setup.squad.map(g => this.st.gladiators.find(x => x.id === g.id)).filter(Boolean);
      const ready = squad.length === setup.squad.length && squad.every(g => this.game.isReady(g));
      if (ready && this.st.gladiators.length) {
        if (this.ui.modalOpen) { this.autoTimer = setTimeout(() => this.onResultClosed(v), 800); return; }
        const foes = [];
        let boss = null;
        for (let r = 0; r < (MODES[setup.modeId].rounds || 1); r++) { const b = buildFoes(setup.venueIdx, setup.modeId, 0, r, this.st); foes.push(b.foes); boss = boss || b.boss; }
        // reinicia la batalla sin volver al ludus
        this.arena.clear();
        document.getElementById('ui').classList.add('hidden');
        this.mode = 'arena';
        const cfg = { venueIdx: setup.venueIdx, modeId: setup.modeId, squad, foes, boss };
        this.cfg = cfg;
        const res = await this.arena.runMatch({ squad, rounds: foes, venue: VENUES[setup.venueIdx], modeName: MODES[setup.modeId].name });
        this.mode = 'result';
        const sum = this.resolveFight(cfg, res); this.lastSummary = sum; this.showResult(sum);
        return;
      }
      if (v === 'auto') this.ui.toast('⏸️', 'Combate automático detenido: el equipo no está en forma.', 'bad');
    }
    this.returnToLudus();
  }

  async returnToLudus() {
    this.mode = 'returning';
    this.arena.director.enabled = false;
    this.arena.clear();
    document.getElementById('ui').classList.add('hidden');
    this.audio.setMode('ludus'); this.audio.setCrowd(0.0);
    this.applyVenueLook(0, true);
    this.colo.crowdMeshes.forEach(m => { m.count = Math.floor(this.colo.crowdCount * 0.6); });
    this.syncCrowd();
    const sel = this.selectedId && this.crowd.getEntry(this.selectedId);
    this.ludusCam.focus = null;
    this.ludusCam.dist = 32; this.ludusCam.yaw = 0.25; this.ludusCam.pitch = 0.36;
    const tgt = this.ludusCam.target.clone();
    const dd = 32, yw = 0.25, pt = 0.36;
    const endPos = new V(Math.sin(yw) * Math.cos(pt) * dd, Math.sin(pt) * dd, Math.cos(yw) * Math.cos(pt) * dd).add(tgt);
    await this.flyTo(() => ({ pos: endPos, look: tgt, fov: 40 }), 3.0, [new V(6, 30, 40), new V(0, 26, 80)]);
    this.crowd.setVisible(true);
    this.ludusCam.enabled = true;
    this.mode = 'ludus';
    document.getElementById('ui').classList.remove('hidden');
    for (const ev of this.pendingLevelEvents) this.ui.onLevel(ev);
    this.pendingLevelEvents = [];
    this.ui.openTab('ludus'); 
  }

  // ── bucle principal ──────────────────────────────────────────────────────
  frame() {
    const eng = this.eng;
    const now = performance.now() / 1000;
    let dt = this.prev ? Math.min(0.05, now - this.prev) : 0.016;
    if (window.__fixedDt) dt = window.__fixedDt;
    this.prev = now;
    this.time += dt;
    const w = eng.size.w, h = eng.size.h;
    // progreso incremental (sigue corriendo en cualquier modo)
    this.game.tick(dt);
    this.uiT += dt; this.lastSave += dt;
    if (this.uiT > 0.25) { this.uiT = 0; this.ui.tick(); this.syncIfChanged(); }
    if (this.lastSave > 15) { this.lastSave = 0; this.game.save(); }

    if (this.flight) this.updateFlight(dt);
    else if (this.mode === 'ludus') {
      const sel = this.ui.tab === 'ludus' && this.selectedId ? this.crowd.getEntry(this.selectedId) : null;
      this.ludusCam.focus = sel ? { pos: sel.avatar.root.position.clone().addScaledVector(new V(Math.cos(this.ludusCam.yaw), 0, -Math.sin(this.ludusCam.yaw)), 1.6), dist: 6.8 } : null;
      if (!sel && this.ludusCam.panelOpen) {
        // desplaza la mira para dejar sitio al panel
      }
      this.ludusCam.update(dt, this.time);
    }
    this.rig.update(dt);
    // entidades
    if (this.mode === 'ludus') {
      this.crowd.update(dt, this.time, eng.camera, w, h, this.game);
      this.world.update(dt, this.time);
      this.fx.update(dt, w, h);
      this.colo.update(dt, this.time, 0.25, null);
    } else if (this.mode === 'arena' || this.mode === 'result') {
      this.arena.update(dt, w, h);
    } else {
      this.world.update(dt, this.time);
      this.colo.update(dt, this.time, 0.3, null);
      this.fx.update(dt, w, h);
    }
    this.audio.update(dt);
    // sol/sombras siguen el foco
    const focus = this.mode === 'ludus' ? new V(this.rig.look.x, 0, this.rig.look.z) : new V(0, 0, 0);
    if (this.mode === 'flying' || this.mode === 'returning') focus.set(this.rig.look.x, 0, this.rig.look.z);
    eng.updateSun(focus);
    eng.u.aberration.value += ((0.0006 + this.rig.shakeAmt * 0.0016) - eng.u.aberration.value) * Math.min(1, dt * 10);
    if (!window.__noRender) eng.render();
  }

  syncIfChanged() {
    const n = this.st.gladiators.length;
    const sig = this.st.gladiators.map(g => g.id + g.activity + (g.wounded > 0 ? 'w' : '')).join();
    if (sig !== this._sig) { this._sig = sig; this.syncCrowd(); }
    // avatares: al subir de nivel se mantiene el modelo
  }
}

new App().boot().catch(err => {
  console.error(err);
  const n = document.getElementById('nogpu');
  n.classList.remove('hidden');
  n.innerHTML = '<div><h2 style="font-family:Cinzel,serif;color:#e3b55a">Error al iniciar</h2><p>' + String(err && err.message || err) + '</p></div>';
});
