// ────────────────────────────────────────────────────────────────────────────
//  Interfaz de usuario (DOM): paneles, plantel, tienda, forja, arena, modales…
// ────────────────────────────────────────────────────────────────────────────
import {
  STATS, STAT_INFO, CLASSES, SLOTS, SLOT_ORDER, BASES, RARITY, SKILLS, SKILL_RARITY, BUILDINGS, VENUES, MODES, MAX_SKILL_RANK,
} from './data.js';
import {
  fmt, fmtTime, xpNeed, skillSlots, combatStats, totalStats, setCount, powerOf, itemArmor, weaponDmg, itemValue, forgeCost, MAX_PLUS,
  genEnemy, buildFoes, rewardFor, venueUnlocked, recruitCost, clamp,
} from './game.js';
import { estimateWin } from './combat.js';
import { QUEST_TYPES, RELICS } from './data.js';
import { OBJECTIVES } from './game.js';
import { pickEvent } from './events.js';

const ICONS = {
  weapon: { gladius: '🗡️', sica: '🔪', sicae: '⚔️', hasta: '🦯', tridens: '🔱', bipennis: '🪓', malleus: '🔨' },
  offhand: { scutum: '🛡️', parma: '🥏', rete: '🕸️' },
  helm: { cassis: '⛑️', galea: '🪖', thracia: '🦅', secutor: '🥽' },
  armor: { tunica: '👕', cuero: '🦺', segmentata: '🥋', muscular: '🏅' },
  greaves: { cuero: '🦵', bronce: '🦿', acero: '🦿' },
  charm: { bulla: '📿', laurel: '🌿', garra: '🦁' },
};
export const itemIcon = it => ICONS[it.slot]?.[it.base] || '❔';
const ACT_NAMES = { rest: 'Descansando', str: 'Levantando piedras', agi: 'Corriendo', vit: 'Acarreando sacos', tec: 'Golpeando el palus', wil: 'Meditando' };
const $ = s => document.querySelector(s);

export class UI {
  constructor(game, hooks) {
    this.game = game; this.hooks = hooks;
    this.tab = null;
    this.selected = null;
    this.arena = { venue: 0, mode: 'duel', squad: [], foes: null, odds: null, oddsKey: '' };
    this.panel = $('#panel'); this.body = $('#panel-body'); this.title = $('#panel-title');
    this.modalRoot = $('#modal-root');
    this.tip = $('#tooltip');
    this.modalQueue = [];
    this.modalOpen = false;
    this.bind();
    document.getElementById('ui').classList.add('panel-closed');
  }

  get st() { return this.game.state; }
  audio() { return this.hooks.audio; }

  // ── eventos globales ─────────────────────────────────────────────────────
  bind() {
    document.querySelectorAll('.nav-b').forEach(b => b.addEventListener('click', () => { this.audio().click(); this.openTab(b.dataset.tab); }));
    $('#panel-close').addEventListener('click', () => this.closePanel());
    this.body.addEventListener('click', e => this.onPanelClick(e));
    this.modalRoot.addEventListener('click', e => this.onModalClick(e));
    document.addEventListener('mousemove', e => this.onMove(e));
    document.addEventListener('mouseover', e => this.onOver(e));
    document.addEventListener('mouseout', e => { if (e.target.closest?.('[data-tip],[data-tipk]')) this.hideTip(); });
    $('#btn-sound').addEventListener('click', () => { const s = this.st.settings; s.sound = !s.sound; this.hooks.audio.setEnabled(s.sound); this.refreshTools(); });
    $('#btn-music').addEventListener('click', () => { const s = this.st.settings; s.music = !s.music; this.hooks.audio.setMusic(s.music); this.refreshTools(); });
    $('#btn-fs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); });
    $('#btn-settings').addEventListener('click', () => this.openSettings());
    $('#btn-help').addEventListener('click', () => this.showHelp(false));
    $('#objective').addEventListener('click', () => {
      const o = OBJECTIVES[this.st.tutorial.step]; if (!o) return;
      this.audio().click();
      if (o.roster) { this.hint('Toca uno de los retratos de la parte inferior.', 3500); return; }
      if (o.tab === 'ludus' && !this.selected && this.st.gladiators[0]) { this.selected = this.st.gladiators[0].id; this.hooks.selectGladiator?.(this.selected); }
      if (o.tab) this.openTabForce(o.tab);
    });
    // en pantallas táctiles no hay "hover": un toque muestra la ayuda
    document.addEventListener('click', e => {
      if (!matchMedia('(hover: none)').matches) return;
      const t = e.target.closest?.('[data-tipk],[data-tip]');
      if (!t || e.target.closest('[data-act],[data-m]')) return;
      const html = t.dataset.tipk ? this.tipHTML(t.dataset.tipk) : t.dataset.tip; if (!html) return;
      this.tip.innerHTML = html; this.tip.classList.add('on');
      const r = t.getBoundingClientRect();
      this.tip.style.left = Math.max(8, Math.min(innerWidth - this.tip.offsetWidth - 8, r.left)) + 'px';
      this.tip.style.top = Math.max(8, r.top - this.tip.offsetHeight - 8) + 'px';
      clearTimeout(this._tipT); this._tipT = setTimeout(() => this.hideTip(), 3200);
    });
    document.querySelectorAll('#fh-ctrl .spd').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#fh-ctrl .spd').forEach(x => x.classList.remove('on')); b.classList.add('on');
      const s = +b.dataset.spd; if (s === 8) this.hooks.skipFight(); else { this.hooks.setSpeed(s); this.st.settings.speed = s; }
    }));
    $('#cam-toggle').addEventListener('click', () => { const free = this.hooks.toggleFreeCam(); $('#cam-toggle').textContent = free ? '🎥 Libre' : '🎥 Auto'; });
    $('#hud-toggle').addEventListener('click', () => document.body.classList.toggle('hud-off'));
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (this.modalOpen) this.closeModal(); else this.closePanel(); }
    });
  }

  refreshTools() {
    const s = this.st.settings;
    $('#btn-sound').classList.toggle('off', !s.sound); $('#btn-sound').textContent = s.sound ? '🔊' : '🔇';
    $('#btn-music').classList.toggle('off', !s.music);
  }

  // ── tooltips ─────────────────────────────────────────────────────────────
  onOver(e) {
    const t = e.target.closest?.('[data-tip],[data-tipk]');
    if (!t) return;
    let html = '';
    if (t.dataset.tipk) html = this.tipHTML(t.dataset.tipk); else html = t.dataset.tip;
    if (!html) return;
    this.tip.innerHTML = html; this.tip.classList.add('on');
    this.onMove(e);
  }
  hideTip() { this.tip.classList.remove('on'); }
  onMove(e) {
    if (!this.tip.classList.contains('on')) return;
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > innerWidth - 8) x = e.clientX - w - 16;
    if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    this.tip.style.left = Math.max(8, x) + 'px'; this.tip.style.top = Math.max(8, y) + 'px';
  }
  findItem(id) {
    const st = this.st;
    let it = st.inventory.find(i => i.id === id);
    if (it) return it;
    for (const g of st.gladiators) for (const s of SLOT_ORDER) if (g.equip[s]?.id === id) return g.equip[s];
    for (const g of st.market) for (const s of SLOT_ORDER) if (g.equip[s]?.id === id) return g.equip[s];
    return null;
  }
  tipHTML(k) {
    const [type, a, b] = k.split(':');
    if (type === 'skill') {
      const sk = SKILLS[a]; const rank = +b || 1; const R = SKILL_RARITY[sk.rarity];
      return `<div class="tt-h" style="color:${R.color}">${sk.icon} ${sk.name}</div><div class="tt-r" style="color:${R.color}">${R.name} · ${sk.kind === 'active' ? 'Activa · recarga ' + sk.cd + ' s' : 'Pasiva'} · Rango ${rank}/${MAX_SKILL_RANK}</div>${sk.desc(rank)}${rank < MAX_SKILL_RANK ? `<div class="dim small" style="margin-top:6px">Siguiente rango: ${sk.desc(rank + 1)}</div>` : ''}`;
    }
    if (type === 'item') {
      const it = this.findItem(a); if (!it) return '';
      return this.itemTip(it, b);
    }
    if (type === 'stat') {
      const s = STAT_INFO[a]; return `<div class="tt-h">${s.icon} ${s.name}</div>${s.desc}<div class="dim small" style="margin-top:4px">Se entrena: ${s.train}.</div>`;
    }
    return '';
  }
  itemAffixLines(it) {
    const lines = [];
    const m = 1 + (it.plus || 0) * 0.09;
    for (const a of it.affixes) {
      const def = STAT_INFO[a.key];
      if (def) lines.push(`<div class="good">+${Math.round(a.val * m)} ${def.name}</div>`);
      else {
        const label = { crit: 'Prob. crítico', lifesteal: 'Robo de vida', dodge: 'Esquiva', hpPct: 'Vida máx.', dmgPct: 'Daño', thorns: 'Espinas', goldPct: 'Oro de combate' }[a.key] || a.key;
        lines.push(`<div class="good">+${(a.val * m * 100).toFixed(1)}% ${label}</div>`);
      }
    }
    return lines.join('');
  }
  itemTip(it, gid) {
    const R = RARITY[it.rarity], base = BASES[it.slot][it.base];
    let main = '';
    if (it.slot === 'weapon') { const [a, b] = weaponDmg(it); main = `<div>Daño <b>${Math.round(a)}–${Math.round(b)}</b> · ${base.interval.toFixed(2)} s · alcance ${base.reach} m</div>`; }
    else { const ar = itemArmor(it); if (ar) main = `<div>Armadura <b>${Math.round(ar)}</b></div>`; if (base.block) main += `<div>Bloqueo +${Math.round(base.block * 100)}%</div>`; }
    // comparación con lo equipado
    let cmp = '';
    const g = this.st.gladiators.find(x => x.id === gid) || (this.selected && this.st.gladiators.find(x => x.id === this.selected));
    if (g && g.equip[it.slot] && g.equip[it.slot].id !== it.id) {
      const cur = g.equip[it.slot];
      if (it.slot === 'weapon') { const a = weaponDmg(it), b = weaponDmg(cur); const d = (a[0] + a[1]) / 2 - (b[0] + b[1]) / 2; cmp = `<div class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))} daño medio vs. equipado</div>`; }
      else { const d = itemArmor(it) - itemArmor(cur); cmp = `<div class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))} armadura vs. equipado</div>`; }
    }
    return `<div class="tt-h" style="color:${R.color}">${itemIcon(it)} ${it.name}${it.plus ? ' +' + it.plus : ''}</div><div class="tt-r" style="color:${R.color}">${R.name} · ${SLOTS[it.slot].name} · nivel ${it.ilvl}</div>${main}${this.itemAffixLines(it)}${cmp}<div class="dim small" style="margin-top:5px">Valor: 🪙 ${fmt(itemValue(it))}</div>`;
  }

  // ── paneles ──────────────────────────────────────────────────────────────
  openTab(tab) {
    if (this.tab === tab && !this.panel.classList.contains('closed')) { this.closePanel(); return; }
    this.tab = tab;
    document.querySelectorAll('.nav-b').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    this.panel.classList.remove('closed');
    document.getElementById('ui').classList.remove('panel-closed');
    this.body.scrollTop = 0;
    this.render();
    this.hooks.onTab?.(tab);
  }
  closePanel() {
    this.panel.classList.add('closed'); this.tab = null;
    document.getElementById('ui').classList.add('panel-closed');
    document.querySelectorAll('.nav-b').forEach(b => b.classList.remove('active'));
    this.hooks.onTab?.(null);
  }
  render() {
    if (!this.tab) return;
    const scroll = this.body.scrollTop;
    const titles = { ludus: this.selected ? 'Gladiador' : 'Tu Ludus', market: 'Mercado de Gladiadores', armory: 'Armería', build: 'Mejoras del Ludus', arena: 'Entrar a la Arena', legacy: 'Misiones y Legado' };
    this.title.textContent = titles[this.tab];
    let html = '';
    switch (this.tab) {
      case 'ludus': html = this.selected && this.gl(this.selected) ? this.renderDetail(this.gl(this.selected)) : this.renderLudus(); break;
      case 'market': html = this.renderMarket(); break;
      case 'armory': html = this.renderArmory(); break;
      case 'build': html = this.renderBuild(); break;
      case 'arena': html = this.renderArena(); break;
      case 'legacy': html = this.renderLegacy(); break;
    }
    this.body.innerHTML = html;
    this.body.scrollTop = scroll;
    this.live();
  }
  gl(id) { return this.st.gladiators.find(g => g.id === id); }

  // ── plantel inferior ─────────────────────────────────────────────────────
  renderRoster() {
    const st = this.st;
    const key = st.gladiators.map(g => g.id + g.level + g.activity + (g.wounded > 0 ? 'w' : '')).join('|') + this.selected;
    if (key === this._rosterKey) return;
    this._rosterKey = key;
    let h = '';
    for (const g of st.gladiators) {
      const act = g.wounded > 0 ? '🩹' : g.resting ? '💤' : { str: '💪', agi: '🏃', vit: '❤️', tec: '🎯', wil: '🔥', rest: '💤' }[g.activity];
      h += `<div class="rc ${this.selected === g.id ? 'sel' : ''} ${g.wounded > 0 ? 'hurt' : ''}" data-act="select" data-id="${g.id}"><span class="badge-lv rl" style="min-width:20px;height:20px;font-size:10.5px">${g.level}</span><span class="ra">${act}</span><div class="ava">${CLASSES[g.cls].icon}</div><div class="rn">${g.name.split(' ')[0]}</div><div class="bar thin rb"><i data-live="xp:${g.id}" style="width:0"></i></div></div>`;
    }
    if (st.gladiators.length < this.game.capacity()) h += `<div class="rc add" data-act="goto" data-tab="market" data-tip="Reclutar un nuevo gladiador">＋</div>`;
    $('#roster').innerHTML = h;
    $('#roster').onclick = e => this.onPanelClick(e);
  }

  // ── pestaña Ludus ────────────────────────────────────────────────────────
  renderLudus() {
    const st = this.st;
    let h = `<div class="row between small dim"><span>${st.gladiators.length}/${this.game.capacity()} gladiadores</span><span>Ingresos: <b class="gold">🪙 ${fmt(this.game.incomeRate)}/s</b></span></div>`;
    h += `<div class="dim small" style="margin:6px 0 2px;font-family:var(--ff-b);font-style:italic">Toca un gladiador para entrenarlo, equiparlo y ver sus habilidades.</div>`;
    if (!st.gladiators.length) h += `<div class="empty">El ludus está vacío. Ve al Mercado a reclutar gladiadores.</div>`;
    for (const g of st.gladiators) {
      const c = CLASSES[g.cls];
      const power = Math.round(powerOf(g));
      h += `<div class="card click ${this.selected === g.id ? 'sel' : ''}" data-act="select" data-id="${g.id}">
        <div class="row"><div class="ava">${c.icon}</div>
        <div class="grow"><div class="row between"><span class="name">${g.name}</span><span class="badge-lv">${g.level}</span></div>
        <div class="dim small">${c.name} · Poder ${power}${g.talent ? ` · Talento: ${STAT_INFO[g.talent].icon}` : ''}</div>
        <div class="bar xp" style="margin-top:5px"><i data-live="xp:${g.id}"></i></div></div></div>
        <div class="row between small" style="margin-top:7px"><span data-live-txt="act:${g.id}" class="dim"></span>
        <span class="row" style="gap:4px">${this.actButtons(g)}</span></div></div>`;
    }
    return h;
  }
  actButtons(g) {
    let h = '';
    for (const s of STATS) h += `<button class="icon-btn small ${g.activity === s ? 'on' : ''}" style="${g.activity === s ? 'background:var(--gold2);border-color:var(--gold)' : ''}" data-act="activity" data-id="${g.id}" data-v="${s}" data-tip="${STAT_INFO[s].name}: ${STAT_INFO[s].train}">${STAT_INFO[s].icon}</button>`;
    h += `<button class="icon-btn small" style="${g.activity === 'rest' ? 'background:var(--gold2);border-color:var(--gold)' : ''}" data-act="activity" data-id="${g.id}" data-v="rest" data-tip="Descansar">💤</button>`;
    return h;
  }

  // ── detalle del gladiador ────────────────────────────────────────────────
  renderDetail(g) {
    const c = CLASSES[g.cls];
    const tot = totalStats(g);
    const cs = combatStats(g);
    let h = `<button class="btn ghost sm" data-act="back">← Plantel</button>`;
    h += `<div class="card" style="margin-top:10px"><div class="row"><div class="ava" style="width:56px;height:56px;font-size:30px">${c.icon}</div>
      <div class="grow"><div class="row between"><span class="name" style="font-size:18px">${g.name}</span><span class="badge-lv" style="min-width:30px;height:30px;font-size:15px">${g.level}</span></div>
      <div class="dim small">${c.name}${g.look.female ? ' (gladiatrix)' : ''} · ${g.wins}V ${g.losses}D · ${g.kills} bajas${g.talent ? ` · Talento ${STAT_INFO[g.talent].icon} ${STAT_INFO[g.talent].name}` : ''}</div></div></div>
      <div class="row between tiny dim" style="margin-top:8px"><span>Experiencia</span><span data-live-txt="xp:${g.id}"></span></div><div class="bar xp"><i data-live="xp:${g.id}"></i></div>
      <div class="row between tiny dim" style="margin-top:7px"><span>Fatiga <span class="dim2">(al llegar a 100 descansa solo)</span></span><span data-live-txt="fat:${g.id}"></span></div><div class="bar fat thin"><i data-live="fat:${g.id}"></i></div>
      ${g.wounded > 0 ? `<div class="row between" style="margin-top:9px"><span class="small" style="color:#ff8a7a">🩹 Herido · <span data-live-txt="wound:${g.id}"></span></span><button class="btn sm red" data-act="heal" data-id="${g.id}" data-cost="${Math.round(g.wounded * 1.2 + 10)}">Curar <span class="cost">🪙 ${fmt(g.wounded * 1.2 + 10)}</span></button></div>` : ''}
    </div>`;
    h += `<div class="sec">Atributos y entrenamiento</div>`;
    for (const s of STATS) {
      const bonus = tot[s] - g.stats[s];
      const on = g.activity === s;
      h += `<div class="stat ${on ? 'on' : ''}" data-act="activity" data-id="${g.id}" data-v="${s}" data-tipk="stat:${s}">
        <div class="ic">${STAT_INFO[s].icon}</div>
        <div><div class="nm">${STAT_INFO[s].name}${g.talent === s ? ' <small>★ talento</small>' : ''}${on ? ' <small style="color:var(--gold)">· entrenando</small>' : ''}</div>
        <div class="bar thin"><i data-live="prog:${g.id}:${s}" style="width:${on ? g.prog[s] * 100 : 0}%"></i></div></div>
        <div class="val"><span data-live-txt="stat:${g.id}:${s}">${g.stats[s]}</span>${bonus ? `<small>+${bonus}</small>` : ''}</div></div>`;
    }
    h += `<div class="stat ${g.activity === 'rest' ? 'on' : ''}" data-act="activity" data-id="${g.id}" data-v="rest"><div class="ic">💤</div><div><div class="nm">Solo descansar</div><div class="dim tiny">No entrena; recupera la fatiga más rápido.</div></div><div></div></div>`;
    // habilidades
    const slots = skillSlots(g);
    h += `<div class="sec">Habilidades (${g.skills.length}/${slots})</div><div class="skills">`;
    for (const s of g.skills) {
      const d = SKILLS[s.id], R = SKILL_RARITY[d.rarity];
      h += `<div class="skill ${d.kind} ${d.rarity === 'legendary' ? 'leg' : ''}" style="--rc:${R.color}" data-tipk="skill:${s.id}:${s.rank}">${d.icon}<span class="rk">${s.rank}</span></div>`;
    }
    for (let i = g.skills.length; i < slots; i++) h += `<div class="skill empty" data-tip="Ranura libre. Puede aprender una habilidad al subir de nivel.">?</div>`;
    h += `</div><div class="dim tiny" style="margin-top:6px">Al subir de nivel hay una probabilidad (${Math.round(clamp(0.4 + g.stats.wil * 0.002 + this.st.b.shrine * 0.02, 0, 0.88) * 100)}%) de aprender una habilidad aleatoria o subir el rango de una ya conocida.</div>`;
    // equipo
    h += `<div class="sec">Equipo</div><div class="slots">`;
    for (const s of SLOT_ORDER) {
      const it = g.equip[s];
      const w = g.equip.weapon ? BASES.weapon[g.equip.weapon.base] : null;
      const blocked = s === 'offhand' && w && w.hands === 2;
      if (it) {
        const R = RARITY[it.rarity];
        h += `<div class="slot" style="--rc:${R.color};--g:${R.glow}" data-act="slot" data-id="${g.id}" data-slot="${s}" data-tipk="item:${it.id}:${g.id}"><span class="si">${itemIcon(it)}</span><span class="sn" style="color:${R.color}">${it.name}</span>${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}<span class="sl">${SLOTS[s].name}</span></div>`;
      } else h += `<div class="slot emptys ${blocked ? 'locked' : ''}" ${blocked ? 'style="opacity:.4"' : ''} data-act="slot" data-id="${g.id}" data-slot="${s}"><span class="si" style="opacity:.35">${SLOTS[s].icon}</span><span class="sl">${blocked ? 'Arma a dos manos' : SLOTS[s].name}</span></div>`;
    }
    h += `</div>`;
    { const n = setCount(g); h += `<div class="tiny ${n >= 4 ? 'gold' : 'dim'}" style="margin-top:6px">⚜️ Equipo de ${c.name}: ${n}/${Object.values(c.kit).filter(Boolean).length} piezas clásicas · 4 piezas: +6% daño y vida · 6 piezas: +15%</div>`; }
    // combate
    const avg = Math.round((cs.dmgMin + cs.dmgMax) / 2);
    h += `<div class="sec">Estadísticas de combate · Poder ${Math.round(powerOf(g))}</div><div class="grid2 small">
      <div class="stats-line"><span class="dim">Vida</span><b>${fmt(cs.hp)}</b></div><div class="stats-line"><span class="dim">Daño</span><b>${avg}</b></div>
      <div class="stats-line"><span class="dim">Vel. ataque</span><b>${(1 / cs.interval).toFixed(2)}/s</b></div><div class="stats-line"><span class="dim">Armadura</span><b>${Math.round(cs.armor)}</b></div>
      <div class="stats-line"><span class="dim">Crítico</span><b>${(cs.crit * 100).toFixed(0)}% ×${cs.critMult.toFixed(1)}</b></div><div class="stats-line"><span class="dim">Esquiva</span><b>${(cs.dodge * 100).toFixed(0)}%</b></div>
      <div class="stats-line"><span class="dim">Bloqueo</span><b>${(cs.block * 100).toFixed(0)}%</b></div><div class="stats-line"><span class="dim">Robo de vida</span><b>${(cs.lifesteal * 100).toFixed(0)}%</b></div></div>`;
    h += `<div class="hr"></div><div class="row" style="gap:8px;flex-wrap:wrap">`;
    if (this.game.canRetire(g)) h += `<button class="btn green sm" data-act="retire" data-id="${g.id}" data-tip="Libera a este gladiador con honores: ganas 🗡️ Rudis permanentes y entra en el Salón de la Fama.">Manumitir (+${this.game.retireValue(g)} 🗡️)</button>`;
    else h += `<button class="btn ghost sm disabled" data-tip="Disponible desde el nivel 10.">Manumitir (nv. 10)</button>`;
    h += `<button class="btn ghost sm" data-act="dismiss" data-id="${g.id}">Despedir</button></div>`;
    return h;
  }

  // ── mercado ──────────────────────────────────────────────────────────────
  renderMarket() {
    const st = this.st;
    const cap = this.game.capacity();
    let h = `<div class="row between small dim"><span>Cupo: ${st.gladiators.length}/${cap}</span><span>Nuevos candidatos en <b data-live-txt="mk" class="gold"></b></span></div>`;
    h += `<div class="row" style="margin:8px 0"><button class="btn sm" data-act="mkrefresh" data-cost="${this.refreshCost()}">🔄 Buscar otros <span class="cost">🪙 ${fmt(this.refreshCost())}</span></button></div>`;
    for (const g of st.market) {
      const c = CLASSES[g.cls];
      const cost = g.cost;
      h += `<div class="card recruit"><div class="cls"><div class="ava">${c.icon}</div><div class="grow"><div class="row between"><span class="name">${g.name}</span><span class="badge-lv">${g.level}</span></div>
        <div class="dim small">${c.name}${g.look.female ? ' · gladiatrix' : ''}${g.talent ? ` · Talento ${STAT_INFO[g.talent].icon}` : ''} · Poder ${Math.round(powerOf(g))}</div></div></div>
        <div class="mini-stats">${STATS.map(s => `<span style="${g.talent === s ? 'color:var(--gold3)' : ''}">${STAT_INFO[s].icon} ${g.stats[s]}</span>`).join('')}</div>
        <div class="dim tiny" style="margin-top:6px">${c.desc}</div>
        <div class="row between" style="margin-top:8px"><span class="dim tiny">${SLOT_ORDER.filter(s => g.equip[s]).map(s => itemIcon(g.equip[s])).join(' ')}</span>
        <button class="btn sm" data-act="recruit" data-id="${g.id}" data-cost="${cost}">Reclutar <span class="cost">🪙 ${fmt(cost)}</span></button></div></div>`;
    }
    return h;
  }
  refreshCost() { return Math.round(15 + this.st.gladiators.length * 10 + this.game.state.fame * 0.02); }

  // ── armería ──────────────────────────────────────────────────────────────
  renderArmory() {
    const inv = this.st.inventory.slice().sort((a, b) => b.rarity - a.rarity || b.ilvl - a.ilvl);
    let h = `<div class="row between small dim"><span>Inventario ${inv.length}/80</span>
      <span class="row" style="gap:6px"><button class="btn sm ghost" data-act="sellJunk1" data-tip="Vende todos los objetos Comunes y Finos.">Vender basura</button></span></div>`;
    if (!inv.length) h += `<div class="empty">No tienes objetos. Gana combates para obtener botín: armas, yelmos, corazas y amuletos.</div>`;
    h += `<div class="inv" style="margin-top:10px">`;
    for (const it of inv) {
      const R = RARITY[it.rarity];
      h += `<div class="item" style="--rc:${R.color};--g:${R.glow}" data-act="item" data-id="${it.id}" data-tipk="item:${it.id}">${itemIcon(it)}<span class="lv">${it.ilvl}</span>${it.plus ? `<span class="pl">+${it.plus}</span>` : ''}</div>`;
    }
    h += `</div>`;
    h += `<div class="sec">Equipo de tus gladiadores</div>`;
    for (const g of this.st.gladiators) {
      h += `<div class="card click" data-act="select" data-goto="ludus" data-id="${g.id}"><div class="row"><div class="ava" style="width:36px;height:36px;font-size:18px">${CLASSES[g.cls].icon}</div><div class="grow name" style="font-size:13px">${g.name}</div><div class="row" style="gap:4px">${SLOT_ORDER.map(s => g.equip[s] ? `<span data-tipk="item:${g.equip[s].id}:${g.id}" style="font-size:17px;filter:drop-shadow(0 0 4px ${RARITY[g.equip[s].rarity].color})">${itemIcon(g.equip[s])}</span>` : `<span style="opacity:.2;font-size:17px">·</span>`).join('')}</div></div></div>`;
    }
    return h;
  }

  openItemModal(id) {
    const it = this.findItem(id); if (!it) return;
    const R = RARITY[it.rarity];
    const fc = forgeCost(it, this.st.b.forge);
    const eq = this.st.gladiators.map(g => `<option value="${g.id}" ${this.selected === g.id ? 'selected' : ''}>${g.name} (nv ${g.level})</option>`).join('');
    const html = `<div class="modal"><div style="text-align:center;font-size:48px;filter:drop-shadow(0 0 18px ${R.color})">${itemIcon(it)}</div>
      <h1 style="font-size:20px;color:${R.color}">${it.name}${it.plus ? ' +' + it.plus : ''}</h1><div class="sub">${R.name} · ${SLOTS[it.slot].name} · nivel ${it.ilvl}</div>
      <div class="card" style="font-size:13.5px">${this.itemTip(it, this.selected).replace(/<div class="tt-h".*?<\/div><div class="tt-r".*?<\/div>/, '')}</div>
      <div class="row" style="gap:8px;margin-top:10px"><select id="eq-target" style="flex:1;padding:8px;border-radius:8px;background:#1a120b;color:var(--txt);border:1px solid var(--line)">${eq}</select>
      <button class="btn" data-m="equip" data-id="${it.id}">Equipar</button></div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      ${(it.plus || 0) < MAX_PLUS ? `<button class="btn green" data-m="forge" data-id="${it.id}" data-cost="${fc}">Forjar +${(it.plus || 0) + 1} <span class="cost">🪙 ${fmt(fc)}</span></button>` : `<button class="btn ghost disabled">Forja al máximo</button>`}
      <button class="btn red" data-m="sell" data-id="${it.id}">Vender 🪙 ${fmt(itemValue(it))}</button><button class="btn ghost" data-m="close" style="margin-left:auto">Cerrar</button></div></div>`;
    this.showModal(html, true);
  }

  openEquipModal(gid, slot) {
    const g = this.gl(gid); if (!g) return;
    const w = g.equip.weapon ? BASES.weapon[g.equip.weapon.base] : null;
    if (slot === 'offhand' && w && w.hands === 2) { this.toast('⚠️', 'El arma actual requiere dos manos.', 'bad'); this.audio().deny(); return; }
    const items = this.st.inventory.filter(i => i.slot === slot).sort((a, b) => b.rarity - a.rarity || b.ilvl - a.ilvl);
    const cur = g.equip[slot];
    let body = '';
    if (cur) body += `<div class="card"><div class="tiny dim">Equipado</div><div class="row"><div class="item" style="width:54px;flex:none;--rc:${RARITY[cur.rarity].color};--g:${RARITY[cur.rarity].glow}" data-tipk="item:${cur.id}:${g.id}">${itemIcon(cur)}</div><div class="grow">${this.itemTip(cur, g.id).replace(/<div class="dim small".*$/, '')}</div></div><button class="btn sm ghost" data-m="unequip" data-id="${g.id}" data-slot="${slot}" style="margin-top:6px">Desequipar</button></div>`;
    if (!items.length) body += `<div class="empty">No tienes más ${SLOTS[slot].name.toLowerCase()}s en el inventario.</div>`;
    for (const it of items) {
      body += `<div class="card click" data-m="equipTo" data-id="${it.id}" data-gid="${g.id}"><div class="row"><div class="item" style="width:50px;flex:none;--rc:${RARITY[it.rarity].color};--g:${RARITY[it.rarity].glow}">${itemIcon(it)}</div><div class="grow small">${this.itemTip(it, g.id)}</div></div></div>`;
    }
    this.showModal(`<div class="modal"><h1 style="font-size:20px">${SLOTS[slot].icon} ${SLOTS[slot].name}</h1><div class="sub">${g.name}</div>${body}<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost" data-m="close">Cerrar</button></div></div>`, true);
  }

  // ── mejoras ──────────────────────────────────────────────────────────────
  renderBuild() {
    let h = `<div class="dim small" style="font-family:var(--ff-b);font-style:italic">Invierte tus denarios en el ludus: cada mejora multiplica tu progreso.</div>`;
    const icons = {};
    for (const [id, b] of Object.entries(BUILDINGS)) {
      const lv = this.st.b[id], max = b.max >= 0 && lv >= b.max;
      const cost = this.game.bCost(id);
      h += `<div class="card"><div class="row"><div class="ava" style="width:50px;height:50px;font-size:26px;border-radius:12px">${b.icon}</div>
        <div class="grow"><div class="row between"><span class="name">${b.name}</span><span class="badge-lv" style="min-width:auto;padding:0 9px;border-radius:12px">Nv ${lv}</span></div>
        <div class="small" style="margin-top:2px">${b.desc(Math.max(lv, 0))}</div>
        <div class="tiny dim">Siguiente: ${b.desc(lv + 1)}</div></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px">${max ? '<span class="tag gold">Máximo</span>' : `<button class="btn sm" data-act="build" data-id="${id}" data-cost="${cost}">Mejorar <span class="cost">🪙 ${fmt(cost)}</span></button>`}</div></div>`;
    }
    return h;
  }

  // ── arena ────────────────────────────────────────────────────────────────
  ensureArena() {
    const A = this.arena, st = this.st;
    // sede válida
    if (!venueUnlocked(st, A.venue)) A.venue = 0;
    const mode = MODES[A.mode];
    if (A.venue < mode.unlockVenue) A.mode = 'duel';
    const m = MODES[A.mode];
    A.squad = A.squad.filter(id => { const g = this.gl(id); return g && this.game.isReady(g); });
    if (A.squad.length > m.squad) A.squad = A.squad.slice(0, m.squad);
    if (!A.squad.length) {
      const ready = st.gladiators.filter(g => this.game.isReady(g)).sort((a, b) => powerOf(b) - powerOf(a));
      A.squad = ready.slice(0, m.squad).map(g => g.id);
    }
  }
  genFoes() {
    const A = this.arena, m = MODES[A.mode];
    const squad = A.squad.map(id => this.gl(id)).filter(Boolean);
    const rounds = [];
    const n = m.rounds || 1;
    let boss = null;
    const sqLv = squad.length ? squad.reduce((a, g) => a + g.level, 0) / squad.length : 0;
    for (let r = 0; r < n; r++) { const b = buildFoes(A.venue, A.mode, sqLv, r, this.st); rounds.push(b.foes); boss = boss || b.boss; }
    A.foes = rounds; A.boss = boss; A.odds = null;
    this.scheduleOdds();
  }
  scheduleOdds() {
    const A = this.arena;
    clearTimeout(this._oddsT);
    this._oddsT = setTimeout(() => {
      const squad = A.squad.map(id => this.gl(id)).filter(Boolean);
      if (!squad.length || !A.foes) return;
      let p = 1;
      const hp = squad.map(g => ({ ...g, _hpFrac: 1 }));
      const r0 = estimateWin(hp, A.foes[0], 8, { tactic: A.tactic });
      p = r0;
      if (A.foes.length > 1) for (let i = 1; i < A.foes.length; i++) p *= Math.min(0.97, estimateWin(squad.map(g => ({ ...g, _hpFrac: 0.7 })), A.foes[i], 6, { tactic: A.tactic }) + 0.05);
      A.odds = p;
      if (this.tab === 'arena') this.updateOdds();
    }, 30);
  }
  updateOdds() {
    const el = this.body.querySelector('[data-odds]'); if (!el) return;
    const p = this.arena.odds;
    if (p == null) { el.innerHTML = '<span class="dim">Calculando probabilidades…</span>'; return; }
    const pct = Math.round(p * 100);
    const label = pct >= 85 ? 'Victoria casi segura' : pct >= 60 ? 'Favorable' : pct >= 40 ? 'Combate parejo' : pct >= 20 ? 'Arriesgado' : 'Suicida';
    const col = pct >= 60 ? '#6fd18a' : pct >= 40 ? '#e0c24a' : '#ff7a6a';
    el.innerHTML = `<div class="row between"><span class="small dim">Probabilidad de victoria</span><b style="color:${col};font-family:var(--ff-h)">${pct}% · ${label}</b></div><div class="odds"><i style="left:${pct}%"></i></div>`;
  }
  renderArena() {
    this.ensureArena();
    const A = this.arena, st = this.st;
    const m = MODES[A.mode], venue = VENUES[A.venue];
    A.tactic = A.tactic || st.settings.tactic || 'balanced';
    const key = A.venue + A.mode + A.squad.join(',');
    if (!A.foes || A.key !== key) { A.key = key; this.genFoes(); }
    const ready = st.gladiators.filter(g => this.game.isReady(g));
    let h = '';
    h += `<div class="sec">1 · Sede</div>`;
    VENUES.forEach((v, i) => {
      const un = venueUnlocked(st, i);
      const nextLocked = i > 0 && !venueUnlocked(st, i - 1);
      if (nextLocked && !un) return;
      h += `<div class="card click ${A.venue === i ? 'sel' : ''} ${un ? '' : 'locked'}" data-act="venue" data-v="${i}" style="padding:8px 10px"><div class="venue" style="--vc:${v.banner}"><div class="vi">${['🕳️', '🏛️', '🌋', '🐎', '🏟️', '👑', '♾️'][i]}</div>
        <div><div class="row between"><span class="name" style="font-size:14px">${v.name}</span><span class="tag">${v.endless ? 'Nv ' + v.lv[0] + '+' : 'Nv ' + v.lv[0] + '–' + v.lv[1]}</span></div>
        <div class="dim tiny">${v.sub}</div><div class="tiny" style="margin-top:2px">${un ? `Recompensa ×${v.gold}` : `🔒 Requiere ⭐ ${fmt(v.fame)} de fama`}</div></div></div></div>`;
    });
    h += `<div class="sec">2 · Modalidad</div><div class="modes">`;
    for (const [id, md] of Object.entries(MODES)) {
      const off = A.venue < md.unlockVenue;
      h += `<div class="mode ${A.mode === id ? 'on' : ''} ${off ? 'off' : ''}" data-act="mode" data-v="${id}"><span class="mi">${md.icon}</span><b>${md.name}</b><div class="tiny dim">${off ? '🔒 ' + VENUES[md.unlockVenue].name : md.desc}</div><div class="tiny gold" style="margin-top:3px">×${md.mult} botín</div></div>`;
    }
    h += `</div>`;
    h += `<div class="sec">3 · Tu equipo (${A.squad.length}/${m.squad})</div><div class="pickrow">`;
    for (const g of st.gladiators) {
      const rdy = this.game.isReady(g);
      const on = A.squad.includes(g.id);
      h += `<div class="pick ${on ? 'on' : ''} ${rdy ? '' : 'off'}" data-act="pick" data-id="${g.id}"><div class="ava">${CLASSES[g.cls].icon}</div><div><div class="small" style="font-weight:600">${g.name.split(' ')[0]}</div><div class="tiny dim">Nv ${g.level} · ${rdy ? '⚡' + Math.round(powerOf(g)) : '🩹 herido'}</div></div></div>`;
    }
    h += `</div>`;
    if (!ready.length) h += `<div class="empty">Todos tus gladiadores están heridos. Cúralos o espera.</div>`;
    h += `<div class="sec">4 · Rivales</div>`;
    (A.foes || []).forEach((round, ri) => {
      if (A.foes.length > 1) h += `<div class="tiny dim" style="margin-top:6px">Ronda ${ri + 1}</div>`;
      for (const f of round) {
        const c = CLASSES[f.cls];
        h += `<div class="foe"><div class="ava" style="border-color:#c45a48">${f.isBoss ? '🐂' : c.icon}</div><div class="grow"><div class="name" style="font-size:13px">${f.name}</div><div class="tiny dim">${f.isBoss ? 'JEFE · ' : c.name + ' · '}Nv ${f.level} · Poder ${Math.round(powerOf(f) * (f.isBoss ? f.isBoss.hpMul * 0.7 : 1))} · ${f.skills.map(s => SKILLS[s.id].icon).join('')}</div></div></div>`;
      }
    });
    h += `<button class="btn ghost sm" data-act="rerollFoes" style="margin-top:2px">🎲 Otros rivales</button>`;
    h += `<div class="sec">5 · Táctica</div><div class="tactics">`;
    for (const [id, tn] of [['aggressive', ['⚔️', 'Agresiva', '+20% daño, −15% armadura, más rápidos']], ['balanced', ['⚖️', 'Equilibrada', 'Sin modificadores']], ['defensive', ['🛡️', 'Defensiva', '+25% armadura y bloqueo, −12% daño']]]) {
      h += `<div class="mode ${A.tactic === id ? 'on' : ''}" data-act="tactic" data-v="${id}"><span class="mi">${tn[0]}</span><b>${tn[1]}</b><div class="tiny dim">${tn[2]}</div></div>`;
    }
    h += `</div>`;
    // resumen
    const squad = A.squad.map(id => this.gl(id)).filter(Boolean);
    const foesFlat = A.foes ? A.foes.flat() : [];
    if (foesFlat.length) {
      const rw = rewardFor(A.venue, A.mode, foesFlat, true, 0.3, squad);
      h += `<div class="cta"><div class="card" style="margin-top:0"><div data-odds></div><div class="row" style="gap:16px;margin-top:8px;flex-wrap:wrap"><span class="small">🪙 <b class="gold">${fmt(rw.gold * (MODES[A.mode].rounds || 1))}</b></span><span class="small">⭐ <b class="gold">${fmt(rw.fame * (MODES[A.mode].rounds || 1))}</b></span><span class="small">✨ <b class="gold">${fmt(rw.xp * (MODES[A.mode].rounds || 1))}</b> xp</span><span class="small dim">+ botín</span></div></div>`;
    } else h += `<div class="cta">`;
    const can = squad.length === m.squad && squad.every(g => this.game.isReady(g));
    h += `<div class="row" style="margin-top:14px;gap:10px;align-items:center"><button class="btn big red grow ${can ? '' : 'disabled'}" data-act="fight">⚔ ¡A la arena!</button></div></div>`;
    h += `<label class="row small dim" style="margin-top:10px;gap:8px;cursor:pointer"><input type="checkbox" data-act="auto" ${st.settings.auto ? 'checked' : ''}> Combate automático: repetir esta batalla al terminar (mientras el equipo esté en forma)</label>`;
    if (!can) h += `<div class="tiny" style="color:#ff9a8a;margin-top:6px">Elige ${m.squad} gladiador${m.squad > 1 ? 'es' : ''} en forma.</div>`;
    setTimeout(() => this.updateOdds(), 0);
    return h;
  }

  // ── legado ───────────────────────────────────────────────────────────────
  renderLegacy() {
    const st = this.st, s = st.stats;
    let h = '';
    h += `<div class="sec">Misiones · ${st.laurels} 🏅 laureles</div>`;
    for (const q of st.quests) {
      const t = QUEST_TYPES.find(x => x.id === q.type), pr = this.game.questProgress(q), done = pr >= q.target, rw = this.game.questReward(q);
      h += `<div class="card"><div class="row"><div class="ava" style="width:40px;height:40px;font-size:20px">${t.icon}</div><div class="grow"><div class="small" style="font-weight:600">${t.name(fmt(q.target))}</div><div class="bar thin" style="margin:5px 0 3px"><i style="width:${(pr / q.target * 100).toFixed(0)}%"></i></div><div class="tiny dim">${fmt(pr)} / ${fmt(q.target)} · Premio: 🪙 ${fmt(rw.gold)} + ${rw.laurels} 🏅</div></div>
        <button class="btn sm green ${done ? '' : 'disabled'}" data-act="claimQuest" data-id="${q.id}">${done ? 'Reclamar' : '…'}</button></div></div>`;
    }
    h += `<div class="sec">Reliquias del Ludus</div><div class="dim tiny" style="margin-bottom:4px">Mejoras permanentes que se compran con laureles 🏅 (se ganan con misiones y hallazgos).</div>`;
    for (const [id, R] of Object.entries(RELICS)) {
      const lv = st.relics[id], max = lv >= R.max, cost = this.game.relicCost(id);
      h += `<div class="card" style="padding:8px 10px"><div class="row"><div class="ava" style="width:38px;height:38px;font-size:19px">${R.icon}</div><div class="grow"><div class="small" style="font-weight:600">${R.name} <span class="badge-lv" style="min-width:auto;padding:0 7px;height:18px;font-size:10px;border-radius:9px">${lv}</span></div><div class="tiny dim">${R.desc(Math.max(1, lv))}</div></div>
        ${max ? '<span class="tag gold">Máx.</span>' : `<button class="btn sm ${st.laurels >= cost ? '' : 'disabled'}" data-act="relic" data-id="${id}">${cost} 🏅</button>`}</div></div>`;
    }
    h += `<div class="sec">Legado</div>` + `<div class="card"><div class="row"><div class="ava" style="width:56px;height:56px;font-size:30px">🗡️</div><div class="grow"><div class="name" style="font-size:17px">${st.rudis} Rudis</div>
      <div class="small dim">Bonos permanentes: <b class="gold">+${st.rudis * 6}%</b> de ingresos y entrenamiento, <b class="gold">+${st.rudis * 6}%</b> de experiencia.</div></div></div>
      <div class="dim small" style="margin-top:8px;font-family:var(--ff-b);font-style:italic">Manumite a tus gladiadores veteranos (nivel 10+) desde su ficha: recibirán la libertad y la rudis de madera, y tú recibirás bonos eternos.</div></div>`;
    const vets = st.gladiators.filter(g => this.game.canRetire(g));
    if (vets.length) { h += `<div class="sec">Listos para la libertad</div>`; for (const g of vets) h += `<div class="card click" data-act="select" data-goto="ludus" data-id="${g.id}"><div class="row between"><span class="name" style="font-size:14px">${g.name} <span class="dim small">nv ${g.level}</span></span><span class="gold">+${this.game.retireValue(g)} 🗡️</span></div></div>`; }
    h += `<div class="sec">Salón de la Fama</div>`;
    if (!st.hall.length) h += `<div class="empty">Aún nadie ha conquistado su libertad.</div>`;
    for (const x of st.hall.slice().reverse().slice(0, 12)) h += `<div class="stats-line"><span>${CLASSES[x.cls]?.icon || ''} <b>${x.name}</b> <span class="dim">nv ${x.level} · ${x.wins} victorias</span></span><span class="gold">+${x.rudis} 🗡️</span></div>`;
    h += `<div class="sec">Estadísticas</div>
      <div class="stats-line"><span class="dim">Combates</span><b>${s.fights}</b></div><div class="stats-line"><span class="dim">Victorias</span><b>${s.wins}</b></div>
      <div class="stats-line"><span class="dim">Bajas causadas</span><b>${s.kills}</b></div><div class="stats-line"><span class="dim">Oro total ganado</span><b>${fmt(s.gold)}</b></div>
      <div class="stats-line"><span class="dim">Puntos de atributo entrenados</span><b>${fmt(s.trained)}</b></div><div class="stats-line"><span class="dim">Tiempo jugado</span><b>${fmtTime(st.playtime)}</b></div>`;
    h += `<div class="sec">Guardado</div><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="save">💾 Guardar ahora</button><button class="btn sm ghost" data-act="export">Exportar</button><button class="btn sm ghost" data-act="import">Importar</button><button class="btn sm red" data-act="wipe">Borrar todo</button></div>
      <div class="tiny dim" style="margin-top:8px">El juego guarda automáticamente. Los gladiadores siguen entrenando mientras estás fuera (hasta 8 h).</div>`;
    return h;
  }

  openSettings() {
    const s = this.st.settings;
    const html = `<div class="modal"><h1 style="font-size:22px">Ajustes</h1><div class="sub">Personaliza la experiencia</div>
      <div class="stats-line"><span>Calidad gráfica</span><select id="set-q" style="padding:6px;border-radius:8px;background:#1a120b;color:var(--txt);border:1px solid var(--line)"><option value="0" ${s.quality == 0 ? 'selected' : ''}>Baja</option><option value="1" ${s.quality == 1 ? 'selected' : ''}>Media</option><option value="2" ${s.quality == 2 ? 'selected' : ''}>Alta</option></select></div>
      <div class="stats-line"><span>Sangre en combate</span><input type="checkbox" id="set-blood" ${s.blood !== false ? 'checked' : ''}></div>
      <div class="stats-line"><span>Vibración de cámara</span><input type="checkbox" id="set-shake" ${s.shake !== false ? 'checked' : ''}></div>
      <div class="stats-line"><span>Combate automático</span><input type="checkbox" id="set-auto" ${s.auto ? 'checked' : ''}></div>
      <div class="tiny dim" style="margin:12px 0">Motor de render: <b>${this.hooks.backend()}</b> · Three.js ${this.hooks.threeVersion}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-m="settingsOk">Aceptar</button></div></div>`;
    this.showModal(html, true);
  }

  // ── acciones del panel ───────────────────────────────────────────────────
  onPanelClick(e) {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const act = t.dataset.act, id = t.dataset.id, g = this.game, st = this.st;
    const au = this.audio();
    au.init();
    switch (act) {
      case 'select': {
        this.selected = id; au.click(); g.flag('opened');
        this.hooks.selectGladiator?.(id);
        if (t.dataset.goto || this.tab === 'ludus' || !this.tab) { this.openTabForce('ludus'); }
        this._rosterKey = null; this.renderRoster();
        break;
      }
      case 'goto': this.openTabForce(t.dataset.tab); break;
      case 'back': this.selected = null; this.hooks.selectGladiator?.(null); this._rosterKey = null; this.render(); au.click(); break;
      case 'activity': {
        const gl = this.gl(id); if (!gl) break;
        gl.activity = t.dataset.v; gl.resting = false; au.click(); g.flag('trainSet'); this.render(); this._rosterKey = null; break;
      }
      case 'heal': { const gl = this.gl(id); if (gl && g.heal(gl)) { au.coin(); this.toast('🩹', `${gl.name} ha sido curado.`, 'good'); } else au.deny(); this.render(); break; }
      case 'slot': this.openEquipModal(id, t.dataset.slot); au.click(); break;
      case 'retire': {
        const gl = this.gl(id); if (!gl) break;
        this.confirm(`¿Conceder la libertad a <b>${gl.name}</b>?`, `Recibirás <b class="gold">+${g.retireValue(gl)} 🗡️ Rudis</b> permanentes. Su equipo volverá al inventario.`, () => {
          const r = g.retire(gl); this.selected = null; this.hooks.selectGladiator?.(null); this.hooks.onRosterChange?.(); au.levelUp();
          this.toast('🗡️', `${gl.name} es libre. +${r} Rudis.`, 'gold'); this.render(); this._rosterKey = null;
        });
        break;
      }
      case 'dismiss': {
        const gl = this.gl(id); if (!gl) break;
        this.confirm(`¿Despedir a <b>${gl.name}</b>?`, 'Esta acción no se puede deshacer.', () => { g.dismiss(gl); this.selected = null; this.hooks.selectGladiator?.(null); this.hooks.onRosterChange?.(); this.render(); this._rosterKey = null; });
        break;
      }
      case 'recruit': {
        const r = g.recruit(id);
        if (r.ok) { au.buy(); this.toast('🏺', `${r.g.name} se une al ludus.`, 'good'); this.hooks.onRosterChange?.(); this.selected = r.g.id; }
        else { au.deny(); this.toast('⚠️', r.why, 'bad'); }
        this.render(); this._rosterKey = null; break;
      }
      case 'mkrefresh': if (g.refreshMarket(false, this.refreshCost())) { au.buy(); } else au.deny(); this.render(); break;
      case 'item': this.openItemModal(id); au.click(); break;
      case 'sellJunk1': { const r = g.sellJunk(1); if (r.n) { au.coin(); this.toast('🪙', `Vendidos ${r.n} objetos por ${fmt(r.total)}.`, 'gold'); } this.render(); break; }
      case 'build': if (g.buyBuilding(id)) { au.buy(); this.toast(BUILDINGS[id].icon, `${BUILDINGS[id].name} mejorado al nivel ${st.b[id]}.`, 'gold'); this.hooks.onBuild?.(id); } else au.deny(); this.render(); break;
      case 'venue': { const i = +t.dataset.v; if (venueUnlocked(st, i)) { this.arena.venue = i; this.arena.foes = null; au.click(); this.render(); } else au.deny(); break; }
      case 'mode': { const md = t.dataset.v; if (this.arena.venue >= MODES[md].unlockVenue) { this.arena.mode = md; this.arena.foes = null; au.click(); this.render(); } else au.deny(); break; }
      case 'pick': {
        const gl = this.gl(id); if (!gl || !g.isReady(gl)) { au.deny(); break; }
        const A = this.arena, m = MODES[A.mode];
        if (A.squad.includes(id)) A.squad = A.squad.filter(x => x !== id);
        else { A.squad.push(id); if (A.squad.length > m.squad) A.squad.shift(); }
        A.foes = null; au.click(); this.render(); break;
      }
      case 'tactic': this.arena.tactic = t.dataset.v; st.settings.tactic = t.dataset.v; this.arena.odds = null; this.scheduleOdds(); au.click(); this.render(); break;
      case 'rerollFoes': this.arena.foes = null; this.arena.key = ''; au.click(); this.render(); break;
      case 'auto': st.settings.auto = t.checked; break;
      case 'fight': {
        const A = this.arena, m = MODES[A.mode];
        const squad = A.squad.map(i => this.gl(i)).filter(Boolean);
        if (squad.length !== m.squad || !squad.every(x => g.isReady(x))) { au.deny(); break; }
        st.lastSetup = { venue: A.venue, mode: A.mode, squad: [...A.squad], tactic: A.tactic };
        this.closePanel();
        this.hooks.startFight({ venueIdx: A.venue, modeId: A.mode, squad, foes: A.foes, boss: A.boss, tactic: A.tactic });
        break;
      }
      case 'claimQuest': { const r = g.claimQuest(id); if (r) { au.levelUp(); this.toast('🏅', `Misión cumplida: +${fmt(r.gold)} 🪙 y +${r.laurels} 🏅`, 'gold'); } else au.deny(); this.render(); break; }
      case 'relic': if (g.buyRelic(id)) { au.buy(); this.toast(RELICS[id].icon, `${RELICS[id].name} mejorada.`, 'gold'); } else au.deny(); this.render(); break;
      case 'save': g.save(); this.toast('💾', 'Partida guardada.', 'good'); au.click(); break;
      case 'export': { const txt = g.exportSave(); this.showModal(`<div class="modal"><h1 style="font-size:20px">Exportar partida</h1><div class="sub">Copia este texto para respaldar tu progreso</div><textarea readonly style="width:100%;height:160px;background:#140d08;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px">${txt}</textarea><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" data-m="close">Cerrar</button></div></div>`, true); break; }
      case 'import': this.showModal(`<div class="modal"><h1 style="font-size:20px">Importar partida</h1><div class="sub">Pega aquí tu código de guardado</div><textarea id="imp-txt" style="width:100%;height:140px;background:#140d08;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px"></textarea><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn ghost" data-m="close">Cancelar</button><button class="btn" data-m="doImport">Importar</button></div></div>`, true); break;
      case 'wipe': this.confirm('¿Borrar toda la partida?', 'Perderás gladiadores, equipo y progreso. Esta acción es irreversible.', () => { g.wipe(); this.hooks.reload(); }); break;
    }
  }
  openTabForce(tab) { if (this.tab !== tab || this.panel.classList.contains('closed')) { this.tab = null; this.openTab(tab); } else this.render(); }

  onModalClick(e) {
    const t = e.target.closest('[data-m]');
    const g = this.game, au = this.audio();
    if (!t) { if (e.target.classList.contains('modal-bg') && !this.modalLock) this.closeModal(); return; }
    const m = t.dataset.m, id = t.dataset.id;
    switch (m) {
      case 'close': this.closeModal(); break;
      case 'ok': this.closeModal(); break;
      case 'equip': {
        const gid = document.getElementById('eq-target').value; const gl = this.gl(gid);
        const r = g.equip(gl, id);
        if (r && r.ok === false) { this.toast('⚠️', r.why, 'bad'); au.deny(); } else { au.equip(); g.flag('equipped'); this.hooks.rebuildAvatar?.(gid); }
        this.closeModal(); this.render(); break;
      }
      case 'equipTo': { const gl = this.gl(t.dataset.gid); const r = g.equip(gl, id); if (r && r.ok === false) { this.toast('⚠️', r.why, 'bad'); au.deny(); } else { au.equip(); g.flag('equipped'); this.hooks.rebuildAvatar?.(gl.id); } this.closeModal(); this.render(); break; }
      case 'unequip': { const gl = this.gl(id); g.unequip(gl, t.dataset.slot); au.equip(); this.hooks.rebuildAvatar?.(gl.id); this.closeModal(); this.render(); break; }
      case 'forge': { const it = this.findItem(id); if (it && g.upgradeItem(it)) { au.buy(); this.hooks.rebuildAll?.(); this.openItemModal(id); this.render(); } else au.deny(); break; }
      case 'sell': { const v = g.sell(id); if (v) { au.coin(); this.toast('🪙', `Vendido por ${fmt(v)}.`, 'gold'); } this.closeModal(); this.render(); break; }
      case 'event': {
        const c = this._ev?.choices[+t.dataset.i]; if (!c) break;
        if (c.cost && !g.spend(c.cost)) { au.deny(); this.toast('⚠️', 'No tienes suficientes denarios.', 'bad'); break; }
        const r = c.run(); this.closeModal(); au.buy();
        this.toast(this._ev.ev.icon, r.msg, 'gold'); if (r.recruited) this.hooks.onRosterChange?.();
        this._rosterKey = null; this.render(); break;
      }
      case 'yes': { const fn = this._confirm; this.closeModal(); fn && fn(); break; }
      case 'settingsOk': {
        const s = this.st.settings;
        s.quality = +document.getElementById('set-q').value; s.blood = document.getElementById('set-blood').checked; s.shake = document.getElementById('set-shake').checked; s.auto = document.getElementById('set-auto').checked;
        this.hooks.applySettings(); this.closeModal(); break;
      }
      case 'doImport': { try { g.importSave(document.getElementById('imp-txt').value); this.hooks.reload(); } catch (err) { this.toast('⚠️', 'Código inválido.', 'bad'); } break; }
      case 'resClose': this.closeModal(); this.hooks.resultClosed?.(t.dataset.v); break;
    }
  }

  // ── modales ──────────────────────────────────────────────────────────────
  showModal(html, priority = false, lock = false) {
    if (this.modalOpen && !priority) { this.modalQueue.push({ html, lock }); return; }
    this.modalOpen = true; this.modalLock = lock;
    this.modalRoot.innerHTML = `<div class="modal-bg">${html}</div>`;
    this.modalRoot.style.pointerEvents = 'auto';
  }
  closeModal() {
    this.modalRoot.innerHTML = ''; this.modalOpen = false; this.modalRoot.style.pointerEvents = 'none';
    const n = this.modalQueue.shift();
    if (n) setTimeout(() => this.showModal(n.html, true, n.lock), 250);
  }
  confirm(title, text, fn) {
    this._confirm = fn;
    this.showModal(`<div class="modal"><h1 style="font-size:20px">${title}</h1><div class="sub" style="font-style:normal">${text}</div><div class="row" style="justify-content:center;gap:10px;margin-top:12px"><button class="btn ghost" data-m="close">Cancelar</button><button class="btn red" data-m="yes">Confirmar</button></div></div>`, true);
  }

  toast(icon, text, kind = '') {
    const box = $('#toasts');
    if (box.children.length > 4) box.firstChild.remove();
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = `<span class="ti">${icon}</span><span>${text}</span>`;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4000);
  }
  hint(text, ms = 5000) {
    const h = $('#hint'); h.textContent = text; h.classList.add('on'); clearTimeout(this._hintT); this._hintT = setTimeout(() => h.classList.remove('on'), ms);
  }

  showEvent() {
    const ev = pickEvent(); const g = this.game;
    this._ev = { ev, choices: ev.choices(g) };
    const btns = this._ev.choices.map((c, i) => `<button class="btn ${c.cost ? '' : 'ghost'}" data-m="event" data-i="${i}" ${c.cost ? `data-cost="${c.cost}"` : ''}>${c.label}${c.cost ? ` <span class="cost">🪙 ${fmt(c.cost)}</span>` : ''}</button>`).join('');
    this.showModal(`<div class="modal" style="text-align:center"><div style="font-size:48px">${ev.icon}</div><h1 style="font-size:22px">${ev.title}</h1><div class="sub" style="font-style:normal">${ev.text(g)}</div><div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">${btns}</div></div>`, false, true);
    this.audio().horn?.();
  }

  renderObjective() {
    const T = this.st.tutorial, o = OBJECTIVES[T.step], el = $('#objective');
    document.querySelectorAll('.nav-b.hl,.rc.hl').forEach(x => x.classList.remove('hl'));
    if (!o || document.body.classList.contains('in-fight')) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('#ob-n').textContent = `${T.step + 1}/${OBJECTIVES.length}`;
    if ($('#ob-t').textContent !== o.text) $('#ob-t').textContent = o.text;
    const pr = o.progress ? o.progress(this.game) : null;
    $('#ob-bar').style.display = pr ? '' : 'none';
    if (pr) $('#ob-bar i').style.width = Math.min(100, pr[0] / pr[1] * 100).toFixed(0) + '%';
    const rw = [o.reward.gold ? `🪙 ${o.reward.gold}` : '', o.reward.laurels ? `🏅 ${o.reward.laurels}` : ''].filter(Boolean).join(' + ');
    $('#ob-r').textContent = `Premio: ${rw}${pr ? ` · ${fmt(pr[0])}/${fmt(pr[1])}` : ''} · toca aquí para ir`;
    if (o.roster) document.querySelectorAll('.rc:not(.add)').forEach(x => x.classList.add('hl'));
    else if (o.tab && this.tab !== o.tab) document.querySelector(`.nav-b[data-tab="${o.tab}"]`)?.classList.add('hl');
  }
  onObjective(o) {
    const rw = [o.reward.gold ? `+${o.reward.gold} 🪙` : '', o.reward.laurels ? `+${o.reward.laurels} 🏅` : ''].filter(Boolean).join(' ');
    this.toast('📜', `<b>¡Objetivo cumplido!</b> ${rw}`, 'gold');
    this.audio().buy();
    const el = $('#objective'); el.classList.remove('done'); void el.offsetWidth; el.classList.add('done');
    this.renderObjective();
  }
  showHelp(first) {
    const card = (i, t, p) => `<div class="card"><div class="hi">${i}</div><b>${t}</b><p>${p}</p></div>`;
    this.showModal(`<div class="modal" style="width:min(640px,100%)"><h1 style="font-size:24px">${first ? 'Bienvenido, lanista' : 'Cómo se juega'}</h1>
      <div class="sub">Diriges una escuela de gladiadores en Roma. Entrénalos, equípalos y llévalos a la gloria.</div>
      <div class="help-grid">
        ${card('🏛️', 'Entrenan solos', 'En la ficha de cada gladiador eliges qué atributo entrena. Progresan aunque cierres el juego. Si se agotan, descansan solos.')}
        ${card('⚔️', 'Tú preparas, ellos luchan', 'En la Arena eliges sede, modalidad, equipo y táctica. El combate es automático. Fíjate en la probabilidad de victoria.')}
        ${card('✨', 'Habilidades al azar', 'Al subir de nivel pueden aprender una habilidad aleatoria o mejorar una que ya tienen.')}
        ${card('🛡️', 'Botín y equipo', 'Ganar da objetos. Equípalos desde la ficha o la Armería y fórjalos para hacerlos más fuertes.')}
        ${card('⭐', 'Fama y sedes', 'Cada victoria da fama. Con más fama se abren arenas mejores y ganas más oro pasivo.')}
        ${card('🏗️', 'Haz crecer el ludus', 'Gasta denarios en Mejoras y reclutas. Las misiones dan laureles para reliquias permanentes.')}
      </div>
      <div class="dim small" style="text-align:center;margin-bottom:12px">Sigue el <b class="gold">📜 Objetivo</b> (arriba a la izquierda): te guía paso a paso y da premios.</div>
      <div class="row" style="justify-content:center"><button class="btn big" data-m="ok">${first ? '¡A por la gloria!' : 'Entendido'}</button></div></div>`, true);
  }

  // ── eventos de progreso ──────────────────────────────────────────────────
  onLevel(ev) {
    const g = ev.g;
    this.audio().levelUp();
    if (ev.skill) {
      const d = SKILLS[ev.skill.id], R = SKILL_RARITY[d.rarity];
      this.audio().skillLearn(['common', 'rare', 'epic', 'legendary'].indexOf(d.rarity));
      if (d.rarity === 'epic' || d.rarity === 'legendary') {
        this.showModal(`<div class="modal" style="text-align:center"><div style="font-family:var(--ff-h);letter-spacing:.2em;color:${R.color};font-size:12px">${R.name.toUpperCase()}</div><h1 style="margin-top:4px">${ev.skill.isNew ? '¡Nueva habilidad!' : '¡Habilidad mejorada!'}</h1><div class="sub">${g.name} alcanza el nivel ${ev.level}</div>
          <div class="skillpop" style="--rc:${R.color};text-align:left"><div class="skill ${d.kind}" style="--rc:${R.color}">${d.icon}<span class="rk">${ev.skill.rank}</span></div><div><div class="name" style="color:${R.color}">${d.name}</div><div class="small">${d.desc(ev.skill.rank)}</div></div></div>
          <button class="btn" data-m="ok" style="margin-top:12px">¡Excelente!</button></div>`, false);
      } else this.toast(d.icon, `<b>${g.name}</b> ${ev.skill.isNew ? 'aprende' : 'mejora'} <b style="color:${R.color}">${d.name}</b> (rango ${ev.skill.rank})`, 'gold');
      this.hooks.onSkill?.(ev);
    } else this.toast('⬆️', `<b>${g.name}</b> sube al nivel ${ev.level}.`, 'good');
    this.hooks.levelFx?.(g);
  }

  showResult(sum) {
    const A = sum;
    const rows = A.levelEvents.map(ev => {
      let s = `<div class="lvrow"><span class="badge-lv">${ev.level}</span><div class="grow"><b>${ev.g.name}</b> sube de nivel <span class="dim small">${Object.entries(ev.gains).map(([k, v]) => `${STAT_INFO[k].icon}+${v}`).join(' ')}</span></div></div>`;
      if (ev.skill) { const d = SKILLS[ev.skill.id], R = SKILL_RARITY[d.rarity]; s += `<div class="skillpop" style="--rc:${R.color}"><div class="skill ${d.kind}" style="--rc:${R.color}">${d.icon}<span class="rk">${ev.skill.rank}</span></div><div><div class="tiny" style="color:${R.color};letter-spacing:.1em;text-transform:uppercase">${ev.skill.isNew ? 'Nueva habilidad' : 'Rango mejorado'} · ${R.name}</div><div class="name" style="font-size:14px">${d.name}</div><div class="tiny dim">${d.desc(ev.skill.rank)}</div></div></div>`; }
      return s;
    }).join('');
    const loot = A.loot.map(it => `<div class="item" style="--rc:${RARITY[it.rarity].color};--g:${RARITY[it.rarity].glow};width:60px" data-tipk="item:${it.id}">${itemIcon(it)}<span class="lv">${it.ilvl}</span></div>`).join('');
    const mvp = A.mvp ? `<div class="stats-line"><span class="dim">Mejor luchador</span><b>${A.mvp.name} · ${fmt(A.mvp.dealt)} de daño</b></div>` : '';
    const html = `<div class="modal"><h1 class="${A.won ? '' : 'lose'}">${A.won ? 'VICTORIA' : 'DERROTA'}</h1><div class="sub">${A.venue.name} · ${A.modeName}${A.won ? '' : ' — tus gladiadores necesitan reposo'}</div>
      <div class="rew"><div><b>🪙 ${fmt(A.gold)}</b><span>Denarios</span></div><div><b>⭐ ${fmt(A.fame)}</b><span>Fama</span></div><div><b>✨ ${fmt(A.xp)}</b><span>Exp. c/u</span></div></div>
      ${A.hypeBonus > 0 ? `<div class="tiny" style="text-align:center;color:var(--gold3)">Favor de la multitud: +${Math.round(A.hypeBonus * 100)}% de oro</div>` : ''}
      ${mvp}${A.wounded.length ? `<div class="tiny" style="color:#ff9a8a;margin:6px 0">🩹 Heridos: ${A.wounded.map(g => g.name.split(' ')[0]).join(', ')}</div>` : ''}
      ${loot ? `<div class="sec">Botín</div><div class="pickrow">${loot}</div>` : ''}${rows ? `<div class="sec">Progreso</div>${rows}` : ''}
      <div class="row" style="justify-content:center;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn ghost" data-m="resClose" data-v="menu">Volver al ludus</button><button class="btn big" data-m="resClose" data-v="again">${A.won ? 'Otra vez' : 'Reintentar'} ⚔</button></div></div>`;
    this.showModal(html, true, true);
  }

  // ── actualización en vivo ────────────────────────────────────────────────
  live() {
    const st = this.st, g = this.game;
    const set = (sel, txt) => { const e = $(sel); if (e && e.textContent !== txt) e.textContent = txt; };
    set('#r-gold', fmt(st.gold)); set('#r-income', '+' + fmt(g.incomeRate) + '/s'); set('#r-fame', fmt(st.fame)); set('#r-rudis', String(st.rudis)); set('#r-laurel', String(st.laurels));
    // elementos enlazados
    this.body.querySelectorAll('[data-live]').forEach(e => this.bindLive(e, false));
    $('#roster').querySelectorAll('[data-live]').forEach(e => this.bindLive(e, false));
    this.body.querySelectorAll('[data-live-txt]').forEach(e => this.bindLive(e, true));
    // asequibilidad
    document.querySelectorAll('[data-cost]').forEach(e => e.classList.toggle('disabled', st.gold < +e.dataset.cost));
    // aviso en el botón de Misiones cuando hay algo que reclamar
    const claim = st.quests.some(q => g.questProgress(q) >= q.target);
    document.querySelector('.nav-b[data-tab="legacy"]')?.classList.toggle('badge', claim);
  }
  bindLive(e, text) {
    const k = (text ? e.dataset.liveTxt : e.dataset.live).split(':');
    const st = this.st;
    const gl = k[1] ? this.gl(k[1]) : null;
    let v = null, w = null;
    switch (k[0]) {
      case 'xp': if (gl) { const n = xpNeed(gl.level); v = `${fmt(gl.xp)} / ${fmt(n)}`; w = gl.xp / n; } break;
      case 'fat': if (gl) { v = Math.round(gl.fatigue) + '%'; w = gl.fatigue / 100; } break;
      case 'wound': if (gl) v = fmtTime(gl.wounded / (1 + st.b.infirmary * 0.15)); break;
      case 'prog': if (gl) w = gl.activity === k[2] ? gl.prog[k[2]] : 0; break;
      case 'stat': if (gl) v = String(gl.stats[k[2]]); break;
      case 'act': if (gl) v = gl.wounded > 0 ? `🩹 Herido (${fmtTime(gl.wounded / (1 + st.b.infirmary * 0.15))})` : gl.resting ? '💤 Agotado: descansando…' : ACT_NAMES[gl.activity]; break;
      case 'mk': v = fmtTime(st.marketT); break;
    }
    if (text && v != null && e.textContent !== v) e.textContent = v;
    if (!text && w != null) e.style.width = (clamp(w, 0, 1) * 100).toFixed(1) + '%';
  }

  tick() { this.live(); this.renderRoster(); this.renderObjective(); }
}
