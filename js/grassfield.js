// Painted meadow grass over the whole map: a dense field of thin blades drawn on the GPU. Each blade is one instance of a tapered
// strip; the vertex shader bends it with rolling waves of wind (the shimmering bands you see run across a hillside), a quick
// flutter, and parts it around the wombat. The field is cut into 10 m tiles that are made only near the camera (and dropped again
// far away), a few per frame; far tiles draw fewer, wider blades, so a phone only draws the near ones in full. Colour runs from a
// deep root to a sunlit tip, and follows the land: fresh green meadow, golden savanna, thin red-dust outback, olive swamp.
import * as THREE from 'three';

const VERT = `
  attribute vec3 aOff, aCol; attribute vec4 aPar;   // ground position; tip colour; height, yaw, brightness, random
  uniform float uTime, uFar, uCamH; uniform vec2 uWind; uniform vec3 uPet, uCam;
  varying float vH, vWave, vShade, vFog; varying vec3 vCol;
  void main(){
    float h = aPar.x, r = aPar.w;
    vec3 p = position; float y = p.y;
    float dist = distance(aOff, uCam), near = max(0.0, dist - uCamH*0.8);   // (a high camera sees the ground under it as near)
    p.y *= h; p.x *= (0.75 + 0.5*r)*(1.0 + 1.3*smoothstep(uFar*0.25, uFar, dist));   // far blades wider: fewer of them, same cover
    float c = cos(aPar.y), s = sin(aPar.y); p.xz = mat2(c, -s, s, c)*p.xz;
    vec2 wd = normalize(uWind);
    // big slow waves rolling across the field, plus a small per-blade flutter
    float wave = sin(dot(aOff.xz, wd)*0.32 - uTime*1.7 + sin(dot(aOff.xz, vec2(-wd.y, wd.x))*0.11)*1.5)*0.5 + 0.5;
    float flut = sin(uTime*5.3 + r*40.0)*0.12;
    float bend = (0.18 + 0.62*wave + flut)*pow(y, 1.5)*length(uWind);
    p.xz += wd*bend*h; p.y -= bend*bend*h*0.35;
    // parted around the wombat
    vec2 d = aOff.xz + p.xz - uPet.xz; float pr = uPet.y, dl = length(d);
    if (pr > 0.0 && dl < pr){ float k = (1.0 - dl/pr)*pow(y, 1.2); p.xz += normalize(d + 1e-4)*k*0.45*h; p.y -= k*0.4*h; }
    // fewer blades far away (the random value decides which go first)
    float keep = clamp(1.0 - (near - uFar*0.45)/(uFar*0.55), 0.0, 1.0);
    if (r > keep) p *= 0.0;
    vec4 wp = vec4(aOff + p, 1.0);
    vH = y; vWave = wave; vShade = aPar.z; vCol = aCol;
    vec4 mv = viewMatrix*wp; vFog = -mv.z;
    gl_Position = projectionMatrix*mv;
  }`;
const FRAG = `
  uniform vec3 uSun, uAmb, uFogC; uniform float uFogN, uFogF, uNight;
  varying float vH, vWave, vShade, vFog; varying vec3 vCol;
  void main(){
    vec3 root = vCol*vec3(0.28, 0.4, 0.3), mid = vCol*0.66;
    vec3 col = mix(root, mid, smoothstep(0.0, 0.55, vH)); col = mix(col, vCol, smoothstep(0.45, 1.0, vH));
    col *= mix(0.82, 1.18, vWave*vH);                       // the wind waves catch the light
    vec3 lit = col*(uAmb + uSun*(0.24 + 0.3*vH))*vShade;  // soft light, brighter toward the tips (light through the blade)
    lit = mix(lit, lit*vec3(0.35, 0.42, 0.62), uNight);
    float f = smoothstep(uFogN, uFogF, vFog); lit = mix(lit, uFogC, f);
    gl_FragColor = vec4(lit, 1.0);
  }`;

// tip colours of the kinds of grass
const GREEN = [0.4, 0.64, 0.22], GOLD = [0.86, 0.75, 0.42], RED = [0.78, 0.69, 0.4], OLIVE = [0.55, 0.6, 0.3];
const T = 10;

export function createGrassField({scene, mobile}){
  const blade = (() => {   // a tapered strip: 3 segments and a tip
    const ys = [0, 0.3, 0.62, 1], pos = [], idx = [];
    ys.forEach((y, i) => { const w = 0.045*Math.pow(1 - y, 0.7); if (i < 3){ pos.push(-w, y, 0, w, y, 0); } else pos.push(0, y, 0); });
    for (let i=0;i<2;i++){ const a = i*2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } idx.push(4, 5, 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; })();
  const FAR = mobile ? 22 : 38, DENS = mobile ? 45 : 100, PER_FRAME = mobile ? 1 : 2;
  const U = {uTime:{value:0}, uFar:{value:FAR}, uCamH:{value:0}, uWind:{value:new THREE.Vector2(0.8, 0.5)}, uPet:{value:new THREE.Vector3(0, 0, 0)}, uCam:{value:new THREE.Vector3()},
    uSun:{value:new THREE.Color('#fff2d8')}, uAmb:{value:new THREE.Color('#6f8a8a')}, uFogC:{value:new THREE.Color('#cfe7ef')}, uFogN:{value:30}, uFogF:{value:90}, uNight:{value:0}};
  const mat = new THREE.ShaderMaterial({vertexShader:VERT, fragmentShader:FRAG, uniforms:U, side:THREE.DoubleSide});
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const tiles = new Map();   // "i,j" -> {mesh, rs (sorted random values), gen}
  let src = null, gen = 0;   // src: {ok(x, z), H(x, z), info(x, z) -> world.meadowAt, bounds:[x0, x1, z0, z1]}

  function makeTile(i, j){
    const x0 = i*T, z0 = j*T, {ok, H, info} = src;
    // the land's look on a 1 m grid (cheaper than asking for every blade)
    const G = T + 1, I = []; for (let b=0;b<G;b++) for (let a=0;a<G;a++) I.push(info(x0 + a, z0 + b));
    const at = (x, z) => { const fx = x - x0, fz = z - z0, a = Math.min(T - 1, Math.floor(fx)), b = Math.min(T - 1, Math.floor(fz)), u = fx - a, v = fz - b, o = [];
      const A = I[b*G + a], B = I[b*G + a + 1], C = I[(b + 1)*G + a], D = I[(b + 1)*G + a + 1];
      for (let k=0;k<5;k++) o.push((A[k]*(1 - u) + B[k]*u)*(1 - v) + (C[k]*(1 - u) + D[k]*u)*v); return o; };
    let seed = ((i*73856093) ^ (j*19349663)) >>> 0 || 7; seed = seed % 2147483646 + 1;
    const R = () => (seed = (seed*16807) % 2147483647)/2147483647;
    const N = Math.round(T*T*DENS), L = [];
    for (let n=0;n<N;n++){ const x = x0 + R()*T, z = z0 + R()*T, [g, dry, red, sw, dim] = at(x, z);
      const want = Math.max(Math.min(1, (g - 0.35)/0.45)*(1 - 0.55*red), g > 0.05 ? 0.14*red : 0);   // (the outback: thin dry tufts on red dust) if (want <= 0 || R() > want || !ok(x, z)) continue;
      const tip = GREEN.map((c, k) => { let v = c; v += (GOLD[k] - v)*dry; v += (RED[k] - v)*red; v += (OLIVE[k] - v)*sw*0.8; return v*dim*(0.92 + 0.16*(0.5 + 0.5*Math.sin(x*0.21 + Math.cos(z*0.17)*2.0))); });
      const h = (0.22 + R()*0.3 + 0.12*Math.sin(x*0.7)*Math.sin(z*0.6))*(1 + 0.6*dry - 0.3*red + 0.3*sw);
      L.push([x, H(x, z) - 0.02, z, tip, h, R()*6.283, 0.65 + 0.35*R(), R()]); }
    if (!L.length) return {mesh:null, rs:new Float32Array(0), gen};
    L.sort((a, b) => a[7] - b[7]);   // random values in order: a far tile just draws the first part
    const n = L.length, off = new Float32Array(n*3), col = new Float32Array(n*3), par = new Float32Array(n*4), rs = new Float32Array(n);
    let cy = 0; L.forEach((b, k) => { off[k*3] = b[0]; off[k*3 + 1] = b[1]; off[k*3 + 2] = b[2]; col.set(b[3], k*3); par[k*4] = b[4]; par[k*4 + 1] = b[5]; par[k*4 + 2] = b[6]; par[k*4 + 3] = b[7]; rs[k] = b[7]; cy += b[1]; });
    const g = new THREE.InstancedBufferGeometry(); g.index = blade.index; g.setAttribute('position', blade.attributes.position);
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4));
    g.instanceCount = n; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + T/2, cy/n, z0 + T/2), T*0.75 + 1);
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = true; mesh.userData.cy = cy/n; group.add(mesh);
    return {mesh, rs, gen};
  }
  const drop = (k, t) => { if (t.mesh){ group.remove(t.mesh); t.mesh.geometry.dispose(); } tiles.delete(k); };
  const firstAbove = (rs, v) => { let lo = 0, hi = rs.length; while (lo < hi){ const m = (lo + hi) >> 1; if (rs[m] <= v) lo = m + 1; else hi = m; } return lo; };

  function stream(cam){
    if (!src) return;
    const camH = Math.max(0, cam.y - src.H(cam.x, cam.z)); U.uCamH.value = camH;
    const [bx0, bx1, bz0, bz1] = src.bounds, reach = FAR + 4 + camH*0.6, want = [];
    const i0 = Math.floor(Math.max(bx0, cam.x - reach)/T), i1 = Math.floor((Math.min(bx1, cam.x + reach) - 0.001)/T);
    const j0 = Math.floor(Math.max(bz0, cam.z - reach)/T), j1 = Math.floor((Math.min(bz1, cam.z + reach) - 0.001)/T);
    for (let i=i0;i<=i1;i++) for (let j=j0;j<=j1;j++){
      const dx = Math.max(i*T - cam.x, 0, cam.x - (i + 1)*T), dz = Math.max(j*T - cam.z, 0, cam.z - (j + 1)*T), dxz = Math.hypot(dx, dz);
      if (dxz > reach) continue; const k = i + ',' + j, t = tiles.get(k);
      if (!t || t.gen !== gen) want.push([dxz, i, j, k]);
      else if (t.mesh){ const d = Math.hypot(dxz, cam.y - t.mesh.userData.cy), keep = Math.min(1, Math.max(0, 1 - (Math.max(0, d - camH*0.8) - FAR*0.45)/(FAR*0.55)));
        t.mesh.geometry.instanceCount = firstAbove(t.rs, keep); }
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, i, j, k] of want.slice(0, PER_FRAME)){ const old = tiles.get(k); if (old) drop(k, old); tiles.set(k, makeTile(i, j)); }
    for (const [k, t] of tiles){ const [i, j] = k.split(',').map(Number);   // far behind: let it go
      const dx = Math.max(i*T - cam.x, 0, cam.x - (i + 1)*T), dz = Math.max(j*T - cam.z, 0, cam.z - (j + 1)*T); if (Math.hypot(dx, dz) > reach + 16) drop(k, t); }
  }
  return {
    group, U,
    set visible(v){ group.visible = v; }, get visible(){ return group.visible; },
    setSource(s){ src = s; gen++; },
    invalidate(){ gen++; },   // something was built or moved: tiles are remade, nearest first (the old ones stay until then)
    clear(){ for (const [k, t] of tiles) drop(k, t); },
    count(){ let n = 0; for (const t of tiles.values()) if (t.mesh) n += t.mesh.geometry.instanceCount; return n; },
    update(t, {cam, pet, petR = 0.8, wind = 1, night = 0, fog, sun, amb}){
      stream(cam);
      U.uTime.value = t; U.uCam.value.copy(cam); U.uWind.value.set(0.8, 0.5).multiplyScalar(0.6 + 0.6*wind);
      if (pet) U.uPet.value.set(pet.x, petR, pet.z); else U.uPet.value.y = 0;
      U.uNight.value = night*0.85;
      if (fog){ U.uFogC.value.copy(fog.color); U.uFogN.value = fog.near; U.uFogF.value = fog.far; }
      if (sun) U.uSun.value.copy(sun); if (amb) U.uAmb.value.copy(amb);
    },
  };
}
