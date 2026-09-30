// ────────────────────────────────────────────────────────────────────────────
//  Animación procedural: poses por capas (locomoción + acción + reacciones).
//  Cada pose es un mapa articulación → [rx, ry, rz]; las acciones son
//  fotogramas clave de deltas relativos a la pose base de guardia.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';

const J = ['hips', 'spine', 'chest', 'neck', 'head', 'shR', 'elR', 'wrR', 'shL', 'elL', 'wrL', 'hipR', 'kneeR', 'ankR', 'hipL', 'kneeL', 'ankL'];
const BONE = { hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head', shR: 'shR', elR: 'elR', wrR: 'handR', shL: 'shL', elL: 'elL', wrL: 'handL', hipR: 'hipR', kneeR: 'kneeR', ankR: 'ankleR', hipL: 'hipL', kneeL: 'kneeL', ankL: 'ankleL' };
const ORDER_YXZ = new Set(['shR', 'shL', 'spine', 'chest', 'hips', 'neck', 'head']);

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - (1 - clamp01(x)) ** 3;
const easeIn = x => clamp01(x) ** 3;

function zero() { const p = { P: [0, 0, 0] }; for (const j of J) p[j] = [0, 0, 0]; return p; }
function addTo(dst, src, w = 1) {
  for (const k in src) { const d = dst[k]; const s = src[k]; d[0] += s[0] * w; d[1] += s[1] * w; d[2] += s[2] * w; }
}
function lerpDelta(a, b, k, out) {
  for (const key in out) {
    const pa = a[key] || Z3, pb = b[key] || Z3;
    out[key][0] = pa[0] + (pb[0] - pa[0]) * k; out[key][1] = pa[1] + (pb[1] - pa[1]) * k; out[key][2] = pa[2] + (pb[2] - pa[2]) * k;
  }
}
const Z3 = [0, 0, 0];

function mirror(d) {
  const o = {};
  const swap = { shR: 'shL', shL: 'shR', elR: 'elL', elL: 'elR', wrR: 'wrL', wrL: 'wrR', hipR: 'hipL', hipL: 'hipR', kneeR: 'kneeL', kneeL: 'kneeR', ankR: 'ankL', ankL: 'ankR' };
  for (const k in d) {
    const nk = swap[k] || k;
    const v = d[k];
    o[nk] = [v[0], -v[1], -v[2]];
  }
  return o;
}

// ── poses de guardia por estilo de arma ─────────────────────────────────────
function guardPose(style, hasShield, dual, weapon) {
  const p = zero();
  // piernas: postura escalonada (pie izquierdo adelantado)
  p.hips = [0.0, 0.28, 0];
  p.spine = [0.04, -0.3, 0];
  p.hipL = [-0.3, 0, 0.05]; p.kneeL = [0.45, 0, 0]; p.ankL = [-0.15, 0, 0];
  p.hipR = [0.25, 0, -0.05]; p.kneeR = [0.55, 0, 0]; p.ankR = [-0.3, 0, 0];
  p.P = [0, -0.09, 0];
  switch (style) {
    case 'thrust':
      p.shR = [-0.55, -0.15, -0.2]; p.elR = [-0.7, 0, 0]; p.wrR = [0.75, 0, 0];
      p.shL = [-0.7, 0.3, 0.2]; p.elL = [-1.2, 0, 0];
      if (weapon === 'tridens') { p.shL = [-0.3, 0.2, 0.3]; p.elL = [-0.7, 0, 0]; }
      break;
    case 'flurry':
      p.shR = [-0.8, 0.0, -0.3]; p.elR = [-1.25, 0, 0]; p.wrR = [0.0, 0, 0];
      p.shL = [-0.8, -0.0, 0.3]; p.elL = [-1.25, 0, 0]; p.wrL = [0.0, 0, 0];
      break;
    case 'cleave':
      p.shR = [-0.9, 0.35, -0.15]; p.elR = [-1.05, 0, 0]; p.wrR = [0.15, 0, 0];
      p.shL = [-0.9, -0.1, 0.3]; p.elL = [-1.15, 0, 0];
      if (weapon === 'malleus') { p.shL = [-0.55, 0.2, 0.2]; p.elL = [-1.3, 0, 0]; }
      break;
    default: // slash
      p.shR = [-0.75, 0.15, -0.25]; p.elR = [-1.25, 0, 0]; p.wrR = [0.05, 0, 0];
      p.shL = [-0.75, 0.45, 0.25]; p.elL = [-1.55, 0, 0];
  }
  if (!hasShield && style === 'slash') { p.shL = [-0.45, 0.2, 0.4]; p.elL = [-0.9, 0, 0]; }
  p.head = [0.04, -0.05, 0];
  return p;
}

// ── acciones (keyframes en segundos; d = delta sobre la guardia) ────────────
function attackKeys(style, atk, hand) {
  const w = atk.windT, dur = atk.dur;
  const a = Math.max(0.06, w - 0.1), b = w + 0.02, c = Math.min(dur, w + 0.26);
  let W, S, R;
  switch (style) {
    case 'thrust':
      W = { shR: [0.35, -0.2, 0], elR: [-0.6, 0, 0], wrR: [0.05, 0, 0], spine: [-0.05, 0.3, 0], hips: [0, 0.15, 0], P: [0, -0.02, -0.12], shL: [0.1, 0, 0], hipL: [0.1, 0, 0], hipR: [-0.1, 0, 0] };
      S = { shR: [-0.85, 0.12, 0.0], elR: [0.55, 0, 0], wrR: [-0.1, 0, 0], spine: [0.22, -0.5, 0], hips: [0.0, -0.3, 0], P: [0, -0.06, 0.3], hipL: [-0.4, 0, 0], hipR: [0.3, 0, 0], kneeL: [0.25, 0, 0], shL: [0.3, -0.2, 0] };
      break;
    case 'cleave':
      W = { shR: [-1.9, 0.0, -0.1], elR: [-0.5, 0, 0], shL: [-0.5, 0.0, 0.0], elL: [-0.3, 0, 0], spine: [-0.32, 0.4, 0], chest: [-0.1, 0.2, 0], hips: [0, 0.2, 0], P: [0, 0.0, -0.1], head: [-0.2, 0, 0] };
      S = { shR: [0.35, -0.3, 0.0], elR: [0.45, 0, 0], shL: [0.4, -0.2, 0], elL: [0.35, 0, 0], spine: [0.55, -0.55, 0], chest: [0.15, -0.3, 0], hips: [0.05, -0.4, 0], P: [0, -0.12, 0.3], hipL: [-0.5, 0, 0], kneeL: [0.35, 0, 0], head: [0.2, 0, 0] };
      break;
    case 'flurry': {
      const d1 = { shR: [-0.6, -0.9, 0.4], elR: [-0.2, 0, 0], spine: [0, 0.6, 0], hips: [0, 0.3, 0], shL: [0.1, 0.2, 0], P: [0, -0.03, -0.05] };
      const d2 = { shR: [-0.3, 0.7, -0.1], elR: [0.25, 0, 0], spine: [0.15, -0.6, 0], hips: [0, -0.4, 0], P: [0, -0.06, 0.22], hipL: [-0.3, 0, 0] };
      W = hand === 0 ? d1 : mirror(d1); S = hand === 0 ? d2 : mirror(d2);
      break;
    }
    default: { // slash; alterna tajo vertical y horizontal
      if (hand === 0) {
        W = { shR: [-1.75, 0.15, -0.35], elR: [-0.75, 0, 0], wrR: [-0.2, 0, 0], spine: [-0.22, 0.42, 0], chest: [0, 0.2, 0], hips: [0, 0.2, 0], P: [0, -0.02, -0.08], shL: [0.15, -0.2, -0.1] };
        S = { shR: [0.05, -0.35, 0.15], elR: [0.75, 0, 0], wrR: [0.35, 0, 0], spine: [0.42, -0.5, 0], chest: [0.1, -0.25, 0], hips: [0, -0.35, 0], P: [0, -0.1, 0.28], hipL: [-0.45, 0, 0], kneeL: [0.3, 0, 0], shL: [0.3, -0.1, 0.1] };
      } else {
        W = { shR: [-0.95, -1.4, -0.75], elR: [-0.4, 0, 0], wrR: [-0.1, 0, 0], spine: [-0.05, 0.8, 0], chest: [0, 0.3, 0], hips: [0, 0.3, 0], P: [0, -0.03, -0.08], shL: [0.15, -0.2, -0.1] };
        S = { shR: [-0.85, 1.05, 0.25], elR: [0.15, 0, 0], wrR: [0.15, 0, 0], spine: [0.15, -0.75, 0], chest: [0.05, -0.3, 0], hips: [0, -0.4, 0], P: [0, -0.08, 0.26], hipL: [-0.4, 0, 0], kneeL: [0.25, 0, 0] };
      }
    }
  }
  R = {};
  return [{ t: 0, d: {} }, { t: a, d: W }, { t: b, d: S }, { t: c, d: scaleDelta(S, 0.55) }, { t: dur, d: R }];
}
function scaleDelta(d, k) { const o = {}; for (const key in d) o[key] = [d[key][0] * k, d[key][1] * k, d[key][2] * k]; return o; }

const CAST = {
  bash: { dur: 0.75, keys: [
    { t: 0, d: {} }, { t: 0.18, d: { shL: [-0.35, -0.3, 0.1], elL: [-0.4, 0, 0], spine: [0.0, 0.25, 0], P: [0, -0.1, -0.1] } },
    { t: 0.4, d: { shL: [-0.5, 0.3, 0], elL: [1.0, 0, 0], spine: [0.35, -0.3, 0], P: [0, -0.12, 0.35], hipL: [-0.5, 0, 0] } }, { t: 0.55, d: { shL: [-0.4, 0.2, 0], elL: [0.8, 0, 0], spine: [0.2, -0.2, 0], P: [0, -0.1, 0.25] } }, { t: 0.75, d: {} }] },
  whirl: { dur: 1.45, spin: [0.2, 1.3, Math.PI * 6.2], keys: [
    { t: 0, d: {} }, { t: 0.2, d: { shR: [-0.85, -1.2, -1.1], elR: [-0.1, 0, 0], shL: [-0.85, 0.6, 1.2], elL: [-0.1, 0, 0], spine: [0.25, 0, 0], P: [0, -0.22, 0], hipL: [-0.2, 0, 0], kneeL: [0.4, 0, 0] } },
    { t: 1.2, d: { shR: [-0.85, -1.2, -1.1], elR: [-0.1, 0, 0], shL: [-0.85, 0.6, 1.2], elL: [-0.1, 0, 0], spine: [0.25, 0, 0], P: [0, -0.22, 0], hipL: [-0.2, 0, 0], kneeL: [0.4, 0, 0] } }, { t: 1.45, d: {} }] },
  net: { dur: 0.65, keys: [
    { t: 0, d: {} }, { t: 0.2, d: { shL: [-0.6, 0.7, 0.9], elL: [-1.0, 0, 0], spine: [-0.1, 0.5, 0], hips: [0, 0.2, 0] } },
    { t: 0.34, d: { shL: [-1.35, -0.3, 0.3], elL: [-0.05, 0, 0], spine: [0.3, -0.45, 0], P: [0, -0.06, 0.2] } }, { t: 0.65, d: {} }] },
  dirt: { dur: 0.55, keys: [
    { t: 0, d: {} }, { t: 0.14, d: { shL: [0.1, 0.0, 0.5], elL: [-0.2, 0, 0], spine: [0.4, 0.2, 0], head: [0.2, 0, 0], P: [0, -0.3, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] } },
    { t: 0.3, d: { shL: [-1.2, 0.0, 0.3], elL: [-0.3, 0, 0], spine: [-0.1, -0.3, 0], P: [0, -0.1, 0.15] } }, { t: 0.55, d: {} }] },
  cry: { dur: 0.95, keys: [
    { t: 0, d: {} }, { t: 0.25, d: { shR: [-2.6, 0.0, -0.4], elR: [-0.2, 0, 0], shL: [-2.4, 0, 0.4], elL: [-0.3, 0, 0], spine: [-0.3, 0, 0], head: [-0.5, 0, 0], P: [0, -0.04, 0] } },
    { t: 0.7, d: { shR: [-2.6, 0.0, -0.5], elR: [-0.2, 0, 0], shL: [-2.4, 0, 0.5], elL: [-0.3, 0, 0], spine: [-0.35, 0, 0], head: [-0.6, 0, 0] } }, { t: 0.95, d: {} }] },
  leap: { dur: 1.15, keys: [
    { t: 0, d: {} }, { t: 0.22, d: { P: [0, -0.4, 0], spine: [0.4, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], shR: [0.5, 0, 0], shL: [0.5, 0, 0] } },
    { t: 0.4, d: { P: [0, 0.05, 0], spine: [-0.15, 0, 0], shR: [-1.9, 0, -0.2], elR: [-0.6, 0, 0], shL: [-1.7, 0, 0.2], kneeL: [0.9, 0, 0], kneeR: [0.7, 0, 0], hipL: [-0.9, 0, 0], hipR: [-0.5, 0, 0] } },
    { t: 0.75, d: { P: [0, 0.0, 0], spine: [0.35, 0, 0], shR: [-1.0, 0, 0], elR: [-0.4, 0, 0], shL: [-1.0, 0, 0], hipL: [-0.8, 0, 0], kneeL: [0.4, 0, 0], hipR: [-0.6, 0, 0] } },
    { t: 0.86, d: { P: [0, -0.45, 0], spine: [0.55, 0, 0], shR: [0.4, 0, 0], elR: [-0.2, 0, 0], shL: [0.3, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0] } }, { t: 1.15, d: {} }] },
  pierce: { dur: 0.7, keys: [
    { t: 0, d: {} }, { t: 0.2, d: { shR: [0.5, -0.3, 0], elR: [-0.7, 0, 0], spine: [-0.1, 0.5, 0], P: [0, -0.15, -0.12], kneeR: [0.3, 0, 0] } },
    { t: 0.36, d: { shR: [-0.95, 0.1, 0], elR: [0.65, 0, 0], spine: [0.4, -0.6, 0], P: [0, -0.22, 0.42], hipL: [-0.65, 0, 0], kneeL: [0.4, 0, 0] } }, { t: 0.7, d: {} }] },
  frenzy: { dur: 0.85, keys: [
    { t: 0, d: {} }, { t: 0.3, d: { shR: [-2.4, 0, -0.5], elR: [-0.4, 0, 0], shL: [-2.0, 0, 0.6], elL: [-0.6, 0, 0], spine: [-0.4, 0, 0], head: [-0.6, 0, 0], P: [0, -0.1, 0] } },
    { t: 0.55, d: { shR: [-0.6, 0, -0.9], elR: [-0.5, 0, 0], shL: [-0.6, 0, 0.9], elL: [-0.5, 0, 0], spine: [0.4, 0, 0], head: [0.3, 0, 0], P: [0, -0.22, 0] } }, { t: 0.85, d: {} }] },
  pray: { dur: 1.1, keys: [
    { t: 0, d: {} }, { t: 0.3, d: { shR: [-2.8, 0, -0.35], elR: [-0.2, 0, 0], shL: [-2.8, 0, 0.35], elL: [-0.2, 0, 0], head: [-0.6, 0, 0], spine: [-0.15, 0, 0] } },
    { t: 0.85, d: { shR: [-2.8, 0, -0.35], elR: [-0.2, 0, 0], shL: [-2.8, 0, 0.35], elL: [-0.2, 0, 0], head: [-0.6, 0, 0], spine: [-0.15, 0, 0] } }, { t: 1.1, d: {} }] },
  quake: { dur: 1.1, keys: [
    { t: 0, d: {} }, { t: 0.4, d: { shR: [-2.9, 0, -0.2], elR: [-0.4, 0, 0], shL: [-2.6, 0, 0.2], spine: [-0.5, 0, 0], head: [-0.4, 0, 0], P: [0, 0.06, -0.05] } },
    { t: 0.6, d: { shR: [0.6, 0, -0.1], elR: [0.3, 0, 0], shL: [0.4, 0, 0.1], spine: [0.75, 0, 0], head: [0.3, 0, 0], P: [0, -0.4, 0.15], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] } },
    { t: 0.85, d: { shR: [0.3, 0, -0.1], spine: [0.5, 0, 0], P: [0, -0.3, 0.1], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0] } }, { t: 1.1, d: {} }] },
  jove: { dur: 1.7, keys: [
    { t: 0, d: {} }, { t: 0.4, d: { shR: [-3.0, 0, -0.1], elR: [-0.05, 0, 0], wrR: [0.1, 0, 0], shL: [-0.6, 0, 0.9], spine: [-0.4, 0, 0], head: [-0.7, 0, 0] } },
    { t: 0.9, d: { shR: [-3.0, 0, -0.1], elR: [-0.05, 0, 0], shL: [-0.6, 0, 0.9], spine: [-0.45, 0, 0], head: [-0.75, 0, 0], P: [0, 0.03, 0] } },
    { t: 1.05, d: { shR: [-0.6, 0, 0], elR: [-0.2, 0, 0], spine: [0.5, 0, 0], head: [0.3, 0, 0], P: [0, -0.15, 0.1] } }, { t: 1.7, d: {} }] },
  blade: { dur: 1.55, keys: [
    { t: 0, d: {} }, { t: 0.25, d: { shR: [-0.6, -0.6, -0.8], elR: [-0.6, 0, 0], shL: [-0.6, 0.6, 0.8], elL: [-0.6, 0, 0], spine: [0.3, 0, 0], P: [0, -0.15, 0] } },
    { t: 1.15, d: { shR: [-0.6, -0.6, -0.8], elR: [-0.6, 0, 0], shL: [-0.6, 0.6, 0.8], elL: [-0.6, 0, 0], spine: [0.3, 0, 0], P: [0, -0.15, 0] } }, { t: 1.55, d: {} }], flurryLoop: true },
  taunt: { dur: 0.8, keys: [
    { t: 0, d: {} }, { t: 0.25, d: { shR: [-1.6, 0.0, -0.9], elR: [-0.3, 0, 0], shL: [-0.2, 0.0, 1.0], elL: [-0.2, 0, 0], spine: [-0.25, 0, 0], head: [-0.3, 0, 0] } },
    { t: 0.6, d: { shR: [-1.6, 0.0, -0.9], elR: [-0.3, 0, 0], shL: [-0.2, 0.0, 1.0], elL: [-0.2, 0, 0], spine: [-0.25, 0, 0], head: [-0.3, 0, 0] } }, { t: 0.8, d: {} }] },
};
CAST.hit = { dur: 0.3, keys: [{ t: 0, d: {} }, { t: 0.06, d: { spine: [-0.3, 0.1, 0], head: [-0.25, 0, 0], P: [0, 0, -0.06], shR: [0.3, 0, 0], shL: [0.3, 0, 0] } }, { t: 0.3, d: {} }] };
CAST.block = { dur: 0.3, keys: [{ t: 0, d: {} }, { t: 0.05, d: { shL: [-0.25, 0, 0.0], elL: [-0.25, 0, 0], spine: [-0.1, 0, 0], P: [0, 0, -0.05] } }, { t: 0.3, d: {} }] };
CAST.dodge = { dur: 0.4, keys: [{ t: 0, d: {} }, { t: 0.12, d: { spine: [0.15, 0.0, 0.5], hips: [0, 0, -0.3], P: [0.22, -0.1, 0], head: [0, 0, -0.3] } }, { t: 0.4, d: {} }] };

// ── animadores de entrenamiento (ludus): bucles ─────────────────────────────
function trainingPose(mode, t, out) {
  const s = Math.sin, c = Math.cos;
  switch (mode) {
    case 'str': { // levantar piedra sobre la cabeza
      const k = (s(t * 1.7) + 1) / 2, e = smooth(k);
      out.P = [0, -0.36 + e * 0.3, 0];
      out.hipL = [-0.9 + e * 0.75, 0, 0.12]; out.hipR = [-0.9 + e * 0.75, 0, -0.12]; out.kneeL = [1.5 - e * 1.3, 0, 0]; out.kneeR = [1.5 - e * 1.3, 0, 0];
      out.ankL = [-0.6 + e * 0.5, 0, 0]; out.ankR = [-0.6 + e * 0.5, 0, 0];
      out.spine = [0.35 - e * 0.5, 0, 0]; out.hips = [0, 0, 0];
      out.shR = [-0.4 - e * 2.2, 0, -0.3]; out.shL = [-0.4 - e * 2.2, 0, 0.3]; out.elR = [-0.6 + e * 0.4, 0, 0]; out.elL = [-0.6 + e * 0.4, 0, 0];
      out.head = [-0.1 - e * 0.35, 0, 0]; out.wrR = [0, 0, 0]; out.wrL = [0, 0, 0];
      break; }
    case 'agi': { // carrera en sitio / esquivas
      const ph = t * 9;
      out.P = [0, -0.05 - Math.abs(s(ph)) * 0.05, 0];
      out.hipL = [-s(ph) * 0.9, 0, 0]; out.hipR = [s(ph) * 0.9, 0, 0];
      out.kneeL = [Math.max(0, -c(ph)) * 1.3 + 0.2, 0, 0]; out.kneeR = [Math.max(0, c(ph)) * 1.3 + 0.2, 0, 0];
      out.spine = [0.2, 0, 0]; out.shR = [s(ph) * 0.8 - 0.3, 0, -0.1]; out.shL = [-s(ph) * 0.8 - 0.3, 0, 0.1]; out.elR = [-1.3, 0, 0]; out.elL = [-1.3, 0, 0];
      break; }
    case 'vit': { // flexiones de tronco / acarreo de saco
      const e = (s(t * 2.2) + 1) / 2;
      out.P = [0, -0.1 - e * 0.08, 0];
      out.hipL = [-0.3, 0, 0.1]; out.hipR = [-0.3, 0, -0.1]; out.kneeL = [0.6 + e * 0.3, 0, 0]; out.kneeR = [0.6 + e * 0.3, 0, 0];
      out.spine = [0.2 + e * 0.15, 0, 0]; out.shR = [-1.0, 0, -0.5]; out.shL = [-1.0, 0, 0.5]; out.elR = [-1.6, 0, 0]; out.elL = [-1.6, 0, 0];
      out.head = [-0.15, 0, 0]; out.ankL = [-0.3, 0, 0]; out.ankR = [-0.3, 0, 0];
      break; }
    case 'tec': { // golpes al palus
      const ph = (t * 1.6) % 2;
      const hit = ph < 1 ? 1 : 0;
      const k = (ph % 1);
      const e = k < 0.45 ? smooth(k / 0.45) : k < 0.6 ? 1 - 0 : 1 - smooth((k - 0.6) / 0.4);
      const up = k < 0.45 ? smooth(k / 0.45) : 0;
      out.spine = [0.1 + e * 0.3, hit ? -0.4 * e + 0.2 * (1 - e) : 0.4 * e, 0]; out.hips = [0, 0.3, 0];
      out.hipL = [-0.3, 0, 0]; out.kneeL = [0.5, 0, 0]; out.hipR = [0.25, 0, 0]; out.kneeR = [0.5, 0, 0]; out.P = [0, -0.1, 0.1 * e];
      const swing = k < 0.4 ? -1.9 * smooth(k / 0.4) : k < 0.5 ? -1.9 + 2.2 * smooth((k - 0.4) / 0.1) : 0.3 - 1.0 * smooth((k - 0.5) / 0.5);
      out.shR = [hit ? swing : -0.8, hit ? -0.2 : -1.0 * e, -0.3]; out.elR = [-0.8, 0, 0];
      out.shL = [-0.8, 0.3, 0.3]; out.elL = [-1.4, 0, 0];
      break; }
    case 'wil': { // meditación sentado
      out.P = [0, -0.5, -0.05];
      out.hipL = [-1.45, 0.55, 0.65]; out.hipR = [-1.45, -0.55, -0.65]; out.kneeL = [2.2, 0, 0]; out.kneeR = [2.2, 0, 0];
      out.ankL = [0.4, 0, 0]; out.ankR = [0.4, 0, 0];
      out.spine = [0.05 + s(t * 1.2) * 0.02, 0, 0]; out.shR = [-0.5, 0, -0.35]; out.shL = [-0.5, 0, 0.35]; out.elR = [-1.6, 0, 0]; out.elL = [-1.6, 0, 0];
      out.wrR = [0.2, 0, 0]; out.wrL = [0.2, 0, 0]; out.head = [0.1, 0, 0];
      break; }
    default: { // descanso: de pie con los brazos cruzados respirando
      out.P = [0, -0.03, 0];
      out.hipL = [-0.05, 0, 0.04]; out.hipR = [0.05, 0, -0.04]; out.kneeL = [0.1, 0, 0]; out.kneeR = [0.15, 0, 0];
      out.spine = [0.03 + s(t * 1.4) * 0.015, 0, 0]; out.shR = [-0.5, -0.6, -0.15]; out.shL = [-0.5, 0.6, 0.15]; out.elR = [-1.8, 0, 0]; out.elL = [-1.8, 0, 0];
      out.head = [0.0, s(t * 0.5) * 0.25, 0];
    }
  }
}

export class Animator {
  constructor(avatar) {
    this.av = avatar;
    this.t = Math.random() * 10;
    this.speed = 0; // velocidad actual suavizada (m/s)
    this.phase = Math.random() * 6;
    this.action = null; // {def, t, keys, hand}
    this.flinch = 0;
    this.mode = 'combat'; // 'combat' | 'train:<stat>' | 'dead' | 'victory' | 'stunned' | 'display'
    this.deadT = 0;
    this.deadDir = Math.random() < 0.5 ? 1 : -1;
    this.style = 'slash';
    this.hasShield = false;
    this.dual = false;
    this.setLoadout();
    this.cur = zero();
    this.tmp = zero();
    this.base = zero();
    this.spinAcc = 0;
    this.wobble = 0;
    this.stunned = false;
    this.rootPos = new THREE.Vector3();
    this.airTilt = 0;
  }

  setLoadout() {
    const g = this.av.g;
    const w = g.equip?.weapon;
    this.weaponId = w ? w.base : null;
    const B = { gladius: 'slash', sica: 'slash', sicae: 'flurry', hasta: 'thrust', tridens: 'thrust', bipennis: 'cleave', malleus: 'cleave' };
    this.style = w ? B[w.base] : 'slash';
    if (g.isBoss) this.style = g.isBoss.id === 'cyclops' ? 'cleave' : 'cleave';
    this.hasShield = !!g.equip?.offhand && ['gladius', 'sica', 'hasta', 'tridens', 'malleus'].includes(w?.base || '');
    this.guard = guardPose(this.style, this.hasShield, this.style === 'flurry', this.weaponId);
  }

  /** Lanza una acción (ataque o habilidad). */
  playAttack(atk) {
    let st = this.style;
    if (atk.heavy && st !== 'thrust') st = 'cleave';
    const keys = attackKeys(st, atk, atk.hand || 0);
    if (atk.heavy) for (const k of keys) { for (const j in k.d) { const v = k.d[j]; k.d[j] = [v[0] * 1.25, v[1] * 1.25, v[2] * 1.25]; } }
    this.action = { name: 'attack', t: 0, dur: atk.dur, keys, spin: null };
  }
  playCast(id, dur) {
    const def = CAST[id];
    if (!def) return;
    let keys = def.keys;
    if (id === 'blade') keys = def.keys;
    this.action = { name: id, t: 0, dur: dur || def.dur, keys, spin: def.spin || null, timeScale: def.dur / (dur || def.dur) };
    this.spinAcc = 0;
  }
  playReact(id) { // golpe / bloqueo / esquiva: se superpone levemente sin cancelar ataques
    if (this.action && this.action.name !== 'react') return;
    const def = CAST[id]; if (!def) return;
    this.action = { name: 'react', t: 0, dur: def.dur, keys: def.keys, timeScale: 1 };
  }
  hit(strength = 1) { this.flinch = Math.min(1.4, this.flinch + 0.6 * strength); }
  die() { this.mode = 'dead'; this.deadT = 0; this.action = null; }
  revive() { this.mode = 'combat'; this.deadT = 0; }
  victory() { this.mode = 'victory'; this.action = null; this.vt = 0; }
  stun(on) { this.stunned = on; }

  get actionProgress() { return this.action ? this.action.t / this.action.dur : 1; }
  get actionName() { return this.action ? this.action.name : null; }

  sampleKeys(keys, t, out) {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    const k = b.t > a.t ? smooth((t - a.t) / (b.t - a.t)) : 1;
    lerpDelta(a.d, b.d, clamp01(k), out);
  }

  update(dt, sp = 0, extra = {}) {
    this.t += dt;
    const B = this.av.bones;
    const P = this.cur; // pose final
    const b = this.base;
    for (const j of J) { b[j][0] = 0; b[j][1] = 0; b[j][2] = 0; }
    b.P[0] = b.P[1] = b.P[2] = 0;

    if (this.mode.startsWith('train:')) {
      trainingPose(this.mode.slice(6), this.t, b);
    } else if (this.mode === 'display') {
      // pose de exhibición: guardia suave con respiración
      addTo(b, this.guard, 1);
      b.spine[0] += Math.sin(this.t * 1.6) * 0.02;
      b.chest[0] += Math.sin(this.t * 1.6 + 0.6) * 0.012;
      b.hips[2] += Math.sin(this.t * 0.7) * 0.02;
    } else if (this.mode === 'dead') {
      this.updateDead(dt);
      this.applyPose();
      return;
    } else {
      // locomoción + guardia
      this.speed += (sp - this.speed) * Math.min(1, dt * 10);
      const run = clamp01(this.speed / 2.5);
      addTo(b, this.guard, 1 - run * 0.0);
      // respiración y balanceo
      const br = Math.sin(this.t * 2.0 + this.phase);
      b.spine[0] += br * 0.02; b.chest[0] += br * 0.015; b.shR[0] += br * 0.02; b.shL[0] += br * 0.02;
      b.hips[2] += Math.sin(this.t * 0.9 + this.phase) * 0.02 * (1 - run);
      if (this.speed > 0.15) {
        this.phase += dt * (this.speed * 2.4 + 2.0);
        const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
        const a = Math.min(1, run * 1.2);
        // piernas en ciclo de carrera
        b.hipL[0] = b.hipL[0] * (1 - a) + (-s * 0.95) * a; b.hipR[0] = b.hipR[0] * (1 - a) + (s * 0.95) * a;
        b.kneeL[0] = b.kneeL[0] * (1 - a) + (Math.max(0, -c) * 1.2 + 0.25) * a; b.kneeR[0] = b.kneeR[0] * (1 - a) + (Math.max(0, c) * 1.2 + 0.25) * a;
        b.ankL[0] = b.ankL[0] * (1 - a) + (-0.2 + Math.max(0, c) * 0.3) * a; b.ankR[0] = b.ankR[0] * (1 - a) + (-0.2 + Math.max(0, -c) * 0.3) * a;
        b.hips[1] *= (1 - a * 0.8); b.spine[1] *= (1 - a * 0.8);
        b.P[1] += -Math.abs(s) * 0.05 * a;
        b.spine[0] += 0.18 * a; b.head[0] -= 0.12 * a;
        b.hips[1] += s * 0.12 * a; b.spine[1] -= s * 0.12 * a;
        b.shR[0] += -s * 0.12 * a; b.shL[0] += s * 0.22 * a;
        b.P[1] += -0.04 * a; b.kneeL[0] += 0.0; 
      }
      if (this.stunned) { b.head[0] += 0.45; b.spine[0] += 0.3 + Math.sin(this.t * 14) * 0.03; b.shR[0] = 0.1; b.shL[0] = 0.1; b.elR[0] = -0.3; b.elL[0] = -0.3; b.hips[2] += Math.sin(this.t * 9) * 0.12; b.P[1] -= 0.05; }
      if (this.mode === 'victory') {
        this.vt = (this.vt || 0) + dt;
        const k = smooth(this.vt / 0.5);
        const v = zero();
        v.shR = [-2.75, 0, -0.3]; v.elR = [-0.2, 0, 0]; v.wrR = [0, 0, 0]; v.shL = [-0.5, 0.2, 0.6]; v.elL = [-1.2, 0, 0];
        v.spine = [-0.25, 0.0, 0]; v.head = [-0.5, 0, 0]; v.hips = [0, 0, 0];
        v.hipL = [-0.15, 0, 0.1]; v.hipR = [0.0, 0, -0.1]; v.kneeL = [0.2, 0, 0]; v.kneeR = [0.2, 0, 0];
        // anula guardia
        for (const j of J) for (let i = 0; i < 3; i++) b[j][i] = b[j][i] * (1 - k) + v[j][i] * k;
        b.shR[0] += Math.sin(this.t * 4) * 0.12 * k; b.spine[1] = Math.sin(this.t * 1.5) * 0.2 * k;
        b.P[1] = -0.02 + Math.abs(Math.sin(this.t * 3)) * 0.03 * k;
      }
    }

    // acción superpuesta
    let overlayW = 0;
    const tmp = this.tmp;
    if (this.action) {
      const A = this.action;
      A.t += dt * (A.timeScale || 1);
      const dur = A.dur;
      this.sampleKeys(A.keys, Math.min(A.t, dur), tmp);
      // los deltas ya incorporan la entrada/salida (empiezan y acaban en 0)
      addTo(b, tmp, 1);
      if (A.spin) { this.spinAcc = A.t < A.spin[0] ? 0 : Math.min(A.spin[2], (A.t - A.spin[0]) / (A.spin[1] - A.spin[0]) * A.spin[2]); }
      else this.spinAcc = 0;
      if (A.t >= dur) { this.action = null; this.spinAcc = 0; }
    } else this.spinAcc = 0;

    // flinch aditivo
    if (this.flinch > 0.001) {
      const f = this.flinch; this.flinch *= Math.exp(-dt * 9);
      b.spine[0] -= 0.3 * f; b.head[0] -= 0.25 * f; b.chest[0] -= 0.1 * f; b.P[2] -= 0.04 * f; b.shL[0] += 0.3 * f; b.shR[0] += 0.3 * f;
    }
    // suavizado de la pose final
    const k = 1 - Math.exp(-dt * (this.mode === 'display' ? 12 : 22));
    for (const j of J) { const p = P[j], t = b[j]; p[0] += (t[0] - p[0]) * k; p[1] += (t[1] - p[1]) * k; p[2] += (t[2] - p[2]) * k; }
    P.P[0] += (b.P[0] - P.P[0]) * k; P.P[1] += (b.P[1] - P.P[1]) * k; P.P[2] += (b.P[2] - P.P[2]) * k;
    this.applyPose();
  }

  updateDead(dt) {
    this.deadT += dt;
    const t = this.deadT;
    const fall = easeOut(t / 0.75);
    const b = this.base;
    for (const j of J) { b[j][0] = 0; b[j][1] = 0; b[j][2] = 0; }
    // extremidades lánguidas
    b.shR = [0.3 + fall * 0.5, 0, -0.4 * fall]; b.shL = [0.3 + fall * 0.5, 0, 0.4 * fall]; b.elR = [-0.3 * fall, 0, 0]; b.elL = [-0.3 * fall, 0, 0];
    b.hipL = [-0.3 * fall, 0, 0.15 * fall]; b.hipR = [0.15 * fall, 0, -0.2 * fall]; b.kneeL = [0.4 * fall, 0, 0]; b.kneeR = [0.6 * fall, 0, 0];
    b.head = [0.2 * fall, 0.3 * fall * this.deadDir, 0]; b.spine = [0.1 * fall, 0, 0];
    b.P = [0, 0, 0];
    const k = 1 - Math.exp(-dt * 14);
    for (const j of J) { const p = this.cur[j], tt = b[j]; p[0] += (tt[0] - p[0]) * k; p[1] += (tt[1] - p[1]) * k; p[2] += (tt[2] - p[2]) * k; }
    this.cur.P = [0, 0, 0];
  }

  applyPose() {
    const B = this.av.bones, P = this.cur;
    for (const j of J) {
      const bone = B[BONE[j]];
      if (!bone) continue;
      if (bone.rotation.order !== 'YXZ' && ORDER_YXZ.has(j)) bone.rotation.order = 'YXZ';
      bone.rotation.set(P[j][0], P[j][1], P[j][2]);
    }
    const base = this.av.hipBase ?? 0.84;
    if (this.mode === 'dead') {
      const t = this.deadT;
      const fall = easeOut(t / 0.8);
      // cae hacia atrás (o de lado) pivotando sobre los pies y se tumba
      const root = B.root;
      root.rotation.set(-Math.PI / 2 * 0.96 * fall * (this.deadDir > 0 ? 1 : 0.6) + 0, 0, this.deadDir * 0.3 * fall, 'XYZ');
      if (this.deadDir < 0) root.rotation.x = -Math.PI / 2 * 0.96 * fall * 0.6 + (Math.PI / 2 * 0.9 * fall) * 0.0;
      root.position.y = (0.12) * fall + (t < 0.15 ? Math.sin(t / 0.15 * Math.PI) * 0.0 : 0);
      B.hips.position.y = base - 0.05 * fall;
      return;
    }
    const root = B.root;
    root.rotation.set(0, this.spinAcc, 0);
    root.position.y = 0;
    B.hips.position.set(P.P[0], base + P.P[1], P.P[2]);
  }

  resetBones() {
    const B = this.av.bones;
    B.root.rotation.set(0, 0, 0); B.root.position.y = 0;
  }
}

export { CAST };
