// ────────────────────────────────────────────────────────────────────────────
//  Texturas procedurales (canvas 2D): color + normal map para cada material.
//  Todo se genera en tiempo de ejecución: cero assets externos.
// ────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three/webgpu';

// ruido de valor con hash entero, determinista
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a) => (period ? ((a % period) + period) % period : a);
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s);
  const c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, s = 1, period = 0) {
  let v = 0, a = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x * f, y * f, s + i * 17, period ? period * f : 0);
    tot += a; a *= 0.5; f *= 2;
  }
  return v / tot;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// Convierte un campo de altura (Float32Array) en un normal map.
function heightToNormal(h, w, hh, strength = 2) {
  const c = makeCanvas(w, hh);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const l = h[y * w + ((x - 1 + w) % w)], r = h[y * w + ((x + 1) % w)];
    const u = h[((y - 1 + hh) % hh) * w + x], d = h[((y + 1) % hh) * w + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function buildMaterialTex(size, colorFn, heightFn, { normalStrength = 2.5 } = {}) {
  const col = makeCanvas(size, size), cctx = col.getContext('2d');
  const img = cctx.createImageData(size, size);
  const hf = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const hv = heightFn(u, v, x, y);
    hf[y * size + x] = hv;
    const [r, g, b] = colorFn(u, v, hv, x, y);
    const i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  cctx.putImageData(img, 0, 0);
  return { map: toTexture(col), normalMap: toTexture(heightToNormal(hf, size, size, normalStrength), { srgb: false }) };
}

const mix = (a, b, t) => a + (b - a) * t;
const hex = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ── arena / arena de entrenamiento ─────────────────────────────────────────
export function sandTex(size = 512, tint = '#d9b27c') {
  const base = hex(tint);
  return buildMaterialTex(size, (u, v, h) => {
    const big = fbm(u * 6, v * 6, 4, 9, 6);
    const grain = hash2(Math.floor(u * size), Math.floor(v * size), 3);
    const k = 0.78 + big * 0.35 + (grain - 0.5) * 0.12 + h * 0.18;
    return [base[0] * k, base[1] * k, base[2] * k * 0.98];
  }, (u, v) => fbm(u * 24, v * 24, 4, 5, 24) * 0.7 + fbm(u * 120, v * 120, 2, 2, 120) * 0.3, { normalStrength: 3.2 });
}

export function stoneTex(size = 512, { block = [4, 6], tint = '#cbb99a', dark = 0.6 } = {}) {
  const base = hex(tint);
  const [bx, by] = block;
  return buildMaterialTex(size, (u, v, h) => {
    const row = Math.floor(v * by);
    const off = (row % 2) * 0.5;
    const cu = ((u * bx + off) % 1 + 1) % 1, cv = (v * by) % 1;
    const id = Math.floor(u * bx + off) + row * 13;
    const tone = 0.85 + hash2(id, row, 4) * 0.25;
    const edge = Math.min(cu, 1 - cu, cv * (bx / by) * 0.0 + Math.min(cv, 1 - cv)) ;
    const mortar = edge < 0.035 ? 0 : edge < 0.07 ? (edge - 0.035) / 0.035 : 1;
    const n = fbm(u * 18, v * 18, 4, 7, 18);
    const k = tone * (0.75 + n * 0.45) * mix(dark, 1, mortar);
    return [base[0] * k, base[1] * k, base[2] * k];
  }, (u, v) => {
    const row = Math.floor(v * by);
    const off = (row % 2) * 0.5;
    const cu = ((u * bx + off) % 1 + 1) % 1, cv = (v * by) % 1;
    const edge = Math.min(cu, 1 - cu, Math.min(cv, 1 - cv));
    const m = Math.min(1, edge / 0.06);
    return m * 0.7 + fbm(u * 40, v * 40, 3, 11, 40) * 0.3;
  }, { normalStrength: 4 });
}

export function plasterTex(size = 512, tint = '#d8c7a3') {
  const base = hex(tint);
  return buildMaterialTex(size, (u, v, h) => {
    const n = fbm(u * 8, v * 8, 5, 21, 8);
    const s = fbm(u * 60, v * 60, 2, 33, 60);
    const k = 0.72 + n * 0.5 + (s - 0.5) * 0.12;
    return [base[0] * k, base[1] * k, base[2] * k];
  }, (u, v) => fbm(u * 30, v * 30, 4, 12, 30), { normalStrength: 1.8 });
}

export function woodTex(size = 256, tint = '#7a5230') {
  const base = hex(tint);
  return buildMaterialTex(size, (u, v, h) => {
    const w = Math.sin((u + fbm(u * 3, v * 12, 3, 4, 3) * 0.35) * 40) * 0.5 + 0.5;
    const k = 0.62 + w * 0.3 + fbm(u * 50, v * 6, 3, 8, 50) * 0.22;
    return [base[0] * k, base[1] * k, base[2] * k];
  }, (u, v) => Math.sin((u + fbm(u * 3, v * 12, 3, 4, 3) * 0.35) * 40) * 0.5 + 0.5, { normalStrength: 1.5 });
}

export function leatherTex(size = 256, tint = '#6b3f22') {
  const base = hex(tint);
  return buildMaterialTex(size, (u, v, h) => {
    const k = 0.7 + h * 0.4 + fbm(u * 6, v * 6, 3, 2, 6) * 0.25;
    return [base[0] * k, base[1] * k, base[2] * k];
  }, (u, v) => {
    // piel granulada: celdas tipo worley barato
    const x = u * 48, y = v * 48;
    const xi = Math.floor(x), yi = Math.floor(y);
    let d = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = ((xi + i) % 48 + 48) % 48, cy = ((yi + j) % 48 + 48) % 48;
      const px = xi + i + hash2(cx, cy, 3), py = yi + j + hash2(cx, cy, 4);
      d = Math.min(d, Math.hypot(x - px, y - py));
    }
    return Math.min(1, d * 0.9);
  }, { normalStrength: 3 });
}

export function clothTex(size = 256, tint = '#8a1f25') {
  const base = hex(tint);
  return buildMaterialTex(size, (u, v, h) => {
    const k = 0.7 + h * 0.4 + fbm(u * 5, v * 5, 3, 6, 5) * 0.2;
    return [base[0] * k, base[1] * k, base[2] * k];
  }, (u, v) => {
    const a = Math.sin(u * Math.PI * 2 * 64) * 0.5 + 0.5, b = Math.sin(v * Math.PI * 2 * 64) * 0.5 + 0.5;
    return a * 0.5 + b * 0.5;
  }, { normalStrength: 1.2 });
}

export function metalTex(size = 256) {
  return buildMaterialTex(size, (u, v, h) => {
    const k = 0.72 + fbm(u * 2, v * 40, 3, 5, 0) * 0.35 + h * 0.1;
    return [k * 255, k * 255, k * 255];
  }, (u, v) => fbm(u * 3, v * 90, 3, 13, 0) * 0.6 + fbm(u * 20, v * 20, 2, 14, 20) * 0.4, { normalStrength: 1.5 });
}

export function grassTex(size = 512) {
  return buildMaterialTex(size, (u, v, h) => {
    const n = fbm(u * 10, v * 10, 5, 41, 10), n2 = fbm(u * 70, v * 70, 2, 42, 70);
    const k = 0.6 + n * 0.7 + (n2 - 0.5) * 0.3;
    return [70 * k, 92 * k, 42 * k];
  }, (u, v) => fbm(u * 60, v * 60, 3, 9, 60), { normalStrength: 2 });
}

// ── sprites de partículas ───────────────────────────────────────────────────
export function softCircle(size = 128, hard = 0.0) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, size * 0.5 * hard, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return toTexture(c, { srgb: true, repeat: false });
}
export function smokePuff(size = 128) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x / size - 0.5) * 2, dy = (y / size - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    const n = fbm(x / size * 5, y / size * 5, 4, 77, 0);
    const a = Math.max(0, 1 - r) ** 1.4 * (0.45 + n * 0.8);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: true, repeat: false });
}
export function streakTex(size = 64) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, size, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, size * 0.42, size, size * 0.16);
  return toTexture(c, { srgb: true, repeat: false });
}
export function ringTex(size = 256) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.9, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return toTexture(c, { srgb: true, repeat: false });
}
export function flameTex(size = 128) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size - 0.5, v = 1 - y / size; // v 0..1 de abajo arriba
    const w = 0.42 * (1 - v) ** 0.7 * (0.35 + 0.65 * Math.sin(Math.min(1, v * 3.2) * Math.PI * 0.5));
    const n = fbm(x / size * 4, y / size * 6, 3, 88, 0) - 0.5;
    const d = Math.abs(u + n * 0.25 * v) / Math.max(0.001, w);
    const a = Math.max(0, 1 - d) * Math.min(1, (1 - v) * 3.0 + 0.2) ** 0.8;
    const i = (y * size + x) * 4;
    // gradiente de color: blanco-amarillo en el núcleo a naranja-rojo en el borde
    const heat = Math.max(0, Math.min(1, a * 1.3 - v * 0.3));
    img.data[i] = 255; img.data[i + 1] = 120 + heat * 135; img.data[i + 2] = 30 + heat * 170; img.data[i + 3] = Math.min(255, a * 255 * 1.3);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: true, repeat: false });
}

// ── decal de arena dinámico: huellas y manchas ──────────────────────────────
export class SandDecals {
  constructor(size = 1024, worldSize = 34) {
    this.size = size; this.worldSize = worldSize;
    this.canvas = makeCanvas(size, size);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.dirty = false;
    this.clear();
  }
  clear() {
    this.ctx.clearRect(0, 0, this.size, this.size);
    // marcas de rastrillo concéntricas muy tenues
    this.ctx.strokeStyle = 'rgba(90,60,30,0.10)'; this.ctx.lineWidth = 2;
    for (let r = 40; r < this.size / 2; r += 22) { this.ctx.beginPath(); this.ctx.arc(this.size / 2, this.size / 2, r, 0, Math.PI * 2); this.ctx.stroke(); }
    this.dirty = true;
  }
  toPx(x, z) { return [(x / this.worldSize + 0.5) * this.size, (z / this.worldSize + 0.5) * this.size]; }
  foot(x, z, yaw, a = 0.22) {
    const [px, py] = this.toPx(x, z);
    const c = this.ctx; c.save(); c.translate(px, py); c.rotate(-yaw);
    c.fillStyle = `rgba(70,45,22,${a})`;
    c.beginPath(); c.ellipse(0, 0, 4.5, 8.5, 0, 0, Math.PI * 2); c.fill();
    this.dirty = true; c.restore();
  }
  scuff(x, z, len = 40, a = 0.15) {
    const [px, py] = this.toPx(x, z);
    const c = this.ctx; c.strokeStyle = `rgba(80,55,30,${a})`; c.lineWidth = 3;
    const ang = Math.random() * 6.28;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); c.stroke(); this.dirty = true;
  }
  stain(x, z, r = 10, col = '90,18,14', a = 0.35) {
    const [px, py] = this.toPx(x, z);
    const c = this.ctx;
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(${col},${a * (0.4 + Math.random() * 0.6)})`;
      c.beginPath(); c.arc(px + (Math.random() - 0.5) * r * 1.6, py + (Math.random() - 0.5) * r * 1.6, r * (0.2 + Math.random() * 0.5), 0, 6.28); c.fill();
    }
    this.dirty = true;
  }
  crack(x, z, r = 4, a = 0.55) {
    const [px, py] = this.toPx(x, z);
    const c = this.ctx; c.strokeStyle = `rgba(40,25,12,${a})`; c.lineCap = 'round';
    const rad = r / this.worldSize * this.size;
    for (let i = 0; i < 9; i++) {
      let ang = (i / 9) * 6.283 + Math.random() * 0.4, cx = px, cy = py;
      c.lineWidth = 3.5; c.beginPath(); c.moveTo(cx, cy);
      for (let k = 0; k < 6; k++) { ang += (Math.random() - 0.5) * 0.9; const l = rad / 6 * (0.6 + Math.random() * 0.8); cx += Math.cos(ang) * l; cy += Math.sin(ang) * l; c.lineTo(cx, cy); c.lineWidth = Math.max(1, 3.5 - k * 0.5); }
      c.stroke();
    }
    c.fillStyle = `rgba(60,40,20,${a * 0.4})`; c.beginPath(); c.arc(px, py, rad * 0.25, 0, 6.28); c.fill();
    this.dirty = true;
  }
  flush() { if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; } }
}

export function cloudTex(size = 512) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let n = fbm(u * 5, v * 5, 6, 61, 5);
    n = Math.max(0, (n - 0.42) * 2.6);
    const d = Math.min(1, n);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = d * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}
