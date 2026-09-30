// HUD del combate: barras de equipo, favor de la multitud, registro, banners.
import { CLASSES } from './data.js';
const $ = s => document.querySelector(s);

export class HUD {
  constructor() {
    this.root = $('#fight-hud');
    this.banEl = $('#banner');
    this.logEl = $('#fh-log');
    this.flashEl = $('#flash');
    this.ghost = [1, 1];
  }
  fightShow(show, cfg, roundIdx = 0) {
    this.root.classList.toggle('hidden', !show);
    document.body.classList.toggle('in-fight', show);
    if (show && cfg) {
      $('#fh-venue').textContent = cfg.venue.name + (cfg.rounds.length > 1 ? ` · Ronda ${roundIdx + 1}/${cfg.rounds.length}` : '');
      this.logEl.innerHTML = '';
      const a = cfg.squad.map(g => g.name.split(' ')[0]).join(' · ');
      const b = cfg.rounds[roundIdx].map(g => g.name.split(' ')[0]).join(' · ');
      $('#fh-n0').textContent = a; $('#fh-n1').textContent = b;
    }
  }
  fightUpdate(battle, views) {
    if (!battle) return;
    for (const t of [0, 1]) {
      let hp = 0, max = 0;
      for (const f of battle.teams[t]) { hp += Math.max(0, f.hp); max += f.maxHp; }
      const k = max ? hp / max : 0;
      $('#fh-f' + t).style.width = (k * 100).toFixed(1) + '%';
      $('#fh-g' + t).style.width = (k * 100).toFixed(1) + '%';
    }
    $('#hype-fill').style.width = Math.round(battle.hype * 100) + '%';
  }
  banner(main, sub = '', dur = 2.4, cls = '') {
    const el = this.banEl;
    el.className = ''; void el.offsetWidth;
    el.classList.add('show'); if (cls) el.classList.add(cls);
    el.style.setProperty('--bd', dur + 's');
    el.querySelector('.b-main').textContent = main;
    el.querySelector('.b-sub').textContent = sub;
  }
  log(html, team = 0) {
    const d = document.createElement('div');
    d.className = team === 0 ? '' : 'e'; d.innerHTML = html;
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 5) this.logEl.firstChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 650); }, 6500);
  }
  flash(color = '#fff', amt = 0.3) {
    const f = this.flashEl;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = String(amt);
    requestAnimationFrame(() => { f.style.transition = 'opacity .5s ease-out'; f.style.opacity = '0'; });
  }
}
