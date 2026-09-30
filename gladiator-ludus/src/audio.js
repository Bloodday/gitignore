// ────────────────────────────────────────────────────────────────────────────
//  Audio 100 % procedural con WebAudio: impactos, acero, multitud, cuernos,
//  percusión de guerra y ambiente. Cero archivos de sonido.
// ────────────────────────────────────────────────────────────────────────────
export class GameAudio {
  constructor() {
    this.ctx = null; this.enabled = true; this.musicOn = true;
    this.crowdLevel = 0.2; this.mode = 'ludus'; this.hype = 0;
    this.nextBeat = 0; this.beat = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0.5; this.mus.connect(this.master);
    // reverb sintética (impulso de ruido decreciente)
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35; this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // ruido rosa base
    const nl = ctx.sampleRate * 3, nb = ctx.createBuffer(1, nl, ctx.sampleRate), nd = nb.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < nl; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; nd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    this.noiseBuf = nb;
    // multitud continua
    this.crowd = ctx.createBufferSource(); this.crowd.buffer = nb; this.crowd.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    this.crowdLfo = ctx.createOscillator(); this.crowdLfo.frequency.value = 0.23; const lg = ctx.createGain(); lg.gain.value = 180; this.crowdLfo.connect(lg); lg.connect(bp.frequency); this.crowdLfo.start();
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
    this.crowd.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master); this.crowdGain.connect(this.verb);
    this.crowd.start();
    // viento / ambiente
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.08;
    wind.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master); wind.start();
    // drone musical
    this.startDrone();
  }

  startDrone() {
    const ctx = this.ctx;
    this.drone = ctx.createGain(); this.drone.gain.value = 0.0; this.drone.connect(this.mus); this.drone.connect(this.verb);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(this.drone);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    for (const [f, d] of [[55, -6], [55, 7], [82.4, 3], [110, -4], [164.8, 2]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const g = ctx.createGain(); g.gain.value = f < 100 ? 0.11 : 0.04; o.connect(g); g.connect(lp); o.start();
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.drone.gain.cancelScheduledValues(t); this.drone.gain.linearRampToValueAtTime(this.musicOn ? (mode === 'arena' ? 0.35 : 0.22) : 0, t + 1.5);
    this.windGain.gain.linearRampToValueAtTime(mode === 'arena' ? 0.03 : 0.1, t + 1.5);
  }
  setCrowd(v) {
    this.crowdLevel = v;
    if (!this.ctx) return;
    this.crowdGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.crowdGain.gain.linearRampToValueAtTime(this.enabled ? v * 0.5 : 0, this.ctx.currentTime + 0.25);
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.8 : 0; }
  setMusic(on) { this.musicOn = on; if (this.ctx) this.drone.gain.linearRampToValueAtTime(on ? (this.mode === 'arena' ? 0.35 : 0.22) : 0, this.ctx.currentTime + 0.4); }

  // ── utilidades ───────────────────────────────────────────────────────────
  noise(dur, filterType, f0, f1, vol, dest = this.sfx, q = 1, when = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 2, dur + 0.05);
  }
  tone(type, f0, f1, dur, vol, dest = this.sfx, when = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // ── efectos de combate ───────────────────────────────────────────────────
  swoosh(power = 1) { this.noise(0.16 + 0.05 * power, 'bandpass', 500, 2600, 0.12 * power, this.sfx, 1.2); }
  hit(power = 1, crit = false) {
    if (!this.ctx) return;
    this.noise(0.12, 'lowpass', 1400, 200, 0.5 * power);
    this.tone('sine', 140, 45, 0.18 + 0.1 * power, 0.55 * power);
    if (crit) { this.noise(0.25, 'highpass', 3000, 1000, 0.22); this.tone('square', 300, 80, 0.15, 0.12); }
  }
  clang(power = 1) {
    if (!this.ctx) return;
    const base = 900 + Math.random() * 500;
    [1, 1.52, 2.31, 3.08, 4.4].forEach((m, i) => this.tone('sine', base * m, base * m * 0.995, 0.35 - i * 0.04, 0.16 * power / (i + 1)));
    this.noise(0.05, 'highpass', 4000, 3000, 0.25 * power);
    const verbSend = this.ctx.createGain(); verbSend.gain.value = 0.3;
  }
  thud() { this.tone('sine', 90, 35, 0.4, 0.7); this.noise(0.3, 'lowpass', 600, 80, 0.4); }
  whiff() { this.swoosh(0.6); }
  step() { this.noise(0.05, 'lowpass', 500, 200, 0.05); }
  death() { this.thud(); this.roar(1.0, 0.5); }
  roar(power = 1, dur = 1.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(Math.min(1.2, 0.35 + power * 0.6), t + 0.12);
    this.crowdGain.gain.linearRampToValueAtTime(this.enabled ? this.crowdLevel * 0.5 : 0, t + dur);
  }
  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.25); g.gain.setValueAtTime(0.35, t + 1.4); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    lp.connect(g); g.connect(this.master); g.connect(this.verb);
    for (const [f, d] of [[146.8, 0], [146.8, 8], [220, -5], [293.7, 4]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.9, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.3); o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + 2.5); }
  }
  cast(kind) {
    if (!this.ctx) return;
    switch (kind) {
      case 'cry': this.horn(); this.noise(0.6, 'bandpass', 300, 900, 0.3); break;
      case 'quake': this.thud(); this.noise(0.8, 'lowpass', 300, 40, 0.8); break;
      case 'jove': this.noise(1.0, 'bandpass', 4000, 300, 0.7, this.sfx, 0.5); this.tone('sawtooth', 60, 30, 0.9, 0.3); break;
      case 'pray': [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 1.0, 0.1, this.sfx, i * 0.08)); break;
      case 'frenzy': this.noise(0.6, 'bandpass', 200, 1000, 0.35); this.tone('sawtooth', 110, 220, 0.5, 0.15); break;
      case 'leap': this.swoosh(1.4); break;
      case 'whirl': this.noise(1.2, 'bandpass', 400, 1800, 0.22, this.sfx, 2); break;
      case 'net': this.swoosh(0.9); break;
      default: this.swoosh(1.1);
    }
  }
  bolt() { this.noise(0.5, 'highpass', 3000, 800, 0.8, this.sfx, 0.4); this.tone('sawtooth', 80, 30, 0.6, 0.5); this.thud(); }
  stun() { this.tone('triangle', 900, 700, 0.2, 0.08); }

  // ── interfaz ─────────────────────────────────────────────────────────────
  click() { this.tone('triangle', 620, 500, 0.06, 0.1); }
  hover() { this.tone('sine', 900, 900, 0.03, 0.03); }
  coin() { this.tone('triangle', 1400, 1400, 0.09, 0.12); this.tone('triangle', 2100, 2100, 0.14, 0.1, this.sfx, 0.06); }
  buy() { this.tone('triangle', 500, 500, 0.08, 0.12); this.tone('triangle', 750, 750, 0.1, 0.12, this.sfx, 0.07); this.tone('triangle', 1000, 1000, 0.18, 0.12, this.sfx, 0.14); }
  deny() { this.tone('sawtooth', 160, 120, 0.18, 0.12); }
  levelUp() { [392, 494, 587, 784, 988].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.14, this.sfx, i * 0.09)); }
  skillLearn(r = 0) {
    const scale = [523, 659, 784, 988, 1175];
    scale.slice(0, 3 + r).forEach((f, i) => this.tone('sine', f, f, 0.7, 0.13, this.sfx, i * 0.08));
    if (r >= 2) this.tone('sawtooth', 196, 196, 1.2, 0.08);
  }
  victory() { [262, 330, 392, 523].forEach((f, i) => this.tone('sawtooth', f, f, 0.9, 0.08, this.sfx, i * 0.12)); this.roar(1.2, 3); }
  defeat() { [330, 311, 294, 262].forEach((f, i) => this.tone('sawtooth', f, f, 0.8, 0.07, this.sfx, i * 0.22)); }
  equip() { this.noise(0.08, 'highpass', 3000, 2000, 0.2); this.tone('sine', 700, 500, 0.1, 0.08); }

  // ── percusión de guerra (taiko) ──────────────────────────────────────────
  update(dt) {
    if (!this.ctx || !this.enabled || !this.musicOn) return;
    const t = this.ctx.currentTime;
    if (this.mode !== 'arena') {
      // melodía tranquila: arpegio de lira en escala frigia
      if (this.nextNote === undefined || this.nextNote < t - 1) this.nextNote = t + 0.5;
      while (this.nextNote < t + 0.15) {
        const sc = [220, 233.1, 277.2, 329.6, 349.2, 440, 466.2, 554.4];
        this.noteIdx = ((this.noteIdx ?? 0) + (Math.random() < 0.6 ? 1 : -1) + (Math.random() < 0.15 ? 3 : 0) + sc.length * 4) % sc.length;
        if (Math.random() < 0.7) this.pluck(sc[this.noteIdx], this.nextNote - t);
        this.nextNote += 0.9 + Math.random() * 0.9;
      }
      return;
    }
    const bpm = 78 + this.hype * 34, step = 60 / bpm / 2;
    if (this.nextBeat < t - 0.2) this.nextBeat = t + 0.05;
    while (this.nextBeat < t + 0.12) {
      const b = this.beat % 16;
      if (this.hype > 0.5 && b % 4 === 2) this.pluck([196, 233.1, 261.6, 293.7][(this.beat >> 2) % 4] * 0.5, this.nextBeat - t);
      const loud = b % 8 === 0 ? 1 : b % 4 === 0 ? 0.65 : (b % 2 === 0 && this.hype > 0.25) ? 0.35 : (this.hype > 0.6 && b % 2 === 1 ? 0.22 : 0);
      if (loud > 0) this.drum(loud, this.nextBeat - t);
      this.nextBeat += step; this.beat++;
    }
  }
  pluck(f, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + Math.max(0, when);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(g); o2.connect(g); g.connect(this.mus); g.connect(this.verb); o.start(t); o2.start(t); o.stop(t + 1.9); o2.stop(t + 1.9);
  }
  drum(v, when) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.max(0, when);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.mus); g.connect(this.verb); o.start(t); o.stop(t + 0.7);
    this.noise(0.12, 'lowpass', 900, 200, 0.2 * v, this.mus, 1, Math.max(0, when));
  }
}
