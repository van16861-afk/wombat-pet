// Painted meadow grass (the trial look for the home plot): a dense field of thin blades drawn on the GPU. Each blade is one instance
// of a tapered strip; the vertex shader bends it with rolling waves of wind (the shimmering bands you see run across a hillside),
// a quick flutter, and parts it around the wombat; far blades thin out, so a phone only draws the near ones in full. Colour runs from
// a deep root green to sunlit yellow-green tips, lit softly from the sun with light coming through the blades.
import * as THREE from 'three';

const VERT = `
  attribute vec3 aOff; attribute vec4 aPar;   // ground position; height, yaw, colour shift, random
  uniform float uTime, uFar; uniform vec2 uWind; uniform vec3 uPet, uCam;
  varying float vH, vWave, vShade, vFog; varying vec3 vTint;
  void main(){
    float h = aPar.x, r = aPar.w;
    vec3 p = position; float y = p.y; p.y *= h; p.x *= 0.75 + 0.5*r;
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
    float dist = distance(aOff, uCam), keep = clamp(1.0 - (dist - uFar*0.45)/(uFar*0.55), 0.0, 1.0);
    if (r > keep) p *= 0.0;
    vec4 wp = vec4(aOff + p, 1.0);
    vH = y; vWave = wave; vShade = 0.65 + 0.35*r; vTint = vec3(aPar.z);
    vec4 mv = viewMatrix*wp; vFog = -mv.z;
    gl_Position = projectionMatrix*mv;
  }`;
const FRAG = `
  uniform vec3 uRoot, uMid, uTip, uSun, uAmb, uFogC; uniform float uFogN, uFogF, uNight;
  varying float vH, vWave, vShade, vFog; varying vec3 vTint;
  void main(){
    vec3 col = mix(uRoot, uMid, smoothstep(0.0, 0.55, vH)); col = mix(col, uTip, smoothstep(0.45, 1.0, vH));
    col *= 1.0 + (vTint - 0.5)*0.35;                      // patches a little greener or yellower
    col *= mix(0.82, 1.18, vWave*vH);                       // the wind waves catch the light
    vec3 lit = col*(uAmb + uSun*(0.32 + 0.4*vH))*vShade;  // soft light, brighter toward the tips (light through the blade)
    lit = mix(lit, lit*vec3(0.35, 0.42, 0.62), uNight);
    float f = smoothstep(uFogN, uFogF, vFog); lit = mix(lit, uFogC, f);
    gl_FragColor = vec4(lit, 1.0);
  }`;

export function createGrassField({scene, mobile}){
  const blade = (() => {   // a tapered strip: 3 segments and a tip
    const ys = [0, 0.3, 0.62, 1], pos = [], idx = [];
    ys.forEach((y, i) => { const w = 0.045*Math.pow(1 - y, 0.7); if (i < 3){ pos.push(-w, y, 0, w, y, 0); } else pos.push(0, y, 0); });
    for (let i=0;i<2;i++){ const a = i*2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } idx.push(4, 5, 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; })();
  const U = {uTime:{value:0}, uFar:{value:mobile ? 26 : 40}, uWind:{value:new THREE.Vector2(0.8, 0.5)}, uPet:{value:new THREE.Vector3(0, 0, 0)}, uCam:{value:new THREE.Vector3()},
    uRoot:{value:new THREE.Color('#1c4517')}, uMid:{value:new THREE.Color('#3f7f25')}, uTip:{value:new THREE.Color('#9cc443')},
    uSun:{value:new THREE.Color('#fff2d8')}, uAmb:{value:new THREE.Color('#6f8a8a')}, uFogC:{value:new THREE.Color('#cfe7ef')}, uFogN:{value:30}, uFogF:{value:90}, uNight:{value:0}};
  const mat = new THREE.ShaderMaterial({vertexShader:VERT, fragmentShader:FRAG, uniforms:U, side:THREE.DoubleSide});
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  let tiles = [];
  // fill [x0,x1]x[z0,z1] where ok(x, z); ground height from H(x, z); cut into tiles so off-screen ones are skipped
  function build(x0, x1, z0, z1, ok, H){
    tiles.forEach(t => { group.remove(t); t.geometry.dispose(); }); tiles = [];
    const area = (x1 - x0)*(z1 - z0), N = Math.round(area*(mobile ? 55 : 125)), T = 10, bins = new Map();
    let seed = 7; const R = () => (seed = (seed*16807) % 2147483647)/2147483647;
    for (let i=0;i<N;i++){ const x = x0 + R()*(x1 - x0), z = z0 + R()*(z1 - z0); if (!ok(x, z)) continue;
      const k = Math.floor(x/T) + ',' + Math.floor(z/T); (bins.get(k) || bins.set(k, []).get(k)).push(x, H(x, z) - 0.02, z, 0.22 + R()*0.3 + 0.12*Math.sin(x*0.7)*Math.sin(z*0.6), R()*6.283, 0.5 + 0.5*Math.sin(x*0.21 + Math.cos(z*0.17)*2.0), R()); }
    for (const a of bins.values()){ const n = a.length/7, off = new Float32Array(n*3), par = new Float32Array(n*4);
      for (let i=0;i<n;i++){ off.set(a.slice(i*7, i*7 + 3), i*3); par.set(a.slice(i*7 + 3, i*7 + 7), i*4); }
      const g = new THREE.InstancedBufferGeometry(); g.index = blade.index; g.setAttribute('position', blade.attributes.position);
      g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4)); g.instanceCount = n;
      let cx = 0, cz = 0, cy = 0; for (let i=0;i<n;i++){ cx += off[i*3]; cy += off[i*3 + 1]; cz += off[i*3 + 2]; } cx /= n; cy /= n; cz /= n;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), T*0.75 + 1);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = true; group.add(m); tiles.push(m); }
    return tiles.reduce((a, t) => a + t.geometry.instanceCount, 0);
  }
  return {
    group, build, U,
    set visible(v){ group.visible = v; }, get visible(){ return group.visible; },
    update(t, {cam, pet, petR = 0.8, wind = 1, night = 0, fog, sun, amb}){
      U.uTime.value = t; U.uCam.value.copy(cam); U.uWind.value.set(0.8, 0.5).multiplyScalar(0.6 + 0.6*wind);
      if (pet) U.uPet.value.set(pet.x, petR, pet.z); else U.uPet.value.y = 0;
      U.uNight.value = night*0.85;
      if (fog){ U.uFogC.value.copy(fog.color); U.uFogN.value = fog.near; U.uFogF.value = fog.far; }
      if (sun) U.uSun.value.copy(sun); if (amb) U.uAmb.value.copy(amb);
    },
  };
}
