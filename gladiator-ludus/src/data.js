// ────────────────────────────────────────────────────────────────────────────
//  Datos estáticos del juego: clases, habilidades, equipo, sedes, mejoras…
// ────────────────────────────────────────────────────────────────────────────

export const STATS = ['str', 'agi', 'vit', 'tec', 'wil'];
export const STAT_INFO = {
  str: { name: 'Fuerza', short: 'FUE', icon: '💪', color: '#e0643c', desc: 'Aumenta el daño de todos los ataques.', train: 'Levantar piedras' },
  agi: { name: 'Agilidad', short: 'AGI', icon: '🏃', color: '#6fd18a', desc: 'Velocidad de ataque, movimiento y esquiva.', train: 'Carreras y esquivas' },
  vit: { name: 'Vitalidad', short: 'VIT', icon: '❤️', color: '#e0566a', desc: 'Puntos de vida máximos.', train: 'Acarreo de sacos' },
  tec: { name: 'Técnica', short: 'TEC', icon: '🎯', color: '#e5c35a', desc: 'Probabilidad de crítico, parada y precisión.', train: 'Duelo con el palus' },
  wil: { name: 'Voluntad', short: 'VOL', icon: '🔥', color: '#b27cf0', desc: 'Potencia de habilidades, recarga y aprendizaje.', train: 'Meditación en el santuario' },
};

export const RARITY = [
  { id: 'common', name: 'Común', color: '#c9c2b4', glow: 0, mult: 1.0, affixes: 0 },
  { id: 'fine', name: 'Fino', color: '#7fd66f', glow: 0.15, mult: 1.18, affixes: 1 },
  { id: 'rare', name: 'Raro', color: '#5aa9ff', glow: 0.35, mult: 1.42, affixes: 2 },
  { id: 'epic', name: 'Épico', color: '#c277ff', glow: 0.7, mult: 1.78, affixes: 3 },
  { id: 'legendary', name: 'Legendario', color: '#ffb347', glow: 1.3, mult: 2.35, affixes: 4 },
];

export const SKILL_RARITY = {
  common: { name: 'Común', color: '#c9c2b4', weight: 50 },
  rare: { name: 'Rara', color: '#5aa9ff', weight: 30 },
  epic: { name: 'Épica', color: '#c277ff', weight: 14 },
  legendary: { name: 'Legendaria', color: '#ffb347', weight: 4 },
};

// ── Clases ──────────────────────────────────────────────────────────────────
export const CLASSES = {
  murmillo: {
    name: 'Murmillo', icon: '🛡️', desc: 'Coloso blindado. Aguanta cualquier golpe.',
    base: { str: 6, agi: 4, vit: 9, tec: 5, wil: 4 }, growth: { str: 0.9, agi: 0.5, vit: 1.4, tec: 0.7, wil: 0.5 },
    kit: { weapon: 'gladius', offhand: 'scutum', helm: 'galea', armor: 'cuero', greaves: 'cuero' },
    hire: 1.0,
  },
  thraex: {
    name: 'Tracio', icon: '🦅', desc: 'Ágil y letal con la sica curva.',
    base: { str: 5, agi: 8, vit: 5, tec: 6, wil: 4 }, growth: { str: 0.7, agi: 1.4, vit: 0.7, tec: 1.0, wil: 0.6 },
    kit: { weapon: 'sica', offhand: 'parma', helm: 'thracia', armor: 'tunica', greaves: 'bronce' },
    hire: 1.0,
  },
  retiarius: {
    name: 'Reciario', icon: '🔱', desc: 'Pescador mortal: tridente largo y red.',
    base: { str: 5, agi: 7, vit: 7, tec: 7, wil: 5 }, growth: { str: 0.8, agi: 1.1, vit: 1.0, tec: 1.3, wil: 0.8 },
    kit: { weapon: 'tridens', offhand: 'rete', helm: null, armor: 'cuero', greaves: 'cuero' },
    hire: 1.1,
  },
  secutor: {
    name: 'Secutor', icon: '🔨', desc: 'Perseguidor implacable de golpes demoledores.',
    base: { str: 9, agi: 4, vit: 7, tec: 4, wil: 3 }, growth: { str: 1.5, agi: 0.5, vit: 1.0, tec: 0.6, wil: 0.4 },
    kit: { weapon: 'malleus', offhand: 'scutum', helm: 'secutor', armor: 'segmentata', greaves: 'bronce' },
    hire: 1.15,
  },
  dimachaerus: {
    name: 'Dimacero', icon: '⚔️', desc: 'Dos sicas, cero piedad. Ráfagas veloces.',
    base: { str: 6, agi: 8, vit: 6, tec: 6, wil: 4 }, growth: { str: 1.0, agi: 1.3, vit: 0.9, tec: 1.0, wil: 0.6 },
    kit: { weapon: 'sicae', offhand: null, helm: 'cassis', armor: 'cuero', greaves: 'cuero' },
    hire: 1.25,
  },
  hoplomachus: {
    name: 'Hoplómaco', icon: '🏛️', desc: 'Lanza griega y disciplina de falange.',
    base: { str: 6, agi: 5, vit: 6, tec: 6, wil: 5 }, growth: { str: 0.9, agi: 0.8, vit: 0.9, tec: 1.1, wil: 0.9 },
    kit: { weapon: 'hasta', offhand: 'parma', helm: 'cassis', armor: 'cuero', greaves: 'bronce' },
    hire: 1.1,
  },
};

// ── Equipo ──────────────────────────────────────────────────────────────────
export const SLOTS = {
  weapon: { name: 'Arma', icon: '⚔️' },
  offhand: { name: 'Mano izq.', icon: '🛡️' },
  helm: { name: 'Yelmo', icon: '⛑️' },
  armor: { name: 'Coraza', icon: '🥋' },
  greaves: { name: 'Grebas', icon: '🦵' },
  charm: { name: 'Amuleto', icon: '📿' },
};
export const SLOT_ORDER = ['weapon', 'offhand', 'helm', 'armor', 'greaves', 'charm'];

// dmg: [min,max] base por nivel de objeto · interval: segundos entre ataques · reach: alcance en metros
export const BASES = {
  weapon: {
    gladius: { name: 'Gladius', dmg: [8, 12], interval: 1.05, reach: 1.9, style: 'slash', wind: 0.32, hands: 1 },
    sica: { name: 'Sica', dmg: [7, 11], interval: 0.85, reach: 1.8, style: 'slash', wind: 0.26, hands: 1, crit: 0.05 },
    sicae: { name: 'Sicas gemelas', dmg: [7, 10], interval: 0.62, reach: 1.75, style: 'flurry', wind: 0.2, hands: 2, dual: true },
    hasta: { name: 'Hasta', dmg: [9, 14], interval: 1.25, reach: 2.9, style: 'thrust', wind: 0.36, hands: 1 },
    tridens: { name: 'Tridente', dmg: [13, 18], interval: 1.2, reach: 3.1, style: 'thrust', wind: 0.36, hands: 1 },
    bipennis: { name: 'Bipennis', dmg: [15, 22], interval: 1.65, reach: 2.2, style: 'cleave', wind: 0.5, hands: 2 },
    malleus: { name: 'Malleus', dmg: [13, 19], interval: 1.5, reach: 1.95, style: 'cleave', wind: 0.44, hands: 1 },
  },
  offhand: {
    scutum: { name: 'Scutum', armor: 6, block: 0.22, weight: 1 },
    parma: { name: 'Parma', armor: 3, block: 0.14, weight: 0.5 },
    rete: { name: 'Rete', armor: 2, block: 0.04, weight: 0.1, dodge: 0.12 },
  },
  helm: {
    cassis: { name: 'Cassis', armor: 3 },
    galea: { name: 'Galea', armor: 5 },
    thracia: { name: 'Yelmo tracio', armor: 6 },
    secutor: { name: 'Yelmo de secutor', armor: 7 },
  },
  armor: {
    tunica: { name: 'Túnica reforzada', armor: 3 },
    cuero: { name: 'Coraza de cuero', armor: 7 },
    segmentata: { name: 'Lorica segmentata', armor: 12 },
    muscular: { name: 'Coraza muscular', armor: 15 },
  },
  greaves: {
    cuero: { name: 'Grebas de cuero', armor: 3 },
    bronce: { name: 'Grebas de bronce', armor: 5 },
    acero: { name: 'Grebas de acero', armor: 8 },
  },
  charm: {
    bulla: { name: 'Bulla', armor: 0 },
    laurel: { name: 'Laurel', armor: 0 },
    garra: { name: 'Garra de león', armor: 0 },
  },
};

export const AFFIXES = [
  { key: 'str', name: 'de Marte', label: 'Fuerza', per: 1.0, kind: 'stat' },
  { key: 'agi', name: 'de Mercurio', label: 'Agilidad', per: 1.0, kind: 'stat' },
  { key: 'vit', name: 'de Hércules', label: 'Vitalidad', per: 1.0, kind: 'stat' },
  { key: 'tec', name: 'de Minerva', label: 'Técnica', per: 1.0, kind: 'stat' },
  { key: 'wil', name: 'de Némesis', label: 'Voluntad', per: 1.0, kind: 'stat' },
  { key: 'crit', name: 'del Águila', label: 'Prob. crítico', per: 0.012, kind: 'pct', cap: 0.25 },
  { key: 'lifesteal', name: 'del Vampiro', label: 'Robo de vida', per: 0.008, kind: 'pct', cap: 0.2 },
  { key: 'dodge', name: 'de la Sombra', label: 'Esquiva', per: 0.01, kind: 'pct', cap: 0.2 },
  { key: 'hpPct', name: 'del Oso', label: 'Vida máx.', per: 0.025, kind: 'pct', cap: 0.3 },
  { key: 'dmgPct', name: 'del Lobo', label: 'Daño', per: 0.025, kind: 'pct', cap: 0.35 },
  { key: 'thorns', name: 'del Erizo', label: 'Espinas', per: 0.012, kind: 'pct', cap: 0.25 },
  { key: 'goldPct', name: 'del Mercader', label: 'Oro de combate', per: 0.03, kind: 'pct', cap: 0.4 },
];

export const LEGENDARY_NAMES = ['de Aquila', 'del Emperador', 'de Spartaco', 'del Último Rey', 'de Vulcano', 'de los Mil Gritos', 'del Sol Naciente', 'de Medusa'];

// ── Habilidades ─────────────────────────────────────────────────────────────
// Las activas se lanzan solas en combate cuando están listas; las pasivas siempre actúan.
export const SKILLS = {
  // — activas —
  bash: { name: 'Embestida de Escudo', icon: '🛡️', kind: 'active', rarity: 'common', cd: 9, range: 4.5, desc: r => `Carga y golpea con el escudo: ${Math.round(110 + r * 12)}% de daño y aturde ${(0.8 + r * 0.12).toFixed(1)} s.` },
  whirl: { name: 'Torbellino', icon: '🌀', kind: 'active', rarity: 'rare', cd: 12, range: 2.6, desc: r => `Gira segando a todos los cercanos: 3 golpes de ${Math.round(65 + r * 8)}%.` },
  net: { name: 'Red Enredadora', icon: '🕸️', kind: 'active', rarity: 'common', cd: 11, range: 7, desc: r => `Lanza una red: inmoviliza al objetivo ${(1.8 + r * 0.3).toFixed(1)} s.` },
  dirt: { name: 'Puñado de Arena', icon: '🏜️', kind: 'active', rarity: 'common', cd: 10, range: 3.2, desc: r => `Ciega al rival ${(2.4 + r * 0.4).toFixed(1)} s: falla el ${Math.round(45 + r * 3)}% de sus ataques.` },
  cry: { name: 'Grito de Guerra', icon: '📯', kind: 'active', rarity: 'rare', cd: 18, range: 99, desc: r => `Aliados: +${Math.round(14 + r * 4)}% daño y velocidad de ataque durante 6 s.` },
  leap: { name: 'Salto del Coloso', icon: '🦘', kind: 'active', rarity: 'rare', cd: 13, range: 9, desc: r => `Salta sobre el enemigo: ${Math.round(160 + r * 20)}% de daño en área y lo aturde.` },
  pierce: { name: 'Estocada Perforante', icon: '🗡️', kind: 'active', rarity: 'common', cd: 8, range: 3.2, desc: r => `Golpe que ignora el 60% de armadura: ${Math.round(170 + r * 25)}% de daño.` },
  frenzy: { name: 'Frenesí Sangriento', icon: '🩸', kind: 'active', rarity: 'epic', cd: 20, range: 99, desc: r => `7 s: +${Math.round(40 + r * 6)}% vel. de ataque y ${Math.round(10 + r * 3)}% robo de vida. Recibes +15% daño.` },
  pray: { name: 'Plegaria de Némesis', icon: '✨', kind: 'active', rarity: 'epic', cd: 24, range: 99, cond: 'hurt', desc: r => `Regenera el ${Math.round(24 + r * 4)}% de la vida máxima en 4 s.` },
  quake: { name: 'Pisotón Sísmico', icon: '🌋', kind: 'active', rarity: 'epic', cd: 16, range: 3.6, desc: r => `Onda de choque: ${Math.round(90 + r * 12)}% de daño, empuja y ralentiza a todos en 4.5 m.` },
  jove: { name: 'Ira de Júpiter', icon: '⚡', kind: 'active', rarity: 'legendary', cd: 22, range: 99, desc: r => `Invoca hasta 3 rayos: ${Math.round(220 + r * 35)}% de daño y aturdimiento.` },
  blade: { name: 'Danza de Sicas', icon: '💫', kind: 'active', rarity: 'epic', cd: 14, range: 6, desc: r => `Cruza al enemigo y le propina 5 cortes de ${Math.round(58 + r * 7)}%.` },
  taunt: { name: 'Desafío', icon: '🎺', kind: 'active', rarity: 'common', cd: 14, range: 8, desc: r => `Obliga a los rivales cercanos a atacarte y gana +${Math.round(25 + r * 5)}% armadura 5 s.` },
  // — pasivas —
  thick: { name: 'Piel de Hierro', icon: '🪨', kind: 'passive', rarity: 'common', desc: r => `+${r * 12}% de armadura.` },
  will: { name: 'Voluntad Inquebrantable', icon: '🫀', kind: 'passive', rarity: 'common', desc: r => `+${r * 7}% de vida máxima.` },
  iron: { name: 'Maestro de Armas', icon: '⚒️', kind: 'passive', rarity: 'common', desc: r => `+${r * 6}% de daño.` },
  eye: { name: 'Ojo de Águila', icon: '🦅', kind: 'passive', rarity: 'common', desc: r => `+${r * 4}% prob. crítica y +${r * 8}% daño crítico.` },
  fleet: { name: 'Pie Ligero', icon: '👟', kind: 'passive', rarity: 'common', desc: r => `+${r * 6}% velocidad de movimiento y +${r * 2}% esquiva.` },
  vamp: { name: 'Sed de Sangre', icon: '🧛', kind: 'passive', rarity: 'rare', desc: r => `Recuperas el ${r * 3}% del daño causado.` },
  thorns: { name: 'Espinas de Acero', icon: '🦔', kind: 'passive', rarity: 'rare', desc: r => `Reflejas el ${r * 8}% del daño recibido.` },
  riposte: { name: 'Réplica', icon: '🔁', kind: 'passive', rarity: 'rare', desc: r => `${r * 8}% al esquivar o bloquear de contraatacar al instante.` },
  exec: { name: 'Verdugo', icon: '🪓', kind: 'passive', rarity: 'rare', desc: r => `+${r * 14}% de daño a enemigos con menos del 35% de vida.` },
  parry: { name: 'Parada Maestra', icon: '🤺', kind: 'passive', rarity: 'rare', desc: r => `+${r * 4}% prob. de bloqueo y los bloqueos absorben más daño.` },
  fav: { name: 'Favorito del Pueblo', icon: '👑', kind: 'passive', rarity: 'rare', desc: r => `+${r * 8}% de oro y el daño crece con el favor de la multitud.` },
  wind: { name: 'Segundo Aliento', icon: '💨', kind: 'passive', rarity: 'epic', desc: r => `Al bajar del 30% de vida, recuperas ${Math.round(18 + r * 5)}% (una vez por combate).` },
  berserk: { name: 'Berserker', icon: '😤', kind: 'passive', rarity: 'epic', desc: r => `Hasta +${r * 12}% de daño según la vida que te falte.` },
  phoenix: { name: 'Renacer del Fénix', icon: '🔥', kind: 'passive', rarity: 'legendary', desc: r => `Al morir, revives con el ${Math.round(35 + r * 8)}% de vida y una explosión de fuego (1 vez).` },
};
export const MAX_SKILL_RANK = 5;

// ── Sedes / torneos ─────────────────────────────────────────────────────────
export const VENUES = [
  { id: 'pit', name: 'La Fosa de Arena', sub: 'Combates clandestinos', fame: 0, lv: [1, 4], gold: 1, sun: 0.35, tint: '#e8b070', crowd: 0.35, banner: '#7a2a20' },
  { id: 'provincial', name: 'Anfiteatro Provincial', sub: 'El circo de la ciudad', fame: 120, lv: [5, 10], gold: 1.25, sun: 0.30, tint: '#ffbf7a', crowd: 0.6, banner: '#8a1f25' },
  { id: 'pompeii', name: 'Juegos de Pompeya', sub: 'A los pies del volcán', fame: 700, lv: [11, 18], gold: 1.55, sun: 0.22, tint: '#ff9e5e', crowd: 0.8, banner: '#9a1a2a' },
  { id: 'maximus', name: 'Circo Máximo', sub: 'Carreras de sangre y sol', fame: 3500, lv: [19, 28], gold: 1.9, sun: 0.16, tint: '#ff8a4c', crowd: 0.92, banner: '#8c1630' },
  { id: 'colosseum', name: 'Coliseo Flavio', sub: 'La arena de los dioses', fame: 16000, lv: [29, 42], gold: 2.4, sun: 0.11, tint: '#ff7a3c', crowd: 1.0, banner: '#7c0f2a' },
  { id: 'imperial', name: 'Juegos Imperiales', sub: 'Ante el César y su guardia', fame: 70000, lv: [43, 60], gold: 3.0, sun: 0.08, tint: '#ff6a30', crowd: 1.0, banner: '#5a0a3a' },
  { id: 'eternal', name: 'Arena Eterna', sub: 'Más allá de la gloria', fame: 400000, lv: [61, 999], gold: 4.0, sun: 0.05, tint: '#ff5a28', crowd: 1.0, banner: '#3a0a4a', endless: true },
];

export const MODES = {
  duel: { name: 'Duelo', icon: '⚔️', desc: '1 contra 1. Pura habilidad.', squad: 1, foes: 1, mult: 1.0, unlockVenue: 0 },
  melee: { name: 'Melé 3v3', icon: '🛡️', desc: 'Equipos de tres en plena arena.', squad: 3, foes: 3, mult: 2.4, unlockVenue: 1 },
  tournament: { name: 'Torneo', icon: '🏆', desc: 'Tres duelos seguidos. Sin descanso.', squad: 1, foes: 1, rounds: 3, mult: 3.4, unlockVenue: 1 },
  beast: { name: 'Bestiarium', icon: '🐂', desc: 'Dos gladiadores contra un monstruo.', squad: 2, foes: 1, boss: true, mult: 3.0, unlockVenue: 2 },
};

export const BOSSES = [
  { id: 'minotaur', name: 'Minotauro de Creta', lore: 'Mitad hombre, mitad toro.', hpMul: 4.2, dmgMul: 1.45, size: 1.55, weapon: 'bipennis', skills: ['quake', 'leap', 'frenzy'] },
  { id: 'cyclops', name: 'Cíclope Polifemo', lore: 'Un solo ojo, mil heridas.', hpMul: 4.8, dmgMul: 1.5, size: 1.75, weapon: 'malleus', skills: ['quake', 'bash', 'dirt'] },
  { id: 'golem', name: 'Coloso de Arena', lore: 'La arena misma cobra vida.', hpMul: 5.4, dmgMul: 1.3, size: 1.65, weapon: 'malleus', skills: ['quake', 'thick', 'taunt'] },
];

// ── Mejoras del Ludus ───────────────────────────────────────────────────────
export const BUILDINGS = {
  yard: { name: 'Patio de Entrenamiento', icon: '🏋️', max: 30, base: 90, growth: 1.55, desc: l => `Velocidad de entrenamiento +${l * 12}%.` },
  barracks: { name: 'Barracones', icon: '🏠', max: 12, base: 220, growth: 2.1, desc: l => `Capacidad del ludus: ${4 + l} gladiadores.` },
  infirmary: { name: 'Enfermería y Termas', icon: '♨️', max: 25, base: 130, growth: 1.6, desc: l => `Descanso y curación +${l * 15}% más rápidos.` },
  forge: { name: 'Herrería del Ludus', icon: '🔥', max: 25, base: 160, growth: 1.62, desc: l => `Mejor botín (+${l * 2}% calidad) y forja ${l * 3}% más barata.` },
  market: { name: 'Mercado de Esclavos', icon: '🏺', max: 25, base: 150, growth: 1.6, desc: l => `Reclutas de mayor nivel y más talento (+${l}).` },
  shrine: { name: 'Santuario de Némesis', icon: '🏛️', max: 25, base: 200, growth: 1.65, desc: l => `+${l * 2}% probabilidad de aprender habilidades y mejores rarezas.` },
  stands: { name: 'Gradas y Taquilla', icon: '🎟️', max: 30, base: 110, growth: 1.58, desc: l => `Ingresos pasivos +${l * 18}% y más fama por victoria.` },
};

// ── Nombres y aspecto ───────────────────────────────────────────────────────
export const NAMES_M = ['Marcus', 'Lucius', 'Gaius', 'Titus', 'Cassius', 'Brutus', 'Flavius', 'Decimus', 'Maximus', 'Crixus', 'Priscus', 'Verus', 'Felix', 'Octavius', 'Varro', 'Septimus', 'Quintus', 'Tiberius', 'Sextus', 'Cato', 'Atticus', 'Valerius', 'Rufus', 'Darius', 'Brennus', 'Arminius', 'Oenomaus', 'Castus', 'Gannicus', 'Nasica', 'Tarquin', 'Jugurta', 'Lysander', 'Leonidas', 'Borys', 'Kaeso'];
export const NAMES_F = ['Livia', 'Julia', 'Cornelia', 'Valeria', 'Aurelia', 'Claudia', 'Sabina', 'Fulvia', 'Camilla', 'Helena', 'Drusilla', 'Tullia', 'Lucilla', 'Boudica', 'Hippolyta', 'Nyx', 'Antonia', 'Septima', 'Messalina', 'Octavia'];
export const NICKS = ['el Toro', 'Sombra', 'Martillo', 'el Lobo', 'Garra', 'Ceniza', 'Trueno', 'Víbora', 'Colmillo', 'el Cuervo', 'Rompehuesos', 'Halcón', 'el Silencioso', 'Puño de Hierro', 'Sangre Fría', 'la Tormenta', 'Cicatriz', 'el Gigante', 'Llama', 'Acero', 'el Fantasma', 'Rayo', 'el Carnicero', 'Medianoche'];
export const SKIN_TONES = ['#f0c8a0', '#e3b088', '#d09a6c', '#b87a50', '#94603c', '#6e4428', '#4f3020'];
export const HAIR_COLORS = ['#1a1412', '#2c1c12', '#4a2e1a', '#7a5230', '#b48850', '#c9a060', '#8a8a8a', '#5a1c14'];
export const TUNIC_COLORS = ['#8a1f25', '#1f4a8a', '#2f6a3a', '#7a5a1a', '#4a2a6a', '#b0a08a', '#2a2a30', '#9a4a1a'];

// ── Misiones, reliquias y eventos ───────────────────────────────────────────
export const QUEST_TYPES = [
  { id: 'wins', icon: '🏆', stat: 'wins', base: 3, name: n => `Gana ${n} combates` },
  { id: 'fights', icon: '⚔️', stat: 'fights', base: 5, name: n => `Disputa ${n} combates` },
  { id: 'kills', icon: '💀', stat: 'kills', base: 4, name: n => `Derrota a ${n} rivales` },
  { id: 'trained', icon: '💪', stat: 'trained', base: 14, name: n => `Entrena ${n} puntos de atributo` },
  { id: 'gold', icon: '🪙', stat: 'gold', base: 0, name: n => `Acumula ${n} denarios` },
  { id: 'skills', icon: '✨', stat: 'skills', base: 1, name: n => `Aprende o mejora ${n} habilidades` },
  { id: 'bosses', icon: '🐂', stat: 'bosses', base: 1, name: n => `Vence a ${n} monstruo${n > 1 ? 's' : ''} del Bestiarium` },
];

export const RELICS = {
  gold: { name: 'Cuerno de la Abundancia', icon: '🏺', max: 20, desc: l => `+${l * 8}% de denarios (pasivos y de combate)` },
  xp: { name: 'Laurel de Minerva', icon: '🌿', max: 20, desc: l => `+${l * 8}% de experiencia` },
  train: { name: 'Yunque de Vulcano', icon: '⚒️', max: 20, desc: l => `+${l * 8}% de velocidad de entrenamiento` },
  vigor: { name: 'Égida de Hércules', icon: '🛡️', max: 15, desc: l => `+${l * 3}% de vida de tu equipo` },
  crit: { name: 'Ojo de Marte', icon: '🎯', max: 15, desc: l => `+${l}% de probabilidad de crítico` },
  market: { name: 'Bolsa de Mercurio', icon: '💰', max: 15, desc: l => `+${l * 2} de calidad de reclutas y botín` },
};
