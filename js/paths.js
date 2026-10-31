// Paths you lay yourself, one 1 m square at a time (S.paths = {"i,j": kind}): bare dirt, gravel, flagstones, red brick and a
// wooden boardwalk. Each kind is one mesh of terrain-hugging squares with a painted texture laid in world space, so neighbouring
// squares join seamlessly; dirt and gravel fade out at their open edges (a worn track, not a cut-out), the built ones keep a
// clean edge and sit a little proud of the ground.
import * as THREE from 'three';

export const PATH_KINDS = {
  dirt:  {name:'泥土路', price:1, icon:'🟫', desc:'把草除掉，露出泥土的小路。邊緣自然，像走出來的路。', soft:true, lift:0.015, tile:3},
  gravel:{name:'碎石路', price:2, icon:'🪨', desc:'鋪滿小碎石的路，走起來沙沙響。', soft:true, lift:0.02, tile:2},
  stone: {name:'石板路', price:3, icon:'🧱', desc:'一塊一塊不規則的石板，縫裡長著一點青苔。', lift:0.035, tile:2},
  brick: {name:'紅磚路', price:3, icon:'🟥', desc:'整齊的紅磚步道。', lift:0.035, tile:2},
  wood:  {name:'木棧道', price:4, icon:'🪵', desc:'木板鋪成的步道，適合水邊和花園。', lift:0.06, tile:2},
};

function canvasTex(draw, size = 256){
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const x = cv.getContext('2d'); draw(x, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
let seed = 11; const R = () => (seed = (seed*16807) % 2147483647)/2147483647;
const speckle = (x, s, n, cols, r0, r1) => { for (let i=0;i<n;i++){ x.fillStyle = cols[Math.floor(R()*cols.length)]; x.beginPath(); x.arc(R()*s, R()*s, r0 + R()*(r1 - r0), 0, Math.PI*2); x.fill(); } };
// drawn on a 3x3 grid of copies so shapes crossing an edge wrap round (the texture tiles without seams)
const wrapped = (x, s, f) => { for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]){ x.save(); x.translate(dx, dy); f(); x.restore(); } };
const TEX = {
  dirt: () => canvasTex((x, s) => { x.fillStyle = '#8a6a48'; x.fillRect(0, 0, s, s);
    speckle(x, s, 900, ['#7a5c3e', '#957556', '#6e5236', '#a08060'], 1, 4); speckle(x, s, 60, ['#5f4630', '#b39572'], 2, 6); }),
  gravel: () => canvasTex((x, s) => { x.fillStyle = '#9b927f'; x.fillRect(0, 0, s, s);
    for (let i=0;i<1400;i++){ const px = R()*s, py = R()*s, r = 1.5 + R()*3.5, l = 120 + Math.floor(R()*90);
      x.fillStyle = `rgb(${l},${l - 6},${l - 18})`; x.beginPath(); x.ellipse(px, py, r, r*(0.6 + R()*0.4), R()*3, 0, Math.PI*2); x.fill();
      x.fillStyle = 'rgba(40,35,30,0.25)'; x.beginPath(); x.ellipse(px + 0.8, py + 1, r, r*0.5, 0, 0, Math.PI*2); x.fill(); } }),
  stone: () => canvasTex((x, s) => { x.fillStyle = '#5b6b45'; x.fillRect(0, 0, s, s);   // the gaps: moss and soil
    speckle(x, s, 300, ['#4c5e3a', '#6b7a4f', '#5e5040'], 1, 3);
    const n = 9, pts = []; for (let i=0;i<n;i++) pts.push([R()*s, R()*s]);
    // flagstones: each pixel to its nearest seed (a Voronoi pattern), shrunk a little so the joints show
    const img = x.getImageData(0, 0, s, s), d = img.data, tone = pts.map(() => 112 + Math.floor(R()*40));
    for (let py=0;py<s;py++) for (let px=0;px<s;px++){ let a = 1e9, b = 1e9, k = 0;
      for (let i=0;i<n;i++) for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]){ const dd = Math.hypot(px - pts[i][0] - ox, py - pts[i][1] - oy); if (dd < a){ b = a; a = dd; k = i; } else if (dd < b) b = dd; }
      if (b - a > 5){ const l = tone[k] + (Math.random() - 0.5)*14 - Math.max(0, 9 - (b - a))*3, j = (py*s + px)*4; d[j] = l; d[j + 1] = l - 4; d[j + 2] = l - 12; } }
    x.putImageData(img, 0, 0); }),
  brick: () => canvasTex((x, s) => { x.fillStyle = '#b8ab98'; x.fillRect(0, 0, s, s);   // mortar
    const bw = s/4, bh = s/8;
    for (let r=0;r<8;r++) for (let c=-1;c<5;c++){ const ox = (r % 2)*bw/2, l = R();
      x.fillStyle = `rgb(${150 + Math.floor(l*50)},${62 + Math.floor(l*25)},${48 + Math.floor(l*18)})`; x.fillRect(c*bw + ox + 3, r*bh + 3, bw - 6, bh - 6);
      x.fillStyle = 'rgba(255,220,190,0.12)'; x.fillRect(c*bw + ox + 3, r*bh + 3, bw - 6, 3); } }),
  wood: () => canvasTex((x, s) => { const pw = s/6;
    for (let i=0;i<6;i++){ const l = R(); x.fillStyle = `rgb(${140 + Math.floor(l*40)},${98 + Math.floor(l*30)},${60 + Math.floor(l*20)})`; x.fillRect(0, i*pw, s, pw);
      x.strokeStyle = 'rgba(70,45,25,0.35)'; x.lineWidth = 1; for (let k=0;k<7;k++){ const y = i*pw + 3 + R()*(pw - 6); x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(s*0.3, y + R()*4 - 2, s*0.6, y + R()*4 - 2, s, y); x.stroke(); }
      x.fillStyle = 'rgba(45,28,15,0.8)'; x.fillRect(0, i*pw, s, 2.5);   // the gap between boards
      for (const nx of [s*0.12, s*0.62]){ x.fillStyle = '#3d3a36'; x.beginPath(); x.arc(nx, i*pw + pw*0.3, 2, 0, 7); x.arc(nx, i*pw + pw*0.72, 2, 0, 7); x.fill(); } } }),
};

export function createPaths({scene, gy, normal}){
  const group = new THREE.Group(); scene.add(group);
  const mats = {}, meshes = {};
  const matFor = k => mats[k] || (mats[k] = new THREE.MeshLambertMaterial({map:TEX[k](), color:'#c8c8c8', vertexColors:true, transparent:!!PATH_KINDS[k].soft, depthWrite:!PATH_KINDS[k].soft,
    polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2}));
  function rebuild(paths){
    const by = {}; for (const [key, k] of Object.entries(paths || {})){ if (!PATH_KINDS[k]) continue; (by[k] || (by[k] = [])).push(key.split(',').map(Number)); }
    for (const k of Object.keys(PATH_KINDS)){ if (meshes[k]){ group.remove(meshes[k]); meshes[k].geometry.dispose(); delete meshes[k]; }
      const cells = by[k]; if (!cells || !cells.length) continue;
      const K = PATH_KINDS[k], has = (i, j) => paths[i + ',' + j] === k || (K.soft && PATH_KINDS[paths[i + ',' + j]] && PATH_KINDS[paths[i + ',' + j]].soft);
      const pos = [], nor = [], uv = [], col = [], idx = [];
      for (const [i, j] of cells){ const base = pos.length/3;
        for (let b=0;b<=2;b++) for (let a=0;a<=2;a++){   // 3x3 vertices: corners, edge middles, centre
          const x = i + a/2, z = j + b/2, n = normal(x, z), y = gy(x, z) + K.lift;
          let al = 1;
          if (K.soft){ const di = a - 1, dj = b - 1;   // open sides fade out (worn edges), a little uneven
            const open = (di && !has(i + di, j)) || (dj && !has(i, j + dj)) || (di && dj && !has(i + di, j + dj));
            if (open) al = 0.08 + 0.3*(0.5 + 0.5*Math.sin(x*3.7 + z*2.3)); }
          pos.push(x, y, z); nor.push(n.x, n.y, n.z); uv.push(x/K.tile, z/K.tile); col.push(1, 1, 1, al); }
        for (let b=0;b<2;b++) for (let a=0;a<2;a++){ const v = base + b*3 + a; idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4); } }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, matFor(k)); m.renderOrder = K.soft ? -1 : 0; m.userData.kind = 'ground'; group.add(m); meshes[k] = m; }
  }
  return {group, rebuild};
}
