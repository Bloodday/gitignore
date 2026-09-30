// Visor de modelos para desarrollo: /debug.html?cam=x,y,z,tx,ty,tz&r=rareza&webgl
import './gpu-shim.js';
import './style.css';
import * as THREE from 'three/webgpu';
import { Engine } from './engine.js';
import { Avatar } from './model.js';
import { Animator, CAST } from './animator.js';
import { genGladiator, genEnemy } from './game.js';
import { CLASSES, BOSSES, VENUES } from './data.js';
const q = new URLSearchParams(location.search);
const eng = new Engine();
await eng.init(document.getElementById('app'), 1);
eng.setSun(0.5, +(q.get('sun') || 330), '#fff0d8', { zenith: '#2a58a8', mid: '#8fb0da', horizon: '#f7dcb4', fog: '#d9c6a2' });
const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardNodeMaterial({ color: 0xb08a5c, roughness: 1 }));
g.rotation.x = -Math.PI / 2; g.receiveShadow = true; eng.scene.add(g);
const ans = [];
const rar = +(q.get('r') ?? 3);
const list = Object.keys(CLASSES);
const n = +(q.get('n') || 6);
list.slice(0, n).forEach((c, i) => {
  const gl = genGladiator({ cls: c, level: 10, quality: 30, female: q.get('f') ? i % 2 === 1 : false });
  for (const k in gl.equip) if (gl.equip[k]) gl.equip[k].rarity = rar;
  const a = new Avatar(gl); a.root.position.set((i - (n - 1) / 2) * 1.9, 0, 0); a.root.rotation.y = +(q.get('ry') || 0.3); eng.scene.add(a.root);
  const an = new Animator(a); an.mode = 'display'; ans.push(an);
});
if (q.get('boss')) BOSSES.forEach((b, i) => { const e = genEnemy(VENUES[2], 15, { boss: b }); const a = new Avatar(e); a.root.position.set((i - 1) * 3.4, 0, -4); eng.scene.add(a.root); const an = new Animator(a); an.mode = 'display'; ans.push(an); });
const c = (q.get('cam') || '0,1.6,7.5,0,1.0,0').split(',').map(Number);
eng.camera.position.set(c[0], c[1], c[2]); eng.camera.lookAt(c[3], c[4], c[5]);
window.__pose = (name, t) => {
  ans.forEach(an => { an.mode = name === 'dead' ? 'combat' : name === 'victory' ? 'combat' : 'display'; an.action = null; });
  ans.forEach(an => { if (name === 'dead') an.die(); else if (name === 'victory') an.victory(); else if (name === 'attack') an.playAttack({ dur: 1, windT: 0.4, hand: 0 }); else if (CAST[name]) an.playCast(name, CAST[name].dur); });
  for (let x = 0; x < t; x += 1 / 60) ans.forEach(an => an.update(1 / 60, 0));
  eng.updateSun(new THREE.Vector3()); eng.render();
};
window.__ready = true;
eng.renderer.setAnimationLoop(() => { if (!window.__freeze) { ans.forEach(an => an.update(1 / 60, 0)); eng.updateSun(new THREE.Vector3()); eng.render(); } });
