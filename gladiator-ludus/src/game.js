// ────────────────────────────────────────────────────────────────────────────
//  Lógica de juego (sin dependencias de render): gladiadores, equipo,
//  economía incremental, entrenamiento, progreso, guardado.
// ────────────────────────────────────────────────────────────────────────────
import {
  STATS, CLASSES, BASES, QUEST_TYPES, RELICS, RARITY, AFFIXES, SKILLS, SKILL_RARITY, BUILDINGS, VENUES, MODES, BOSSES, SLOT_ORDER,
  LEGENDARY_NAMES, NAMES_M, NAMES_F, NICKS, SKIN_TONES, HAIR_COLORS, TUNIC_COLORS, MAX_SKILL_RANK,
} from './data.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function weighted(items, wf) {
  let total = 0;
  for (const it of items) total += wf(it);
  let r = Math.random() * total;
  for (const it of items) { r -= wf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

let _uid = 1;
export const uid = () => (Date.now().toString(36) + (_uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36));

// ── formato numérico ────────────────────────────────────────────────────────
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
export function fmt(n) {
  if (!isFinite(n)) return '∞';
  const neg = n < 0; n = Math.abs(n);
  if (n < 1000) return (neg ? '-' : '') + (n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n));
  let i = 0;
  while (n >= 1000 && i < SUF.length - 1) { n /= 1000; i++; }
  return (neg ? '-' : '') + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + SUF[i];
}
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  return Math.floor(s / 3600) + 'h ' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm';
}

// ── equipo ──────────────────────────────────────────────────────────────────
export function itemPlusMul(it) { return 1 + (it.plus || 0) * 0.09; }
export function weaponDmg(it) {
  const b = BASES.weapon[it.base];
  const m = (1 + it.ilvl * 0.11) * RARITY[it.rarity].mult * itemPlusMul(it);
  return [b.dmg[0] * m, b.dmg[1] * m];
}
export function itemArmor(it) {
  const b = BASES[it.slot][it.base];
  if (!b || !b.armor) return 0;
  return b.armor * (1 + it.ilvl * 0.22) * RARITY[it.rarity].mult * itemPlusMul(it);
}

export function genItem(slot, ilvl, quality = 0, forceRarity = null, baseId = null) {
  ilvl = Math.max(1, Math.round(ilvl));
  // tirada de rareza (quality desplaza hacia rarezas mayores)
  let rar;
  if (forceRarity != null) rar = forceRarity;
  else {
    const w = [60, 26, 10 + quality * 0.3, 3.2 + quality * 0.2, 0.6 + quality * 0.06];
    let t = 0; for (const x of w) t += x;
    let r = Math.random() * t; rar = 0;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { rar = i; break; } }
  }
  const pool = Object.keys(BASES[slot]);
  const base = baseId || pick(pool);
  const affixes = [];
  const used = new Set();
  const nAff = RARITY[rar].affixes;
  for (let i = 0; i < nAff; i++) {
    let a; let guard = 0;
    do { a = pick(AFFIXES); guard++; } while (used.has(a.key) && guard < 20);
    used.add(a.key);
    let val;
    if (a.kind === 'stat') val = Math.max(1, Math.round((1.4 + ilvl * 0.5) * rand(0.8, 1.25) * (0.75 + rar * 0.12)));
    else val = +(a.per * rand(1.0, 2.2) * (1 + rar * 0.22) * (0.9 + Math.min(ilvl, 60) / 120)).toFixed(3);
    affixes.push({ key: a.key, val });
  }
  let name = BASES[slot][base].name;
  if (affixes.length) {
    const first = AFFIXES.find(x => x.key === affixes[0].key);
    name += ' ' + (rar === 4 ? pick(LEGENDARY_NAMES) : first.name);
  } else if (rar === 4) name += ' ' + pick(LEGENDARY_NAMES);
  return { id: uid(), slot, base, name, rarity: rar, ilvl, plus: 0, affixes };
}

export function itemValue(it) {
  return Math.round(6 * Math.pow(it.ilvl, 1.3) * Math.pow(RARITY[it.rarity].mult, 2) * (1 + (it.plus || 0) * 0.35) + 5);
}
export function forgeCost(it, forgeLv) {
  return Math.round((25 + it.ilvl * 9) * Math.pow(1.55, it.plus || 0) * (1 - Math.min(0.75, forgeLv * 0.03)) * (1 + it.rarity * 0.35));
}
export const MAX_PLUS = 10;

// ── creación de gladiadores ─────────────────────────────────────────────────
export function genLook(female, str = 6) {
  return {
    female,
    skin: pick(SKIN_TONES),
    hair: Math.floor(Math.random() * (female ? 5 : 5)), // 0 calvo, 1 corto, 2 largo, 3 cresta, 4 moño/trenza
    hairColor: pick(HAIR_COLORS),
    beard: female ? 0 : (Math.random() < 0.55 ? randi(1, 3) : 0),
    height: rand(0.94, 1.06) * (female ? 0.95 : 1),
    build: clamp(rand(0.92, 1.08) + (str - 6) * 0.004, 0.88, 1.18),
    tunic: pick(TUNIC_COLORS),
    scar: Math.random() < 0.3,
  };
}

export function genName(female) {
  const n = pick(female ? NAMES_F : NAMES_M);
  return Math.random() < 0.8 ? `${n} ${pick(NICKS)}` : n;
}

function addKit(g, ilvl, quality = 0, rarityBias = null) {
  const c = CLASSES[g.cls];
  for (const slot of SLOT_ORDER) {
    const base = c.kit[slot];
    if (!base) continue;
    g.equip[slot] = genItem(slot, ilvl, quality, rarityBias, base);
  }
}

export function genGladiator({ cls = null, level = 1, female = null, kit = true, talentBias = 0, quality = 0, kitRarity = 0 } = {}) {
  cls = cls || pick(Object.keys(CLASSES));
  const c = CLASSES[cls];
  female = female == null ? Math.random() < 0.3 : female;
  const stats = {};
  for (const s of STATS) stats[s] = Math.max(1, Math.round(c.base[s] + rand(-1.4, 1.6) + (level - 1) * c.growth[s] * rand(0.92, 1.12)));
  const talent = Math.random() < 0.6 + talentBias ? pick(STATS) : null;
  if (talent) stats[talent] += 1 + Math.floor(level / 6);
  const g = {
    id: uid(), name: genName(female), cls, level, xp: 0, stats,
    prog: { str: 0, agi: 0, vit: 0, tec: 0, wil: 0 }, grow: { str: 0, agi: 0, vit: 0, tec: 0, wil: 0 },
    talent, skills: [], equip: { weapon: null, offhand: null, helm: null, armor: null, greaves: null, charm: null },
    activity: 'rest', fatigue: 0, wounded: 0,
    wins: 0, losses: 0, kills: 0, streak: 0, look: genLook(female, stats.str), born: Date.now(),
  };
  if (kit) addKit(g, Math.max(1, level), quality, kitRarity || null);
  return g;
}

export function recruitCost(g, bld) {
  const c = CLASSES[g.cls];
  const power = Object.values(g.stats).reduce((a, b) => a + b, 0);
  return Math.round((50 + power * 6 * Math.pow(1.11, g.level)) * c.hire * (g.talent ? 1.15 : 1));
}

// ── estadísticas de combate ─────────────────────────────────────────────────
export function totalStats(g) {
  const s = { ...g.stats };
  for (const slot of SLOT_ORDER) {
    const it = g.equip[slot];
    if (!it) continue;
    for (const a of it.affixes) if (STATS.includes(a.key)) s[a.key] += Math.round(a.val * itemPlusMul(it));
  }
  return s;
}
function affixSum(g, key) {
  let v = 0;
  for (const slot of SLOT_ORDER) { const it = g.equip[slot]; if (!it) continue; for (const a of it.affixes) if (a.key === key) v += a.val * itemPlusMul(it); }
  const cap = AFFIXES.find(a => a.key === key)?.cap ?? 9;
  return Math.min(cap, v);
}
export function skillRank(g, id) { return g.skills.find(s => s.id === id)?.rank || 0; }

// Conjunto de clase: piezas equipadas que coinciden con el equipo clásico de su clase
export function setCount(g) {
  const kit = CLASSES[g.cls]?.kit; if (!kit) return 0;
  let n = 0;
  for (const slot of SLOT_ORDER) if (kit[slot] && g.equip[slot]?.base === kit[slot]) n++;
  return n;
}
export const RELIC_MOD = { hp: 0, crit: 0 };
export function combatStats(g) {
  const s = totalStats(g);
  const wi = g.equip.weapon;
  const wb = wi ? BASES.weapon[wi.base] : { name: 'Puños', dmg: [3, 5], interval: 0.9, reach: 1.4, style: 'slash', wind: 0.22, hands: 1 };
  const [wmin, wmax] = wi ? weaponDmg(wi) : [3, 5];
  const off = g.equip.offhand && wb.hands === 1 ? BASES.offhand[g.equip.offhand.base] : null;
  const offItem = off ? g.equip.offhand : null;

  const rk = id => skillRank(g, id);
  let armor = 0;
  for (const slot of SLOT_ORDER) { const it = g.equip[slot]; if (it) armor += itemArmor(it); }
  if (!off && g.equip.offhand && wb.hands === 2) armor -= itemArmor(g.equip.offhand);
  armor += g.level * 1.2;
  armor *= 1 + rk('thick') * 0.12;

  const setN = setCount(g);
  const setB = setN >= 6 ? 0.15 : setN >= 4 ? 0.06 : 0;
  const rm = g.isEnemy ? { hp: 0, crit: 0 } : RELIC_MOD;
  const hp = (100 + s.vit * 14 + g.level * 9) * 1.25 * (1 + affixSum(g, 'hpPct') + rk('will') * 0.07 + rm.hp + setB);
  const dmgMul = 1 + affixSum(g, 'dmgPct') + rk('iron') * 0.06 + setB;
  const cs = {
    level: g.level, stats: s,
    hp, armor,
    dmgMin: (wmin + s.str * 0.85) * dmgMul, dmgMax: (wmax + s.str * 0.85) * dmgMul,
    interval: Math.max(0.26, wb.interval * 0.8 / (1 + s.agi * 0.006)),
    reach: wb.reach, style: wb.style, wind: wb.wind, weapon: wi ? wi.base : null, dual: !!wb.dual,
    crit: Math.min(0.65, 0.04 + s.tec * 0.0025 + affixSum(g, 'crit') + rk('eye') * 0.04 + (wb.crit || 0) + rm.crit),
    critMult: 1.6 + rk('eye') * 0.08 + s.tec * 0.002,
    dodge: Math.min(0.4, 0.02 + s.agi * 0.0018 + affixSum(g, 'dodge') + rk('fleet') * 0.02 + (off?.dodge || 0)),
    block: off ? Math.min(0.55, (off.block * (1 + s.tec * 0.004)) + rk('parry') * 0.04) : 0,
    blockAbsorb: 0.55 + rk('parry') * 0.05,
    hasShield: !!off && g.equip.offhand?.base !== 'rete',
    moveSpeed: (4.3 + s.agi * 0.01) * (1 + rk('fleet') * 0.06),
    lifesteal: Math.min(0.4, affixSum(g, 'lifesteal') + rk('vamp') * 0.03),
    thorns: affixSum(g, 'thorns') + rk('thorns') * 0.08,
    skillPower: 1 + s.wil * 0.006,
    cdr: Math.min(0.45, s.wil * 0.003),
    execBonus: rk('exec') * 0.14,
    berserk: rk('berserk') * 0.12,
    riposte: rk('riposte') * 0.08,
    wind: rk('wind'), phoenix: rk('phoenix'), fav: rk('fav'),
    goldPct: affixSum(g, 'goldPct') + rk('fav') * 0.08,
    skills: g.skills.filter(k => SKILLS[k.id].kind === 'active').map(k => ({ id: k.id, rank: k.rank })),
    offhandBase: off ? g.equip.offhand.base : null,
  };
  return cs;
}

export function powerOf(g) {
  const cs = combatStats(g);
  const avg = (cs.dmgMin + cs.dmgMax) / 2;
  const dps = avg * (1 + cs.crit * (cs.critMult - 1)) / cs.interval;
  const red = cs.armor / (cs.armor + 45 + g.level * 10);
  const ehp = cs.hp / ((1 - red) * (1 - cs.dodge) * (1 - cs.block * 0.5));
  let p = Math.sqrt(dps * ehp) * 1.4;
  p *= 1 + cs.skills.length * 0.07 + (cs.lifesteal > 0 ? 0.05 : 0);
  return p;
}

// ── progreso: niveles y habilidades ─────────────────────────────────────────
export const xpNeed = lv => Math.round(45 * Math.pow(lv, 1.35));
export const skillSlots = g => 4 + (g.level >= 10 ? 1 : 0) + (g.level >= 20 ? 1 : 0) + (g.level >= 35 ? 1 : 0);

export function rollSkill(g, shrineLv = 0) {
  const known = new Map(g.skills.map(s => [s.id, s.rank]));
  const full = g.skills.length >= skillSlots(g);
  const all = Object.entries(SKILLS)
    .filter(([id, sk]) => (full ? known.has(id) : true) && !(known.get(id) >= MAX_SKILL_RANK))
    .filter(([id, sk]) => sk.rarity !== 'legendary' || g.level >= 8);
  if (!all.length) return null;
  const [id, sk] = weighted(all, ([id, sk]) => {
    let w = SKILL_RARITY[sk.rarity].weight;
    if (sk.rarity !== 'common') w *= 1 + shrineLv * 0.06;
    if (known.has(id)) w *= 0.55; // preferimos novedades
    return w;
  });
  return id;
}

export function grantXp(g, amount, game) {
  const events = [];
  g.xp += amount * (1 + (game?.state.relics?.xp || 0) * 0.08);
  while (g.xp >= xpNeed(g.level)) {
    g.xp -= xpNeed(g.level);
    g.level++;
    const c = CLASSES[g.cls];
    const gains = {};
    for (const s of STATS) {
      g.grow[s] += c.growth[s] * rand(0.85, 1.2);
      const inc = Math.floor(g.grow[s]);
      if (inc > 0) { g.grow[s] -= inc; g.stats[s] += inc; gains[s] = inc; }
    }
    const ev = { type: 'level', g, level: g.level, gains, skill: null };
    const chance = clamp(0.4 + g.stats.wil * 0.002 + (game?.state.b.shrine || 0) * 0.02, 0, 0.88);
    if (Math.random() < chance) {
      const id = rollSkill(g, game?.state.b.shrine || 0);
      if (id) {
        const cur = g.skills.find(s => s.id === id);
        if (cur) { cur.rank++; ev.skill = { id, rank: cur.rank, isNew: false }; }
        else { g.skills.push({ id, rank: 1 }); ev.skill = { id, rank: 1, isNew: true }; }
        if (game) game.state.stats.skills = (game.state.stats.skills || 0) + 1;
      }
    }
    events.push(ev);
  }
  return events;
}

// ── mundo / estado ──────────────────────────────────────────────────────────
const SAVE_KEY = 'ludus-aeterna-v1';

export class Game {
  constructor() {
    this.listeners = {};
    this.state = null;
    this.saveTimer = 0;
    this.incomeRate = 0;
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach(f => f(data)); }

  newState() {
    const g1 = genGladiator({ cls: 'murmillo', level: 1, female: false, talentBias: 1 });
    const g2 = genGladiator({ cls: 'thraex', level: 1, female: true, talentBias: 1 });
    g1.name = 'Marcus el Toro'; g2.name = 'Livia Víbora';
    g1.activity = 'str'; g2.activity = 'agi';
    const s = {
      v: 1, gold: 160, fame: 0, rudis: 0, gladiators: [g1, g2], inventory: [],
      b: { yard: 0, barracks: 0, infirmary: 0, forge: 0, market: 0, shrine: 0, stands: 0 },
      market: [], marketT: 0, hall: [],
      stats: { fights: 0, wins: 0, gold: 0, kills: 0, bestVenue: 0, trained: 0 },
      settings: { quality: 1, sound: true, music: true, auto: false, speed: 1, shake: true },
      lastTick: Date.now(), playtime: 0, lastSquad: null, lastSetup: null,
      tutorial: { intro: false },
      laurels: 0, quests: [], questsDone: 0, eventT: 240,
      relics: { gold: 0, xp: 0, train: 0, vigor: 0, crit: 0, market: 0 },
    };
    return s;
  }

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
    if (s && s.v === 1) {
      const def = this.newState();
      this.state = { ...def, ...s, b: { ...def.b, ...s.b }, stats: { ...def.stats, ...s.stats }, relics: { ...def.relics, ...(s.relics || {}) }, settings: { ...def.settings, ...s.settings }, tutorial: { ...def.tutorial, ...s.tutorial } };
      for (const g of this.state.gladiators) { g.grow ||= { str: 0, agi: 0, vit: 0, tec: 0, wil: 0 }; g.prog ||= { str: 0, agi: 0, vit: 0, tec: 0, wil: 0 }; }
      const away = (Date.now() - (s.lastTick || Date.now())) / 1000;
      this.offline = null;
      if (away > 30) this.offline = this.simulateOffline(Math.min(away, this.offlineCap()));
    } else {
      this.state = this.newState();
      this.refreshMarket(true);
    }
    if (!this.state.market.length) this.refreshMarket(true);
    this.ensureQuests();
    this.recalc();
    return this.state;
  }

  save() {
    this.state.lastTick = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* cuota */ }
  }
  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} this.state = this.newState(); this.refreshMarket(true); this.recalc(); }
  exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); }
  importSave(txt) {
    const s = JSON.parse(decodeURIComponent(escape(atob(txt.trim()))));
    if (!s || s.v !== 1) throw new Error('Guardado inválido');
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    this.load();
  }

  offlineCap() { return 8 * 3600; }

  // bonos globales
  get legacy() { return 1 + this.state.rudis * 0.06; }
  capacity() { return 4 + this.state.b.barracks; }
  bCost(id) { const b = BUILDINGS[id]; return Math.round(b.base * Math.pow(b.growth, this.state.b[id])); }

  recalc() {
    const st = this.state;
    const passive = (0.6 + Math.pow(st.fame, 0.72) * 0.08) * (1 + st.b.stands * 0.18) * this.legacy * (1 + st.relics.gold * 0.08);
    this.incomeRate = passive;
    RELIC_MOD.hp = st.relics.vigor * 0.03; RELIC_MOD.crit = st.relics.crit * 0.01;
  }

  fatigueEff(g) { return g.fatigue < 70 ? 1 : 1 - (g.fatigue - 70) / 30 * 0.75; }
  trainRate(g) {
    const st = this.state;
    return (1 + st.b.yard * 0.12) * (1 + st.rudis * 0.05) * (1 + st.relics.train * 0.08) * this.fatigueEff(g);
  }
  trainNeed(g, stat) { return 6 + Math.pow(g.stats[stat], 1.12) * 0.9; }
  isReady(g) { return g.wounded <= 0; }

  // avance del tiempo: entrenamiento, fatiga, heridas, oro pasivo
  tick(dt, events) {
    const st = this.state;
    st.playtime += dt;
    st.gold += this.incomeRate * dt;
    st.stats.gold += this.incomeRate * dt;
    const rest = 1 + st.b.infirmary * 0.15;
    for (const g of st.gladiators) {
      if (g.wounded > 0) { g.wounded = Math.max(0, g.wounded - dt * rest); g.fatigue = Math.max(0, g.fatigue - dt * 0.6 * rest); continue; }
      if (g.activity === 'rest') { g.fatigue = Math.max(0, g.fatigue - dt * 1.4 * rest); continue; }
      const stat = g.activity;
      g.fatigue = Math.min(100, g.fatigue + dt * 0.45);
      g.prog[stat] += dt * this.trainRate(g) * (g.talent === stat ? 1.3 : 1) / this.trainNeed(g, stat);
      let guard = 0;
      while (g.prog[stat] >= 1 && guard++ < 50) {
        g.prog[stat] -= 1; g.stats[stat]++; st.stats.trained++;
        const evs = grantXp(g, (3 + g.level * 0.6) * (1 + st.rudis * 0.06), this);
        if (events) events.push({ type: 'trained', g, stat }, ...evs); else evs.forEach(e => this.emit('level', e));
      }
    }
    st.marketT -= dt;
    st.eventT -= dt;
    this.recalc();
  }

  simulateOffline(seconds) {
    const before = { gold: this.state.gold, stats: this.state.gladiators.map(g => ({ id: g.id, lv: g.level, ...g.stats })) };
    const step = Math.max(1, seconds / 900);
    const events = [];
    for (let t = 0; t < seconds; t += step) this.tick(Math.min(step, seconds - t), events);
    const levels = events.filter(e => e.type === 'level');
    return { seconds, gold: this.state.gold - before.gold, levels: levels.length, skills: levels.filter(e => e.skill).length, events };
  }

  // ── economía ─────────────────────────────────────────────────────────────
  canAfford(n) { return this.state.gold >= n; }
  spend(n) { if (this.state.gold < n) return false; this.state.gold -= n; return true; }

  buyBuilding(id) {
    const st = this.state;
    if (st.b[id] >= BUILDINGS[id].max) return false;
    if (!this.spend(this.bCost(id))) return false;
    st.b[id]++;
    this.recalc();
    return true;
  }

  refreshMarket(free = false, cost = 0) {
    const st = this.state;
    if (!free && !this.spend(cost)) return false;
    const mk = st.b.market + st.relics.market * 2;
    const vl = VENUES[Math.min(st.stats.bestVenue, VENUES.length - 1)].lv[0];
    st.market = [];
    for (let i = 0; i < 5; i++) {
      const lvl = Math.max(1, Math.round(rand(1, 2 + mk * 1.0 + vl * 0.35)));
      const g = genGladiator({ level: lvl, quality: mk, talentBias: mk * 0.02 });
      g.cost = recruitCost(g);
      st.market.push(g);
    }
    st.marketT = 240;
    return true;
  }
  recruit(id) {
    const st = this.state;
    const i = st.market.findIndex(g => g.id === id);
    if (i < 0) return { ok: false, why: 'Ya no está disponible.' };
    if (st.gladiators.length >= this.capacity()) return { ok: false, why: 'Barracones llenos. Mejora los Barracones.' };
    const g = st.market[i];
    if (!this.spend(g.cost)) return { ok: false, why: 'Denarios insuficientes.' };
    st.market.splice(i, 1);
    delete g.cost;
    g.activity = 'rest';
    st.gladiators.push(g);
    return { ok: true, g };
  }

  // ── inventario ───────────────────────────────────────────────────────────
  addItem(it) {
    if (this.state.inventory.length >= 80) { this.state.gold += itemValue(it); return false; }
    this.state.inventory.push(it); return true;
  }
  equip(g, itemId) {
    const st = this.state;
    const i = st.inventory.findIndex(x => x.id === itemId);
    if (i < 0) return false;
    const it = st.inventory[i];
    const slot = it.slot;
    if (slot === 'offhand') {
      const w = g.equip.weapon ? BASES.weapon[g.equip.weapon.base] : null;
      if (w && w.hands === 2) return { ok: false, why: 'El arma actual requiere dos manos.' };
    }
    st.inventory.splice(i, 1);
    const prev = g.equip[slot];
    g.equip[slot] = it;
    if (prev) st.inventory.push(prev);
    if (slot === 'weapon' && BASES.weapon[it.base].hands === 2 && g.equip.offhand) { st.inventory.push(g.equip.offhand); g.equip.offhand = null; }
    return { ok: true };
  }
  unequip(g, slot) {
    const it = g.equip[slot];
    if (!it) return;
    g.equip[slot] = null;
    this.addItem(it);
  }
  sell(itemId) {
    const st = this.state;
    const i = st.inventory.findIndex(x => x.id === itemId);
    if (i < 0) return 0;
    const v = itemValue(st.inventory[i]);
    st.inventory.splice(i, 1);
    st.gold += v;
    return v;
  }
  sellJunk(maxRarity = 1) {
    const st = this.state;
    let total = 0, n = 0;
    st.inventory = st.inventory.filter(it => {
      if (it.rarity <= maxRarity) { total += itemValue(it); n++; return false; }
      return true;
    });
    st.gold += total;
    return { total, n };
  }
  upgradeItem(it) {
    if ((it.plus || 0) >= MAX_PLUS) return false;
    const c = forgeCost(it, this.state.b.forge);
    if (!this.spend(c)) return false;
    it.plus = (it.plus || 0) + 1;
    return true;
  }

  heal(g) {
    const cost = Math.round(g.wounded * 1.2 + 10);
    if (!this.spend(cost)) return false;
    g.wounded = 0;
    return true;
  }

  // ── misiones y reliquias ─────────────────────────────────────────────────
  questTarget(t) {
    const k = 1 + this.state.questsDone * 0.22;
    if (t.id === 'gold') return Math.round(Math.max(300, this.incomeRate * 420) * k / 10) * 10;
    return Math.max(1, Math.round(t.base * k));
  }
  ensureQuests() {
    const st = this.state;
    st.quests = st.quests || [];
    while (st.quests.length < 3) {
      const used = new Set(st.quests.map(q => q.type));
      const pool = QUEST_TYPES.filter(t => !used.has(t.id) && (t.id !== 'bosses' || st.stats.bestVenue >= 2));
      const t = pick(pool.length ? pool : QUEST_TYPES.filter(x => x.id !== 'bosses'));
      st.quests.push({ id: uid(), type: t.id, target: this.questTarget(t), base0: st.stats[t.stat] || 0 });
    }
  }
  questProgress(q) { const t = QUEST_TYPES.find(x => x.id === q.type); return Math.min(q.target, (this.state.stats[t.stat] || 0) - q.base0); }
  questReward(q) { const n = this.state.questsDone; return { gold: Math.round((120 + this.incomeRate * 150) * (1 + n * 0.25)), laurels: 1 + Math.floor(n / 6) }; }
  claimQuest(id) {
    const st = this.state, q = st.quests.find(x => x.id === id);
    if (!q || this.questProgress(q) < q.target) return null;
    const r = this.questReward(q);
    st.gold += r.gold; st.laurels += r.laurels; st.questsDone++;
    st.quests = st.quests.filter(x => x.id !== id);
    this.ensureQuests();
    return r;
  }
  relicCost(id) { return 2 + this.state.relics[id] * 2; }
  buyRelic(id) {
    const st = this.state, R = RELICS[id];
    if (st.relics[id] >= R.max || st.laurels < this.relicCost(id)) return false;
    st.laurels -= this.relicCost(id); st.relics[id]++; this.recalc(); return true;
  }

  // ── retiro / legado ──────────────────────────────────────────────────────
  retireValue(g) {
    return Math.floor(Math.pow(g.level, 1.35) / 3 + g.wins / 25 + g.kills / 10);
  }
  canRetire(g) { return g.level >= 10; }
  retire(g) {
    const st = this.state;
    const r = this.retireValue(g);
    st.rudis += r;
    st.hall.push({ name: g.name, cls: g.cls, level: g.level, wins: g.wins, rudis: r, look: g.look });
    for (const s of SLOT_ORDER) if (g.equip[s]) { this.addItem(g.equip[s]); g.equip[s] = null; }
    st.gladiators = st.gladiators.filter(x => x.id !== g.id);
    this.recalc();
    return r;
  }
  dismiss(g) {
    const st = this.state;
    for (const s of SLOT_ORDER) if (g.equip[s]) { this.addItem(g.equip[s]); g.equip[s] = null; }
    st.gladiators = st.gladiators.filter(x => x.id !== g.id);
  }
}

// ── enemigos y recompensas ──────────────────────────────────────────────────
export function venueUnlocked(st, i) { return st.fame >= VENUES[i].fame; }

export function genEnemy(venue, level, { boss = null, cls = null } = {}) {
  level = Math.max(1, Math.round(level));
  const g = genGladiator({ cls, level, kit: false });
  g.isEnemy = true;
  g.name = genName(g.look.female);
  // pequeña variación de dificultad
  const k = rand(0.92, 1.08);
  for (const s of STATS) g.stats[s] = Math.round(g.stats[s] * k);
  const rarityBias = level > 25 ? 2 : level > 12 ? 1 : 0;
  addKit(g, level, level * 0.35, null);
  for (const slot of SLOT_ORDER) {
    const it = g.equip[slot];
    if (it && it.rarity < rarityBias) it.rarity = rarityBias;
  }
  // habilidades
  const nSk = Math.min(5, Math.floor(level / 7) + (Math.random() < 0.5 ? 1 : 0));
  for (let i = 0; i < nSk; i++) {
    const id = rollSkill({ ...g, skills: g.skills, level: Math.max(g.level, 8) }, 0);
    if (!id) break;
    const cur = g.skills.find(s => s.id === id);
    if (cur) cur.rank = Math.min(MAX_SKILL_RANK, cur.rank + 1); else g.skills.push({ id, rank: 1 + Math.floor(level / 14) });
  }
  if (boss) {
    g.isBoss = boss;
    g.name = boss.name;
    const weapon = genItem('weapon', level + 2, 40, 3, boss.weapon);
    g.equip = { weapon, offhand: null, helm: null, armor: null, greaves: null, charm: null };
    g.skills = boss.skills.map(id => ({ id, rank: 1 + Math.floor(level / 12) })).filter(s => SKILLS[s.id]);
    for (const s of STATS) g.stats[s] = Math.round(g.stats[s] * 1.15);
    g.cls = 'secutor';
  }
  return g;
}

// construye los rivales de un combate
export function buildFoes(venueIdx, modeId, squadPower, round = 0, st = null) {
  const venue = VENUES[venueIdx];
  const mode = MODES[modeId];
  const span = venue.lv[1] - venue.lv[0];
  const foes = [];
  let baseLv;
  if (venue.endless) baseLv = venue.lv[0] + Math.floor((st?.stats.eternal || 0) * 1.5) + round * 2;
  else baseLv = venue.lv[0] + span * 0.35 + round * Math.max(1, span * 0.15);
  if (mode.boss) {
    const boss = pick(BOSSES);
    const e = genEnemy(venue, baseLv + span * 0.1, { boss });
    foes.push(e);
    return { foes, boss };
  }
  for (let i = 0; i < mode.foes; i++) {
    const lv = baseLv + rand(-span * 0.25, span * 0.25) - (mode.foes > 1 ? 1 : 0);
    foes.push(genEnemy(venue, lv));
  }
  return { foes };
}

export function rewardFor(venueIdx, modeId, foes, won, hype, squad) {
  const venue = VENUES[venueIdx];
  const mode = MODES[modeId];
  const avgLv = foes.reduce((a, f) => a + f.level, 0) / foes.length;
  const rounds = mode.rounds || 1;
  let gold = (25 + 14 * Math.pow(avgLv, 1.25)) * venue.gold * mode.mult * (foes.length > 1 && !mode.boss ? 1 : 1);
  gold *= 1 + hype * 0.5;
  const fame = (5 + avgLv * 1.5) * mode.mult * (0.6 + venueIdx * 0.25);
  const xp = (14 + avgLv * 9) * (mode.xpMult || mode.mult * 0.75 + 0.25);
  return { gold: won ? gold : gold * 0.12, fame: won ? fame : fame * 0.12, xp: won ? xp : xp * 0.4 };
}

export function rollLoot(game, venueIdx, modeId, avgLv, won, boss) {
  const st = game.state;
  const mode = MODES[modeId];
  const items = [];
  if (!won) return items;
  const q = st.b.forge * 2 + st.b.shrine * 1.5 + venueIdx * 3 + (boss ? 25 : 0) + st.relics.market * 2;
  let n = Math.random() < 0.5 + venueIdx * 0.04 ? 1 : 0;
  if (modeId === 'melee' || modeId === 'tournament') n += 1;
  if (boss) n += 1;
  for (let i = 0; i < n; i++) {
    const slot = pick(SLOT_ORDER);
    const it = genItem(slot, avgLv + randi(-1, 2), q, boss && i === 0 ? Math.max(2, 2 + (Math.random() < 0.25 ? 1 : 0) + (Math.random() < 0.05 ? 1 : 0)) : null);
    items.push(it);
  }
  return items;
}

export const GAME = new Game();
