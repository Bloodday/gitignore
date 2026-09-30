// Eventos aleatorios del ludus: el jugador elige cómo reaccionar.
import { genItem, genGladiator, fmt, pick, rand, randi } from './game.js';
import { SLOT_ORDER } from './data.js';

const avgLevel = g => Math.max(1, Math.round(g.state.gladiators.reduce((a, x) => a + x.level, 0) / Math.max(1, g.state.gladiators.length)));

export const EVENTS = [
  {
    id: 'merchant', icon: '🧳', title: 'Un mercader de armas',
    text: g => 'Un mercader extranjero ofrece una pieza de equipo excepcional a un precio razonable.',
    choices: g => [
      { label: 'Comprarla', cost: Math.round(120 + g.incomeRate * 200), run: () => { const it = genItem(pick(SLOT_ORDER), avgLevel(g) + 2, 40, 2 + (Math.random() < 0.3 ? 1 : 0)); g.addItem(it); return { msg: `Obtienes ${it.name}.`, item: it }; } },
      { label: 'Rechazar', run: () => ({ msg: 'El mercader se marcha.' }) },
    ],
  },
  {
    id: 'senator', icon: '🏛️', title: 'Visita de un senador',
    text: g => 'Un senador quiere ver a tus gladiadores. Un buen espectáculo te dará renombre; pedirle dinero te cansará.',
    choices: g => [
      { label: 'Exhibición de entrenamiento', run: () => { const f = Math.round(10 + g.state.fame * 0.06); g.state.fame += f; g.state.gladiators.forEach(x => { x.fatigue = Math.min(100, x.fatigue + 15); }); return { msg: `+${fmt(f)} ⭐ de fama. Tus gladiadores quedan cansados.` }; } },
      { label: 'Pedir patrocinio', run: () => { const m = Math.round(60 + g.incomeRate * 240); g.state.gold += m; return { msg: `El senador dona ${fmt(m)} 🪙.` }; } },
    ],
  },
  {
    id: 'plague', icon: '🤒', title: 'Fiebre en los barracones',
    text: g => 'Varios esclavos enferman. Un buen médico podría evitar que la fiebre se extienda.',
    choices: g => [
      { label: 'Pagar al médico', cost: Math.round(80 + g.incomeRate * 120), run: () => ({ msg: 'El médico controla la fiebre. No hay bajas.' }) },
      { label: 'Ignorarla', run: () => { const v = pick(g.state.gladiators); if (v) { v.wounded = Math.max(v.wounded, 50 + v.level * 4); return { msg: `${v.name} cae enfermo y debe reposar.` }; } return { msg: 'Nada ocurre.' }; } },
    ],
  },
  {
    id: 'chest', icon: '📦', title: 'Hallazgo bajo la arena',
    text: g => 'Mientras rastrillan el patio, tus esclavos desentierran un cofre antiguo.',
    choices: g => [
      { label: 'Abrirlo', run: () => {
        const r = Math.random();
        if (r < 0.5) { const m = Math.round(80 + g.incomeRate * 360); g.state.gold += m; return { msg: `Contiene ${fmt(m)} 🪙.` }; }
        if (r < 0.75) { g.state.laurels += 1; return { msg: 'Un laurel dorado brilla dentro: +1 🏅.' }; }
        const it = genItem(pick(SLOT_ORDER), avgLevel(g), 30, 2); g.addItem(it); return { msg: `¡Un ${it.name}!`, item: it };
      } },
    ],
  },
  {
    id: 'fugitive', icon: '🏃', title: 'Un fugitivo pide asilo',
    text: g => 'Un luchador herido llama a tu puerta. Promete servirte si lo acoges.',
    choices: g => [
      { label: 'Acogerlo', run: () => {
        if (g.state.gladiators.length >= g.capacity()) { g.state.gold += 150; return { msg: 'No hay sitio en los barracones. Te deja 150 🪙 por las molestias.' }; }
        const n = genGladiator({ level: Math.max(1, avgLevel(g) - 1), talentBias: 0.3, quality: 10 }); n.activity = 'rest'; g.state.gladiators.push(n);
        return { msg: `${n.name} (nv ${n.level}) se une al ludus.`, recruited: n };
      } },
      { label: 'Echarlo', run: () => ({ msg: 'Se aleja en silencio.' }) },
    ],
  },
  {
    id: 'omen', icon: '🔮', title: 'Augurio de Némesis',
    text: g => 'La sacerdotisa ofrece un sacrificio para bendecir a tus gladiadores con sabiduría.',
    choices: g => [
      { label: 'Ofrecer un sacrificio', cost: Math.round(100 + g.incomeRate * 150), run: () => { g.state.gladiators.forEach(x => { x.xp += 10 + x.level * 6; }); return { msg: 'Tus gladiadores sienten la gracia de la diosa: experiencia extra.' }; } },
      { label: 'No ahora', run: () => ({ msg: 'Némesis no lo olvidará…' }) },
    ],
  },
];
export function pickEvent() { return pick(EVENTS); }
