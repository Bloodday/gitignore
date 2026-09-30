// Biblioteca de materiales PBR compartidos (se cachean para minimizar pipelines).
import * as THREE from 'three/webgpu';
import { positionLocal, sin, time, vec3, uv, float } from 'three/tsl';
import { leatherTex, clothTex, metalTex, woodTex, stoneTex, plasterTex, sandTex, grassTex } from './textures.js';

let TEX = null;
function tex() {
  if (TEX) return TEX;
  TEX = {
    leather: leatherTex(256, '#8a5a34'),
    cloth: clothTex(256, '#ffffff'),
    metal: metalTex(256),
    wood: woodTex(256, '#8a6038'),
    stone: stoneTex(512, { block: [4, 6], tint: '#d5c4a4' }),
    travertine: stoneTex(512, { block: [2, 3], tint: '#e0cfaa', dark: 0.7 }),
    darkStone: stoneTex(512, { block: [4, 8], tint: '#8c7f70', dark: 0.5 }),
    plaster: plasterTex(512, '#e2d2ae'),
    sand: sandTex(512, '#e0b886'),
    grass: grassTex(512),
  };
  for (const k of ['leather', 'cloth', 'metal', 'wood']) for (const t of [TEX[k].map, TEX[k].normalMap]) { t.repeat.set(1, 1); }
  return TEX;
}
export const T = () => tex();

const cache = new Map();
function std(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function mat(name, color) {
  const t = tex();
  const key = name + (color || '');
  return std(key, () => {
    const M = THREE.MeshStandardNodeMaterial;
    let m;
    switch (name) {
      case 'bronze': m = new M({ color: color || '#e0a152', metalness: 0.85, roughness: 0.38, normalMap: t.metal.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) }); break;
      case 'steel': m = new M({ color: color || '#e4e8ee', metalness: 0.7, roughness: 0.34, normalMap: t.metal.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) }); break;
      case 'iron': m = new M({ color: '#4d5058', metalness: 0.95, roughness: 0.42, normalMap: t.metal.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) }); break;
      case 'gold': m = new M({ color: '#ffcf5a', metalness: 0.9, roughness: 0.3 }); break;
      case 'leather': m = new M({ color: color || '#7a4a28', map: t.leather.map, normalMap: t.leather.normalMap, roughness: 0.72, metalness: 0 }); break;
      case 'cloth': m = new M({ color: color || '#8a1f25', map: t.cloth.map, normalMap: t.cloth.normalMap, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }); break;
      case 'wood': m = new M({ color: color || '#8a6038', map: t.wood.map, normalMap: t.wood.normalMap, roughness: 0.68 }); break;
      case 'enamel': m = new M({ color: '#3c8596', metalness: 0.7, roughness: 0.38, normalMap: t.metal.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }); break;
      case 'crimson': m = new M({ color: '#9a1d2a', metalness: 0.5, roughness: 0.42 }); break;
      case 'cape': {
        m = new M({ color: color || '#8a1f25', roughness: 0.8, side: THREE.DoubleSide });
        const sway = sin(time.mul(1.8).add(positionLocal.y.mul(4.0)).add(positionLocal.x.mul(3.0))).mul(0.035).mul(positionLocal.y.negate().clamp(0, 1));
        m.positionNode = positionLocal.add(vec3(0, 0, sway));
        break;
      }
      case 'bone': m = new M({ color: '#e6dcc4', roughness: 0.6 }); break;
      case 'skin': m = new M({ color, roughness: 0.56, metalness: 0 }); break;
      case 'hair': m = new M({ color, roughness: 0.55, metalness: 0.05 }); break;
      case 'rock': m = new M({ color: color || '#8e8376', roughness: 0.9, map: t.darkStone.map, normalMap: t.darkStone.normalMap }); break;
      case 'dark': m = new M({ color: '#16120f', roughness: 0.5 }); break;
      case 'white': m = new M({ color: '#f4efe6', roughness: 0.6 }); break;
      case 'stone': m = new M({ color: color || '#d8c8a8', map: t.stone.map, normalMap: t.stone.normalMap, roughness: 0.92 }); break;
      case 'travertine': m = new M({ color: color || '#ffffff', map: t.travertine.map, normalMap: t.travertine.normalMap, roughness: 0.9 }); break;
      case 'darkStone': m = new M({ color: color || '#ffffff', map: t.darkStone.map, normalMap: t.darkStone.normalMap, roughness: 0.95 }); break;
      case 'plaster': m = new M({ color: color || '#ffffff', map: t.plaster.map, normalMap: t.plaster.normalMap, roughness: 0.95 }); break;
      default: m = new M({ color: color || '#ffffff' });
    }
    return m;
  });
}

export function glow(color, intensity = 3) {
  return std('glow' + color + intensity, () => {
    const m = new THREE.MeshStandardNodeMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.3, metalness: 0 });
    return m;
  });
}
