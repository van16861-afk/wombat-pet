import * as THREE from 'three';
import { cloud } from './cloud.js';

// Keep r128-era colour handling so the hand-tuned palette and fur shader look the same.
THREE.ColorManagement.enabled = false;
const LI = Math.PI; // legacy light intensities × π = same brightness under physically based lights

boot();

async function boot(){
const $ = s => document.querySelector(s);
const canvas = $('#c');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true}); }
catch(e){ $('#petSub').textContent = '這個瀏覽器無法顯示 3D，請改用 Chrome、Safari 或 Edge 開啟。'; return; }
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const mobile = matchMedia('(pointer:coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.75 : 2));
renderer.setClearColor(0x000000, 0);

// ---------- helpers ----------
const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
const UP = V3(0,1,0);
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const lerp = (a,b,t) => a + (b-a)*t;
const rnd = (a,b) => a + Math.random()*(b-a);
const ease = p => p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
const wrapA = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const hex2rgb = h => { const n = parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const mixHex = (a,b,t) => '#'+hex2rgb(a).map((v,i)=>Math.round(lerp(v,hex2rgb(b)[i],clamp(t,0,1))).toString(16).padStart(2,'0')).join('');
const pad = n => String(n).padStart(2,'0');
function isShown(o){ while (o){ if (!o.visible) return false; o = o.parent; } return true; }

// ---------- scene / camera ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const camTarget = V3(0, 0.9, 0);
let yaw = 0.75, pitch = 0.42, zoom = 1, baseDist = 14, camY = 0.9, zoomFx = 1;
function placeCam(){
  const d = baseDist * zoom * zoomFx;
  camera.position.set(camTarget.x + d*Math.cos(pitch)*Math.sin(yaw), camTarget.y + d*Math.sin(pitch), camTarget.z + d*Math.cos(pitch)*Math.cos(yaw));
  camera.lookAt(camTarget);
}
function resize(){
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  baseDist = camera.aspect < 0.8 ? 19 : 14;
  camY = camera.aspect < 0.8 ? 1.6 : 0.9;
}
addEventListener('resize', resize); resize();

const L = V3(0.45, 1, 0.55).normalize();
const hemi = new THREE.HemisphereLight(0xfff8ec, 0x6d7562, 0.8*LI); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.75*LI); sun.position.copy(L).multiplyScalar(10); scene.add(sun);

// ---------- canvas textures ----------
function canvasTex(w, h, draw){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); return new THREE.CanvasTexture(cv); }
const radCache = {};
const radialTex = (inner, outer) => radCache[inner+outer] || (radCache[inner+outer] = canvasTex(128,128,(x)=>{ const g = x.createRadialGradient(64,64,0,64,64,64); g.addColorStop(0,inner); g.addColorStop(1,outer); x.fillStyle = g; x.fillRect(0,0,128,128); }));
const shadowTex = canvasTex(128,128,(x)=>{ const g = x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,0.5)'); g.addColorStop(0.55,'rgba(0,0,0,0.22)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0,0,128,128); });
const beamTex = canvasTex(8,128,(x,w,h)=>{ const g = x.createLinearGradient(0,0,0,h); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.6,'rgba(255,255,255,0.35)'); g.addColorStop(1,'rgba(255,255,255,0.9)'); x.fillStyle = g; x.fillRect(0,0,w,h); });
const texCache = {};
function textTex(txt, color, font, outline){
  const key = txt+'|'+color+'|'+font+'|'+outline;
  if (texCache[key]) return texCache[key];
  return texCache[key] = canvasTex(128,128,(x)=>{
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (outline){ x.lineWidth = 10; x.strokeStyle = outline; x.strokeText(txt,64,68); }
    x.fillStyle = color || '#000'; x.fillText(txt,64,68);
  });
}
const EMOJI_FONT = '92px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const emojiTex = e => textTex(e, '#000', EMOJI_FONT);
const sparkTex = textTex('✦', '#fff6c8', 'bold 100px sans-serif', 'rgba(255,200,80,.6)');
const heartTex = canvasTex(64,64,(x)=>{ x.fillStyle = '#e0607e'; x.beginPath(); x.moveTo(32,54);
  x.bezierCurveTo(6,36,4,14,20,10); x.bezierCurveTo(28,8,32,16,32,20); x.bezierCurveTo(32,16,36,8,44,10); x.bezierCurveTo(60,14,58,36,32,54); x.fill(); });
const stinkTex = canvasTex(64,128,(x)=>{ x.strokeStyle = 'rgba(120,150,60,0.85)'; x.lineWidth = 5; x.lineCap = 'round';
  for (const ox of [18,34,48]){ x.beginPath(); for (let y=120;y>10;y-=4){ const xx = ox + Math.sin(y/12)*5; y===120 ? x.moveTo(xx,y) : x.lineTo(xx,y); } x.stroke(); } });
const knitTex = canvasTex(64,64,(x)=>{ x.fillStyle = '#ffffff'; x.fillRect(0,0,64,64); x.strokeStyle = 'rgba(0,0,0,0.13)'; x.lineWidth = 3;
  for (let i=4;i<64;i+=8){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,64); x.stroke(); } });
knitTex.wrapS = knitTex.wrapT = THREE.RepeatWrapping; knitTex.repeat.set(10,3);

// ---------- floating fx ----------
const fx = [];
function floatSprite(tex, at, o={}){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false, depthTest:o.depthTest !== false, blending:o.add ? THREE.AdditiveBlending : THREE.NormalBlending}));
  s.position.copy(at); s.scale.setScalar(o.size || 0.4); s.renderOrder = 5; s.visible = !o.delay;
  scene.add(s);
  fx.push({s, life:0, max:o.max || 1.4, vy:o.vy ?? 1, vx:o.vx || 0, vz:o.vz || 0, g:o.g || 0, delay:o.delay || 0, size:o.size || 0.4, grow:o.grow ?? 0.2});
  return s;
}
function updateFx(dt){
  for (let i=fx.length-1;i>=0;i--){
    const f = fx[i];
    if (f.delay > 0){ f.delay -= dt; continue; }
    f.s.visible = true; f.life += dt;
    f.vy -= f.g*dt;
    f.s.position.x += f.vx*dt; f.s.position.y += f.vy*dt; f.s.position.z += f.vz*dt;
    f.s.material.opacity = clamp((f.max - f.life)/0.5, 0, 1);
    f.s.scale.setScalar(f.size*(1 + Math.min(f.life*3,1)*f.grow));
    if (f.life > f.max){ scene.remove(f.s); f.s.material.dispose(); fx.splice(i,1); }
  }
}

// ---------- fur shader ----------
const NS = 128, nd = new Uint8Array(NS*NS*4);
for (let i=0;i<NS*NS;i++){ const v = Math.random()*255; nd[i*4]=v; nd[i*4+1]=v; nd[i*4+2]=v; nd[i*4+3]=255; }
const noiseTex = new THREE.DataTexture(nd, NS, NS, THREE.RGBAFormat);
noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = noiseTex.minFilter = THREE.NearestFilter;
noiseTex.generateMipmaps = false; noiseTex.needsUpdate = true;
const U = {
  uNoise:{value:noiseTex}, uColor:{value:new THREE.Color('#8b6b50')}, uBelly:{value:new THREE.Color('#b39a82')},
  uLight:{value:L}, uForce:{value:V3(0,0,0)}, uSky:{value:new THREE.Color('#fff8ec')}, uGround:{value:new THREE.Color('#77806a')}, uSun:{value:1}, uWhite:{value:0}
};
const VS = `uniform float uLayer; uniform float uLen; uniform vec3 uForce;
varying vec2 vUv; varying vec3 vN; varying vec3 vWP; varying float vLy;
void main(){ vUv = uv; vLy = normal.y;
  vec3 p = position + normal * (uLen * uLayer);
  vec4 wp = modelMatrix * vec4(p, 1.0); wp.xyz += uForce * (uLayer * uLayer);
  vN = normalize(mat3(modelMatrix) * normal); vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FS = `uniform sampler2D uNoise; uniform vec2 uRep; uniform float uLayer;
uniform vec3 uColor; uniform vec3 uBelly; uniform float uBellyAmt; uniform vec3 uLight; uniform vec3 uSky; uniform vec3 uGround; uniform float uSun; uniform float uWhite;
varying vec2 vUv; varying vec3 vN; varying vec3 vWP; varying float vLy;
void main(){
  float n = texture2D(uNoise, vUv * uRep).r;
  float c = texture2D(uNoise, vUv * uRep * 0.11 + 0.37).r;
  if (uLayer > 0.001 && n * 0.82 + c * 0.18 < uLayer) discard;
  vec3 N = normalize(vN);
  vec3 base = mix(uColor, uBelly, uBellyAmt * smoothstep(-0.15, -0.7, vLy)) * (0.9 + 0.2 * c);
  vec3 col = base * mix(0.42, 1.1, uLayer);
  float d = max(0.0, (dot(N, uLight) + 0.35) / 1.35);
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 V = normalize(cameraPosition - vWP);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.45 * uLayer;
  col = col * (hemi * 0.5 + d * 0.72 * uSun) + rim * uSky * 0.35;
  col = mix(col, vec3(1.0, 0.97, 0.88) * 1.25, uWhite);
  gl_FragColor = vec4(col, 1.0); }`;
const SHELLS = mobile ? 14 : 20;
const hit = [], petMats = [];
function ell(rx, ry, rz, w=48, h=32){ const g = new THREE.SphereGeometry(1, w, h); g.applyMatrix4(new THREE.Matrix4().makeScale(rx, ry, rz)); return g; }
function fur(parent, rx, ry, rz, len, belly, pos){
  const geo = ell(rx, ry, rz), D = 44, rep = new THREE.Vector2(Math.PI*(rx+rz)*D, Math.PI*ry*D), g = new THREE.Group();
  for (let i=0;i<SHELLS;i++){
    const m = new THREE.ShaderMaterial({vertexShader:VS, fragmentShader:FS, uniforms:{
      uLayer:{value:i/(SHELLS-1)}, uLen:{value:len}, uRep:{value:rep}, uBellyAmt:{value:belly},
      uNoise:U.uNoise, uColor:U.uColor, uBelly:U.uBelly, uLight:U.uLight, uForce:U.uForce, uSky:U.uSky, uGround:U.uGround, uSun:U.uSun, uWhite:U.uWhite}});
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false;
    if (i===0){ mesh.userData.kind = 'pet'; hit.push(mesh); }
    g.add(mesh);
  }
  if (pos) g.position.copy(pos);
  parent.add(g); return g;
}
const mat = (c, r=0.7) => new THREE.MeshStandardMaterial({color:c, roughness:r, metalness:0});
function solid(parent, geo, color, rough, pos, pick=true){
  const m = new THREE.Mesh(geo, mat(color, rough)); if (pos) m.position.copy(pos); parent.add(m); petMats.push(m.material);
  if (pick){ m.userData.kind = 'pet'; hit.push(m); } return m;
}
function makeShadow(w, d){
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({map:shadowTex, transparent:true, depthWrite:false}));
  m.rotation.x = -Math.PI/2; m.position.y = 0.006; m.renderOrder = -1; g.add(m); scene.add(g); return {g, m};
}
function heartShape(s){ const sh = new THREE.Shape(); sh.moveTo(0,-0.9*s); sh.bezierCurveTo(-1.25*s,-0.05*s,-0.6*s,0.95*s,0,0.35*s); sh.bezierCurveTo(0.6*s,0.95*s,1.25*s,-0.05*s,0,-0.9*s); return sh; }
function starShape(r1, r2, n=5){ const sh = new THREE.Shape(); for (let i=0;i<n*2;i++){ const r = i%2 ? r2 : r1, a = i/(n*2)*Math.PI*2 + Math.PI/2, x = Math.cos(a)*r, y = Math.sin(a)*r; i ? sh.lineTo(x,y) : sh.moveTo(x,y); } return sh; }
const extrude = (sh, d) => { const g = new THREE.ExtrudeGeometry(sh, {depth:d, bevelEnabled:false}); g.center(); return g; };

// ---------- ground ----------
const groundTex = canvasTex(256,256,(x)=>{ const g = x.createRadialGradient(128,128,0,128,128,128);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.78,'rgba(255,255,255,1)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0,0,256,256); });
const ground = new THREE.Mesh(new THREE.CircleGeometry(10, 72), new THREE.MeshBasicMaterial({color:'#c8d4ba', map:groundTex, transparent:true, depthWrite:false}));
ground.rotation.x = -Math.PI/2; ground.position.y = 0.002; ground.renderOrder = -2; scene.add(ground);

// ---------- wombat ----------
const root = new THREE.Group(); scene.add(root);
const tiltG = new THREE.Group(); tiltG.position.y = 0.95; root.add(tiltG);
const actG = new THREE.Group(); tiltG.add(actG);
const offG = new THREE.Group(); offG.position.y = -0.95; actG.add(offG);
const squashG = new THREE.Group(); offG.add(squashG);
const bodyFit = new THREE.Group(); bodyFit.position.set(0, 0.95, -0.25); squashG.add(bodyFit);
fur(bodyFit, 1.0, 0.85, 1.5, 0.075, 1, null);
fur(bodyFit, 0.12, 0.12, 0.12, 0.05, 0, V3(0, 0.05, -1.47));
const legs = [];
[[0.52,0.85,0,0,1],[-0.52,0.85,1,Math.PI,1],[0.6,-1.0,2,Math.PI,-1],[-0.6,-1.0,3,0,-1]].forEach(([x,z,i,wp,fr])=>{
  const g = new THREE.Group(); g.position.set(x, 0.65, z); squashG.add(g);
  fur(g, 0.27, 0.38, 0.3, 0.05, 0, V3(0, -0.28, 0));
  solid(g, ell(0.22, 0.07, 0.26, 24, 12), '#3a2e2a', 0.7, V3(0, -0.6, 0.03));
  const clawGeo = new THREE.ConeGeometry(0.03, 0.1, 8);
  for (const dx of [-0.09, 0, 0.09]){ const c = solid(g, clawGeo, '#e6dccb', 0.5, V3(dx, -0.6, 0.27), false); c.rotation.x = Math.PI/2; }
  legs.push({g, phase:i*1.7, walkPh:wp, front:fr, baseX:x});
});
const head = new THREE.Group(); head.position.set(0, 0.95, 0.55); squashG.add(head);
fur(head, 0.8, 0.68, 0.72, 0.06, 0.6, V3(0, 0, 0.45));
fur(head, 0.5, 0.4, 0.42, 0.04, 0.6, V3(0, -0.14, 1.0));
solid(head, ell(0.3, 0.2, 0.17, 32, 20), '#2a2220', 0.38, V3(0, -0.06, 1.42));
for (const s of [-1,1]){ const n = solid(head, new THREE.SphereGeometry(0.055,16,10), '#100c0b', 0.6, V3(0.11*s,-0.11,1.565), false); n.scale.set(1,0.6,0.5); }
const eyes = [];
for (const s of [-1,1]){
  const e = new THREE.Group(); e.position.set(0.36*s, 0.17, 1.12); head.add(e);
  const ball = solid(e, new THREE.SphereGeometry(0.075,20,14), '#141110', 0.18, null); ball.scale.z = 0.75;
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.02,10,8), new THREE.MeshBasicMaterial({color:'#ffffff'})); hl.position.set(0.02*s,0.03,0.05); e.add(hl);
  eyes.push(e);
}
const ears = [];
for (const s of [-1,1]){
  const e = new THREE.Group(); e.position.set(0.48*s, 0.62, 0.28); e.rotation.z = -0.35*s; head.add(e);
  fur(e, 0.16, 0.21, 0.07, 0.03, 0, null);
  solid(e, ell(0.09,0.13,0.025,20,12), '#5b4038', 0.8, V3(0,-0.01,0.06));
  ears.push({g:e, base:-0.35*s, v:0, a:0});
}
const shadow = makeShadow(2.8, 4.4);

// ---------- evolution forms ----------
const FORMS = {
  normal: {name:'袋熊',     desc:'照顧得剛剛好。'},
  skinny: {name:'瘦瘦熊',   body:[0.72,0.8,0.95], head:0.9, tint:['#b59c80',0.18], speed:1.05, desc:'進化時太餓，或這個階段常常餓肚子。'},
  sickly: {name:'病懨懨熊', body:[0.9,0.88,1], tint:['#8f9c76',0.42], acc:'bandage', droopy:true, speed:0.7, desc:'進化的時候正在生病。'},
  stinky: {name:'臭臭熊',   tint:['#7b7150',0.2], acc:'poop', desc:'進化的時候，場上有 3 坨以上的便便沒清。'},
  chubby: {name:'胖胖熊',   body:[1.26,1.14,1.05], head:1.06, speed:0.75, desc:'這個階段常常在牠不餓的時候還一直餵。'},
  sporty: {name:'活力熊',   body:[0.98,1.03,1.05], acc:'headband', speed:1.25, desc:'這個階段陪牠玩了很多次（8 次以上）。'},
  royal:  {name:'皇家袋熊', acc:'crown', desc:'完全體以後，照顧得幾乎沒有失誤，心情又很好。'},
  golden: {name:'黃金袋熊', tint:['#d9a933',0.55], acc:'crown', glow:true, speed:1.1, desc:'皇家袋熊在究極體依然被完美照顧。'}
};
const ACC = {};
(function buildAcc(){
  const brown = mat('#6e4c35',0.9);
  { const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.2,0.1,10,24), brown); a.rotation.x = Math.PI/2; a.position.y = 0.05; g.add(a);
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.13,0.08,10,20), brown); b.rotation.x = Math.PI/2; b.position.y = 0.17; g.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1,12,10), brown); c.position.y = 0.26; g.add(c);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.14,10), brown); tip.position.y = 0.38; tip.rotation.z = 0.3; g.add(tip);
    const flies = new THREE.Group(); for (let i=0;i<2;i++){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.025,6,4), mat('#111',0.4)); f.position.set(0.35,0.3+i*0.1,0); f.userData.ph = i*3; flies.add(f); }
    g.add(flies); g.userData.flies = flies;
    g.position.set(0,0.64,0.42); head.add(g); ACC.poop = g; }
  { const g = new THREE.Group(), w = mat('#f4f1ea',0.9);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.73,0.055,8,48), w); band.rotation.x = Math.PI/2; band.scale.set(1,0.9,1); band.position.set(0,0.3,0.45); g.add(band);
    for (const r of [0.6,-0.6]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.08,0.02), mat('#e8c9a6',0.9)); p.position.set(-0.32,0.42,1.0); p.rotation.set(-0.5,0.35,r); g.add(p); }
    head.add(g); ACC.bandage = g; }
  { const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.73,0.07,8,48), mat('#d94b45',0.7)); band.rotation.x = Math.PI/2; band.scale.set(1,0.9,1); band.position.set(0,0.32,0.45); g.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.35,0.12), band.material); tail.position.set(0,0.2,-0.2); tail.rotation.x = 0.6; g.add(tail);
    head.add(g); ACC.headband = g; }
  { const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({color:'#e2b53b', roughness:0.25, metalness:0.6});
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.16,24,1,true), gold); ring.material.side = THREE.DoubleSide; ring.position.y = 0.08; g.add(ring);
    for (let i=0;i<5;i++){ const a = i/5*Math.PI*2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.16,8), gold); c.position.set(Math.sin(a)*0.3,0.23,Math.cos(a)*0.3); g.add(c);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035,8,6), mat(['#e0607e','#4f86c6','#5aa469'][i%3],0.2)); gem.position.set(Math.sin(a)*0.31,0.08,Math.cos(a)*0.31); g.add(gem); }
    g.position.set(0,0.64,0.42); head.add(g); ACC.crown = g; }
  Object.values(ACC).forEach(g => g.visible = false);
})();

// ---------- clothes ----------
const CLOTHES = [
  {id:'party',   name:'派對帽', price:20, def:'#e45b5b', slot:'hat'},
  {id:'straw',   name:'草帽',   price:25, def:'#e45b5b', slot:'hat'},
  {id:'glasses', name:'圓眼鏡', price:25, def:'#3b3b3b', slot:'eyes'},
  {id:'bow',     name:'領結',   price:15, def:'#4f86c6', slot:'neck'},
  {id:'scarf',   name:'圍巾',   price:30, def:'#f2a541', slot:'scarf'},
  {id:'sweater', name:'毛衣',   price:40, def:'#5aa469', slot:'body'},
  {id:'nyband',  name:'新年金頭帶', price:30, def:'#e2b53b', slot:'hat',  holiday:'newyear'},
  {id:'caishen', name:'財神帽',   price:30, def:'#d23b32', slot:'hat',  holiday:'cny'},
  {id:'heartgl', name:'愛心眼鏡', price:25, def:'#e9638c', slot:'eyes', holiday:'valentine'},
  {id:'propeller', name:'竹蜻蜓帽', price:30, def:'#4f86c6', slot:'hat', holiday:'children'},
  {id:'sachet',  name:'端午香包', price:25, def:'#d23b32', slot:'neck', holiday:'dragon'},
  {id:'bunny',   name:'玉兔髮箍', price:30, def:'#f2a6be', slot:'hat',  holiday:'midautumn'},
  {id:'witch',   name:'巫師帽',   price:30, def:'#4b2f6b', slot:'hat',  holiday:'halloween'},
  {id:'santa',   name:'聖誕帽',   price:30, def:'#d23b32', slot:'hat',  holiday:'christmas'}
];
const PALETTE = ['#e45b5b','#f2a541','#f3d250','#5aa469','#4f86c6','#9b6fc4','#f2a6be','#f2f0ea','#3b3b3b'];
const CL = {};
let propeller = null;
(function buildClothes(){
  const white = mat('#f6f3ec',0.95), gold = new THREE.MeshStandardMaterial({color:'#e2b53b', roughness:0.3, metalness:0.5});
  const onHead = (id, g, mats, y=0.62, z=0.42) => { g.position.set(0,y,z); g.userData.baseY = y; head.add(g); CL[id] = {g, mats}; };
  { const g = new THREE.Group(), m = mat('#e45b5b',0.6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.27,0.62,28), m); cone.position.y = 0.31; g.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08,12,10), white); pom.position.y = 0.64; g.add(pom);
    g.rotation.z = 0.12; onHead('party', g, [m]); }
  { const g = new THREE.Group(), straw = mat('#e2c37c',0.85), band = mat('#e45b5b',0.6);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.78,0.8,0.04,40), straw);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.42,0.32,32), straw); crown.position.y = 0.17;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.425,0.43,0.09,32), band); b.position.y = 0.06;
    g.add(brim, crown, b); g.rotation.x = -0.08; onHead('straw', g, [band], 0.66, 0.4); }
  { const g = new THREE.Group(), m = mat('#3b3b3b',0.4);
    for (const s of [-1,1]){ const r = new THREE.Mesh(new THREE.TorusGeometry(0.12,0.02,8,28), m); r.position.set(0.36*s,0.17,1.19); g.add(r); }
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.48,8), m); br.rotation.z = Math.PI/2; br.position.set(0,0.27,1.2); g.add(br);
    head.add(g); CL.glasses = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#4f86c6',0.6);
    for (const s of [-1,1]){ const w = new THREE.Mesh(new THREE.ConeGeometry(0.13,0.24,4), m); w.rotation.z = s*Math.PI/2; w.position.x = 0.12*s; w.scale.z = 0.5; g.add(w); }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.055,12,10), m));
    g.position.set(0,-0.6,0.98); head.add(g); CL.bow = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#f2a541',0.95); m.map = knitTex;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.93,0.16,14,48), m); ring.scale.set(1,0.86,1); g.add(ring);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.17,14,10), m); knot.position.set(0.72,-0.4,0.12); g.add(knot);
    g.position.set(0,-0.02,0.75); bodyFit.add(g); CL.scarf = {g, mats:[m]}; }
  { const geo = new THREE.CylinderGeometry(1,1,1,48,12,true), p = geo.attributes.position;
    for (let i=0;i<p.count;i++){
      const a = Math.atan2(p.getZ(i), p.getX(i)), zz = -0.85 + (p.getY(i)+0.5)*1.15;
      const k = Math.sqrt(Math.max(0.05, 1 - Math.pow((zz+0.25)/1.5, 2)));
      p.setXYZ(i, Math.cos(a)*1.0*k*1.12, Math.sin(a)*0.85*k*1.12, zz + 0.25);
    }
    geo.computeVertexNormals();
    const m = mat('#5aa469',0.95); m.map = knitTex; m.side = THREE.DoubleSide;
    const g = new THREE.Group(); g.add(new THREE.Mesh(geo, m)); bodyFit.add(g); CL.sweater = {g, mats:[m]}; }
  // holiday items
  { const g = new THREE.Group(), m = mat('#e2b53b',0.4);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.73,0.06,8,48), m); band.rotation.x = Math.PI/2; band.scale.set(1,0.9,1); band.position.set(0,-0.3,0.03); g.add(band);
    const star = new THREE.Mesh(extrude(starShape(0.18,0.08), 0.04), gold); star.position.set(0,-0.22,0.66); g.add(star);
    onHead('nyband', g, [m]); }
  { const g = new THREE.Group(), m = mat('#d23b32',0.6);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.32,0.42,24), m); body.position.y = 0.21; g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.326,0.33,0.08,24), gold); band.position.y = 0.05; g.add(band);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07,12,10), gold); top.position.y = 0.46; g.add(top);
    for (const s of [-1,1]){ const w = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.06,0.03), gold); w.position.set(0.4*s,0.3,0); w.rotation.z = -0.25*s; g.add(w); }
    onHead('caishen', g, [m]); }
  { const g = new THREE.Group(), m = mat('#e9638c',0.4), hg = extrude(heartShape(0.13), 0.03);
    for (const s of [-1,1]){ const h = new THREE.Mesh(hg, m); h.position.set(0.36*s,0.17,1.2); g.add(h); }
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.48,8), m); br.rotation.z = Math.PI/2; br.position.set(0,0.27,1.21); g.add(br);
    head.add(g); CL.heartgl = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#4f86c6',0.6);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32,24,12,0,Math.PI*2,0,Math.PI/2), m); g.add(cap);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.22,8), mat('#c9a86a',0.8)); stick.position.y = 0.42; g.add(stick);
    propeller = new THREE.Group(); propeller.position.y = 0.53;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.02,0.1), mat('#f3d250',0.6)); propeller.add(blade); g.add(propeller);
    onHead('propeller', g, [m], 0.56, 0.42); }
  { const g = new THREE.Group(), m = mat('#d23b32',0.7);
    const str = new THREE.Mesh(new THREE.TorusGeometry(0.95,0.025,6,48), mat('#e2b53b',0.5)); str.scale.set(1,0.86,1); g.add(str);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.15,14,10), m); pouch.scale.set(1,1.2,0.6); pouch.position.set(0,-0.92,0.12); g.add(pouch);
    const tas = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.18,8), mat('#e2b53b',0.5)); tas.position.set(0,-1.15,0.12); tas.rotation.x = Math.PI; g.add(tas);
    g.position.set(0,-0.02,0.78); bodyFit.add(g); CL.sachet = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#f2a6be',0.6);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.62,0.035,8,32,Math.PI), m); band.position.set(0,-0.5,0); g.add(band);
    for (const s of [-1,1]){ const e = new THREE.Group(); e.position.set(0.26*s,0.5,0); e.rotation.z = -0.18*s;
      const out = new THREE.Mesh(new THREE.SphereGeometry(1,16,12), white); out.scale.set(0.1,0.36,0.06); e.add(out);
      const inn = new THREE.Mesh(new THREE.SphereGeometry(1,12,10), m); inn.scale.set(0.05,0.26,0.02); inn.position.z = 0.045; e.add(inn); g.add(e); }
    onHead('bunny', g, [m], 0.6, 0.4); }
  { const g = new THREE.Group(), m = mat('#4b2f6b',0.7);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72,0.72,0.03,36), m); g.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.33,0.85,24), m); cone.position.set(0.05,0.42,0); cone.rotation.z = -0.15; g.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31,0.32,0.08,24), mat('#f2a541',0.6)); band.position.y = 0.07; g.add(band);
    onHead('witch', g, [m], 0.66, 0.42); }
  { const g = new THREE.Group(), m = mat('#d23b32',0.6), flop = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3,0.66,24), m); cone.position.y = 0.33; flop.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08,12,10), white); pom.position.y = 0.68; flop.add(pom);
    flop.rotation.z = 0.45; g.add(flop);
    const fur_ = new THREE.Mesh(new THREE.TorusGeometry(0.3,0.07,10,28), white); fur_.rotation.x = Math.PI/2; fur_.position.y = 0.03; g.add(fur_);
    onHead('santa', g, [m]); }
  Object.values(CL).forEach(c => c.g.visible = false);
})();

// ---------- egg ----------
const eggG = new THREE.Group(); scene.add(eggG);
const eggPts = []; for (let i=0;i<=24;i++){ const t = i/24*Math.PI; eggPts.push(new THREE.Vector2(Math.max(0.001, 0.52*Math.sin(t)*(1+0.14*Math.cos(t))), -Math.cos(t)*0.72)); }
const eggTex = canvasTex(256,128,(x,w,h)=>{ x.fillStyle = '#f1e6cf'; x.fillRect(0,0,w,h); x.fillStyle = '#a77d55';
  for (let i=0;i<46;i++){ x.beginPath(); x.ellipse(Math.random()*w, 10+Math.random()*(h-20), 3+Math.random()*7, 2+Math.random()*5, 0, 0, Math.PI*2); x.fill(); } });
const eggMat = new THREE.MeshStandardMaterial({map:eggTex, roughness:0.65});
const eggMesh = new THREE.Mesh(new THREE.LatheGeometry(eggPts, 32), eggMat); eggMesh.position.y = 0.74; eggMesh.userData.kind = 'egg';
const eggWob = new THREE.Group(); eggWob.add(eggMesh); eggG.add(eggWob);
const nest = new THREE.Mesh(new THREE.TorusGeometry(0.62,0.17,8,28), mat('#c9a86a',0.95)); nest.rotation.x = Math.PI/2; nest.position.y = 0.12; eggG.add(nest);
const eggShadow = makeShadow(1.8, 1.8);
let eggHalves = null;

// spotlight beam + evolution pillar
const beamMat = () => new THREE.MeshBasicMaterial({map:beamTex, color:'#fff1c2', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.7, 9, 32, 1, true), beamMat()); spot.position.y = 4.5; spot.visible = false; scene.add(spot);
const spotPool = new THREE.Mesh(new THREE.PlaneGeometry(4,4), new THREE.MeshBasicMaterial({map:radialTex('rgba(255,240,190,0.9)','rgba(255,240,190,0)'), transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending}));
spotPool.rotation.x = -Math.PI/2; spotPool.position.y = 0.012; spotPool.visible = false; scene.add(spotPool);
const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 16, 32, 1, true), beamMat()); pillar.position.y = 8; pillar.visible = false; scene.add(pillar);
const rings = [0,1,2].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(1.6,0.05,8,64), new THREE.MeshBasicMaterial({color:i===1?'#ffe08a':'#ffffff', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
  m.rotation.x = Math.PI/2; m.visible = false; scene.add(m); return m; });

// ---------- world layout & buildings ----------
const BOUND = 5.4, WANDER = 4.4;
const SPOTS = { house:V3(-4.0,0,-3.5), pond:V3(4.0,0,-3.4), lamp:V3(1.0,0,-5.3), flowers:V3(-4.5,0,3.0) };
const ringSpot = deg => V3(Math.sin(deg*Math.PI/180)*8.3, 0, Math.cos(deg*Math.PI/180)*8.3);
const BUILDS = [
  {id:'house',   name:'袋熊小窩', price:120, desc:'晚上、下雨或累了會躲進去睡，睡得比較好。', r:2.3},
  {id:'pond',    name:'小水池',   price:90,  desc:'不用再擺水碗，按喝水牠就會自己走去喝。', r:1.9},
  {id:'lamp',    name:'路燈',     price:60,  desc:'天黑會亮起來。', r:0.5},
  {id:'flowers', name:'花圃',     price:40,  desc:'看著花，心情掉得比較慢。', r:1.4},
  {id:'fence',   name:'木圍籬',   price:80,  desc:'圍出一個家，雜草長得比較慢。', r:0},
  {id:'fireworks', name:'煙火台',   price:80, desc:'晚上會自己放煙火。', r:0, holiday:'newyear',   spot:100},
  {id:'lanterns',  name:'紅燈籠串', price:70, desc:'一整串喜氣的紅燈籠，晚上會亮。', r:0, holiday:'cny', spot:130},
  {id:'heartarch', name:'愛心拱門', price:70, desc:'粉紅色的拱門。', r:0, holiday:'valentine', spot:160},
  {id:'slide',     name:'溜滑梯',   price:80, desc:'公園裡的那種溜滑梯。', r:0, holiday:'children', spot:190},
  {id:'dragonboat',name:'小龍舟',   price:80, desc:'放在院子外的迷你龍舟。', r:0, holiday:'dragon', spot:220},
  {id:'moonlamp',  name:'月亮燈',   price:70, desc:'晚上會發光的大月亮。', r:0, holiday:'midautumn', spot:250},
  {id:'pumpkins',  name:'南瓜燈',   price:70, desc:'三顆會發光的南瓜。', r:0, holiday:'halloween', spot:280},
  {id:'xmastree',  name:'聖誕樹',   price:90, desc:'掛滿彩球，頂端有顆星星。', r:0, holiday:'christmas', spot:310}
];
const BG = {}, nightGlow = [];
function faceCenter(g, p){ g.position.copy(p); g.rotation.y = Math.atan2(-p.x, -p.z); }
function glowMat(color, emissive){ const m = new THREE.MeshStandardMaterial({color, emissive, emissiveIntensity:0, roughness:0.5}); nightGlow.push(m); return m; }
function signTexture(name){
  return canvasTex(256,128,(x,w,h)=>{ x.fillStyle = '#b98b5a'; x.fillRect(0,0,w,h); x.strokeStyle = '#8a6239'; x.lineWidth = 10; x.strokeRect(5,5,w-10,h-10);
    x.fillStyle = '#3b2a1c'; x.font = 'bold 56px "LXGW WenKai TC","PingFang TC",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name || '小窩', w/2, h/2+4); });
}
function build(id){
  if (BG[id]) return;
  const g = new THREE.Group(), wood = mat('#9a7350',0.9);
  if (id === 'house'){
    const domeTex = canvasTex(256,128,(x,w,h)=>{ x.fillStyle = '#7f8f5b'; x.fillRect(0,0,w,h);
      for (let i=0;i<900;i++){ x.fillStyle = Math.random()<.5 ? 'rgba(60,80,40,.35)' : 'rgba(170,180,110,.35)'; x.fillRect(Math.random()*w, Math.random()*h, 2, 4); } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 48, 24, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshStandardMaterial({map:domeTex, roughness:0.95}));
    dome.scale.y = 0.95; dome.userData.kind = 'house'; g.add(dome);
    const dark = new THREE.MeshBasicMaterial({color:'#1a1410'});
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32, 0, Math.PI), dark); hole.position.set(0, 0.02, 2.17); g.add(hole);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.1, 8, 24, Math.PI), mat('#8c7a66',0.9)); rim.position.set(0, 0.02, 2.15); g.add(rim);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.8,16), mat('#a35e46',0.9)); chim.position.set(0.8, 2.0, -0.6); g.add(chim);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.1,8), mat('#7a5634',0.9)); post.position.set(1.55,0.55,2.0); g.add(post);
    const sideM = mat('#b98b5a');
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.45,0.06), [sideM,sideM,sideM,sideM,new THREE.MeshStandardMaterial({map:signTexture(S.name), roughness:0.9}),sideM]);
    sign.position.set(1.55,1.15,2.04); g.add(sign);
    g.userData.dome = dome; g.userData.sign = sign;
    faceCenter(g, SPOTS.house);
  } else if (id === 'pond'){
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), new THREE.MeshStandardMaterial({color:'#6fa8c9', roughness:0.15, metalness:0.1}));
    water.rotation.x = -Math.PI/2; water.position.y = 0.03; water.scale.set(1.15,1,1); g.add(water);
    for (let i=0;i<16;i++){ const a = i/16*Math.PI*2; const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.16,0.24),10,8), mat(['#9c9a92','#b3b0a6','#85837c'][i%3],0.9));
      s.position.set(Math.cos(a)*1.55, 0.06, Math.sin(a)*1.35); s.scale.y = 0.55; g.add(s); }
    g.position.copy(SPOTS.pond);
  } else if (id === 'lamp'){
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.09,2.6,10), mat('#3a3f3a',0.6)); pole.position.y = 1.3; g.add(pole);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12), glowMat('#fff3c4','#ffd36b')); cap.position.y = 2.7; g.add(cap);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32,0.25,16), mat('#3a3f3a',0.6)); hat.position.y = 2.95; g.add(hat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,220,130,0.9)','rgba(255,220,130,0)'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
    glow.position.y = 2.7; glow.scale.setScalar(1.8); g.add(glow);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4,4), new THREE.MeshBasicMaterial({map:radialTex('rgba(255,210,120,0.55)','rgba(255,210,120,0)'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
    pool.rotation.x = -Math.PI/2; pool.position.y = 0.01; g.add(pool);
    g.userData.glows = [glow.material, pool.material];
    g.position.copy(SPOTS.lamp);
  } else if (id === 'flowers'){
    const soil = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), mat('#6b4f37',1)); soil.rotation.x = -Math.PI/2; soil.position.y = 0.012; g.add(soil);
    const stemG = new THREE.CylinderGeometry(0.02,0.02,0.4,5), headG = new THREE.SphereGeometry(0.1,10,8), cols = ['#f2a541','#e0607e','#f3d250','#9b6fc4','#f2f0ea'];
    for (let i=0;i<16;i++){ const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*0.95, h = rnd(0.3,0.5);
      const st = new THREE.Mesh(stemG, mat('#5a8a42')); st.scale.y = h/0.4; st.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); g.add(st);
      const hd = new THREE.Mesh(headG, mat(cols[i%5],0.6)); hd.position.set(Math.cos(a)*r, h, Math.sin(a)*r); g.add(hd); }
    g.position.copy(SPOTS.flowers);
  } else if (id === 'fence'){
    const N = 40, R = 7.1, postG = new THREE.BoxGeometry(0.14,0.9,0.14);
    for (let i=0;i<N;i++){
      const a = i/N*Math.PI*2, a2 = (i+1)/N*Math.PI*2, len = 2*R*Math.sin(Math.PI/N);
      const p = new THREE.Mesh(postG, wood); p.position.set(Math.cos(a)*R, 0.45, Math.sin(a)*R); g.add(p);
      for (const y of [0.35, 0.68]){ const rail = new THREE.Mesh(new THREE.BoxGeometry(len,0.08,0.06), wood);
        rail.position.set(Math.cos((a+a2)/2)*R*Math.cos(Math.PI/N), y, Math.sin((a+a2)/2)*R*Math.cos(Math.PI/N)); rail.rotation.y = -((a+a2)/2) + Math.PI/2; g.add(rail); }
    }
  } else if (id === 'fireworks'){
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.5,0.9), mat('#8c2f2a',0.8)); box.position.y = 0.25; g.add(box);
    for (let i=0;i<4;i++){ const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.5,10), mat(['#e2b53b','#4f86c6','#5aa469','#e0607e'][i],0.6)); t.position.set((i%2-0.5)*0.4, 0.7, (Math.floor(i/2)-0.5)*0.4); g.add(t); }
    faceCenter(g, ringSpot(100));
  } else if (id === 'lanterns'){
    for (const s of [-1,1]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,2.6,8), wood); p.position.set(1.6*s,1.3,0); g.add(p); }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,3.2,6), mat('#3b2a1c')); rope.rotation.z = Math.PI/2; rope.position.y = 2.45; g.add(rope);
    const red = glowMat('#d23b32','#ff7a3c'), goldC = mat('#e2b53b',0.4);
    for (let i=0;i<5;i++){ const x = -1.2 + i*0.6, l = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12), red); l.scale.y = 1.15; l.position.set(x,2.05,0); g.add(l);
      for (const y of [2.32,1.78]){ const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.06,12), goldC); c.position.set(x,y,0); g.add(c); } }
    faceCenter(g, ringSpot(130));
  } else if (id === 'heartarch'){
    const pink = mat('#f2a6be',0.6);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.3,0.14,12,40,Math.PI), pink); g.add(arc);
    const hg = extrude(heartShape(0.25), 0.1);
    for (let i=0;i<5;i++){ const a = i/4*Math.PI; const h = new THREE.Mesh(hg, mat('#e0607e',0.5)); h.position.set(Math.cos(a)*1.3, Math.sin(a)*1.3, 0.1); g.add(h); }
    faceCenter(g, ringSpot(160));
  } else if (id === 'slide'){
    const blue = mat('#4f86c6',0.6), yel = mat('#f3d250',0.6);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1,0.1,1), yel); top.position.y = 1.5; g.add(top);
    for (const [x,z] of [[-0.45,-0.45],[0.45,-0.45],[-0.45,0.45],[0.45,0.45]]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.5,8), blue); p.position.set(x,0.75,z); g.add(p); }
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.06,2.4), mat('#e45b5b',0.5)); sl.position.set(0,0.78,1.45); sl.rotation.x = 0.66; g.add(sl);
    for (let i=0;i<5;i++){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.9,6), blue); r.rotation.z = Math.PI/2; r.position.set(0,0.25+i*0.28,-0.55); g.add(r); }
    faceCenter(g, ringSpot(190));
  } else if (id === 'dragonboat'){
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2), mat('#d23b32',0.6)); hull.scale.set(0.6,0.4,2.2); hull.position.y = 0.4; hull.material.side = THREE.DoubleSide; g.add(hull);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1,0.05,6,40), mat('#e2b53b',0.4)); rim.scale.set(0.6,2.2,1); rim.rotation.x = Math.PI/2; rim.position.y = 0.4; g.add(rim);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.28,14,10), mat('#5aa469',0.6)); hd.position.set(0,0.95,2.15); hd.scale.z = 1.4; g.add(hd);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,0.6,10), hd.material); neck.position.set(0,0.65,2.05); neck.rotation.x = 0.4; g.add(neck);
    for (const s of [-1,1]){ const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.25,8), mat('#e2b53b',0.4)); horn.position.set(0.12*s,1.2,2.05); horn.rotation.x = -0.4; g.add(horn); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15,0.6,8), hd.material); tail.position.set(0,0.8,-2.2); tail.rotation.x = -0.5; g.add(tail);
    g.position.copy(ringSpot(220)); g.rotation.y = Math.atan2(-g.position.x, -g.position.z) + Math.PI/2;
  } else if (id === 'moonlamp'){
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.25,1.1,10), wood); st.position.y = 0.55; g.add(st);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.8,32,20), glowMat('#fff1b8','#ffe08a')); moon.position.y = 1.85; g.add(moon);
    const rab = new THREE.Mesh(new THREE.CircleGeometry(0.22,16), new THREE.MeshBasicMaterial({color:'#e6d48e', transparent:true, opacity:0.6})); rab.position.set(0.15,2.0,0.79); g.add(rab);
    faceCenter(g, ringSpot(250));
  } else if (id === 'pumpkins'){
    const face = new THREE.MeshBasicMaterial({color:'#2a1a0c'});
    [[-0.9,0.45],[0,0.6],[0.9,0.4]].forEach(([x,s]) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(s,20,14), glowMat('#e8833a','#ff9a2e')); p.scale.y = 0.78; p.position.set(x, s*0.78, 0); g.add(p);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.06,0.2,6), mat('#4c6b35')); stem.position.set(x, s*1.56+0.06, 0); g.add(stem);
      for (const ex of [-0.35,0.35]){ const e = new THREE.Mesh(new THREE.CircleGeometry(s*0.17,3), face); e.position.set(x+ex*s, s*0.95, s*0.97); e.rotation.z = Math.PI/2*(ex<0?1:1)+Math.PI/6; g.add(e); }
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(s*0.7,s*0.12), face); mouth.position.set(x, s*0.55, s*0.99); g.add(mouth);
    });
    faceCenter(g, ringSpot(280));
  } else if (id === 'xmastree'){
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.5,10), wood); trunk.position.y = 0.25; g.add(trunk);
    const green = mat('#2f6b45',0.8);
    [[1.1,1.3,0.95],[0.85,1.1,1.65],[0.6,0.9,2.25]].forEach(([r,h,y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r,h,20), green); c.position.y = y; g.add(c); });
    for (let i=0;i<18;i++){ const y = rnd(0.6,2.4), r = (2.7-y)*0.42, a = Math.random()*Math.PI*2;
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8), glowMat(['#e45b5b','#e2b53b','#4f86c6','#f2f0ea'][i%4], ['#ff6b6b','#ffd36b','#7fb2ff','#ffffff'][i%4])); o.position.set(Math.sin(a)*r, y, Math.cos(a)*r); g.add(o); }
    const star = new THREE.Mesh(extrude(starShape(0.26,0.11),0.06), glowMat('#e2b53b','#ffd36b')); star.position.y = 2.85; g.add(star);
    faceCenter(g, ringSpot(310));
  }
  scene.add(g); BG[id] = g;
}
function unbuildAll(){ Object.keys(BG).forEach(id => { scene.remove(BG[id]); delete BG[id]; }); nightGlow.length = 0; }
function obstacles(){ return BUILDS.filter(b => b.r && BG[b.id]).map(b => ({c:SPOTS[b.id], r:b.r})); }
function houseDoor(){ const h = SPOTS.house, d = V3(-h.x,0,-h.z).normalize(); return h.clone().addScaledVector(d, 2.2 + 1.6*petS + 0.3); }

// ---------- holidays ----------
const HOLIDAYS = [
  {id:'newyear',   name:'元旦',   date:'01-01', song:'newyear',   tint:['#d8d0f0',0.18], deco:'fireworks'},
  {id:'cny',       name:'春節',   lunar:{2026:'02-17',2027:'02-06',2028:'01-26',2029:'02-13',2030:'02-03'}, song:'cny', tint:['#efb6a0',0.22], deco:'lanterns'},
  {id:'valentine', name:'情人節', date:'02-14', song:'valentine', tint:['#f3c4d4',0.25], deco:'hearts'},
  {id:'children',  name:'兒童節', date:'04-04', song:'children',  tint:['#cfe3f2',0.2],  deco:'balloons'},
  {id:'dragon',    name:'端午節', lunar:{2026:'06-19',2027:'06-09',2028:'05-28',2029:'06-16',2030:'06-05'}, song:'dragon', tint:['#cfe0c4',0.15], deco:'leaves'},
  {id:'midautumn', name:'中秋節', lunar:{2026:'09-25',2027:'09-15',2028:'10-03',2029:'09-22',2030:'09-12'}, song:'midautumn', tint:['#d8c895',0.18], deco:'moon'},
  {id:'halloween', name:'萬聖節', date:'10-31', song:'halloween', tint:['#9b7fb3',0.3],  deco:'pumpkins'},
  {id:'christmas', name:'聖誕節', date:'12-25', song:'christmas', tint:['#d6e6e0',0.15], deco:'gifts'}
];
const mdKey = d => pad(d.getMonth()+1) + '-' + pad(d.getDate());
const holidayOn = (h, d) => h.date ? h.date === mdKey(d) : !!(h.lunar && h.lunar[d.getFullYear()] === mdKey(d));
let previewHoliday = null;
function realHoliday(){ const d = new Date(); return HOLIDAYS.find(h => holidayOn(h, d)) || null; }
function activeHoliday(){ return previewHoliday ? HOLIDAYS.find(h => h.id === previewHoliday) : realHoliday(); }
function nextHoliday(){ for (let i=1;i<=400;i++){ const d = new Date(Date.now() + i*86400000), h = HOLIDAYS.find(x => holidayOn(x, d)); if (h) return {h, d}; } return null; }
let decoId = null, decoT = 0; const decoObjs = [];
function setupDeco(h){
  decoObjs.forEach(o => scene.remove(o)); decoObjs.length = 0; decoId = h ? h.id : null;
  if (!h) return;
  const ring = (emoji, n, y, size) => { for (let i=0;i<n;i++){ const a = i/n*Math.PI*2 + 0.2, s = new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex(emoji), transparent:true, depthWrite:false}));
    s.position.set(Math.sin(a)*6.6, y, Math.cos(a)*6.6); s.scale.setScalar(size); s.userData.y = y; s.userData.ph = i; scene.add(s); decoObjs.push(s); } };
  if (h.deco === 'pumpkins') ring('🎃', 10, 0.42, 0.9);
  if (h.deco === 'gifts') ring('🎁', 10, 0.4, 0.8);
  if (h.deco === 'lanterns') ring('🏮', 8, 2.6, 0.9);
  if (h.deco === 'leaves') ring('🌿', 10, 0.35, 0.7);
  if (h.deco === 'moon'){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,244,200,1)','rgba(255,236,170,0)'), transparent:true, depthWrite:false}));
    s.position.set(-9, 10, -16); s.scale.setScalar(9); s.userData.y = 10; scene.add(s); decoObjs.push(s);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,248,215,1)','rgba(255,248,215,0.9)'), transparent:true, depthWrite:false}));
    core.position.set(-9,10,-15.9); core.scale.setScalar(3.4); core.userData.y = 10; scene.add(core); decoObjs.push(core); }
}
function fireworkBurst(at){
  const cols = ['#ff6b6b','#ffd36b','#7fb2ff','#9bf0a0','#f2a6be','#ffffff'], col = cols[Math.floor(Math.random()*cols.length)];
  const tex = radialTex(col, 'rgba(0,0,0,0)');
  for (let i=0;i<28;i++){ const a = Math.random()*Math.PI*2, b = Math.acos(rnd(-1,1)), sp = rnd(2.5,3.5);
    floatSprite(tex, at, {size:0.35, vx:Math.sin(b)*Math.cos(a)*sp, vy:Math.cos(b)*sp, vz:Math.sin(b)*Math.sin(a)*sp, g:2.5, max:1.4, add:true, grow:0}); }
  sfx('firework');
}
function updateDeco(dt, t){
  const h = activeHoliday();
  if ((h ? h.id : null) !== decoId) setupDeco(h);
  decoObjs.forEach(s => { if (s.userData.ph !== undefined) s.position.y = s.userData.y + Math.sin(t*1.5 + s.userData.ph)*0.08; });
  if (h){
    decoT -= dt;
    const at = () => V3(camTarget.x + rnd(-6,6), 0.3, camTarget.z + rnd(-6,6));
    if (decoT <= 0) switch (h.deco){
      case 'hearts':   decoT = 0.6; floatSprite(emojiTex('💗'), at(), {size:0.5, vy:0.8, max:5, grow:0}); break;
      case 'balloons': decoT = 0.9; floatSprite(emojiTex(['🎈','🎈','🎈','🪁'][Math.floor(Math.random()*4)]), at(), {size:0.8, vy:1.0, vx:rnd(-0.2,0.2), max:7, grow:0}); break;
      case 'lanterns': decoT = 1.4; floatSprite(emojiTex('🏮'), at(), {size:0.6, vy:0.6, max:8, grow:0}); break;
      case 'leaves':   decoT = 0.8; { const p = at(); p.y = 5; floatSprite(emojiTex('🍃'), p, {size:0.45, vy:-0.7, vx:rnd(-0.5,0.5), max:7, grow:0}); } break;
      case 'pumpkins': decoT = 2.5; { const p = at(); p.y = rnd(2,4); floatSprite(emojiTex('🦇'), p, {size:0.6, vy:rnd(-0.2,0.4), vx:rnd(-2,2), vz:rnd(-2,2), max:4, grow:0}); } break;
      case 'fireworks': decoT = rnd(1.2,2.4); fireworkBurst(V3(camTarget.x + rnd(-7,7), rnd(6,9), camTarget.z + rnd(-9,-3))); break;
      case 'gifts': case 'moon': decoT = 99; break;
    }
  }
  if (BG.fireworks && nightF > 0.6){ BG.fireworks.userData.t = (BG.fireworks.userData.t || 3) - dt;
    if (BG.fireworks.userData.t <= 0){ BG.fireworks.userData.t = rnd(3,6); fireworkBurst(BG.fireworks.position.clone().add(V3(rnd(-1,1), rnd(5,7), rnd(-1,1)))); } }
}

// ---------- weather & sky particles ----------
const RN = 800, rainPos = new Float32Array(RN*6), rainSpd = new Float32Array(RN);
for (let i=0;i<RN;i++){ const x = rnd(-11,11), y = rnd(0,11), z = rnd(-11,11); rainPos.set([x,y,z,x+0.08,y+0.4,z], i*6); rainSpd[i] = rnd(11,15); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos,3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({color:'#a9bccf', transparent:true, opacity:0.55}));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const SN = 600, snowPos = new Float32Array(SN*3);
for (let i=0;i<SN;i++) snowPos.set([rnd(-11,11), rnd(0,11), rnd(-11,11)], i*3);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos,3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({map:radialTex('rgba(255,255,255,1)','rgba(255,255,255,0)'), size:0.16, transparent:true, depthWrite:false}));
snow.frustumCulled = false; snow.visible = false; scene.add(snow);
const FN = 26, ffPos = new Float32Array(FN*3), ffSeed = [];
for (let i=0;i<FN;i++) ffSeed.push({x:rnd(-6,6), z:rnd(-6,6), y:rnd(0.4,2), p:rnd(0,9), cx:0, cy:0, cz:0});
const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos,3));
const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({map:radialTex('rgba(235,250,150,1)','rgba(235,250,150,0)'), size:0.28, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
fireflies.frustumCulled = false; fireflies.visible = false; scene.add(fireflies);
const WX = {
  sunny: {name:'晴天', dim:1,    grey:0},
  cloudy:{name:'多雲', dim:0.88, grey:0.18},
  rain:  {name:'下雨', dim:0.72, grey:0.35},
  storm: {name:'雷雨', dim:0.58, grey:0.5},
  snow:  {name:'下雪', dim:0.95, grey:0, white:0.28}
};

// ---------- sound & music ----------
const SND = {ctx:null, on:false, songId:null, song:null, step:0, next:0};
function audio(){
  if (SND.ctx) return SND.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const c = new AC(); SND.ctx = c;
  const master = c.createGain(); master.gain.value = 0.5;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; master.connect(lp); lp.connect(c.destination);
  const music = c.createGain(); music.gain.value = 0; music.connect(master);
  const dly = c.createDelay(1); dly.delayTime.value = 0.43; const fb = c.createGain(); fb.gain.value = 0.25; const wet = c.createGain(); wet.gain.value = 0.2;
  music.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(master);
  const sfxBus = c.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
  const mk = sec => { const b = c.createBuffer(1, Math.floor(c.sampleRate*sec), c.sampleRate), d = b.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1; return b; };
  Object.assign(SND, {master, music, sfx:sfxBus, noise:mk(0.1), noiseLong:mk(2.5)});
  return c;
}
const mtof = m => 440*Math.pow(2,(m-69)/12);
function tone(type, f, t, peak, dec, dest, att=0.006){
  const c = SND.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f,t);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002),t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+att+dec);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t+att+dec+0.05); return o;
}
function noiseHit(t, dur, peak, type, freq, dest, buf, q){
  const c = SND.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf || SND.noise; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t+dur+0.05); return {s, f};
}
const SONGS = {
  morning:  {bpm:104, lead:'bell', perc:'shaker', mel:[76,0,79,76,72,0,74,76, 72,0,69,0,67,69,72,0, 69,0,72,74,76,0,74,72, 74,0,71,74,79,0,0,0, 79,76,79,81,79,76,74,76, 72,0,76,0,74,72,69,0, 69,72,74,0,72,69,67,0, 67,71,74,79,0,76,72,0], bass:[[48,55],[45,52],[41,48],[43,50]], ch:[[64,67],[64,69],[65,69],[62,67]]},
  day:      {bpm:116, lead:'pluck', perc:'shaker', mel:[67,71,74,71,76,74,71,0, 72,76,79,76,74,0,71,0, 69,72,76,72,74,71,67,0, 71,74,78,74,79,0,0,0], bass:[[43,50],[48,55],[45,52],[50,57]], ch:[[71,74],[72,76],[72,76],[74,78]]},
  evening:  {bpm:88,  lead:'soft', perc:'none', mel:[69,0,72,0,77,76,74,72, 74,0,0,69,72,74,77,0, 74,0,70,0,72,74,77,79, 76,0,72,0,0,0,0,0], bass:[[41,48],[38,45],[46,53],[48,55]], ch:[[65,69],[65,69],[65,70],[64,67]]},
  night:    {bpm:70,  lead:'celesta', perc:'none', sparse:true, mel:[79,0,76,0,72,0,0,0, 76,0,72,0,69,0,0,0, 72,0,74,0,76,0,77,0, 74,0,0,0,71,0,0,0], bass:[[48,55],[45,52],[41,48],[43,50]], ch:[[64,67],[64,69],[65,69],[62,67]]},
  rain:     {bpm:80,  lead:'piano', perc:'none', mel:[76,0,74,72,0,72,74,76, 72,0,0,0,69,0,0,0, 67,0,69,72,0,74,72,69, 71,0,0,0,0,0,0,0], bass:[[45,52],[41,48],[48,55],[43,50]], ch:[[64,69],[65,69],[64,67],[62,67]]},
  storm:    {bpm:96,  lead:'square', perc:'drum', mel:[62,0,65,0,69,68,0,0, 62,0,65,0,70,69,0,0, 62,65,69,72,70,69,65,62, 61,0,0,0,0,0,0,0], bass:[[38,45],[38,45],[34,41],[33,40]], ch:[[62,65],[62,65],[62,65],[61,64]]},
  snow:     {bpm:120, lead:'bell', perc:'sleigh', mel:[78,76,74,76,78,0,81,0, 79,78,76,0,74,0,0,0, 76,78,79,81,83,81,79,78, 76,0,74,0,0,0,0,0], bass:[[38,45],[43,50],[45,52],[38,45]], ch:[[66,69],[67,71],[69,73],[66,69]]},
  newyear:  {bpm:126, lead:'square', perc:'drum', mel:[72,0,72,76,79,0,76,79, 84,0,0,0,79,0,0,0, 81,79,77,76,74,76,77,79, 72,0,0,0,0,0,0,0], bass:[[48,55],[48,55],[41,48],[43,50]], ch:[[64,67],[64,67],[65,69],[62,67]]},
  cny:      {bpm:120, lead:'pluck', perc:'gong', mel:[72,74,76,79,76,74,72,0, 69,72,74,0,72,69,67,0, 67,69,72,74,76,79,76,74, 72,0,0,0,72,0,0,0], bass:[[48,55],[45,52],[43,50],[48,55]], ch:[[64,67],[64,69],[62,67],[64,67]]},
  valentine:{bpm:92,  lead:'soft', perc:'shaker', mel:[76,77,79,0,84,0,79,0, 77,76,74,0,77,0,0,0, 74,76,77,0,81,0,77,0, 76,0,74,0,72,0,0,0], bass:[[48,55],[45,52],[41,48],[43,50]], ch:[[64,67],[64,69],[65,69],[62,67]]},
  children: {bpm:126, lead:'pluck', perc:'drum', mel:[72,72,76,76,79,79,76,0, 77,77,74,74,71,71,67,0, 72,74,76,77,79,81,79,76, 74,0,79,0,72,0,0,0], bass:[[48,55],[41,48],[43,50],[48,55]], ch:[[64,67],[65,69],[62,67],[64,67]]},
  dragon:   {bpm:132, lead:'pluck', perc:'drum', mel:[69,0,72,74,76,0,74,72, 69,0,67,0,69,0,0,0, 72,74,76,79,81,79,76,74, 76,0,0,0,0,0,0,0], bass:[[45,52],[43,50],[48,55],[45,52]], ch:[[64,69],[62,67],[64,67],[64,69]]},
  midautumn:{bpm:76,  lead:'soft', perc:'none', mel:[76,0,79,0,81,0,79,76, 74,0,76,0,72,0,0,0, 69,0,72,0,74,76,74,72, 69,0,0,0,0,0,0,0], bass:[[45,52],[48,55],[43,50],[45,52]], ch:[[64,69],[64,67],[62,67],[64,69]]},
  halloween:{bpm:100, lead:'square', perc:'drum', mel:[69,72,76,75,76,0,72,0, 69,72,76,77,76,75,72,0, 71,74,77,76,77,0,74,0, 68,71,74,72,71,68,64,0], bass:[[45,52],[45,52],[38,45],[40,47]], ch:[[60,64],[60,64],[62,65],[62,68]]},
  christmas:{bpm:112, lead:'bell', perc:'sleigh', mel:[79,79,76,79,81,79,76,0, 74,76,79,76,74,72,71,0, 72,74,76,77,79,81,83,84, 79,0,0,0,0,0,0,0], bass:[[43,50],[48,55],[50,57],[43,50]], ch:[[71,74],[72,76],[74,78],[71,74]]}
};
const SONG_NAME = {morning:'早晨', day:'午後', evening:'黃昏', night:'夜晚', rain:'雨天', storm:'雷雨', snow:'雪天'};
function voice(kind, m, t, v){
  const f = mtof(m), out = SND.music;
  switch (kind){
    case 'bell':    tone('sine',f,t,v,1.2,out); tone('sine',f*2,t,v*0.28,0.6,out); tone('sine',f*3.01,t,v*0.07,0.3,out); break;
    case 'pluck':   tone('triangle',f,t,v*1.1,0.35,out); tone('square',f,t,v*0.12,0.12,out); break;
    case 'soft':    tone('sine',f,t,v,1.0,out,0.05); tone('triangle',f/2,t,v*0.25,0.8,out,0.05); break;
    case 'celesta': tone('sine',f*2,t,v*0.8,0.9,out); tone('sine',f*4,t,v*0.12,0.3,out); break;
    case 'piano':   tone('triangle',f,t,v*1.1,0.9,out); tone('sine',f*2,t,v*0.3,0.4,out); break;
    case 'square':  tone('square',f,t,v*0.35,0.22,out); break;
  }
}
function perc(kind, i, bar, t){
  const out = SND.music;
  if (kind === 'shaker' && i%2 === 1) noiseHit(t, 0.05, 0.028, 'highpass', 7000, out);
  if (kind === 'sleigh'){ noiseHit(t, 0.06, i%4===0 ? 0.05 : 0.022, 'highpass', 8500, out); }
  if (kind === 'drum' || kind === 'gong'){
    if (i === 0 || i === 4){ const o = tone('sine',130,t,0.35,0.25,out); o.frequency.exponentialRampToValueAtTime(48,t+0.2); }
    if (i === 2 || i === 6) noiseHit(t, 0.1, 0.09, 'bandpass', 1800, out);
  }
  if (kind === 'gong' && bar === 0 && i === 0){ tone('sine',98,t,0.2,2.6,out); tone('sine',147.5,t,0.08,1.8,out); noiseHit(t, 1.2, 0.05, 'bandpass', 900, out, SND.noiseLong, 3); }
}
function schedule(step, t){
  const g = SND.song, i = step%8, bar = Math.floor(step/8)%4, m = g.mel[step % g.mel.length];
  if (m) voice(g.lead, m, t, 0.15);
  const bs = g.bass[bar];
  if (i === 0) tone('sine', mtof(bs[0]), t, 0.2, g.sparse ? 1.8 : 0.5, SND.music);
  if (i === 4 && !g.sparse) tone('sine', mtof(bs[1]), t, 0.14, 0.5, SND.music);
  if (!g.sparse && (i === 2 || i === 6)) g.ch[bar].forEach(n => tone('triangle', mtof(n), t, 0.04, 0.25, SND.music));
  if (g.sparse && i === 0) g.ch[bar].forEach((n,k) => tone('sine', mtof(n), t + k*0.3, 0.035, 1.4, SND.music));
  perc(g.perc, i, bar, t);
}
function wantedSong(){
  const h = activeHoliday(); if (h) return h.song;
  const w = weatherNow(); if (w === 'rain' || w === 'storm' || w === 'snow') return w;
  return dayInfo().phase;
}
function tick(){
  const c = SND.ctx;
  while (SND.next < c.currentTime + 0.15){
    if (SND.step % 8 === 0){ const w = wantedSong(); if (w !== SND.songId){ SND.songId = w; SND.song = SONGS[w]; SND.step = 0; } }
    schedule(SND.step, SND.next); SND.next += 60/SND.song.bpm/2; SND.step++;
  }
}
function duck(on){ if (SND.ctx && SND.on) SND.music.gain.setTargetAtTime(on ? 0.12 : 0.9, SND.ctx.currentTime, 0.2); }
function setSound(on){
  const c = audio(); if (!c){ toast('這個瀏覽器不支援播放聲音。'); return; }
  c.resume(); SND.on = on;
  if (on){ SND.songId = wantedSong(); SND.song = SONGS[SND.songId]; SND.next = c.currentTime + 0.08; SND.step = 0;
    SND.music.gain.cancelScheduledValues(c.currentTime); SND.music.gain.setTargetAtTime(0.9, c.currentTime, 0.05); clearInterval(SND.timer); SND.timer = setInterval(tick, 30); }
  else { clearInterval(SND.timer); SND.music.gain.setTargetAtTime(0, c.currentTime, 0.08); rainSound(false); }
  $('#btnMusic').setAttribute('aria-pressed', on ? 'true' : 'false');
  hudDirty = true;
}
function rainSound(on){
  if (!SND.ctx) return;
  if (on && !SND.rainSrc){
    const c = SND.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = SND.noiseLong; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6; g.gain.value = 0.0001;
    s.connect(bp); bp.connect(g); g.connect(SND.master); s.start(); g.gain.setTargetAtTime(0.06, c.currentTime, 0.5);
    SND.rainSrc = s; SND.rainGain = g;
  } else if (!on && SND.rainSrc){
    const s = SND.rainSrc; SND.rainGain.gain.setTargetAtTime(0.0001, SND.ctx.currentTime, 0.4); setTimeout(()=>{ try{ s.stop(); }catch(e){} }, 2000); SND.rainSrc = null;
  }
}
function sfx(name){
  if (!SND.on || !SND.ctx) return;
  const c = SND.ctx, t = c.currentTime, out = SND.sfx; let o;
  switch(name){
    case 'boing': o = tone('sine',260,t,0.35,0.3,out); o.frequency.exponentialRampToValueAtTime(720,t+0.18); break;
    case 'thud':  o = tone('sine',150,t,0.45,0.22,out); o.frequency.exponentialRampToValueAtTime(55,t+0.15); break;
    case 'plop':  o = tone('sine',600,t,0.35,0.18,out); o.frequency.exponentialRampToValueAtTime(140,t+0.12); break;
    case 'nom':   o = tone('triangle',520,t,0.2,0.09,out); o.frequency.exponentialRampToValueAtTime(360,t+0.07); break;
    case 'drink': o = tone('sine',380,t,0.22,0.12,out); o.frequency.exponentialRampToValueAtTime(760,t+0.08); break;
    case 'pop':   o = tone('sine',900,t,0.15,0.08,out); o.frequency.exponentialRampToValueAtTime(1300,t+0.05); break;
    case 'coin':  tone('square',1318,t,0.06,0.08,out); tone('square',1760,t+0.07,0.06,0.18,out); break;
    case 'happy': [72,76,79,84].forEach((m,i)=>tone('sine',mtof(m),t+i*0.07,0.16,0.4,out)); break;
    case 'sad':   [67,64,60].forEach((m,i)=>tone('sine',mtof(m),t+i*0.25,0.14,0.6,out)); break;
    case 'whoosh': noiseHit(t, 0.3, 0.25, 'bandpass', 1500, out); break;
    case 'splash': noiseHit(t, 0.35, 0.35, 'bandpass', 1100, out, null, 0.8); [0.08,0.16,0.22].forEach(d => { const q = tone('sine', rnd(900,1400), t+d, 0.08, 0.08, out); q.frequency.exponentialRampToValueAtTime(rnd(400,600), t+d+0.07); }); break;
    case 'thunder': noiseHit(t, 2.2, 0.9, 'lowpass', 180, out, SND.noiseLong); break;
    case 'firework': { const o2 = tone('sine', 1200, t, 0.04, 0.5, out); o2.frequency.exponentialRampToValueAtTime(300, t+0.45); noiseHit(t+0.5, 0.6, 0.18, 'lowpass', 900, out, SND.noiseLong); break; }
    case 'roll':  for (let i=0;i<14;i++) noiseHit(t+i*0.1, 0.06, 0.06 + i*0.012, 'bandpass', 220, out); break;
    case 'hatch': [60,64,67,72,76,79,84].forEach((m,i)=>tone('square',mtof(m),t+i*0.06,0.05,0.5,out)); tone('sine',mtof(84),t+0.5,0.15,1.4,out); noiseHit(t+0.4, 1.0, 0.12, 'highpass', 6000, out, SND.noiseLong); break;
    case 'grow':  [60,64,67,72,76,79,84].forEach((m,i)=>tone('sine',mtof(m),t+i*0.08,0.15,0.5,out)); break;
    case 'evolve': {
      let time = 0, i = 0; const arp = [60,64,67,72,64,67,72,76,67,72,76,79];
      while (time < 3.6){ tone('square', mtof(arp[i % arp.length] + 12*Math.floor(time/1.4)), t+time, 0.045, 0.1, out); time += Math.max(0.045, 0.2 - time*0.05); i++; }
      const n = noiseHit(t, 3.7, 0.2, 'bandpass', 300, out, SND.noiseLong, 2); n.f.frequency.exponentialRampToValueAtTime(5000, t+3.6);
      [48,60,64,67,72,76,79].forEach(m => tone('sawtooth', mtof(m), t+3.8, 0.035, 1.8, out, 0.02));
      noiseHit(t+3.8, 1.6, 0.25, 'highpass', 5000, out, SND.noiseLong);
      [84,88,91,96].forEach((m,k) => tone('sine', mtof(m), t+4.0+k*0.1, 0.1, 0.8, out));
      break; }
  }
}
// wombat calls
function cry(kind){
  if (!SND.on || !SND.ctx || !petActive()) return;
  const c = SND.ctx, t = c.currentTime, out = SND.sfx;
  const p = {baby:1.9, child:1.45, adult:1.1, perfect:1.0, ultimate:0.88}[S.stage] || 1; let o;
  switch (kind){
    case 'happy': for (const d of [0, 0.14]){ o = tone('sine', 680*p, t+d, 0.16, 0.12, out); o.frequency.exponentialRampToValueAtTime(1080*p, t+d+0.09); } break;
    case 'grunt': noiseHit(t, 0.2, 0.3, 'bandpass', 450*p, out, null, 1.5); o = tone('sawtooth', 105*p, t, 0.07, 0.18, out); o.frequency.exponentialRampToValueAtTime(80*p, t+0.16); break;
    case 'angry': noiseHit(t, 0.45, 0.22, 'highpass', 3200, out); o = tone('sawtooth', 92*p, t, 0.11, 0.4, out); o.frequency.setValueAtTime(92*p, t); o.frequency.linearRampToValueAtTime(70*p, t+0.4); break;
    case 'sad': for (const d of [0, 0.42]){ o = tone('sine', 620*p, t+d, 0.12, 0.35, out, 0.03); o.frequency.exponentialRampToValueAtTime(400*p, t+d+0.33); } break;
    case 'sleepy': o = tone('sine', 300*p, t, 0.1, 0.8, out, 0.1); o.frequency.linearRampToValueAtTime(430*p, t+0.35); o.frequency.linearRampToValueAtTime(240*p, t+0.85); break;
    case 'snore': noiseHit(t, 0.9, 0.08, 'lowpass', 300, out, SND.noiseLong); break;
    case 'evolve': o = tone('sawtooth', 190*p, t, 0.12, 0.7, out, 0.02); o.frequency.exponentialRampToValueAtTime(420*p, t+0.45); noiseHit(t, 0.5, 0.15, 'bandpass', 900, out); break;
  }
}

// ---------- save ----------
const KEY = 'wombat-pet-save-v1';
const freshCare = () => ({hungry:0, thirsty:0, dirty:0, sick:0, meals:0, overfed:0, plays:0});
function freshSave(){
  return {v:2, stage:'egg', form:'normal', warm:0, name:'', ageMs:0, growth:0, st:{hunger:80, thirst:80, happy:75, energy:85, health:100}, care:freshCare(),
    coins:30, owned:{}, worn:{}, colors:{}, fur:0, builds:{}, poops:[], weeds:[], snowmen:[], poopQ:[], weedTimer:4, speed:1,
    hud:true, uiHidden:false, dayMode:'hourly', weather:{type:'sunny', until:Date.now()+5*60000, forced:null}, dead:null, gen:1, lastSeen:Date.now(), petPos:null, seenGuide:false};
}
function fromObj(o){
  if (!o || !(o.v === 1 || o.v === 2)) return null;
  const s = Object.assign(freshSave(), o);
  if (o.v === 1){ if (s.stage === 'elder') s.stage = 'perfect'; s.form = 'normal'; s.care = freshCare(); s.dayMode = 'hourly'; s.v = 2; s.seenGuide = false; }
  s.care = Object.assign(freshCare(), s.care || {});
  return s;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} };
const readLocal = () => { try { return fromObj(JSON.parse(lsGet(KEY))); } catch(e){ return null; } };
// FORCE_LOCAL: set by "import save code" so the imported pet wins over the cloud once.
// PREFER_REMOTE: set when another device took over, so this device reloads the cloud copy.
// SYNC_UID: the account this device's local save was last synced with.
const FORCE_LOCAL = 'wombat-force-local', PREFER_REMOTE = 'wombat-prefer-remote', SYNC_UID = 'wombat-sync-uid';
const STAGE_NAME = {egg:'蛋', baby:'幼兒期', child:'成長期', adult:'成熟期', perfect:'完全體', ultimate:'究極體'};
const when = ms => { const d = new Date(ms || 0), m = Math.round((Date.now() - d)/60000);
  return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.floor(m/60)} 小時前` : `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const describe = s => `${s.name || (s.stage === 'egg' ? '一顆蛋' : '還沒取名')}・${STAGE_NAME[s.stage] || ''}・代幣 ${s.coins}・上次玩：${when(s.lastSeen)}`;
// Decide whether this device's save or the cloud save should be used.
async function pickSave(local, remote, uid){
  const r = fromObj(remote.save); if (!r) return 'local';
  if (!local) return 'remote';
  if (lsGet(FORCE_LOCAL)) return 'local';
  if (lsGet(PREFER_REMOTE)) return 'remote';
  if (lsGet(SYNC_UID) === uid) return (r.lastSeen || 0) >= (local.lastSeen || 0) ? 'remote' : 'local';
  if (local.stage === 'egg' && local.gen === 1 && !Object.keys(local.builds).length && !Object.keys(local.owned).length) return 'remote';
  return new Promise(res => showModal('要用哪一份進度？', `<p>這個帳號在雲端已經有存檔，這台裝置也有另一份。選一份繼續玩，另一份會被取代。</p>`
    + `<p><b>雲端：</b>${esc(describe(r))}</p><p><b>這台裝置：</b>${esc(describe(local))}</p>`,
    [{label:'用這台的', ghost:true, onClick:()=>res('local')}, {label:'用雲端的', onClick:()=>res('remote')}]));
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let S = readLocal();
$('#petSub').textContent = '讀取存檔中……';
const boot0 = await cloud.init(4000);
if (boot0.user && boot0.remote && await pickSave(S, boot0.remote, boot0.user.uid) === 'remote') S = fromObj(boot0.remote.save);
if (boot0.user && boot0.checked){ lsSet(SYNC_UID, boot0.user.uid); lsSet(PREFER_REMOTE, null); }
$('#petSub').textContent = '';
if (!S) S = freshSave();

// ---------- runtime state ----------
const pos = V3(0,0,0), vel = V3(0,0,0), walkVel = V3(0,0,0), forceSm = V3(0,0,0);
let tx=0, tz=0, tvx=0, tvz=0, sq=0, sqv=0, liftW=0, gaitW=0, walkClock=0, wiggleW=0, danceW=0, sleepW=0, sitW=0;
let petS = 0.45, reveal = 1, dragging = false, act = null, actY = 0, lastMouse = -1e9, hasHover = false, hatLift = 0, clothesHidden = false;
let blinkTimer = 2.5, blinkT = 0, snowCover = 0, flashV = 0, thunderT = 6, hatching = null, evo = null, nightF = 0, fxoV = 0, hudDirty = true;
const grabLocal = V3(0,0,0), pointerWorld = V3(0,0,0), plane = new THREE.Plane(), ROPE = 0.35;
const B = {mode:'idle', timer:2, target:V3(0,0,0), lookT:0, lookYaw:0, lookPitch:0, food:null, water:null, nomT:0,
  sleeping:false, sleepAfter:false, anim:0, from:V3(0,0,0), emoteT:4, stompT:3, petCd:0, petTimes:[], zzzT:0, cryT:12};
const petActive = () => S.stage !== 'egg' && !S.dead && B.mode !== 'dying' && B.mode !== 'dead';
const asleep = () => B.mode === 'sleep' || (B.mode === 'inHouse' && B.sleeping);
const form = () => FORMS[S.form] || FORMS.normal;

// ---------- poop, weeds, food, water, snowmen ----------
const cubeGeo = new THREE.BoxGeometry(0.2,0.2,0.2), cubeMat = mat('#6e4c35',0.95);
const hbMat = new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false});
const cubes = [];
function makePoop(p, v, sc){
  const m = new THREE.Mesh(cubeGeo, cubeMat); m.rotation.order = 'YXZ'; m.position.copy(p); m.scale.setScalar(sc); scene.add(m);
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.32/sc,8,6), hbMat); hb.userData.kind = 'poop'; m.add(hb);
  const stink = new THREE.Sprite(new THREE.SpriteMaterial({map:stinkTex, transparent:true, depthWrite:false})); stink.scale.set(0.35,0.7,1); stink.visible = false; scene.add(stink);
  const c = {m, v, a:v ? V3(rnd(-6,6), rnd(-3,3), rnd(-6,6)) : V3(0,0,0), sh:makeShadow(0.42*sc, 0.42*sc), hb, stink, sc, ph:Math.random()*6};
  hb.userData.ref = c; cubes.push(c); return c;
}
function poopNow(){
  if (!petActive() || ['inHouse','enter','exit','evolve'].includes(B.mode)) return false;
  const p = offG.localToWorld(V3(0, 0.62, -1.85));
  const back = V3(0,0,-1).applyAxisAngle(UP, root.rotation.y), side = V3(1,0,0).applyAxisAngle(UP, root.rotation.y);
  const v = back.multiplyScalar(rnd(1.0,2.0)*petS).add(side.multiplyScalar(rnd(-0.8,0.8))); v.y = 0.6;
  makePoop(p, v, 0.5 + 0.5*Math.min(petS,1)); sfx('plop');
  if (!S.toldPoop){ S.toldPoop = true; toast('袋熊的便便是方塊形的，這是真的。點一下便便可以清掉，還能賺代幣。'); }
  return true;
}
function removePoop(c){ scene.remove(c.m, c.sh.g, c.stink); cubes.splice(cubes.indexOf(c),1); }
function cleanPoop(c){ if (!cubes.includes(c)) return; const p = c.m.position.clone(); removePoop(c); addCoins(3, p.add(V3(0,0.4,0))); sfx('pop'); }

const weeds = [], fxPull = [];
const bladeGeo = new THREE.ConeGeometry(0.04, 0.42, 4); bladeGeo.translate(0,0.21,0);
const weedMats = [mat('#4c6b35'), mat('#5f7f3e'), mat('#3f5c2c')];
function makeWeed(x, z, s){
  const g = new THREE.Group();
  for (let i=0;i<6;i++){ const b = new THREE.Mesh(bladeGeo, weedMats[i%3]); b.position.set(rnd(-0.1,0.1),0,rnd(-0.1,0.1)); b.rotation.set(rnd(-0.6,0.6),0,rnd(-0.6,0.6)); b.scale.y = rnd(0.6,1.3); g.add(b); }
  if (Math.random() < 0.35){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6), mat('#f3d250',0.6)); f.position.set(0,0.42,0); g.add(f); }
  g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), hbMat); hb.position.y = 0.2; hb.userData.kind = 'weed'; g.add(hb);
  const w = {g, x, z, s, hb}; hb.userData.ref = w; weeds.push(w); return w;
}
function spawnWeed(){
  if (weeds.length >= 12) return;
  for (let k=0;k<12;k++){
    const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*5.6, x = Math.sin(a)*r, z = Math.cos(a)*r;
    if (obstacles().some(o => Math.hypot(o.c.x-x, o.c.z-z) < o.r + 0.4)) continue;
    if (Math.hypot(pos.x-x, pos.z-z) < 1.6) continue;
    makeWeed(+x.toFixed(2), +z.toFixed(2), +rnd(0.8,1.25).toFixed(2)); return;
  }
}
function pullWeed(w){
  if (!weeds.includes(w)) return;
  weeds.splice(weeds.indexOf(w),1);
  const p = w.g.position.clone(); fxPull.push({g:w.g, t:0});
  addCoins(2, p.add(V3(0,0.6,0))); sfx('pop');
}

const foods = [];
const grassGeo = new THREE.ConeGeometry(0.035,0.38,5); grassGeo.translate(0,0.19,0);
const grassMats = ['#6f9a4a','#86b25a','#5c8540'].map(c => mat(c,0.8));
const leafGeo = new THREE.ConeGeometry(0.025,0.24,5); leafGeo.translate(0,0.12,0);
function spawnFood(x, z){
  const r = Math.hypot(x,z); if (r > BOUND-0.3){ x *= (BOUND-0.3)/r; z *= (BOUND-0.3)/r; }
  const g = new THREE.Group();
  if (Math.random() < 0.5){
    for (let i=0;i<9;i++){ const b = new THREE.Mesh(grassGeo, grassMats[i%3]); b.position.set(rnd(-0.11,0.11),0,rnd(-0.11,0.11)); b.rotation.set(rnd(-0.35,0.35),0,rnd(-0.35,0.35)); b.scale.y = rnd(0.7,1.3); g.add(b); }
  } else {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.075,0.5,12), mat('#e8833a',0.6)); body.rotation.z = Math.PI/2; body.position.y = 0.075; g.add(body);
    for (const a of [-0.5,0,0.5]){ const l = new THREE.Mesh(leafGeo, grassMats[1]); l.position.set(0.24,0.075,0); l.rotation.set(a,0,-Math.PI/2+0.5); g.add(l); }
    g.rotation.y = Math.random()*Math.PI*2;
  }
  g.position.set(x, 1.6, z); scene.add(g);
  foods.push({g, vy:0, landed:false, eat:1, sh:makeShadow(0.6,0.6)});
}
let bowl = null;
function spawnBowl(){
  const a = root.rotation.y + rnd(-1,1), d = 1.9*petS + 1.3;
  let x = pos.x + Math.sin(a)*d, z = pos.z + Math.cos(a)*d; const r = Math.hypot(x,z); if (r > BOUND-0.3){ x *= (BOUND-0.3)/r; z *= (BOUND-0.3)/r; }
  const g = new THREE.Group();
  const pts = [[0.001,0],[0.3,0],[0.36,0.05],[0.38,0.2],[0.33,0.2],[0.31,0.07],[0.001,0.07]].map(p => new THREE.Vector2(p[0],p[1]));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts,28), mat('#d6dde2',0.35)));
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.31,24), new THREE.MeshStandardMaterial({color:'#6fa8c9', roughness:0.15})); w.rotation.x = -Math.PI/2; w.position.y = 0.17; g.add(w);
  g.position.set(x,0,z); scene.add(g);
  bowl = {g, w, left:1}; sfx('pop');
}
const snowmen = [];
function makeSnowman(x, z, ry, melt=0){
  const g = new THREE.Group(), white = mat('#f7f9fb',0.9), coal = mat('#222',0.5);
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.55,20,14), white); b1.position.y = 0.5; g.add(b1);
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.38,20,14), white); b2.position.y = 1.25; g.add(b2);
  for (const s of [-1,1]){ const e = new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6), coal); e.position.set(0.13*s,1.36,0.33); g.add(e);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.02,0.7,6), mat('#6b4f37',0.9)); arm.position.set(0.6*s,0.95,0); arm.rotation.z = -1.0*s; g.add(arm); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.28,10), mat('#e8833a',0.6)); nose.rotation.x = Math.PI/2; nose.position.set(0,1.26,0.48); g.add(nose);
  const sc = new THREE.Mesh(new THREE.TorusGeometry(0.33,0.07,8,24), mat('#d23b32',0.8)); sc.rotation.x = Math.PI/2; sc.position.y = 0.95; g.add(sc);
  g.position.set(x,0,z); g.rotation.y = ry; scene.add(g);
  const o = {g, x, z, ry, melt, sh:makeShadow(1.4,1.4)}; o.sh.g.position.set(x,0,z); snowmen.push(o); return o;
}
const puddles = [];

// ---------- hearts / emotes / coins ----------
const emote = new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex('💢'), transparent:true, depthWrite:false, depthTest:false}));
emote.renderOrder = 10; emote.visible = false; scene.add(emote);
let emoteLife = 0;
function headTop(){
  if (B.mode === 'inHouse' && BG.house) return SPOTS.house.clone().add(V3(0,2.6,0));
  return head.localToWorld(V3(0, 1.0, 0.4));
}
function showEmote(ch, dur=2){ emote.material.map = emojiTex(ch); emote.material.needsUpdate = true; emoteLife = dur; emote.visible = true; }
function spawnHearts(n){ const p = headTop(); for (let i=0;i<n;i++) floatSprite(heartTex, p.clone().add(V3(rnd(-0.4,0.4)*petS, rnd(0,0.3), rnd(-0.4,0.4)*petS)), {size:0.32, delay:i*0.15, vx:rnd(-0.2,0.2)}); }
function sparkles(at, n, spread=1){ for (let i=0;i<n;i++) floatSprite(sparkTex, at.clone().add(V3(rnd(-spread,spread), rnd(0,spread), rnd(-spread,spread))), {size:rnd(0.2,0.45), vy:rnd(0.4,1.4), delay:Math.random()*0.4, add:true, max:1.2, depthTest:false}); }
function addCoins(n, at){
  S.coins += n; sfx('coin');
  floatSprite(textTex('+'+n, '#e2b53b', 'bold 76px sans-serif', '#5a4310'), at || headTop(), {size:0.6, vy:1.2, max:1.1, depthTest:false});
  hudDirty = true;
}

// ---------- forms & clothes ----------
const FURS = [{name:'經典棕', c:'#8b6b50', b:'#b39a82'}, {name:'灰褐', c:'#847b70', b:'#aaa196'}, {name:'奶油', c:'#cdb48e', b:'#e3d3b8'}, {name:'炭灰', c:'#4c4846', b:'#6e6966'}];
function applyFur(){
  const f = FURS[S.fur] || FURS[0], F = form();
  let c = f.c, b = f.b;
  if (F.tint){ c = mixHex(c, F.tint[0], F.tint[1]); b = mixHex(b, F.tint[0], F.tint[1]*0.8); }
  U.uColor.value.set(c); U.uBelly.value.set(b);
}
function applyForm(){
  const F = form(), bd = F.body || [1,1,1];
  bodyFit.scale.set(bd[0], bd[1], bd[2]); head.scale.setScalar(F.head || 1);
  legs.forEach(l => l.g.position.x = l.baseX * clamp(bd[0], 0.85, 1.12));
  Object.entries(ACC).forEach(([k,g]) => g.visible = F.acc === k);
  hatLift = (F.acc === 'poop' || F.acc === 'crown') ? 0.34 : 0;
  applyFur(); applyClothes();
}
function wear(id, on){ const c = CLOTHES.find(x => x.id === id); if (on) CLOTHES.forEach(o => { if (o.slot === c.slot) S.worn[o.id] = false; }); S.worn[id] = on; applyClothes(); }
function applyClothes(){
  CLOTHES.forEach(c => {
    const v = !!(S.owned[c.id] && S.worn[c.id]) && !clothesHidden;
    const cl = CL[c.id]; cl.g.visible = v; cl.mats.forEach(m => m.color.set(S.colors[c.id] || c.def));
    if (c.slot === 'hat' && cl.g.userData.baseY !== undefined) cl.g.position.y = cl.g.userData.baseY + hatLift;
  });
}

// ---------- tricks & special activities ----------
const ACTS = {
  flip: {name:'後空翻',   dur:1.15},
  roll: {name:'連續側翻滾', dur:2.6},
  spin: {name:'跳躍轉圈',  dur:1.05},
  belly:{name:'翻肚扭扭',  dur:3.4},
  shake:{name:'抖抖毛',   dur:1.3},
  dance:{name:'跳舞',     dur:5.2},
  snowman:  {name:'堆雪人',   dur:7.5, special:true, need:() => weatherNow() === 'snow' || snowCover > 0.3, why:'下雪天才能堆雪人。', desc:'滾兩顆雪球堆成雪人，代幣 +5'},
  puddle:   {name:'踩水窪',   dur:4.6, special:true, need:() => weatherNow() === 'rain', why:'下雨天（不打雷）才有水窪可以踩。', desc:'跳進水窪濺水花，心情 +15'},
  fireflies:{name:'看螢火蟲', dur:6.5, special:true, need:() => nightF > 0.6 && ['sunny','cloudy'].includes(weatherNow()), why:'晴朗或多雲的晚上才有螢火蟲。', desc:'安靜地看螢火蟲，心情和體力都會回復'}
};
function whyCantPlay(k){
  if (!petActive()) return S.stage === 'egg' ? '還沒孵出來喔。' : '';
  if (B.mode === 'evolve') return '牠正在進化！';
  if (B.mode === 'inHouse' || B.mode === 'enter') return '牠在小窩裡，點一下小窩叫牠出來。';
  if (asleep()) return '牠在睡覺，讓牠多睡一下吧。';
  if (k && ACTS[k].special && !ACTS[k].need()) return ACTS[k].why;
  if (S.st.health < 35) return '牠生病了，先餵藥。';
  if (S.st.hunger < 25) return '牠肚子餓在生氣，先餵牠吃東西。';
  if (S.st.energy < 15 && k !== 'fireflies') return '牠太累了，讓牠休息一下。';
  if (act || dragging || pos.y > 0.05) return '等牠忙完這個。';
  return null;
}
function startAct(k){
  const why = whyCantPlay(k); if (why){ toast(why); return; }
  act = {key:k, t:0, dir:1, moved:0, jumped:false, rolls:0, noteT:0, step:0};
  const side = V3(1,0,0).applyAxisAngle(UP, root.rotation.y), fwd = V3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y));
  if (k === 'roll') act.dir = pos.clone().addScaledVector(side, 3.2*petS).length() > BOUND-0.5 ? -1 : 1;
  if (k === 'flip' || k === 'spin') sqv += 2.2;
  if (k === 'shake') sfx('whoosh');
  if (k === 'dance' && !SND.on) toast('打開右上角的音樂，跳起來更好看。');
  if (k === 'snowman'){
    let c = pos.clone().addScaledVector(side, 1.4*petS); if (c.length() > BOUND-1.5) c.multiplyScalar((BOUND-1.5)/c.length());
    act.c = c; act.a0 = Math.atan2(pos.x-c.x, pos.z-c.z); act.R = 1.4*petS;
    act.ball = new THREE.Mesh(new THREE.SphereGeometry(1,20,14), mat('#f7f9fb',0.9)); scene.add(act.ball); act.ball2 = null;
  }
  if (k === 'puddle'){
    act.spots = [];
    let p = pos.clone(), yawP = root.rotation.y;
    for (let i=0;i<3;i++){ yawP += rnd(-0.6,0.6); let q = p.clone().add(V3(Math.sin(yawP),0,Math.cos(yawP)).multiplyScalar(1.6*petS + 0.6)); if (q.length() > BOUND-0.5){ yawP += Math.PI; q = p.clone().add(V3(Math.sin(yawP),0,Math.cos(yawP)).multiplyScalar(1.6*petS + 0.6)); }
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.8*Math.max(petS,0.6), 28), new THREE.MeshStandardMaterial({color:'#8fb1c4', roughness:0.1, transparent:true, opacity:0.75}));
      m.rotation.x = -Math.PI/2; m.position.set(q.x, 0.015, q.z); m.scale.set(1.2,0.85,1); scene.add(m); puddles.push(m); act.spots.push(q); p = q; }
    act.from = pos.clone();
  }
  if (k === 'fireflies'){ act.wasVis = true; }
  B.mode = 'idle'; B.timer = 2; B.food = null; B.water = null;
}
function endAct(){
  if (!act) return;
  const k = act.key, st = S.st;
  if (act.ball) scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2);
  act = null; actG.rotation.set(0,0,0); actY = 0;
  const gain = {dance:[8,14], snowman:[10,20], puddle:[6,15], fireflies:[-6,15]}[k] || [6,10];
  st.energy = clamp(st.energy - gain[0], 0, 100); st.happy = clamp(st.happy + gain[1], 0, 100); st.thirst = clamp(st.thirst - 3, 0, 100);
  S.care.plays++; if (growthOK()) S.growth += 1;
  if (k === 'flip' || k === 'spin'){ sqv += 2.6; sfx('thud'); }
  if (k === 'puddle'){ puddles.forEach(m => fxPull.push({g:m, t:0, flat:true})); puddles.length = 0; addCoins(2); }
  spawnHearts(2); cry('happy'); hudDirty = true;
}
function updateAct(dt){
  const inBelly = act && act.key === 'belly' && act.t/ACTS.belly.dur > 0.2 && act.t/ACTS.belly.dur < 0.8;
  wiggleW += ((inBelly?1:0) - wiggleW) * Math.min(1, dt*8);
  danceW += ((act && act.key === 'dance' ? 1 : 0) - danceW) * Math.min(1, dt*8);
  sitW += ((act && act.key === 'fireflies' ? 1 : 0) - sitW) * Math.min(1, dt*3);
  if (!act){ return {shake:0, walk:false}; }
  act.t += dt;
  const A = ACTS[act.key], p = Math.min(act.t/A.dur, 1), s = petS; let shakeF = 0, walk = false;
  actG.rotation.set(0,0,0); actY = 0;
  switch (act.key){
    case 'flip': { const u = clamp((p-0.15)/0.8,0,1); if (!act.jumped && p >= 0.15){ act.jumped = true; sfx('boing'); }
      actY = 4*2.2*s*u*(1-u); actG.rotation.x = -2*Math.PI*ease(u); break; }
    case 'roll': { const r = ease(p); actG.rotation.z = -act.dir*2*Math.PI*3*r; actY = Math.abs(Math.sin(actG.rotation.z))*0.08*s;
      const d = 3.0*s*r, delta = d - act.moved; act.moved = d; pos.addScaledVector(V3(1,0,0).applyAxisAngle(UP, root.rotation.y), act.dir*delta);
      const n = Math.floor(r*3+0.15); if (n > act.rolls){ act.rolls = n; sfx('whoosh'); } break; }
    case 'spin': { const u = clamp((p-0.1)/0.85,0,1); if (!act.jumped && p >= 0.1){ act.jumped = true; sfx('boing'); }
      actY = 4*1.6*s*u*(1-u); actG.rotation.y = 2*Math.PI*ease(u); break; }
    case 'belly': {
      if (p < 0.2){ const r = ease(p/0.2); actG.rotation.z = Math.PI*r; actY = Math.sin(r*Math.PI)*0.25*s; }
      else if (p < 0.8) actG.rotation.z = Math.PI + Math.sin(act.t*6)*0.15;
      else { const r = ease((p-0.8)/0.2); actG.rotation.z = Math.PI + Math.PI*r; actY = Math.sin(r*Math.PI)*0.25*s; }
      break; }
    case 'shake': { const w = Math.sin(p*Math.PI*16)*(1-p); actG.rotation.z = w*0.28; shakeF = w; break; }
    case 'dance': { const b = act.t*Math.PI*2*1.7, fade = Math.min(1, (1-p)*6);
      actY = Math.abs(Math.sin(b))*0.28*s*fade; actG.rotation.y = Math.sin(b*0.5)*0.6*fade; actG.rotation.z = Math.sin(b)*0.14*fade;
      if (act.t > act.noteT){ act.noteT = act.t + 0.45; floatSprite(textTex(Math.random()<.5?'♪':'♫', '#3f6b55', 'bold 96px sans-serif', 'rgba(255,255,255,.8)'), headTop(), {size:0.45, vy:1, vx:rnd(-0.6,0.6), depthTest:false}); }
      break; }
    case 'snowman': {
      const T = act.t;
      if (T < 6.2){
        walk = true;
        const ang = act.a0 + T*0.9;
        const nx = act.c.x + Math.sin(ang)*act.R, nz = act.c.z + Math.cos(ang)*act.R;
        root.rotation.y = Math.atan2(nx-pos.x, nz-pos.z) || root.rotation.y; pos.x = nx; pos.z = nz;
        const fwd = V3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y));
        const big = T < 3.4, r = big ? lerp(0.12, 0.55, T/3.4) : lerp(0.1, 0.38, (T-3.4)/2.8);
        const ball = big ? act.ball : (act.ball2 || (act.ball2 = new THREE.Mesh(new THREE.SphereGeometry(1,20,14), act.ball.material), scene.add(act.ball2), act.ball2));
        ball.scale.setScalar(r); ball.position.copy(pos).addScaledVector(fwd, 2.05*s + r); ball.position.y = r; ball.rotation.x += dt*3;
        if (!big && !act.parked){ act.parked = act.ball.position.clone(); }
        if (act.parked) act.ball.position.copy(act.parked);
      } else if (!act.built){
        act.built = true; const p0 = act.parked || act.ball.position;
        makeSnowman(p0.x, p0.z, Math.atan2(camera.position.x-p0.x, camera.position.z-p0.z));
        scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2); act.ball = act.ball2 = null;
        sparkles(V3(p0.x,1,p0.z), 12, 0.8); addCoins(5, V3(p0.x,1.8,p0.z)); sfx('happy');
      }
      break; }
    case 'puddle': {
      const seg = 4.2/3, i = Math.min(2, Math.floor(act.t/seg)), u = clamp((act.t - i*seg)/seg, 0, 1);
      const from = i === 0 ? act.from : act.spots[i-1], to = act.spots[i];
      const lu = clamp((u-0.15)/0.7, 0, 1);
      if (u > 0.15 && u < 0.9){ pos.x = lerp(from.x, to.x, lu); pos.z = lerp(from.z, to.z, lu); actY = 4*1.2*s*lu*(1-lu); }
      root.rotation.y += clamp(wrapA(Math.atan2(to.x-from.x, to.z-from.z) - root.rotation.y), -6*dt, 6*dt);
      if (act.step <= i && u >= 0.88){ act.step = i+1; sqv += 2.2; sfx('splash');
        for (let k=0;k<14;k++){ const a = Math.random()*Math.PI*2; floatSprite(radialTex('rgba(210,232,245,1)','rgba(210,232,245,0)'), V3(to.x,0.15,to.z), {size:0.22, vx:Math.cos(a)*rnd(1,2.2), vz:Math.sin(a)*rnd(1,2.2), vy:rnd(2,3.5), g:9, max:0.8, grow:0}); } }
      break; }
    case 'fireflies': { if (act.t > act.noteT){ act.noteT = act.t + 1.6; spawnHearts(1); } break; }
  }
  if (p >= 1) endAct();
  return {shake:shakeF, walk};
}

// ---------- life simulation ----------
const STAGES = {
  baby:    {name:'幼兒期', next:'child',    age:20,      growth:25,  scale:[0.42,0.6]},
  child:   {name:'成長期', next:'adult',    age:360,     growth:120, scale:[0.62,0.88]},
  adult:   {name:'成熟期', next:'perfect',  age:2*1440,  growth:300, scale:[1,1]},
  perfect: {name:'完全體', next:'ultimate', age:4*1440,  growth:500, scale:[1.1,1.1]},
  ultimate:{name:'究極體', scale:[1.2,1.2]}
};
const STAGE_ORDER = ['baby','child','adult','perfect','ultimate'];
const LIFE = 8*1440;
const ageMin = () => S.ageMs/60000;
const cleanVal = () => clamp(100 - cubes.length*14 - weeds.length*4, 0, 100);
const growthOK = () => S.st.health >= 50 && S.st.hunger >= 30 && S.st.thirst >= 30;
function weatherNow(){
  if (S.weather.forced) return S.weather.forced;
  const h = activeHoliday(); if (h && h.id === 'christmas') return 'snow';
  return S.weather.type;
}
function badWeather(){ const w = weatherNow(); return w === 'rain' || w === 'storm'; }
function sim(m, offline){
  if (S.dead || S.stage === 'egg') return;
  const st = S.st, k = offline ? 0.25 : 1, w = weatherNow();
  const fBaby = S.stage === 'baby' ? 1.25 : 1, fOld = S.stage === 'ultimate' ? 1.15 : 1, dirty = cleanVal() < 40;
  st.hunger -= 0.7*m*k*fBaby*fOld*(S.form === 'chubby' ? 1.15 : 1);
  st.thirst -= 0.9*m*k*(w==='rain'||w==='storm' ? 0.6 : 1)*fOld;
  st.happy  -= (0.45 + (dirty?0.3:0) + (badWeather()?0.1:0))*m*k*(BG.flowers ? 0.7 : 1);
  if (offline) st.energy += 1.2*m;
  else if (asleep()) st.energy += (B.mode === 'inHouse' ? 3.2 : 2.4)*m;
  else if (act && act.key === 'fireflies') st.energy += 1.5*m;
  else st.energy -= 0.35*m*(w==='snow'?1.3:1)*(st.health<35?1.3:1)*(S.form === 'sporty' ? 0.8 : 1);
  let dh = 0;
  if (st.hunger < 15) dh -= 1.0;
  if (st.thirst < 15) dh -= 1.0;
  if (dirty) dh -= 0.6;
  if (st.happy < 15) dh -= 0.3;
  if (dh === 0 && st.hunger > 40 && st.thirst > 40) dh = 0.5;
  st.health += dh*m*(offline ? 0.3 : 1);
  for (const key in st) st[key] = clamp(st[key], 0, 100);
  if (offline) st.health = Math.max(st.health, 5);
  const c = S.care;
  if (st.hunger < 25) c.hungry += m; if (st.thirst < 25) c.thirsty += m; if (dirty) c.dirty += m; if (st.health < 35) c.sick += m;
  if (growthOK()) S.growth += 0.08*m;
  S.weedTimer -= m;
  if (S.weedTimer <= 0){ spawnWeed(); S.weedTimer = rnd(5,9)*(BG.fence ? 1.5 : 1); }
}
function decideForm(next){
  const c = S.care, st = S.st;
  if (cubes.length >= 3) return 'stinky';
  if (st.health < 35) return 'sickly';
  if (st.hunger < 30 || c.hungry >= 40) return 'skinny';
  if (c.overfed >= 4) return 'chubby';
  const mistakes = c.hungry + c.thirsty + c.dirty + c.sick;
  if ((next === 'perfect' || next === 'ultimate') && mistakes < 30 && st.happy >= 70) return (next === 'ultimate' && (S.form === 'royal' || S.form === 'golden')) ? 'golden' : 'royal';
  if (next !== 'child' && c.plays >= 8) return 'sporty';
  return 'normal';
}
function readyToEvolve(){
  const sd = STAGES[S.stage]; if (!sd || !sd.next) return false;
  return ageMin() >= sd.age && S.growth >= sd.growth;
}
function checkStage(){
  if (S.dead || S.stage === 'egg' || !petActive() || evo) return;
  if (ageMin() >= LIFE){ die('old'); return; }
  if (S.st.health <= 0){ die('sick'); return; }
  if (readyToEvolve() && !act && !dragging && pos.y < 0.02 && ['idle','walk','goto'].includes(B.mode)) startEvolution(STAGES[S.stage].next);
}
function stageScale(){
  const sd = STAGES[S.stage]; if (!sd) return 0.45;
  if (S.stage === 'baby') return lerp(sd.scale[0], sd.scale[1], clamp(S.growth/25, 0, 1));
  if (S.stage === 'child') return lerp(sd.scale[0], sd.scale[1], clamp((S.growth-25)/95, 0, 1));
  return sd.scale[0];
}
function catchUp(ms){
  if (ms < 1500) return;
  const gameMin = ms/60000*S.speed;
  if (S.stage === 'egg'){ S.warm = Math.min(100, S.warm + ms/1000*S.speed); return; }
  if (S.dead) return;
  S.ageMs += gameMin*60000;
  let left = Math.min(gameMin, 720);
  while (left > 0){ const c = Math.min(5, left); sim(c, true); left -= c; }
  S.poopQ.forEach(() => { const a = Math.random()*Math.PI*2, r = rnd(1.5,3); makePoop(V3(clamp(pos.x+Math.sin(a)*r,-5,5), 0.1, clamp(pos.z+Math.cos(a)*r,-5,5)), null, 0.5+0.5*Math.min(petS,1)); });
  S.poopQ = [];
  hudDirty = true;
}

// ---------- evolution ----------
const fxo = $('#fxo'), fxSub = $('#fxSub'), fxName = $('#fxName');
function startEvolution(next){
  evo = {t:0, next, form:decideForm(next), spin:0, swapped:false, burst:false};
  B.mode = 'evolve'; closeSheet(); clothesHidden = true; applyClothes();
  fxo.hidden = false; fxo.classList.remove('reveal'); fxSub.textContent = `${S.name || '牠'}要進化了……`; fxName.textContent = '';
  duck(true); sfx('evolve'); cry('evolve');
}
function updateEvo(dt){
  const e = evo; e.t += dt; const t = e.t, s = petS;
  const spd = t < 3.2 ? 4 + (t/3.2)*26 : Math.max(0, 30*(1 - (t-3.2)/1.4));
  e.spin += spd*dt;
  if (t > 4.6){ const target = Math.round(e.spin/(Math.PI*2))*Math.PI*2; e.spin += (target - e.spin)*Math.min(1, dt*5); }
  actG.rotation.set(0, e.spin, 0);
  actY = s*(t < 0.8 ? ease(t/0.8)*0.9 : t < 4.6 ? 0.9 + Math.sin(t*3)*0.08 : 0.9*(1 - ease(clamp((t-4.6)/0.6,0,1))));
  const white = t < 0.6 ? 0 : t < 2.6 ? ease((t-0.6)/2) : t < 3.9 ? 1 : 1 - ease(clamp((t-3.9)/0.8,0,1));
  U.uWhite.value = white; petMats.forEach(m => m.emissive.setScalar(white*0.95));
  const pOp = t < 0.8 ? t/0.8 : t < 4.4 ? 1 : Math.max(0, 1 - (t-4.4)/0.8);
  pillar.visible = true; pillar.position.set(pos.x, 8, pos.z); pillar.scale.setScalar(Math.max(s, 0.6)); pillar.material.opacity = pOp*0.75;
  rings.forEach((r,i) => { const ph = (t*0.55 + i/3)%1; r.visible = true; r.position.set(pos.x, 0.2 + ph*4*Math.max(s,0.6), pos.z); r.scale.setScalar((1.25 - ph*0.65)*Math.max(s,0.6)); r.material.opacity = Math.sin(ph*Math.PI)*pOp; });
  e.sp = (e.sp || 0) - dt;
  if (t < 3.9 && e.sp <= 0){ e.sp = 0.05; const a = t*9; floatSprite(sparkTex, V3(pos.x + Math.sin(a)*1.7*Math.max(s,0.6), 0.2, pos.z + Math.cos(a)*1.7*Math.max(s,0.6)), {size:0.35, vy:2.2, add:true, max:1.4, depthTest:false}); }
  if (!e.swapped && t >= 3.0){ e.swapped = true; S.stage = e.next; S.form = e.form; S.care = freshCare(); applyForm(); petS = stageScale(); hudDirty = true; }
  if (!e.burst && t >= 3.9){ e.burst = true; flashV = 1; sparkles(V3(pos.x, 1.2*s, pos.z), 34, 2.2*Math.max(s,0.6));
    fxo.classList.add('reveal'); fxSub.textContent = `${S.name || '牠'}進化成`; fxName.textContent = `${STAGES[S.stage].name}　${form().name}`; }
  fxoV = t < 0.8 ? t/0.8 : t < 5.6 ? 1 : Math.max(0, 1 - (t-5.6)/0.6);
  if (t >= 6.2){
    evo = null; B.mode = 'idle'; B.timer = 2; actG.rotation.set(0,0,0); actY = 0;
    U.uWhite.value = 0; petMats.forEach(m => m.emissive.setScalar(0));
    pillar.visible = false; rings.forEach(r => r.visible = false);
    fxo.hidden = true; clothesHidden = false; applyClothes(); duck(false);
    const F = form();
    toast(S.form === 'normal' ? `${S.name || '牠'}長大了，現在是${STAGES[S.stage].name}。` : `${F.name}：${F.desc}`);
    spawnHearts(3); save();
  }
}

// ---------- hatch / death / reset ----------
function hatchStart(){ if (hatching || S.stage !== 'egg') return; hatching = {t:0, cracked:false}; duck(true); sfx('roll'); }
function updateHatch(dt){
  if (!hatching) return;
  hatching.t += dt; const t = hatching.t;
  const sp = t < 0.8 ? t/0.8 : t < 3.4 ? 1 : Math.max(0, 1 - (t-3.4)/0.8);
  spot.visible = spotPool.visible = sp > 0; spot.material.opacity = sp*0.8; spotPool.material.opacity = sp;
  fxoV = sp*0.85; fxo.hidden = false;
  if (t < 1.6){ eggWob.rotation.z = Math.sin(t*40)*0.14*(t/1.6); return; }
  if (!hatching.cracked){
    hatching.cracked = true; eggWob.rotation.z = 0; eggMesh.visible = false;
    eggHalves = [0, Math.PI].map(start => { const m = new THREE.Mesh(new THREE.LatheGeometry(eggPts, 16, start, Math.PI), eggMat); m.position.y = 0.74; eggG.add(m); return {m, v:V3(start ? -1.6 : 1.6, 3, rnd(-0.5,0.5)), r:start ? 4 : -4}; });
    S.stage = 'baby'; S.form = 'normal'; S.ageMs = 0; S.growth = 0; S.st = {hunger:70, thirst:70, happy:80, energy:90, health:100}; S.poopQ = []; S.care = freshCare();
    B.mode = 'idle'; B.timer = 3; pos.set(0,0,0); vel.set(0,0,0); root.rotation.y = Math.atan2(camera.position.x, camera.position.z); reveal = 0;
    root.visible = true; shadow.g.visible = true; eggShadow.g.visible = false; nest.visible = false; applyForm();
    petS = stageScale(); sfx('hatch'); sparkles(V3(0,0.9,0), 26, 1); flashV = 0.6;
    fxo.classList.add('reveal'); fxSub.textContent = ''; fxName.textContent = '誕生了！';
  }
  if (eggHalves) eggHalves.forEach(h => { h.v.y -= 9*dt; h.m.position.addScaledVector(h.v, dt); h.m.rotation.z += h.r*dt; h.m.scale.setScalar(Math.max(0.01, 1 - (t-1.6)/1.6)); });
  reveal = clamp((t-1.6)/0.6, 0, 1);
  if (t > 2.2 && !hatching.cried){ hatching.cried = true; cry('happy'); }
  if (t > 4.3){
    if (eggHalves) eggHalves.forEach(h => eggG.remove(h.m)); eggHalves = null; hatching = null; reveal = 1; eggG.visible = false;
    spot.visible = spotPool.visible = false; fxo.hidden = true; fxo.classList.remove('reveal'); fxoV = 0; duck(false);
    askName();
  }
}
let tomb = null;
function makeTomb(p){
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.48,0.8,24), mat('#a3a59d',0.9)); stone.position.y = 0.4; stone.scale.z = 0.45; g.add(stone);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.42,24,12,0,Math.PI*2,0,Math.PI/2), mat('#a3a59d',0.9)); top.position.y = 0.8; top.scale.z = 0.45; g.add(top);
  const cols = ['#f2a541','#e0607e','#f3d250','#f2f0ea'];
  for (let i=0;i<7;i++){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6), mat(cols[i%4],0.6)); f.position.set(rnd(-0.6,0.6),0.08,rnd(0.25,0.55)); g.add(f); }
  g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); scene.add(g); return g;
}
function die(cause){
  if (S.dead || B.mode === 'dying') return;
  act = null; actG.rotation.set(0,0,0); dragging = false; rope.visible = handle.visible = false;
  if (B.mode === 'inHouse'){ root.visible = true; shadow.g.visible = true; pos.copy(houseDoor()); }
  B.mode = 'dying'; B.anim = 0; B.cause = cause; sfx('sad'); cry('sad');
}
function updateDying(dt){
  B.anim += dt/3.2; const a = B.anim;
  actG.rotation.z = (Math.PI/2)*ease(Math.min(a*2.2, 1));
  if (a > 0.55 && !B.heartsDone){ B.heartsDone = true; spawnHearts(6); }
  reveal = clamp(1 - (a-0.6)/0.4, 0, 1);
  if (a >= 1){
    root.visible = false; shadow.g.visible = false;
    S.dead = {cause:B.cause, ageMs:S.ageMs, x:pos.x, z:pos.z, stage:S.stage, form:S.form};
    tomb = makeTomb(pos); B.heartsDone = false; B.mode = 'dead'; actG.rotation.set(0,0,0); save(); showMemorial(); hudDirty = true;
  }
}
function clearPetWorld(){
  if (tomb){ scene.remove(tomb); tomb = null; }
  cubes.slice().forEach(removePoop);
  foods.forEach(f => scene.remove(f.g, f.sh.g)); foods.length = 0;
  if (bowl){ scene.remove(bowl.g); bowl = null; }
  puddles.forEach(m => scene.remove(m)); puddles.length = 0;
  if (act){ if (act.ball) scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2); act = null; }
  actG.rotation.set(0,0,0); actY = 0; reveal = 1; dragging = false; rope.visible = handle.visible = false;
  root.visible = false; shadow.g.visible = false; pos.set(0,0,0); vel.set(0,0,0);
  eggG.visible = true; eggMesh.visible = true; nest.visible = true; eggShadow.g.visible = true; eggWob.rotation.set(0,0,0);
  if (eggHalves){ eggHalves.forEach(h => eggG.remove(h.m)); eggHalves = null; }
  hatching = null; evo = null; fxo.hidden = true; fxoV = 0; U.uWhite.value = 0; petMats.forEach(m => m.emissive.setScalar(0));
  pillar.visible = false; rings.forEach(r => r.visible = false); spot.visible = spotPool.visible = false;
  B.mode = 'idle'; B.timer = 2; B.food = null; B.water = null; B.sleeping = false;
}
function newEgg(){
  clearPetWorld();
  S.stage = 'egg'; S.form = 'normal'; S.warm = 0; S.name = ''; S.ageMs = 0; S.growth = 0; S.dead = null; S.gen += 1; S.poopQ = []; S.care = freshCare();
  S.st = {hunger:80, thirst:80, happy:75, energy:85, health:100};
  applyForm(); save(); hudDirty = true; toast('一顆新的蛋出現了。點一點牠，幫牠保暖。');
}
function resetAll(){
  clearPetWorld();
  weeds.slice().forEach(w => { scene.remove(w.g); }); weeds.length = 0;
  snowmen.forEach(o => scene.remove(o.g, o.sh.g)); snowmen.length = 0;
  unbuildAll();
  S = freshSave(); previewHoliday = null;
  try { localStorage.removeItem(KEY); } catch(e){}
  applyForm(); save(); hudDirty = true; closeSheet();
  toast('全部重新開始了。點一點蛋，幫牠保暖。');
}

// ---------- brain ----------
function petSpeed(){ let v = 0.95*(0.55 + 0.45*Math.min(petS,1)); const st = S.st;
  if (st.health < 35) v *= 0.5; if (S.stage === 'ultimate') v *= 0.85; if (st.energy < 20) v *= 0.7; return v*(form().speed || 1); }
function nearestFood(){ let best = null, bd = 1e9; for (const f of foods){ if (!f.landed) continue; const d = Math.hypot(f.g.position.x-pos.x, f.g.position.z-pos.z); if (d < bd){ bd = d; best = f; } } return best; }
function waterSpot(){ if (BG.pond) return {p:SPOTS.pond, r:1.45}; if (bowl) return {p:bowl.g.position, r:0.15}; return null; }
function pickWander(){
  const obs = obstacles();
  for (let i=0;i<14;i++){
    const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*WANDER, x = Math.sin(a)*r, z = Math.cos(a)*r;
    if (Math.hypot(x-pos.x, z-pos.z) < 1.4) continue;
    if (obs.some(o => Math.hypot(o.c.x-x, o.c.z-z) < o.r + 1.4*petS)) continue;
    B.target.set(x,0,z); return;
  }
  B.target.set(-pos.x*0.5, 0, -pos.z*0.5);
}
function walkTowards(tx_, tz_, dt, speed, stopDist){
  const dx = tx_-pos.x, dz = tz_-pos.z, dist = Math.hypot(dx,dz), diff = wrapA(Math.atan2(dx,dz) - root.rotation.y);
  root.rotation.y += clamp(diff, -2.6*dt, 2.6*dt);
  let sp = speed*clamp(Math.cos(diff), 0, 1); if (dist < stopDist) sp = 0;
  const fwd = V3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
  pos.addScaledVector(fwd, sp*dt); walkVel.copy(fwd).multiplyScalar(sp);
  return {dist, diff, moving: sp > 0.05 || Math.abs(diff) > 0.15};
}
function startSleep(){ B.mode = 'sleep'; B.zzzT = 0; cry('sleepy'); }
function wake(grumpy){
  if (B.mode === 'inHouse') B.sleeping = false; else { B.mode = 'idle'; B.timer = 2; }
  if (grumpy){ S.st.happy = clamp(S.st.happy - 6, 0, 100); showEmote('😠', 1.6); cry('angry'); }
}
function goHouse(sleep){ B.mode = 'goHouse'; B.sleepAfter = sleep; }
function exitHouse(){ if (B.mode !== 'inHouse') return; B.mode = 'exit'; B.anim = 0; B.sleeping = false; root.visible = true; shadow.g.visible = true; }
function think(dt){
  walkVel.set(0,0,0);
  if (!petActive() || hatching || B.mode === 'evolve' || dragging || act || pos.y > 0.02 || liftW > 0.05) return false;
  const st = S.st; B.timer -= dt;
  const wakeOK = () => st.energy >= 98 || (nightF < 0.5 && st.energy >= 80);
  if (B.mode === 'sleep'){ if (wakeOK()) wake(false); return false; }
  if (B.mode === 'inHouse'){
    if (B.sleeping && wakeOK()) B.sleeping = false;
    if (!B.sleeping && (st.energy < 20 || (nightF > 0.6 && st.energy < 85))) B.sleeping = true;
    if (!B.sleeping && !badWeather()) exitHouse();
    return false;
  }
  const busy = ['eat','drink','enter','exit','goHouse'].includes(B.mode);
  const wantSleep = st.energy < 20 || (nightF > 0.6 && st.energy < 85);
  if (!busy && wantSleep){ if (BG.house) goHouse(true); else startSleep(); return false; }
  if (!busy || B.mode === 'goHouse'){
    if (!['seek','seekWater'].includes(B.mode)){
      const f = nearestFood();
      if (f && st.hunger < 96){ B.mode = 'seek'; B.food = f; }
      else if (B.water && st.thirst < 96 && waterSpot()) B.mode = 'seekWater';
    }
  }
  if (badWeather() && BG.house && ['idle','walk'].includes(B.mode)) goHouse(false);
  let moving = false; const sp = petSpeed(), mouth = 1.95*petS;
  switch (B.mode){
    case 'idle': {
      B.lookT -= dt;
      if (B.lookT <= 0){ B.lookT = rnd(0.7,1.8); B.lookYaw = [-0.7,-0.35,0,0.35,0.7][Math.floor(Math.random()*5)]; B.lookPitch = rnd(-0.15,0.15); if (Math.random() < 0.4) ears[Math.floor(Math.random()*2)].v += rnd(-6,6); }
      if (st.hunger < 25){ B.stompT -= dt; if (B.stompT <= 0){ B.stompT = rnd(2.5,4); vel.y = 2.6*petS + 1; showEmote('💢',1.4); cry('angry'); } }
      if (B.timer <= 0){ if (Math.random() < (st.health < 35 ? 0.3 : 0.72)){ pickWander(); B.mode = 'walk'; B.timer = 14; } else B.timer = rnd(2,4); }
      break; }
    case 'walk': case 'goto': {
      const r = walkTowards(B.target.x, B.target.z, dt, sp, 0.25); moving = r.moving;
      if (r.dist < 0.3 || B.timer <= 0){ B.mode = 'idle'; B.timer = rnd(2,5); B.lookT = 0; }
      break; }
    case 'seek': {
      const f = B.food;
      if (!f || !foods.includes(f)){ B.mode = 'idle'; B.timer = 1; break; }
      const fx_ = f.g.position.x, fz_ = f.g.position.z, dist = Math.hypot(fx_-pos.x, fz_-pos.z);
      if (dist < mouth*0.75){
        root.rotation.y += clamp(wrapA(Math.atan2(fx_-pos.x, fz_-pos.z) - root.rotation.y), -2.6*dt, 2.6*dt);
        const back = V3(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)); pos.addScaledVector(back, 0.6*dt); walkVel.copy(back).multiplyScalar(0.6); moving = true;
      } else {
        const r = walkTowards(fx_, fz_, dt, sp*1.3, mouth); moving = r.moving;
        if (r.dist < mouth + 0.1 && Math.abs(r.diff) < 0.25){ B.mode = 'eat'; B.timer = 2.6; B.nomT = 0; B.before = st.hunger; }
      }
      break; }
    case 'eat': {
      const f = B.food;
      if (!f || !foods.includes(f)){ B.mode = 'idle'; B.timer = 1.5; break; }
      f.eat -= dt/2.6; f.g.scale.setScalar(Math.max(0.05, f.eat));
      st.hunger = clamp(st.hunger + 28*dt/2.6, 0, 100);
      B.nomT -= dt; if (B.nomT <= 0){ B.nomT = 0.38; sfx('nom'); }
      if (f.eat <= 0){
        scene.remove(f.g, f.sh.g); foods.splice(foods.indexOf(f),1); B.food = null;
        S.care.meals++; if (B.before > 80) S.care.overfed++;
        if (B.before < 90) addCoins(2, headTop());
        S.growth += growthOK() ? 4 : 0.5; st.happy = clamp(st.happy+3, 0, 100);
        if (Math.random() < 0.75) S.poopQ.push(rnd(1.5,3.5));
        spawnHearts(2); sfx('happy'); cry('happy');
        B.mode = 'idle'; B.timer = 2.5;
        if (st.hunger > 90 && st.energy < 70 && Math.random() < 0.5){ if (BG.house) goHouse(true); else startSleep(); }
      }
      break; }
    case 'seekWater': {
      const w = waterSpot(); if (!w){ B.mode = 'idle'; B.water = null; break; }
      const r = walkTowards(w.p.x, w.p.z, dt, sp*1.2, mouth + w.r); moving = r.moving;
      if (r.dist < mouth + w.r + 0.12 && Math.abs(r.diff) < 0.25){ B.mode = 'drink'; B.timer = 2.4; B.nomT = 0; B.before = st.thirst; }
      break; }
    case 'drink': {
      st.thirst = clamp(st.thirst + 45*dt/2.4, 0, 100);
      B.nomT -= dt; if (B.nomT <= 0){ B.nomT = 0.45; sfx('drink'); }
      if (bowl && !BG.pond){ bowl.left -= dt/2.4; bowl.w.position.y = 0.06 + 0.11*Math.max(0, bowl.left); }
      if (B.timer <= 0){
        if (B.before < 90) addCoins(2, headTop());
        if (growthOK()) S.growth += 1.5;
        if (bowl && !BG.pond){ scene.remove(bowl.g); bowl = null; }
        B.water = null; B.mode = 'idle'; B.timer = 2; spawnHearts(1);
      }
      break; }
    case 'goHouse': {
      if (!BG.house){ B.mode = 'idle'; break; }
      const d = houseDoor(), r = walkTowards(d.x, d.z, dt, sp*1.1, 0.2); moving = r.moving;
      if (r.dist < 0.35){
        const diff = wrapA(Math.atan2(SPOTS.house.x-pos.x, SPOTS.house.z-pos.z) - root.rotation.y);
        root.rotation.y += clamp(diff, -2.6*dt, 2.6*dt); moving = true;
        if (Math.abs(diff) < 0.15){ B.mode = 'enter'; B.anim = 0; B.from.copy(pos); }
      }
      break; }
    case 'enter': {
      B.anim += dt/1.4; pos.lerpVectors(B.from, SPOTS.house, ease(Math.min(B.anim,1))); moving = true;
      if (B.anim >= 1){ root.visible = false; shadow.g.visible = false; B.mode = 'inHouse'; B.sleeping = B.sleepAfter; }
      break; }
    case 'exit': {
      B.anim += dt/1.4; const d = houseDoor(); pos.lerpVectors(SPOTS.house, d, ease(Math.min(B.anim,1)));
      root.rotation.y = Math.atan2(d.x-SPOTS.house.x, d.z-SPOTS.house.z); moving = true;
      if (B.anim >= 1){ B.mode = 'idle'; B.timer = 2; }
      break; }
  }
  if (!['enter','exit','inHouse'].includes(B.mode)){
    for (const o of obstacles()){ const dx = pos.x-o.c.x, dz = pos.z-o.c.z, d = Math.hypot(dx,dz), min = o.r + 0.9*petS;
      if (d < min && d > 0.001){ pos.x = o.c.x + dx/d*min; pos.z = o.c.z + dz/d*min; } }
  }
  return moving;
}
function moodKey(){
  const st = S.st;
  if (asleep()) return 'sleep';
  if (st.health < 35) return 'sick';
  if (st.hunger < 25) return 'angry';
  if (st.thirst < 25) return 'thirsty';
  if (cleanVal() < 40) return 'dirty';
  if (st.energy < 20) return 'tired';
  if (st.happy < 30) return 'sad';
  if (st.happy > 75) return 'happy';
  return 'ok';
}
const MOOD_EMOTE = {sick:'🤒', angry:'💢', thirsty:'💧', dirty:'😖', tired:'🥱', sad:'😢', happy:'❤️'};
const MOOD_CRY = {sick:'sad', angry:'angry', thirsty:'sad', dirty:'grunt', tired:'sleepy', sad:'sad', happy:'happy', ok:'grunt'};
function statusText(){
  if (S.stage === 'egg' || S.dead || B.mode === 'dying' || B.mode === 'dead') return '';
  if (B.mode === 'evolve') return '進化中！';
  if (dragging) return '被抓起來了！';
  if (act) return ACTS[act.key].name;
  if (B.mode === 'inHouse') return B.sleeping ? '在小窩裡睡覺' : '躲在小窩裡';
  if (B.mode === 'sleep') return '睡覺中';
  if (B.mode === 'eat') return '吃東西中';
  if (B.mode === 'drink') return '喝水中';
  if (B.mode === 'seek') return '發現食物了';
  if (B.mode === 'seekWater') return '去喝水';
  if (B.mode === 'goHouse' || B.mode === 'enter') return '回小窩';
  const m = moodKey();
  return {sick:'生病了，不太舒服', angry:'肚子餓，在生氣', thirsty:'好渴', dirty:'覺得好髒好臭', tired:'好累', sad:'有點寂寞',
    happy: B.mode === 'walk' ? '開心地散步' : '心情很好'}[m] || (B.mode === 'walk' || B.mode === 'goto' ? '散步中' : '東張西望');
}

// ---------- day / night / weather ----------
const SKY_DAY = '#d9e1d2', SKY_NIGHT = '#1a2130', SKY_DUSK = '#e3bfa4';
const PHASE_NAME = {morning:'早上', day:'白天', evening:'傍晚', night:'晚上'};
let wxAnnounced = null, lastTheme = null, lastPhase = null;
function dayInfo(){
  const d = new Date();
  if (S.dayMode === 'real'){
    const h = d.getHours() + d.getMinutes()/60;
    let n; if (h < 5.5 || h >= 19) n = 1; else if (h < 7) n = 1-(h-5.5)/1.5; else if (h < 17.5) n = 0; else n = (h-17.5)/1.5;
    const dusk = (h >= 5.5 && h < 7.5) || (h >= 17 && h < 19.5) ? 1 - Math.abs(n-0.5)*2 : 0;
    const phase = (h < 5.5 || h >= 19.5) ? 'night' : h < 10 ? 'morning' : h < 17 ? 'day' : 'evening';
    return {d, n, dusk, phase, left:null};
  }
  const m = d.getMinutes() + d.getSeconds()/60, dayHour = d.getHours()%2 === 0, tr = clamp(m/5, 0, 1);
  const n = dayHour ? 1 - ease(tr) : ease(tr);
  let dusk = tr < 1 ? 1 - Math.abs(tr*2-1) : 0;
  if (dayHour && m > 50) dusk = Math.max(dusk, (m-50)/10*0.7);
  const phase = !dayHour ? 'night' : m < 20 ? 'morning' : m < 50 ? 'day' : 'evening';
  return {d, n, dusk, phase, left:Math.ceil(60 - m), dayHour};
}
function updateWorld(dt, t){
  const di = dayInfo(); nightF = di.n;
  if (lastPhase && lastPhase !== di.phase && S.dayMode === 'hourly'){ if (di.phase === 'night') toast('天黑了。'); if (di.phase === 'morning') toast('天亮了，早安！'); }
  lastPhase = di.phase;
  if (!S.weather.forced && Date.now() > S.weather.until){
    const r = Math.random(); S.weather.type = r<.4?'sunny':r<.65?'cloudy':r<.82?'rain':r<.9?'storm':'snow';
    S.weather.until = Date.now() + rnd(4,10)*60000;
  }
  const w = weatherNow(), W = WX[w], hol = activeHoliday();
  if (wxAnnounced !== null && wxAnnounced !== w){
    const msg = {rain:'開始下雨了。可以帶牠去踩水窪。', storm:'打雷了，牠有點怕。', snow:'下雪了！可以堆雪人。', sunny:'天晴了。', cloudy:'雲飄過來了。'}[w];
    if (msg) toast(msg);
    if (w === 'storm' && petActive() && !asleep()){ showEmote('😨', 2); cry('sad'); }
  }
  wxAnnounced = w;
  let sky = mixHex(SKY_DAY, SKY_NIGHT, di.n); sky = mixHex(sky, SKY_DUSK, di.dusk*0.6);
  sky = mixHex(sky, '#8e979a', W.grey*(1-di.n*0.6)); if (W.white) sky = mixHex(sky, '#eef1f3', W.white*(1-di.n));
  if (hol) sky = mixHex(sky, hol.tint[0], hol.tint[1]*(1-di.n*0.5));
  document.documentElement.style.setProperty('--bg', sky);
  const theme = di.n > 0.5 ? 'dark' : 'light'; if (theme !== lastTheme){ lastTheme = theme; document.documentElement.dataset.theme = theme; }
  snowCover = clamp(snowCover + (w === 'snow' ? 0.015 : -0.006)*dt, 0, 0.75);
  let gc = mixHex('#c8d4ba', '#202b26', di.n); gc = mixHex(gc, di.n > 0.5 ? '#5f6a72' : '#eef1f2', snowCover);
  ground.material.color.set(gc);
  flashV *= Math.exp(-5*dt); $('#flash').style.opacity = (flashV*0.8).toFixed(3);
  const dim = W.dim*(1 - fxoV*0.45);
  hemi.intensity = (lerp(0.8, 0.32, di.n)*dim + flashV*1.2)*LI;
  sun.intensity = (lerp(0.75, 0.1, di.n)*dim + flashV)*LI;
  U.uSun.value = lerp(1, 0.22, di.n)*dim + flashV;
  U.uSky.value.set(mixHex('#fff8ec', '#7584ab', di.n));
  U.uGround.value.set(mixHex('#77806a', '#283040', di.n));
  const on = Math.max(clamp((di.n - 0.3)/0.4, 0, 1), w === 'storm' ? 0.6 : 0);
  nightGlow.forEach(m => m.emissiveIntensity = on*1.3);
  if (BG.lamp) BG.lamp.userData.glows.forEach(m => m.opacity = on);
  rain.visible = w === 'rain' || w === 'storm';
  if (rain.visible){
    rain.position.set(camTarget.x, 0, camTarget.z);
    for (let i=0;i<RN;i++){ let y = rainPos[i*6+1] - rainSpd[i]*dt*(w==='storm'?1.3:1);
      if (y < 0){ y += 11; const x = rnd(-11,11), z = rnd(-11,11); rainPos[i*6] = x; rainPos[i*6+2] = z; rainPos[i*6+3] = x+0.08; rainPos[i*6+5] = z; }
      rainPos[i*6+1] = y; rainPos[i*6+4] = y + 0.4; }
    rainGeo.attributes.position.needsUpdate = true;
  }
  snow.visible = w === 'snow';
  if (snow.visible){
    snow.position.set(camTarget.x, 0, camTarget.z);
    for (let i=0;i<SN;i++){ let y = snowPos[i*3+1] - 0.9*dt; snowPos[i*3] += Math.sin(t*0.8 + i)*0.25*dt;
      if (y < 0){ y += 11; snowPos[i*3] = rnd(-11,11); snowPos[i*3+2] = rnd(-11,11); } snowPos[i*3+1] = y; }
    snowGeo.attributes.position.needsUpdate = true;
  }
  const ffAct = act && act.key === 'fireflies';
  fireflies.visible = ffAct || (di.n > 0.6 && (w === 'sunny' || w === 'cloudy'));
  if (fireflies.visible){
    const hp = ffAct ? headTop() : null;
    ffSeed.forEach((f,i) => {
      let x = f.x + Math.sin(t*0.4+f.p)*1.2, y = f.y + Math.sin(t*0.9+f.p*2)*0.3, z = f.z + Math.cos(t*0.35+f.p)*1.2;
      if (hp){ const a = t*0.6 + f.p; x = hp.x + Math.sin(a)*(0.8+i%5*0.25); y = hp.y - 0.3 + Math.sin(t*1.3+f.p)*0.5; z = hp.z + Math.cos(a)*(0.8+i%5*0.25); }
      f.cx += (x - f.cx)*Math.min(1, dt*1.5); f.cy += (y - f.cy)*Math.min(1, dt*1.5); f.cz += (z - f.cz)*Math.min(1, dt*1.5);
      ffPos[i*3] = f.cx; ffPos[i*3+1] = f.cy; ffPos[i*3+2] = f.cz; });
    ffGeo.attributes.position.needsUpdate = true;
    fireflies.material.opacity = 0.6 + 0.4*Math.sin(t*3);
  }
  if (w === 'storm'){
    thunderT -= dt;
    if (thunderT <= 0){ thunderT = rnd(5,12); flashV = 1; setTimeout(()=>sfx('thunder'), 350);
      if (petActive() && !asleep() && B.mode !== 'inHouse' && !evo){ showEmote('😨',1.8); sqv += 1.5; cry('sad'); } }
  }
  if (SND.on) rainSound(w === 'rain' || w === 'storm'); else rainSound(false);
  // snowmen melt
  for (let i=snowmen.length-1;i>=0;i--){ const o = snowmen[i];
    if (w !== 'snow' && snowCover < 0.05) o.melt += dt/600;
    const s = 1 - o.melt*0.6; o.g.scale.set(s, s*(1 - o.melt*0.3), s); o.sh.g.scale.setScalar(s);
    if (o.melt >= 1){ scene.remove(o.g, o.sh.g); snowmen.splice(i,1); } }
}

// ---------- HUD ----------
const STAT_DEFS = [['hunger','飽足'],['thirst','水分'],['happy','心情'],['energy','體力'],['clean','清潔'],['health','健康']];
const statsEl = $('#stats');
statsEl.innerHTML = STAT_DEFS.map(([k,l]) => `<div class="stat"><span>${l}</span><div class="track"><div class="fill" id="f_${k}"></div></div><span class="num" id="n_${k}"></span></div>`).join('')
  + `<div class="stat"><span id="l_grow">成長</span><div class="track"><div class="fill" id="f_grow"></div></div><span class="num" id="n_grow"></span></div><p class="env" id="env"></p>`;
function fmtAge(){ const m = ageMin(); if (m < 60) return `${Math.floor(m)} 分鐘大`; if (m < 1440) return `${Math.floor(m/60)} 小時大`; return `${Math.floor(m/1440)} 天 ${Math.floor(m%1440/60)} 小時大`; }
function setBar(k, v, txt){ const f = $('#f_'+k); f.style.width = clamp(v,0,100).toFixed(0)+'%'; f.classList.toggle('low', v < 25); $('#n_'+k).textContent = txt ?? Math.round(v); }
function stageLabel(){ const sd = STAGES[S.stage]; return S.stage === 'baby' || S.form === 'normal' ? sd.name : `${sd.name}　${form().name}`; }
function renderHUD(){
  $('#coins').textContent = S.coins;
  const egg = S.stage === 'egg';
  $('#petName').textContent = egg ? '一顆蛋' : (S.name || '袋熊');
  if (egg){ $('#petSub').textContent = `孵化中 ${Math.floor(S.warm)}%`; $('#petNow').textContent = hatching ? '要出來了！' : '點一點蛋，幫牠保暖。'; }
  else if (S.dead){ $('#petSub').textContent = '已經離開了'; $('#petNow').textContent = ''; }
  else { $('#petSub').textContent = `${stageLabel()}，${fmtAge()}`; const stx = statusText(); $('#petNow').textContent = stx ? '現在：' + stx : ''; }
  statsEl.hidden = !S.hud; $('#btnStats').setAttribute('aria-pressed', S.hud ? 'true' : 'false');
  const st = S.st;
  $('#l_grow').textContent = egg ? '孵化' : '成長';
  if (egg || S.dead){ STAT_DEFS.forEach(([k]) => setBar(k, 0, '–')); setBar('grow', egg ? S.warm : 0, egg ? Math.floor(S.warm)+'%' : '–'); $('#f_grow').classList.remove('low'); }
  else {
    STAT_DEFS.forEach(([k]) => setBar(k, k === 'clean' ? cleanVal() : st[k]));
    const sd = STAGES[S.stage];
    if (sd.next){ const prevG = {baby:0, child:25, adult:120, perfect:300}[S.stage], pct = clamp((S.growth-prevG)/(sd.growth-prevG)*100, 0, 100);
      const ageOK = ageMin() >= sd.age;
      setBar('grow', pct, !growthOK() ? '停滯' : pct >= 100 && !ageOK ? '等待' : Math.floor(pct)+'%'); $('#f_grow').classList.toggle('low', !growthOK()); }
    else setBar('grow', 100, '最終');
  }
  const di = dayInfo(), hh = pad(di.d.getHours()), mm = pad(di.d.getMinutes()), hol = activeHoliday();
  let env = `${WX[weatherNow()].name}　${PHASE_NAME[di.phase]}`;
  env += di.left != null ? `（${di.left} 分鐘後${di.dayHour ? '天黑' : '天亮'}）` : ` ${hh}:${mm}`;
  if (hol) env += `<br>今天是${hol.name}！`;
  if (SND.on && SND.songId) env += `<br>♪ ${hol && SND.songId === hol.song ? hol.name : (SONG_NAME[SND.songId] || '')}之歌`;
  if (S.speed > 1) env += `<br>時間 ${S.speed} 倍速`;
  $('#env').innerHTML = env;
  $('#alert').hidden = !(petActive() && st.health < 35 && B.mode !== 'evolve');
  const alive = petActive();
  document.querySelectorAll('.dock button').forEach(b => { const c = b.dataset.cmd; b.disabled = !alive && ['feed','water','play'].includes(c); });
  document.body.classList.toggle('ui-off', !!S.uiHidden); $('#btnShow').hidden = !S.uiHidden;
  hudDirty = false;
}

// ---------- toast / modal / sheet ----------
const toastEl = $('#toast'); let toastTimer;
function toast(t){ toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 4200); }
function showModal(title, bodyHTML, actions){
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = bodyHTML; const ac = $('#modalActs'); ac.innerHTML = '';
  actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn' + (a.ghost ? ' ghost' : ''); b.textContent = a.label; b.onclick = () => { closeModal(); a.onClick(); }; ac.appendChild(b); });
  $('#modal').hidden = false; const inp = $('#modalBody input'); (inp || ac.lastChild).focus();
}
function closeModal(){ $('#modal').hidden = true; canvas.focus({preventScroll:true}); }
function askName(){
  showModal('孵出來了！', `<p>是一隻袋熊寶寶。幫牠取個名字吧。</p><input id="nameIn" maxlength="8" value="小袋" aria-label="名字">`, [{label:'就叫這個', onClick:()=>{
    S.name = (($('#nameIn') && $('#nameIn').value) || '').trim() || '小袋'; refreshSign(); save(); hudDirty = true;
    toast(`${S.name}來了！餵牠吃東西、陪牠玩，牠會慢慢長大。`); }}]);
  const inp = $('#nameIn'); const v = inp.value;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('#modalActs button').click(); });
  // keep the typed value when the button is clicked
  $('#modalActs button').onclick = () => { S.name = (inp.value || v).trim() || '小袋'; closeModal(); refreshSign(); save(); hudDirty = true; toast(`${S.name}來了！餵牠吃東西、陪牠玩，牠會慢慢長大。`); };
}
function refreshSign(){ if (!BG.house) return; const m = BG.house.userData.sign.material[4]; m.map = signTexture(S.name); m.needsUpdate = true; }
function showMemorial(){
  const d = S.dead, days = Math.floor(d.ageMs/86400000), hrs = Math.floor(d.ageMs%86400000/3600000), nm = S.name || '牠';
  const what = d.stage && STAGES[d.stage] ? `（${STAGES[d.stage].name}${d.form && d.form !== 'normal' ? '的' + FORMS[d.form].name : ''}）` : '';
  const msg = d.cause === 'old'
    ? `${nm}${what}活了 ${days} 天 ${hrs} 小時，安安穩穩地走完了這一生。謝謝你一路照顧牠。`
    : `${nm}${what}病得太重，沒能撐過去。牠陪了你 ${days} 天 ${hrs} 小時。下一隻記得多餵牠吃東西、喝水，保持乾淨，生病時要餵藥。`;
  showModal(`${nm}離開了`, `<p>${msg}</p><p>代幣、衣服和建設都會留給下一隻。</p>`, [{label:'孵一顆新蛋', onClick:newEgg}]);
}
const sheet = $('#sheet'), sheetBody = $('#sheetBody'); let sheetKind = null;
function openSheet(kind){ sheetKind = kind; sheet.hidden = false; renderSheet(); $('#sheetClose').focus(); }
function closeSheet(){ sheet.hidden = true; sheetKind = null; }
$('#sheetClose').onclick = closeSheet;
function md(d){ return `${d.getMonth()+1}/${d.getDate()}`; }
function renderSheet(){
  if (!sheetKind) return;
  $('#sheetTitle').textContent = {play:'玩耍', shop:'商店', wardrobe:'衣櫥', settings:'設定'}[sheetKind];
  let h = '';
  if (sheetKind === 'play'){
    const card = ([k,a]) => { const why = whyCantPlay(k), sp = a.special;
      const cost = {dance:'體力 -8，心情 +14', snowman:'', puddle:'', fireflies:''}[k] ?? '體力 -6，心情 +10';
      return `<button class="card" data-act="${k}" ${why && sp ? 'disabled' : ''}><h3>${a.name}</h3><p>${sp ? (why && sp ? a.why : a.desc) : cost}</p></button>`; };
    h = `<div class="grid">` + Object.entries(ACTS).filter(([,a]) => !a.special).map(card).join('') + `</div>`
      + `<p class="sec">特別活動（看天氣和時間）</p><div class="grid">` + Object.entries(ACTS).filter(([,a]) => a.special).map(card).join('') + `</div>`;
  } else if (sheetKind === 'shop'){
    const hol = activeHoliday(), real = realHoliday(), nx = nextHoliday();
    const clothCard = c => `<div class="card${c.holiday ? ' limited' : ''}">${c.holiday ? `<span class="tag">${HOLIDAYS.find(x=>x.id===c.holiday).name}限定</span>` : ''}<h3>${c.name}</h3><p>${c.price} 代幣</p>${S.owned[c.id] ? `<button class="btn ghost" disabled>已擁有</button>` : (c.holiday && (!real || real.id !== c.holiday)) ? `<button class="btn ghost" disabled>只在節日當天賣</button>` : `<button class="btn" data-buy="${c.id}" ${S.coins < c.price ? 'disabled' : ''}>購買</button>`}</div>`;
    const buildCard = b => `<div class="card${b.holiday ? ' limited' : ''}">${b.holiday ? `<span class="tag">${HOLIDAYS.find(x=>x.id===b.holiday).name}限定</span>` : ''}<h3>${b.name}</h3><p>${b.desc}</p><p>${b.price} 代幣</p>${S.builds[b.id] ? `<button class="btn ghost" disabled>已建造</button>` : (b.holiday && (!real || real.id !== b.holiday)) ? `<button class="btn ghost" disabled>只在節日當天賣</button>` : `<button class="btn" data-build="${b.id}" ${S.coins < b.price ? 'disabled' : ''}>建造</button>`}</div>`;
    if (hol){
      h += `<p class="sec">${hol.name}限定（${real && real.id === hol.id ? '今天才買得到，買了永久保留' : '預覽中，只能看不能買'}）</p><div class="grid">` + CLOTHES.filter(c => c.holiday === hol.id).map(clothCard).join('') + BUILDS.filter(b => b.holiday === hol.id).map(buildCard).join('') + `</div>`;
    } else if (nx){ h += `<p class="sec">下一個節日：${nx.h.name}（${md(nx.d)}），當天會賣限定服裝和建設。</p>`; }
    h += `<p class="sec">衣服</p><div class="grid">` + CLOTHES.filter(c => !c.holiday || (S.owned[c.id] && (!hol || c.holiday !== hol.id))).map(clothCard).join('') + `</div>`;
    h += `<p class="sec">建設</p><div class="grid">` + BUILDS.filter(b => !b.holiday || (S.builds[b.id] && (!hol || b.holiday !== hol.id))).map(buildCard).join('') + `</div>`;
    h += `<p class="sec">補給</p><div class="grid"><div class="card"><h3>感冒藥</h3><p>健康 +45。生病時用。</p><p>10 代幣</p><button class="btn" data-med ${S.coins < 10 ? 'disabled' : ''}>購買並餵藥</button></div></div>`;
    h += `<p class="sec">清大便一顆 +3、拔雜草一株 +2、牠餓或渴的時候餵食、喝水各 +2、堆雪人 +5、踩水窪 +2、摸摸牠偶爾 +1。</p>`;
  } else if (sheetKind === 'wardrobe'){
    const owned = CLOTHES.filter(c => S.owned[c.id]);
    h = `<p class="sec">毛色</p><div class="swrow" role="radiogroup" aria-label="毛色">` + FURS.map((f,i) => `<button class="sw" role="radio" aria-checked="${S.fur===i}" aria-label="${f.name}" title="${f.name}" data-fur="${i}" style="background:${f.c}"></button>`).join('') + `</div>`;
    h += `<div class="row" style="margin-top:14px"><p class="sec" style="margin:0">衣服（同一個位置一次只能穿一件）</p>${owned.length ? `<button class="btn ghost" data-naked>脫光光</button>` : ''}</div>`;
    if (!owned.length) h += `<p style="color:var(--soft)">還沒有衣服。清大便、拔雜草賺代幣，去商店買吧。</p>`;
    else h += owned.map(c => `<div class="card" style="margin-top:10px"><div class="row"><h3>${c.name}</h3><button class="btn ${S.worn[c.id] ? '' : 'ghost'}" data-wear="${c.id}">${S.worn[c.id] ? '脫下' : '穿上'}</button></div><div class="swrow" role="radiogroup" aria-label="${c.name}顏色">` + PALETTE.map(p => `<button class="sw" role="radio" aria-checked="${(S.colors[c.id]||c.def)===p}" aria-label="${p}" data-col="${c.id}|${p}" style="background:${p}"></button>`).join('') + `</div></div>`).join('');
  } else if (sheetKind === 'settings'){
    const sp = [1,10,60], wx = [['auto','自動'],['sunny','晴'],['cloudy','多雲'],['rain','雨'],['snow','雪'],['storm','雷雨']];
    h = `<p class="sec">晝夜</p><div class="opts"><button class="icon" data-day="hourly" aria-pressed="${S.dayMode==='hourly'}">每小時切換早晚</button><button class="icon" data-day="real" aria-pressed="${S.dayMode==='real'}">跟現實時間同步</button></div>`
      + `<p class="sec">時間流速（只影響成長和數值，10 倍、60 倍適合想快點看牠進化）</p><div class="opts">` + sp.map(v => `<button class="icon" data-speed="${v}" aria-pressed="${S.speed===v}">${v} 倍</button>`).join('') + `</div>`
      + `<p class="sec">天氣</p><div class="opts">` + wx.map(([k,l]) => `<button class="icon" data-wx="${k}" aria-pressed="${(S.weather.forced||'auto')===k}">${l}</button>`).join('') + `</div>`
      + `<p class="sec">節日預覽（看背景和音樂，限定商品只能在真正的節日當天買）</p><div class="opts"><button class="icon" data-hol="" aria-pressed="${!previewHoliday}">關閉</button>` + HOLIDAYS.map(x => `<button class="icon" data-hol="${x.id}" aria-pressed="${previewHoliday===x.id}">${x.name}</button>`).join('') + `</div>`
      + `<p class="sec">介面</p><div class="opts"><button class="icon" data-hideui>隱藏全部介面</button><button class="icon" data-guide>打開說明書</button></div>`
      + installPanel()
      + `<p class="sec">帳號與雲端存檔</p>` + cloudPanel()
      + `<p class="sec">存檔碼（備份，或把舊版的袋熊搬過來）</p><div class="opts"><button class="btn ghost" data-export>匯出存檔碼</button><button class="btn ghost" data-import>匯入存檔碼</button></div>`
      + `<p class="sec">重來</p><div class="opts"><button class="btn ghost" data-reset>全部重新開始</button></div>`;
  }
  sheetBody.innerHTML = h;
}
function installPanel(){
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return '';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const how = window.installPrompt ? `<div class="opts"><button class="btn" data-install>安裝</button></div>`
    : ios ? `<p class="note">用 Safari 打開，按下方的「分享」按鈕 →「加入主畫面」。</p>`
    : `<p class="note">用 Chrome 打開，按右上角「⋮」→「加到主畫面」或「安裝應用程式」。</p>`;
  return `<p class="sec">安裝到主畫面（像 App 一樣全螢幕開啟，沒網路也能玩）</p>` + how
    + (ios ? `<p class="note">裝好以後，在 App 裡要再登入一次 Google。</p>` : '');
}
addEventListener('appinstalled', () => { window.installPrompt = null; toast('裝好了！可以從主畫面打開袋熊。'); if (sheetKind === 'settings') renderSheet(); });
function cloudPanel(){
  if (!cloud.available) return `<p class="note">雲端功能沒有載入（可能沒有網路），進度先存在這台裝置。</p>`;
  if (!cloud.user) return `<p class="note">登入後，進度會存到雲端，電腦和手機可以共用同一隻袋熊。沒登入也能玩，只存在這台裝置。</p>`
    + (IN_APP ? `<p class="note">你現在是在 App（例如 LINE）裡面開的網頁，要先改用 Chrome 或 Safari 打開才能登入。</p><div class="opts"><button class="btn" data-login>用瀏覽器打開</button></div>`
              : `<div class="opts"><button class="btn" data-login>用 Google 登入</button></div>`);
  const st = {saving:'同步中……', synced:`已同步（${when(cloud.lastSync)}）`, offline:'暫時連不上雲端，連上網後會自動同步。', error:'同步失敗，稍後會再試。'}[cloud.status] || '準備同步……';
  return `<p class="note">已登入：${esc(cloud.user.email || cloud.user.displayName || '')}<br>${st}</p>`
    + `<div class="opts"><button class="btn ghost" data-syncnow>立即同步</button><button class="btn ghost" data-logout>登出</button></div>`;
}
sheetBody.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.act){ closeSheet(); startAct(d.act); return; }
  if ('reset' in d){ showModal('全部重新開始？', `<p>袋熊、代幣、衣服和建設都會清掉，從一顆蛋重新開始${cloud.user ? '，雲端存檔也一樣' : ''}。沒辦法復原。</p>`, [{label:'取消', ghost:true, onClick:()=>{}}, {label:'重新開始', onClick:resetAll}]); return; }
  if ('guide' in d){ closeSheet(); openGuide(0); return; }
  if ('export' in d){ closeSheet(); exportSave(); return; }
  if ('import' in d){ closeSheet(); importSave(); return; }
  if ('install' in d){ const p = window.installPrompt; if (p){ p.prompt(); p.userChoice.then(() => { window.installPrompt = null; renderSheet(); }); } return; }
  if ('login' in d){ login(); return; }
  if ('logout' in d){ cloud.signOut().then(() => toast('登出了。進度還是會存在這台裝置。')); return; }
  if ('syncnow' in d){ save(true); return; }
  if (d.buy){ const c = CLOTHES.find(x => x.id === d.buy); if (S.coins >= c.price){ S.coins -= c.price; S.owned[c.id] = true; wear(c.id, true); sfx('happy'); toast(`買了${c.name}，已經幫牠穿上。到衣櫥可以換顏色。`); } }
  if (d.build){ const bd = BUILDS.find(x => x.id === d.build); if (S.coins >= bd.price){ S.coins -= bd.price; S.builds[bd.id] = true; build(bd.id); refreshSign(); sfx('grow'); toast(`${bd.name}蓋好了！`); } }
  if ('med' in d) giveMedicine();
  if (d.fur !== undefined){ S.fur = +d.fur; applyFur(); }
  if ('naked' in d){ CLOTHES.forEach(c => S.worn[c.id] = false); applyClothes(); toast('脫光光了。'); }
  if (d.wear){ wear(d.wear, !S.worn[d.wear]); }
  if (d.col){ const [id, col] = d.col.split('|'); S.colors[id] = col; applyClothes(); }
  if (d.speed){ S.speed = +d.speed; }
  if (d.day){ S.dayMode = d.day; lastPhase = null; }
  if (d.wx){ S.weather.forced = d.wx === 'auto' ? null : d.wx; }
  if (d.hol !== undefined){ previewHoliday = d.hol || null; }
  if ('hideui' in d){ S.uiHidden = true; closeSheet(); }
  save(); hudDirty = true; if (sheetKind) renderSheet();
});
function giveMedicine(){
  if (!petActive()){ toast('現在不需要吃藥。'); return; }
  if (S.coins < 10){ toast('代幣不夠。清大便、拔雜草可以賺代幣。'); return; }
  S.coins -= 10; S.st.health = clamp(S.st.health + 45, 0, 100); sfx('happy'); spawnHearts(2); showEmote('💊', 1.6); toast('吃藥了，好多了。'); hudDirty = true; save();
}
$('#btnMed').onclick = giveMedicine;

// ---------- guide (illustrated manual) ----------
function wbSvg(x, y, s=1, o={}){
  const c = o.c || '#8b6b50', bx = o.bx || 1, by = o.by || 1, hx = 34*bx;
  let acc = '';
  if (o.acc === 'poop') acc = `<g fill="#6e4c35"><ellipse cx="${hx}" cy="-24" rx="9" ry="4.5"/><ellipse cx="${hx}" cy="-29" rx="6.5" ry="3.8"/><ellipse cx="${hx}" cy="-33.5" rx="4" ry="3"/><path d="M${hx} -40 l3 4 h-5z"/></g><path d="M${hx-12} -36 q-3 -5 0 -10 M${hx+12} -36 q3 -5 0 -10" stroke="#8a9a4a" stroke-width="1.6" fill="none"/>`;
  if (o.acc === 'bandage') acc = `<path d="M${hx-16} -12 L${hx+15} -16" stroke="#f4f1ea" stroke-width="5" stroke-linecap="round"/><path d="M${hx-4} -24 l7 7 M${hx+3} -24 l-7 7" stroke="#e8c9a6" stroke-width="3"/>`;
  if (o.acc === 'headband') acc = `<path d="M${hx-16} -13 Q${hx} -18 ${hx+16} -13" stroke="#d94b45" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  if (o.acc === 'crown') acc = `<path d="M${hx-9} -20 l0 -9 l4.5 5 l4.5 -8 l4.5 8 l4.5 -5 l0 9z" fill="#e2b53b" stroke="#b88a1c" stroke-width="1"/>`;
  if (o.acc === 'hat') acc = `<path d="M${hx-8} -19 L${hx+1} -40 L${hx+9} -19z" fill="#e45b5b"/><circle cx="${hx+1}" cy="-41" r="3" fill="#fff"/>`;
  const eye = o.droopy ? `<path d="M${hx+7} -10 h6" stroke="#141110" stroke-width="2.2" stroke-linecap="round"/>` : `<circle cx="${hx+10}" cy="-10" r="2.6" fill="#141110"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="2" cy="26" rx="${38*bx}" ry="5" fill="rgba(0,0,0,.12)"/>
    ${[-22,-10,10,22].map(lx => `<rect x="${lx*bx-5}" y="8" width="10" height="17" rx="5" fill="${c}"/>`).join('')}
    <ellipse cx="0" cy="0" rx="${34*bx}" ry="${21*by}" fill="${c}"/>
    <ellipse cx="0" cy="${9*by}" rx="${24*bx}" ry="${9*by}" fill="#fff" opacity=".18"/>
    <circle cx="${hx}" cy="-5" r="17" fill="${c}"/>
    <path d="M${hx-12} -16 l2 -11 l8 7z" fill="${c}"/><path d="M${hx+2} -20 l5 -10 l5 10z" fill="${c}"/>
    <ellipse cx="${hx+16}" cy="-1" rx="8" ry="6" fill="#2a2220"/>${eye}${acc}
  </g>`;
}
const ICON = {
  coin:(x,y)=>`<g transform="translate(${x} ${y})"><circle r="9" fill="#e2b53b" stroke="#a37a17" stroke-width="2"/><circle r="5" fill="none" stroke="#b88a1c" stroke-width="1.5"/></g>`,
  poop:(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-8" y="-8" width="16" height="16" rx="2" fill="#6e4c35"/><rect x="-8" y="-8" width="16" height="5" rx="2" fill="#86603f"/></g>`,
  weed:(x,y)=>`<g transform="translate(${x} ${y})" fill="#4c6b35"><path d="M0 0 L-8 -22 L-2 0z"/><path d="M0 0 L3 -26 L5 0z"/><path d="M0 0 L12 -18 L7 0z"/><circle cx="3" cy="-27" r="3.2" fill="#f3d250"/></g>`,
  hand:(x,y)=>`<g transform="translate(${x} ${y})"><circle r="11" fill="none" stroke="var(--ink)" stroke-width="2" opacity=".35"/><circle r="5" fill="var(--ink)"/></g>`,
  heart:(x,y,s=1)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M0 6 C-10 -2 -7 -10 -2 -9 C0 -9 0 -7 0 -6 C0 -7 0 -9 2 -9 C7 -10 10 -2 0 6z" fill="#e0607e"/>`,
  grass:(x,y)=>`<g transform="translate(${x} ${y})" fill="#6f9a4a"><path d="M-6 0 L-4 -16 L-2 0z"/><path d="M-2 0 L0 -20 L2 0z"/><path d="M2 0 L5 -15 L6 0z"/></g>`,
  carrot:(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-14 0 L10 -5 L10 5z" fill="#e8833a"/><path d="M10 -3 l8 -6 M10 0 l9 0 M10 3 l8 6" stroke="#6f9a4a" stroke-width="2.5"/></g>`,
  bowl:(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-16 -6 h32 l-4 12 h-24z" fill="#d6dde2"/><ellipse cy="-6" rx="16" ry="3.5" fill="#6fa8c9"/></g>`,
  sun:(x,y)=>`<g transform="translate(${x} ${y})"><circle r="10" fill="#f3d250"/>${[0,45,90,135,180,225,270,315].map(a=>`<path d="M0 -14 v-5" transform="rotate(${a})" stroke="#f3d250" stroke-width="2.5" stroke-linecap="round"/>`).join('')}</g>`,
  moon:(x,y)=>`<path transform="translate(${x} ${y})" d="M4 -12 A12 12 0 1 0 4 12 A9 9 0 1 1 4 -12z" fill="#e8d98a"/>`,
  cloud:(x,y)=>`<g transform="translate(${x} ${y})" fill="#b8c2c6"><circle cx="-8" cy="2" r="8"/><circle cx="3" cy="-3" r="10"/><circle cx="12" cy="3" r="7"/><rect x="-14" y="2" width="30" height="8" rx="4"/></g>`
};
const svgWrap = inner => `<svg viewBox="0 0 320 180" role="img" aria-hidden="true">${inner}</svg>`;
const T = (x,y,txt,size=12,anchor='middle',fill='var(--ink)') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-family="inherit">${txt}</text>`;
const GUIDE = [
  {title:'先孵一顆蛋', svg:svgWrap(`
    <path d="M130 0 L190 0 L230 150 L90 150z" fill="#fff3c4" opacity=".55"/>
    <ellipse cx="160" cy="150" rx="70" ry="14" fill="#fff3c4" opacity=".7"/>
    <ellipse cx="160" cy="146" rx="40" ry="10" fill="#c9a86a"/>
    <ellipse cx="160" cy="112" rx="26" ry="34" fill="#f1e6cf" stroke="#d9c9a8"/>
    <circle cx="150" cy="100" r="4" fill="#a77d55"/><circle cx="168" cy="118" r="5" fill="#a77d55"/><circle cx="162" cy="92" r="3" fill="#a77d55"/>
    ${ICON.hand(205,95)}<path d="M190 82 l-8 -6 M195 72 l-3 -9 M206 70 l1 -9" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
    ${T(250,40,'點一點',14)}${T(250,58,'幫牠保暖',12,'middle','var(--soft)')}
    <rect x="30" y="34" width="70" height="8" rx="4" fill="var(--line)"/><rect x="30" y="34" width="46" height="8" rx="4" fill="var(--ink)"/>${T(65,28,'孵化 65%',11)}`),
    html:`<p>第一次打開時，場地中間有一顆蛋。<b>點一點蛋</b>可以幫牠保暖，左上角的「孵化」到 100% 就會破殼，聚光燈會打在牠身上。</p><p>孵出來以後幫牠取個名字，就正式開始養了。</p>`},
  {title:'畫面介紹', svg:svgWrap(`
    <rect x="100" y="6" width="120" height="168" rx="16" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/>
    <rect x="110" y="16" width="40" height="10" rx="3" fill="var(--ink)"/><rect x="110" y="30" width="34" height="5" rx="2" fill="var(--soft)"/>
    <rect x="160" y="16" width="52" height="10" rx="5" fill="var(--chip)" stroke="var(--line)"/>
    <rect x="110" y="42" width="48" height="44" rx="6" fill="var(--chip)" stroke="var(--line)"/>
    ${[50,58,66,74].map(y=>`<rect x="114" y="${y}" width="40" height="4" rx="2" fill="var(--line)"/><rect x="114" y="${y}" width="${20+y%17}" height="4" rx="2" fill="var(--ink)"/>`).join('')}
    ${wbSvg(165,118,0.6)}
    ${[0,1,2,3,4,5].map(i=>`<rect x="${108+i*17.5}" y="152" width="15" height="12" rx="3" fill="var(--chip)" stroke="var(--line)"/>`).join('')}
    ${[[96,22,'①'],[226,22,'②'],[96,64,'③'],[226,158,'④']].map(([x,y,n])=>T(x,y+4,n,14,'middle','var(--warn)')).join('')}
    <path d="M100 22 h8 M220 22 h-8 M100 64 h8 M222 158 h-6" stroke="var(--warn)" stroke-width="1.5"/>`),
    html:`<ul><li><b>①</b> 名字、成長階段、年齡，下面一行是牠現在在做什麼。</li><li><b>②</b> 代幣，以及「狀態」「音樂」「說明」「設定」四個按鈕。</li><li><b>③</b> 狀態面板：七種數值、天氣和時間。按「狀態」可以收起或打開。</li><li><b>④</b> 照顧按鈕：餵食、喝水、玩耍、清理、衣櫥、商店。</li></ul><p class="note">想拍乾淨的畫面：設定 →「隱藏全部介面」，右上角會留一顆「顯示介面」按鈕。</p>`},
  {title:'手勢操作', svg:svgWrap(`
    <g>${wbSvg(48,62,0.55)}${ICON.hand(52,50)}${ICON.heart(60,30,1.1)}${ICON.heart(72,22,0.8)}${T(52,98,'點牠：摸摸')}</g>
    <g><path d="M160 10 v26" stroke="#3f6b55" stroke-width="2"/><circle cx="160" cy="10" r="4" fill="#3f6b55"/><g transform="rotate(-12 160 60)">${wbSvg(152,60,0.55)}</g>${T(160,98,'按住拖：抓起來甩')}</g>
    <g><path d="M240 50 a30 14 0 1 1 50 0" fill="none" stroke="var(--ink)" stroke-width="2" marker-end="url(#ar)"/>${ICON.hand(265,62)}${T(265,98,'拖空白處：轉視角')}</g>
    <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--ink)"/></marker></defs>
    <g>${ICON.hand(70,138)}${ICON.hand(100,138)}<path d="M62 138 h-14 M108 138 h14" stroke="var(--ink)" stroke-width="2" marker-end="url(#ar)"/>${T(85,170,'兩指：放大縮小')}</g>
    <g>${wbSvg(200,140,0.45)}<path d="M228 140 q20 -10 46 0" stroke="var(--ink)" stroke-dasharray="4 4" fill="none" stroke-width="2"/>${ICON.hand(282,140)}${T(240,170,'點地面：叫牠走過去')}</g>`),
    html:`<ul><li><b>點袋熊</b>：摸摸牠，心情變好，偶爾給 1 代幣。牠睡覺時點牠會把牠吵醒，牠會不高興。</li><li><b>按住袋熊拖曳</b>：用繩子把牠吊起來甩。</li><li><b>拖曳空白處</b>：旋轉視角；<b>兩指捏合或滑鼠滾輪</b>：縮放。</li><li><b>點地面</b>：牠會走到那裡。</li><li><b>點便便、雜草</b>：清掉並拿代幣；<b>點小窩</b>：叫牠出來。</li></ul>`},
  {title:'照顧牠', svg:svgWrap(`
    ${ICON.grass(50,70)}${ICON.carrot(90,62)}${T(70,96,'餵食',14)}${T(70,114,'飽足 +28',11,'middle','var(--soft)')}
    ${ICON.bowl(160,64)}${T(160,96,'喝水',14)}${T(160,114,'水分 +45',11,'middle','var(--soft)')}
    <circle cx="250" cy="58" r="12" fill="#f3d250"/><path d="M243 58 h14 M250 51 v14" stroke="#fff" stroke-width="2"/>${T(250,96,'玩耍',14)}${T(250,114,'心情 +10',11,'middle','var(--soft)')}
    ${wbSvg(160,150,0.5)}${ICON.heart(190,128)}`),
    html:`<ul><li><b>餵食</b>：地上會出現青草或紅蘿蔔，牠會自己走過去吃。牠很飽的時候吃不下。</li><li><b>喝水</b>：會放一個水碗；蓋了「小水池」以後，牠會自己走去水池喝。</li><li><b>玩耍</b>：後空翻、側翻滾、轉圈、翻肚、抖毛、跳舞，會花體力、增加心情。</li><li>吃飽的時候，牠有時候會想睡午覺。</li></ul><p class="note">牠太餓會生氣跺腳、不肯表演；太累也不肯玩，讓牠睡一下就好。</p>`},
  {title:'看懂數值', svg:svgWrap(`
    ${[['飽足',80],['水分',60],['心情',90],['體力',40],['清潔',100],['健康',20],['成長',55]].map(([l,v],i)=>`${T(40,24+i*22,l,12,'end')}<rect x="50" y="${15+i*22}" width="200" height="9" rx="4.5" fill="var(--line)"/><rect x="50" y="${15+i*22}" width="${v*2}" height="9" rx="4.5" fill="${v<25?'var(--warn)':'var(--ink)'}"/>${T(272,24+i*22,v,11,'end','var(--soft)')}`).join('')}`),
    html:`<ul><li><b>飽足、水分</b>：會慢慢下降。低於 15 會開始傷健康。</li><li><b>心情</b>：摸摸、玩耍、吃東西會上升；髒亂、下雨會讓它掉比較快。</li><li><b>體力</b>：醒著會消耗，睡覺回復，晚上會想睡。</li><li><b>清潔</b>：便便和雜草越多越低，太髒會生病。</li><li><b>健康</b>：低於 35 會生病（會出現「餵藥」按鈕），歸零就會死掉。</li><li><b>成長</b>：滿了而且年紀到了就會進化。太餓、太渴或生病時會顯示「停滯」。</li></ul><p class="note">數值變紅就是在提醒你了。</p>`},
  {title:'清理與代幣', svg:svgWrap(`
    ${ICON.poop(60,80,1.3)}${ICON.poop(84,86,1)}${ICON.poop(70,62,0.9)}<path d="M55 48 q-4 -8 0 -16 M70 42 q4 -8 0 -16 M86 50 q-4 -8 0 -16" stroke="#8a9a4a" stroke-width="2" fill="none"/>
    ${T(72,120,'3 坨以上會發臭',12)}${ICON.coin(52,150)}${T(68,155,'+3 / 顆',12,'start')}
    ${ICON.weed(200,90)}${ICON.weed(230,92)}${T(215,120,'雜草會自己長',12)}${ICON.coin(192,150)}${T(208,155,'+2 / 株',12,'start')}`),
    html:`<p>袋熊吃完東西過一陣子會拉出<b>方塊形的便便</b>（真的袋熊也是這樣）。雜草也會慢慢長出來。</p><ul><li><b>點一下</b>便便或雜草就能清掉；按「清理」一次清光。</li><li>清一顆便便 +3 代幣、拔一株雜草 +2。牠餓或渴時餵食、喝水各 +2，堆雪人 +5。</li><li>場上同時有 3 坨以上便便會發臭，清潔掉很快，容易生病。</li></ul>`},
  {title:'成長與進化', svg:svgWrap(`
    ${[[30,0.3,'幼兒期'],[88,0.42,'成長期'],[152,0.55,'成熟期'],[222,0.63,'完全體'],[290,0.7,'究極體']].map(([x,s,l],i)=>`${wbSvg(x-8,96,s)}${T(x,140,l,12)}${i<4?`<path d="M${x+22} 96 l12 0" stroke="var(--soft)" stroke-width="2" marker-end="url(#ar2)"/>`:''}`).join('')}
    <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--soft)"/></marker></defs>
    ${T(160,24,'進化時會發光旋轉，還有進化音樂',12,'middle','var(--soft)')}<path d="M147 52 v40 M175 52 v40" stroke="#fff1c2" stroke-width="10" opacity=".5"/>`),
    html:`<p>每個階段的「成長」條滿了、年紀也到了，就會開始<b>進化</b>：牠會浮起來、越轉越快、變成一團白光，最後換成新的樣子。</p><ul><li>幼兒期 → 成長期：大約 20 分鐘</li><li>成長期 → 成熟期：大約 6 小時</li><li>成熟期 → 完全體：大約 2 天</li><li>完全體 → 究極體：大約 4 天</li><li>大約第 8 天走完一生。</li></ul><p class="note">上面是 1 倍速的時間。想快點看，可以到設定調成 10 倍或 60 倍。</p>`},
  {title:'不同的進化型態', svg:svgWrap(`
    ${[['normal',40,46,{}],['skinny',120,46,{bx:.72,by:.8,c:'#9c8064'}],['sickly',200,46,{c:'#8c8a6a',acc:'bandage',droopy:true}],['stinky',280,46,{c:'#837152',acc:'poop'}],
       ['chubby',40,128,{bx:1.25,by:1.12}],['sporty',120,128,{acc:'headband'}],['royal',200,128,{acc:'crown'}],['golden',280,128,{c:'#c49a3a',acc:'crown'}]]
      .map(([k,x,y,o])=>`${wbSvg(x-6,y,0.42,o)}${T(x,y+30,FORMS[k].name,11)}`).join('')}`),
    html:`<p>進化成什麼樣子，要看<b>進化那一刻</b>和這個階段你怎麼照顧牠：</p><ul>${['stinky','sickly','skinny','chubby','sporty','royal','golden'].map(k=>`<li><b>${FORMS[k].name}</b>：${FORMS[k].desc}</li>`).join('')}<li><b>袋熊</b>（一般型）：以上都沒有，正常長大。</li></ul><p class="note">判斷順序就是上面列出來的順序。歪掉的型態，下一次進化前照顧好，還有機會變回來。</p>`},
  {title:'天氣、晝夜和特別活動', svg:svgWrap(`
    <rect x="0" y="0" width="160" height="90" fill="#d9e1d2"/><rect x="160" y="0" width="160" height="90" fill="#1a2130"/>
    ${ICON.sun(80,40)}${ICON.moon(240,40)}${T(80,78,'整點偶數小時：白天',11,'middle','#2c3a31')}${T(240,78,'奇數小時：晚上',11,'middle','#e2e9de')}
    ${ICON.cloud(36,118)}<path d="M28 132 l-3 8 M38 132 l-3 8 M48 132 l-3 8" stroke="#7fa3c0" stroke-width="2"/>${T(40,165,'雨：踩水窪',11)}
    <circle cx="140" cy="140" r="15" fill="#f7f9fb" stroke="#cfd6db"/><circle cx="140" cy="116" r="10" fill="#f7f9fb" stroke="#cfd6db"/><path d="M140 117 l9 2 -9 2z" fill="#e8833a"/>${T(140,170,'雪：堆雪人',11)}
    ${[0,1,2,3,4].map(i=>`<circle cx="${225+i*13}" cy="${125+(i%2)*10}" r="3" fill="#e9f59a"/>`).join('')}${T(255,165,'晴朗夜晚：看螢火蟲',11)}`),
    html:`<ul><li><b>晝夜</b>：預設每一小時切換一次——偶數整點（0、2、4…點）是白天，奇數整點是晚上，交界的前 5 分鐘是日出或日落。設定裡也可以改成跟現實時間同步。</li><li><b>天氣</b>：晴、多雲、雨、雪、雷雨會自己輪替。下雨打雷時牠會躲進小窩，打雷會害怕。</li><li><b>音樂</b>：早上、午後、傍晚、夜晚、雨天、雷雨、雪天，各有不同的曲子。</li><li><b>特別活動</b>（玩耍 → 特別活動）：下雪天堆雪人，下雨天踩水窪，晴朗的晚上看螢火蟲。雪人在雪停以後會慢慢融化。</li></ul>`},
  {title:'商店、衣櫥和節日', svg:svgWrap(`
    ${wbSvg(70,110,0.75,{acc:'hat'})}${T(70,160,'買衣服、換顏色',12)}
    <path d="M150 128 a40 34 0 0 1 80 0z" fill="#7f8f5b"/><path d="M180 128 a10 12 0 0 1 20 0z" fill="#1a1410"/><rect x="203" y="92" width="8" height="16" fill="#a35e46"/>${T(190,160,'蓋建設',12)}
    <rect x="250" y="70" width="56" height="58" rx="6" fill="var(--chip)" stroke="var(--gold)" stroke-width="2"/><rect x="250" y="70" width="56" height="15" rx="6" fill="var(--gold)"/>${T(278,112,'10/31',14)}${T(278,160,'節日限定',12)}`),
    html:`<ul><li><b>商店</b>：用代幣買衣服、建設和感冒藥。</li><li><b>衣櫥</b>：換毛色、幫衣服換顏色、穿上或脫下，也可以一鍵「脫光光」。同一個位置（頭、眼睛、脖子……）一次只能穿一件。</li><li><b>建設</b>：小窩（晚上和雨天躲進去睡）、小水池（自己去喝水）、路燈、花圃、木圍籬。</li><li><b>節日</b>：元旦、春節、情人節、兒童節、端午節、中秋節、萬聖節、聖誕節當天，背景和音樂都會換，商店會賣<b>只有當天買得到</b>的服裝和建設，買了就永久保留。</li></ul><p class="note">設定裡的「節日預覽」可以先看看節日的樣子和音樂，但限定商品還是要等到當天才能買。</p>`},
  {title:'存檔、生病和告別', svg:svgWrap(`
    <rect x="40" y="40" width="70" height="80" rx="8" fill="var(--chip)" stroke="var(--ink)" stroke-width="2"/><rect x="52" y="40" width="46" height="26" fill="var(--ink)" opacity=".8"/><rect x="54" y="88" width="42" height="28" rx="3" fill="var(--line)"/>${T(75,145,'自動存檔',12)}
    <rect x="150" y="60" width="44" height="22" rx="11" fill="#e45b5b"/><rect x="172" y="60" width="22" height="22" rx="11" fill="#f6f3ec"/>${T(172,110,'健康低：餵藥',12)}
    <path d="M250 120 v-38 a20 20 0 0 1 40 0 v38z" fill="#a3a59d"/><circle cx="258" cy="122" r="4" fill="#e0607e"/><circle cx="282" cy="122" r="4" fill="#f3d250"/>${T(270,145,'告別後孵新蛋',12)}`),
    html:`<ul><li>進度每 5 秒自動存在<b>這台裝置</b>裡；到「設定」用 Google 登入後，還會同步到<b>雲端</b>，電腦和手機可以接著玩。離開期間的時間也會算進去。</li><li>你不在的時候牠最多只會變得很虛弱，不會因為沒人照顧而死掉；但年紀還是會增加。</li><li>健康低於 35 會生病，按畫面下方的「餵藥」（10 代幣）。</li><li>牠走完一生或病死之後，會留下一個小墓碑。代幣、衣服、建設都會留給下一隻，再孵一顆新蛋。</li><li>設定 →「全部重新開始」會清掉所有東西，從一顆蛋重來。</li></ul><p class="note">清除瀏覽器資料或換手機，存檔就會不見。</p>`}
];
const guideEl = $('#guide'); let gPage = 0;
function openGuide(p=0){ gPage = p; guideEl.hidden = false; renderGuide(); $('#gNext').focus(); }
function closeGuide(){ guideEl.hidden = true; if (!S.seenGuide){ S.seenGuide = true; save(); } canvas.focus({preventScroll:true}); }
function renderGuide(){
  const g = GUIDE[gPage];
  $('#gPage').textContent = `說明書　${gPage+1} / ${GUIDE.length}`;
  $('#gBody').innerHTML = `<h2 id="gTitle">${g.title}</h2>${g.svg}${g.html}`;
  $('#gBody').scrollTop = 0;
  $('#gPrev').disabled = gPage === 0;
  $('#gNext').textContent = gPage === GUIDE.length-1 ? '開始玩' : '下一頁';
  $('#gDots').innerHTML = GUIDE.map((_,i) => `<button aria-label="第 ${i+1} 頁" aria-current="${i===gPage}" data-p="${i}"></button>`).join('');
}
$('#gPrev').onclick = () => { if (gPage > 0){ gPage--; renderGuide(); } };
$('#gNext').onclick = () => { if (gPage < GUIDE.length-1){ gPage++; renderGuide(); } else closeGuide(); };
$('#gClose').onclick = closeGuide;
$('#gDots').onclick = e => { const b = e.target.closest('button'); if (b){ gPage = +b.dataset.p; renderGuide(); } };
$('#btnGuide').onclick = () => openGuide(0);

// ---------- dock & top buttons ----------
document.querySelector('.dock').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const c = b.dataset.cmd;
  if (B.mode === 'evolve' && ['feed','water','clean'].includes(c)){ toast('等牠進化完。'); return; }
  if (c === 'feed'){
    if (S.st.hunger > 92){ toast('牠吃得很飽了。'); return; }
    if (foods.length >= 3){ toast('地上已經有食物了。'); return; }
    if (B.mode === 'inHouse') exitHouse(); else if (B.mode === 'sleep') wake(true);
    const a = root.rotation.y + rnd(-1.1,1.1), d = 1.9*petS + rnd(1.2,2); spawnFood(pos.x + Math.sin(a)*d, pos.z + Math.cos(a)*d);
  } else if (c === 'water'){
    if (S.st.thirst > 92){ toast('牠現在不渴。'); return; }
    if (B.mode === 'inHouse') exitHouse(); else if (B.mode === 'sleep') wake(true);
    if (!BG.pond && !bowl) spawnBowl();
    B.water = true; if (BG.pond) toast('牠走去水池喝水。');
  } else if (c === 'clean'){
    const list = [...cubes.map(x => ['p',x]), ...weeds.map(x => ['w',x])];
    if (!list.length){ toast('很乾淨，沒有東西要清。'); return; }
    list.forEach(([k,x],i) => setTimeout(() => k === 'p' ? cleanPoop(x) : pullWeed(x), i*140));
  } else { sheetKind === c ? closeSheet() : openSheet(c); }
  hudDirty = true;
});
$('#btnStats').onclick = () => { S.hud = !S.hud; hudDirty = true; save(); };
$('#btnMusic').onclick = () => setSound(!SND.on);
$('#btnSettings').onclick = () => sheetKind === 'settings' ? closeSheet() : openSheet('settings');
$('#btnShow').onclick = () => { S.uiHidden = false; hudDirty = true; save(); };

// ---------- input ----------
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1,8), new THREE.MeshBasicMaterial({color:'#3f6b55'}));
const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07,16,12), rope.material);
rope.visible = handle.visible = false; scene.add(rope, handle);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hoverNdc = new THREE.Vector2(), groundPlane = new THREE.Plane(UP, 0);
const pts = new Map();
let mode = null, downX=0, downY=0, downT=0, lastX=0, lastY=0, hitPoint=null, tapObj=null, pinchD=1, pinchZ=1;
const setNdc = e => ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1);
const locked = () => !!(evo || hatching);
function pickAt(e){
  setNdc(e); ray.setFromCamera(ndc, camera);
  const list = [];
  if (petActive() && root.visible) list.push(...hit);
  if (S.stage === 'egg' && eggMesh.visible) list.push(eggMesh);
  cubes.forEach(c => list.push(c.hb)); weeds.forEach(w => list.push(w.hb));
  if (BG.house) list.push(BG.house.userData.dome);
  scene.updateMatrixWorld(true);
  return ray.intersectObjects(list, false).find(h => isShown(['poop','weed'].includes(h.object.userData.kind) ? h.object.parent : h.object)) || null;
}
function updatePointerWorld(e){
  setNdc(e); ray.setFromCamera(ndc, camera); const p = V3(0,0,0);
  if (ray.ray.intersectPlane(plane, p)){ p.y = clamp(p.y, 0.3, 3.6*Math.max(petS,0.6)); const r = Math.hypot(p.x,p.z); if (r > BOUND){ p.x *= BOUND/r; p.z *= BOUND/r; } pointerWorld.copy(p); }
}
function startGrab(e){
  if (act){ if (act.ball) scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2); puddles.forEach(m => scene.remove(m)); puddles.length = 0; act = null; actG.rotation.set(0,0,0); actY = 0; }
  if (asleep()) wake(true);
  mode = 'grab'; dragging = true; B.mode = 'idle'; B.food = null;
  scene.updateMatrixWorld(true);
  grabLocal.copy(offG.worldToLocal(hitPoint.clone()));
  const n = V3(0,0,0); camera.getWorldDirection(n); n.y = 0; if (n.lengthSq() < 1e-4) n.set(0,0,1); n.normalize();
  plane.setFromNormalAndCoplanarPoint(n, hitPoint); pointerWorld.copy(hitPoint);
  rope.visible = handle.visible = true; canvas.style.cursor = 'grabbing'; updatePointerWorld(e); cry('grunt');
}
function endGrab(){ dragging = false; rope.visible = handle.visible = false; B.timer = 1.5; }
function petTap(){
  if (!petActive() || B.mode === 'evolve') return;
  if (asleep()){ wake(true); return; }
  sqv += 2.2; blinkT = 0.16; ears.forEach(e => e.v += rnd(-7,7)); spawnHearts(2);
  const now = performance.now(); B.petTimes = B.petTimes.filter(t => now - t < 10000); B.petTimes.push(now);
  S.st.happy = clamp(S.st.happy + (B.petTimes.length > 5 ? 1 : 8), 0, 100);
  if (B.petCd <= 0){ B.petCd = 20; addCoins(1); }
  if (S.st.hunger < 25){ showEmote('💢', 1.4); cry('angry'); } else cry('happy');
  if (B.mode === 'idle' || B.mode === 'walk'){ B.mode = 'idle'; B.timer = 2.5; }
  hudDirty = true;
}
function warmEgg(){ if (S.stage !== 'egg' || hatching) return; S.warm = Math.min(100, S.warm + 7); eggWob.userData.kick = 1; sfx('pop'); hudDirty = true; }
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pts.size === 2){ if (dragging) endGrab(); mode = 'pinch'; const a = [...pts.values()]; pinchD = Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y) || 1; pinchZ = zoom; return; }
  if (pts.size > 2) return;
  downX = lastX = e.clientX; downY = lastY = e.clientY; downT = performance.now();
  if (locked()){ mode = 'orbit'; return; }
  const h = pickAt(e);
  if (h && h.object.userData.kind === 'pet'){ mode = 'pending'; hitPoint = h.point.clone(); }
  else if (h){ mode = 'tap'; tapObj = h.object; }
  else mode = 'orbit';
});
canvas.addEventListener('pointermove', e => {
  setNdc(e); hoverNdc.copy(ndc);
  if (e.pointerType === 'mouse'){ hasHover = true; lastMouse = performance.now(); }
  if (!pts.has(e.pointerId)){ if (e.pointerType === 'mouse' && !locked()){ const h = pickAt(e); canvas.style.cursor = h ? (h.object.userData.kind === 'pet' ? 'grab' : 'pointer') : 'default'; } return; }
  pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  const moved = Math.hypot(e.clientX-downX, e.clientY-downY);
  if (mode === 'pinch' && pts.size === 2){ const a = [...pts.values()]; zoom = clamp(pinchZ*pinchD/(Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y)||1), 0.5, 1.7); }
  else if (mode === 'tap' && moved > 6) mode = 'orbit';
  else if (mode === 'orbit'){ yaw -= (e.clientX-lastX)*0.008; pitch = clamp(pitch + (e.clientY-lastY)*0.006, 0.06, 1.3); }
  else if (mode === 'pending' && moved > 6){ if (['inHouse','enter','exit','dying','evolve'].includes(B.mode)) mode = 'orbit'; else startGrab(e); }
  else if (mode === 'grab') updatePointerWorld(e);
  lastX = e.clientX; lastY = e.clientY;
});
function up(e){
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  const quick = performance.now() - downT < 450 && Math.hypot(e.clientX-downX, e.clientY-downY) < 7;
  if (quick && mode === 'pending') petTap();
  else if (quick && mode === 'tap'){
    const k = tapObj.userData.kind;
    if (k === 'egg') warmEgg();
    else if (k === 'poop') cleanPoop(tapObj.userData.ref);
    else if (k === 'weed') pullWeed(tapObj.userData.ref);
    else if (k === 'house'){ if (B.mode === 'inHouse'){ if (B.sleeping) wake(true); exitHouse(); } else toast(petActive() ? `這是${S.name || '牠'}的小窩。` : '小窩。'); }
    hudDirty = true;
  } else if (quick && mode === 'orbit' && !locked() && petActive() && !asleep() && !act && !['inHouse','enter','exit','eat','drink','evolve'].includes(B.mode)){
    setNdc(e); ray.setFromCamera(ndc, camera); const p = V3(0,0,0);
    if (ray.ray.intersectPlane(groundPlane, p) && Math.hypot(p.x,p.z) < BOUND){ B.target.copy(p); B.mode = 'goto'; B.timer = 12; showEmote('❗',0.9); }
  }
  if (mode === 'grab') endGrab();
  if (pts.size === 0){ mode = null; canvas.style.cursor = 'default'; } else if (mode === 'pinch') mode = 'orbit';
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) hasHover = false; });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clamp(zoom*Math.exp(e.deltaY*0.001), 0.5, 1.7); }, {passive:false});
canvas.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); S.stage === 'egg' ? warmEgg() : petTap(); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); yaw += 0.15; }
  else if (e.key === 'ArrowRight'){ e.preventDefault(); yaw -= 0.15; }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); pitch = Math.min(1.3, pitch+0.08); }
  else if (e.key === 'ArrowDown'){ e.preventDefault(); pitch = Math.max(0.06, pitch-0.08); }
});
addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!$('#modal').hidden) return; if (!guideEl.hidden){ closeGuide(); return; } closeSheet(); } });

// ---------- persistence ----------
let halted = false; // set when another device takes over; stops the sim and all saving
function save(force){
  if (halted) return;
  try {
    S.poops = cubes.map(c => [+c.m.position.x.toFixed(2), +c.m.position.z.toFixed(2), +c.m.rotation.y.toFixed(2), +c.sc.toFixed(2)]);
    S.weeds = weeds.map(w => [w.x, w.z, w.s]);
    S.snowmen = snowmen.map(o => [+o.x.toFixed(2), +o.z.toFixed(2), +o.ry.toFixed(2), +o.melt.toFixed(3)]);
    S.petPos = [+pos.x.toFixed(2), +pos.z.toFixed(2), +root.rotation.y.toFixed(2)];
    S.inHouse = B.mode === 'inHouse';
    S.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch(e){}
  cloud.save(S, force === true);
}
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
addEventListener('pagehide', () => save(true));

// ---------- cloud sync ----------
const claimCloud = knownRev => cloud.claim(S, knownRev, !!lsGet(FORCE_LOCAL));
cloud.on('synced', () => { lsSet(FORCE_LOCAL, null); if (cloud.user) lsSet(SYNC_UID, cloud.user.uid); });
cloud.on('takeover', reason => {
  halted = true; lsSet(PREFER_REMOTE, '1'); closeSheet();
  showModal(reason === 'newer' ? '雲端有比較新的進度' : '在其他裝置開啟了',
    reason === 'newer' ? '<p>這個帳號在別的裝置玩得比較新，這裡先暫停，載入最新的進度。</p>'
                       : '<p>你在另一台裝置打開了遊戲，這裡先暫停，避免兩邊的進度互相蓋掉。</p>',
    [{label: reason === 'newer' ? '載入最新進度' : '在這台繼續玩', onClick:() => location.reload()}]);
});
cloud.on('change', () => { if (sheetKind === 'settings') renderSheet(); });
// In-app browsers (LINE, Facebook, Instagram, WeChat, Android WebView) break Google's sign-in popup.
const IN_APP = /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent);
function openOutside(){
  if (/\bLine\//i.test(navigator.userAgent)){ // LINE honours this flag and reopens the page in the system browser
    const u = new URL(location.href); u.searchParams.set('openExternalBrowser', '1'); location.href = u.href; return;
  }
  const url = location.origin + location.pathname;
  showModal('請用瀏覽器打開', `<p>在 App 裡面開的網頁沒辦法用 Google 登入。請按右上角或右下角的「⋯」選單，選「用瀏覽器開啟」，或複製網址貼到 Chrome／Safari。</p><p><b>${esc(url)}</b></p>`,
    [{label:'複製網址', onClick:() => navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('網址複製好了。'))}]);
}
async function login(){
  if (IN_APP){ openOutside(); return; }
  let user;
  try { user = await cloud.signIn(); } catch(e){ toast(e && e.code === 'auth/popup-closed-by-user' ? '登入取消了。' : '登入失敗，請再試一次。'); return; }
  if (!user) return; // redirect sign-in: the page will reload
  let remote;
  try { remote = await cloud.fetch(); }
  catch(e){ toast('登入了，但暫時連不上雲端，連上網後會自動同步。'); claimCloud(undefined); return; }
  if (remote && await pickSave(S, remote, user.uid) === 'remote'){
    halted = true; lsSet(KEY, JSON.stringify(remote.save)); lsSet(SYNC_UID, user.uid); location.reload(); return;
  }
  save(); claimCloud(remote ? remote.rev : null);
  toast('登入了！進度會自動同步到雲端，電腦和手機可以接著玩。');
}
function exportSave(){
  save();
  const code = 'WOMBAT1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  showModal('匯出存檔碼', `<p>這串文字就是你的存檔。可以留著當備份，或在別的地方「匯入存檔碼」。</p>`
    + `<textarea id="saveCode" class="code" readonly rows="5">${code}</textarea>`
    + `<div class="opts" style="margin:10px 0 14px"><button class="btn" id="copyCode">複製</button><button class="btn ghost" id="dlCode">下載成檔案</button></div>`,
    [{label:'關閉', ghost:true, onClick:()=>{}}]);
  const ta = $('#saveCode');
  $('#copyCode').onclick = () => {
    const done = () => toast('複製好了。'), fallback = () => { ta.select(); document.execCommand('copy'); done(); };
    navigator.clipboard ? navigator.clipboard.writeText(code).then(done, fallback) : fallback();
  };
  $('#dlCode').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([code], {type:'text/plain'}));
    a.download = `袋熊存檔-${S.name || '蛋'}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
function importSave(){
  showModal('匯入存檔碼', `<p>貼上匯出的存檔碼（WOMBAT1: 開頭），或選擇下載的存檔檔案。<b>現在這隻袋熊的進度會被取代</b>${cloud.user ? '，雲端存檔也會一起換掉' : ''}。</p>`
    + `<textarea id="importCode" class="code" rows="5" placeholder="WOMBAT1:..."></textarea>`
    + `<p style="margin:8px 0 14px"><input type="file" id="importFile" accept=".txt,text/plain" aria-label="選擇存檔檔案"></p>`,
    [{label:'取消', ghost:true, onClick:()=>{}}, {label:'匯入', onClick:() => {
      const txt = $('#importCode').value.replace(/\s+/g, '').replace(/^WOMBAT1:/, '');
      let o = null; try { o = fromObj(JSON.parse(decodeURIComponent(escape(atob(txt))))); } catch(e){}
      if (!o){ toast('存檔碼看起來不對，再複製一次試試。'); return; }
      halted = true; lsSet(KEY, JSON.stringify(o)); lsSet(FORCE_LOCAL, '1'); location.reload();
    }}]);
  $('#importFile').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => { $('#importCode').value = t.trim(); }); };
  $('#importCode').focus();
}

// ---------- restore ----------
Object.keys(S.builds).forEach(id => S.builds[id] && build(id));
(S.weeds || []).forEach(([x,z,s]) => makeWeed(x,z,s));
(S.poops || []).forEach(([x,z,ry,sc]) => { const c = makePoop(V3(x, 0.1*(sc||1), z), null, sc||1); c.m.rotation.y = ry; });
(S.snowmen || []).forEach(([x,z,ry,m]) => makeSnowman(x,z,ry,m));
if (S.petPos){ pos.set(S.petPos[0], 0, S.petPos[1]); root.rotation.y = S.petPos[2]; }
applyForm();
petS = stageScale();
if (S.stage === 'egg'){ root.visible = false; shadow.g.visible = false; }
else { eggG.visible = false; eggShadow.g.visible = false; }
if (S.dead){ root.visible = false; shadow.g.visible = false; B.mode = 'dead'; tomb = makeTomb(V3(S.dead.x||0,0,S.dead.z||0)); }
if (S.inHouse && BG.house && petActive()){ B.mode = 'inHouse'; B.sleeping = true; root.visible = false; shadow.g.visible = false; pos.copy(SPOTS.house); }
catchUp(Date.now() - (S.lastSeen || Date.now()));
if (S.dead) setTimeout(showMemorial, 600);
if (!S.seenGuide) setTimeout(() => openGuide(0), 500);
else if (S.stage !== 'egg' && !S.dead) setTimeout(() => toast(`歡迎回來，${S.name || '牠'}在等你。`), 800);
if (S.stage === 'egg' && S.warm >= 100) hatchStart();
if (boot0.user) claimCloud(boot0.checked ? (boot0.remote ? boot0.remote.rev : null) : undefined);

// ---------- main loop ----------
const clock = new THREE.Clock();
const tmpQ = new THREE.Quaternion(), tmpQi = new THREE.Quaternion();
let t = 0, hudT = 0, lastReal = performance.now();
function step(){
  if (halted) return;
  const nowR = performance.now(), gap = nowR - lastReal; lastReal = nowR;
  if (gap > 2000) catchUp(gap);
  const dt = Math.min(clock.getDelta(), 1/30); t += dt;

  const gm = dt*S.speed/60;
  if (S.stage === 'egg' && !S.dead){
    if (!hatching){ S.warm = Math.min(100, S.warm + dt*S.speed); if (S.warm >= 100) hatchStart(); }
  } else if (petActive() && !evo){
    S.ageMs += gm*60000; sim(gm, false);
    for (let i=S.poopQ.length-1;i>=0;i--){ S.poopQ[i] -= gm; if (S.poopQ[i] <= 0 && !asleep() && pos.y < 0.02 && !act && !dragging && poopNow()) S.poopQ.splice(i,1); }
    checkStage();
  }
  B.petCd -= dt;
  updateWorld(dt, t);
  updateDeco(dt, t);
  updateHatch(dt);
  if (evo) updateEvo(dt);
  fxo.style.opacity = fxoV.toFixed(3);

  if (S.stage === 'egg' && !hatching){
    const k = eggWob.userData.kick || 0; eggWob.userData.kick = k*Math.exp(-4*dt);
    eggWob.rotation.z = Math.sin(t*(2+S.warm*0.05))*(0.03 + S.warm*0.0012) + Math.sin(t*30)*0.12*k;
  }

  const focus = S.stage === 'egg' || hatching ? V3(0,0,0) : (S.dead && tomb ? tomb.position : pos);
  camTarget.x += (focus.x*(evo ? 1 : 0.6) - camTarget.x)*Math.min(1, dt*1.5);
  camTarget.z += (focus.z*(evo ? 1 : 0.6) - camTarget.z)*Math.min(1, dt*1.5);
  const ty = S.stage === 'egg' || hatching ? 0.8 : evo ? 1.2*petS + 0.4 : camY;
  camTarget.y += (ty - camTarget.y)*Math.min(1, dt*3);
  zoomFx += ((evo ? 0.78 : hatching ? 0.62 : 1) - zoomFx)*Math.min(1, dt*2);
  placeCam();

  if (S.stage !== 'egg' || hatching){
    const moving = think(dt);
    const ar = evo ? {shake:0, walk:false} : updateAct(dt);
    gaitW += ((moving || ar.walk ? 1 : 0) - gaitW)*Math.min(1, dt*6);
    walkClock += dt*9*gaitW*(0.8/Math.max(petS,0.5));
    if (B.mode === 'dying') updateDying(dt);
    sleepW += ((B.mode === 'sleep' ? 1 : 0) - sleepW)*Math.min(1, dt*3);
    if (!evo) petS += (stageScale() - petS)*Math.min(1, dt*1.5);
    root.scale.setScalar(Math.max(0.001, petS*reveal));

    tmpQ.setFromAxisAngle(UP, root.rotation.y); tmpQi.copy(tmpQ).invert();
    if (dragging){
      const off = V3(grabLocal.x,0,grabLocal.z).applyQuaternion(tmpQ).multiplyScalar(0.4*petS);
      const desired = V3(pointerWorld.x-off.x, pointerWorld.y - ROPE - grabLocal.y*petS, pointerWorld.z-off.z);
      vel.addScaledVector(desired.sub(pos).multiplyScalar(60).sub(vel.clone().multiplyScalar(9)), dt);
      pos.addScaledVector(vel, dt); if (pos.y < 0){ pos.y = 0; if (vel.y < 0) vel.y = 0; }
    } else if (B.mode !== 'inHouse'){
      vel.y -= 25*dt; pos.addScaledVector(vel, dt);
      if (pos.y <= 0){ const impact = -vel.y; pos.y = 0;
        if (impact > 2.5){ vel.y = impact*0.22; sqv += Math.min(impact*0.3, 3.2); if (impact > 5) sfx('thud'); } else vel.y = 0;
        const f = Math.exp(-7*dt); vel.x *= f; vel.z *= f; }
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > BOUND && !['enter','exit','inHouse'].includes(B.mode)){ const nx = pos.x/r, nz = pos.z/r; pos.x = nx*BOUND; pos.z = nz*BOUND; const vn = vel.x*nx + vel.z*nz; if (vn > 0){ vel.x -= 1.4*vn*nx; vel.z -= 1.4*vn*nz; } }
    const bob = gaitW*Math.abs(Math.sin(walkClock))*0.05*petS;
    root.position.set(pos.x, pos.y + actY + bob - sleepW*0.22*petS - sitW*0.12*petS, pos.z);
    if (!act && !evo && B.mode !== 'dying'){
      const sick = petActive() && (S.st.health < 35 || S.form === 'sickly') && !asleep();
      actG.rotation.z = gaitW*Math.sin(walkClock)*0.035 + (sick ? Math.sin(t*38)*(S.st.health < 35 ? 0.02 : 0.008) : 0);
    }
    liftW += ((pos.y > 0.12 ? 1 : 0) - liftW)*Math.min(1, dt*6);
    const lv = vel.clone().applyQuaternion(tmpQi);
    let sx = 0, sz = 0;
    if (dragging){ const gy = Math.max(grabLocal.y - 0.35, 0.2); sx = -Math.atan2(grabLocal.z, gy)*0.45; sz = Math.atan2(grabLocal.x, gy)*0.45; }
    const targX = clamp(liftW*sx + lv.z*0.06, -0.6, 0.6) - sitW*0.25, targZ = clamp(liftW*sz - lv.x*0.06, -0.6, 0.6), damp = dragging ? 3.5 : 7;
    tvx += ((targX-tx)*38 - tvx*damp)*dt; tx += tvx*dt; tvz += ((targZ-tz)*38 - tvz*damp)*dt; tz += tvz*dt;
    tiltG.rotation.x = tx; tiltG.rotation.z = tz;
    sqv += (-sq*180 - sqv*11)*dt; sq += sqv*dt; sq = clamp(sq, -0.25, 0.32);
    const breath = reduced ? 0 : Math.sin(t*(asleep()?1.3:2.2))*(asleep()?0.025:0.012);
    squashG.scale.set(1 + sq*0.55 + sleepW*0.05, (1-sq)*(1+breath)*(1 - sleepW*0.1), 1 + sq*0.4);
    legs.forEach(l => {
      const want = liftW*(0.3 + Math.sin(t*9+l.phase)*0.4) + gaitW*Math.sin(walkClock+l.walkPh)*0.5
                 + wiggleW*Math.sin(t*16+l.phase)*0.6 + danceW*Math.sin(t*11+l.walkPh)*0.45 + sleepW*l.front*1.0 + sitW*(l.front < 0 ? 1.1 : -0.2);
      l.g.rotation.x += (want - l.g.rotation.x)*Math.min(1, dt*14);
    });
    const fv = V3(-(vel.x+walkVel.x), -vel.y, -(vel.z+walkVel.z)).multiplyScalar(0.012); fv.y -= 0.012;
    if (ar.shake) fv.add(V3(1,0,0).applyQuaternion(tmpQ).multiplyScalar(ar.shake*0.07));
    if (fv.length() > 0.08) fv.setLength(0.08);
    forceSm.lerp(fv, Math.min(1, dt*12)); U.uForce.value.copy(forceSm);

    let hy = 0, hx = 0, hs = 5;
    if (dragging) hx = -0.15;
    else if (B.mode === 'dying' || asleep()) hx = 0.3;
    else if (evo) hx = -0.2;
    else if (act) hx = act.key === 'belly' ? -0.25 : act.key === 'fireflies' ? -0.4 + Math.sin(t*0.8)*0.1 : act.key === 'snowman' ? 0.25 : 0;
    else if (B.mode === 'eat' || B.mode === 'drink'){ hx = 0.38 + Math.sin(t*16)*0.07; hs = 8; }
    else if (['walk','seek','seekWater','goto','goHouse','enter','exit'].includes(B.mode)){ hy = Math.sin(t*1.3)*0.12; hx = 0.05; }
    else if (hasHover && performance.now() - lastMouse < 2000){
      scene.updateMatrixWorld(true);
      const hp = head.getWorldPosition(V3(0,0,0)), n = V3(0,0,0); camera.getWorldDirection(n);
      const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, hp); ray.setFromCamera(hoverNdc, camera); const p = V3(0,0,0);
      if (ray.ray.intersectPlane(pl, p)){ const lp = squashG.worldToLocal(p).sub(head.position); lp.z += 1.5; hy = clamp(Math.atan2(lp.x, lp.z), -0.6, 0.6); hx = clamp(-Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -0.3, 0.3); }
    } else { hy = B.lookYaw; hx = B.lookPitch + (S.st.happy < 30 || S.form === 'sickly' ? 0.15 : 0); hs = 7; }
    head.rotation.y += (hy - head.rotation.y)*Math.min(1, dt*hs);
    head.rotation.x += (hx - head.rotation.x)*Math.min(1, dt*hs);

    blinkTimer -= dt; if (blinkTimer <= 0){ blinkT = 0.14; blinkTimer = rnd(2,5.5); } if (blinkT > 0) blinkT -= dt;
    const closed = asleep() || B.mode === 'dying' || (evo && evo.t < 3.9);
    const es = closed || blinkT > 0 ? 0.12 : form().droopy ? 0.5 : 1;
    eyes.forEach(e => e.scale.y += (es - e.scale.y)*Math.min(1, dt*30));
    ears.forEach(e => { if (!reduced && Math.random() < dt*0.25 && !asleep()) e.v += rnd(-5,5); e.v += (-e.a*120 - e.v*8)*dt; e.a += e.v*dt;
      e.g.rotation.x = e.a*0.3 + (asleep() || S.st.happy < 30 || S.form === 'sickly' ? 0.35 : 0); e.g.rotation.z = e.base + e.a*0.15; });

    const h = pos.y + actY; shadow.g.position.set(pos.x, 0, pos.z); shadow.g.rotation.y = root.rotation.y;
    shadow.g.scale.set((1+h*0.12)*petS*reveal, 1, (1+h*0.12)*petS*reveal); shadow.m.material.opacity = clamp(1-h/5, 0.15, 1);

    if (petActive() && !evo){
      B.emoteT -= dt;
      if (B.emoteT <= 0){ B.emoteT = rnd(4.5,7.5); const m = moodKey(); if (m === 'happy') spawnHearts(1); else if (MOOD_EMOTE[m] && !act) showEmote(MOOD_EMOTE[m], 2); }
      B.cryT -= dt;
      if (B.cryT <= 0){ B.cryT = rnd(9,18); const m = moodKey(); if (m === 'sleep') cry('snore'); else if (!act) cry(MOOD_CRY[m] || 'grunt'); }
      if (asleep()){ B.zzzT -= dt; if (B.zzzT <= 0){ B.zzzT = 1.1; floatSprite(textTex('Z','#5d6e8f','bold 90px sans-serif','rgba(255,255,255,.85)'), headTop(), {size:0.4, vy:0.6, vx:0.25, max:2, depthTest:false}); } }
      if (S.form === 'stinky' && root.visible && Math.random() < dt*0.8) floatSprite(stinkTex, head.localToWorld(V3(0,1.1,0.4)), {size:0.35, vy:0.5, max:1.4, grow:0.4});
      if (S.form === 'golden' && root.visible && Math.random() < dt*3) floatSprite(sparkTex, root.position.clone().add(V3(rnd(-1.2,1.2)*petS, rnd(0.4,1.8)*petS, rnd(-1.6,1.6)*petS)), {size:0.25, vy:0.4, add:true, max:1});
    }
    if (ACC.poop.visible) ACC.poop.userData.flies.children.forEach(f => { const a = t*6 + f.userData.ph; f.position.set(Math.cos(a)*0.35, 0.3 + Math.sin(a*1.7)*0.1, Math.sin(a)*0.35); });
  }
  if (propeller && CL.propeller.g.visible) propeller.rotation.y += dt*(gaitW > 0.3 || act ? 20 : 6);
  if (emoteLife > 0){ emoteLife -= dt; emote.position.copy(headTop()).add(V3(0, 0.15 + Math.sin(t*4)*0.05, 0)); const k = clamp(emoteLife*3, 0, 1); emote.scale.setScalar(0.6*k); if (emoteLife <= 0) emote.visible = false; }

  foods.forEach(f => {
    if (!f.landed){ f.vy -= 20*dt; f.g.position.y += f.vy*dt;
      if (f.g.position.y <= 0){ f.g.position.y = 0; if (f.vy < -3){ f.vy *= -0.3; sfx('pop'); } else { f.vy = 0; f.landed = true; } } }
    f.sh.g.position.set(f.g.position.x, 0, f.g.position.z); f.sh.m.material.opacity = clamp(1 - f.g.position.y/2, 0.2, 1);
  });
  const smelly = cubes.length >= 3;
  cubes.forEach(c => {
    if (c.v){
      c.v.y -= 25*dt; c.m.position.addScaledVector(c.v, dt); const half = 0.1*c.sc;
      if (c.m.position.y <= half){ c.m.position.y = half; if (c.v.y < -1.5) c.v.y *= -0.25; else c.v.y = 0;
        const f = Math.exp(-6*dt); c.v.x *= f; c.v.z *= f; c.a.multiplyScalar(Math.exp(-8*dt)); const q = Math.PI/2;
        c.m.rotation.x += (Math.round(c.m.rotation.x/q)*q - c.m.rotation.x)*Math.min(1, dt*8); c.m.rotation.z += (Math.round(c.m.rotation.z/q)*q - c.m.rotation.z)*Math.min(1, dt*8);
        if (Math.abs(c.v.x) + Math.abs(c.v.z) < 0.02 && c.v.y === 0 && c.a.length() < 0.05) c.v = null;
      } else { c.m.rotation.x += c.a.x*dt; c.m.rotation.z += c.a.z*dt; }
      if (c.v) c.m.rotation.y += c.a.y*dt;
      const cr = Math.hypot(c.m.position.x, c.m.position.z); if (cr > BOUND+0.3){ c.m.position.x *= (BOUND+0.3)/cr; c.m.position.z *= (BOUND+0.3)/cr; if (c.v){ c.v.x *= -0.3; c.v.z *= -0.3; } }
    }
    c.sh.g.position.set(c.m.position.x, 0, c.m.position.z);
    c.stink.visible = smelly; if (smelly){ c.stink.position.set(c.m.position.x + Math.sin(t*1.5+c.ph)*0.05, 0.55 + Math.sin(t*2+c.ph)*0.08, c.m.position.z); c.stink.material.opacity = 0.6 + 0.3*Math.sin(t*3+c.ph); }
  });
  for (let i=fxPull.length-1;i>=0;i--){ const p = fxPull[i]; p.t += dt;
    if (p.flat){ p.g.material.opacity = Math.max(0, 0.75*(1 - p.t/1.2)); if (p.t > 1.2){ scene.remove(p.g); fxPull.splice(i,1); } continue; }
    p.g.position.y = p.t*3; p.g.rotation.z += dt*8; p.g.scale.multiplyScalar(Math.exp(-3*dt)); if (p.t > 0.6){ scene.remove(p.g); fxPull.splice(i,1); } }
  if (bowl && BG.pond){ scene.remove(bowl.g); bowl = null; }
  updateFx(dt);

  if (dragging){
    scene.updateMatrixWorld(true);
    const a = pointerWorld, b = offG.localToWorld(grabLocal.clone()), d = b.clone().sub(a), len = Math.max(d.length(), 0.001);
    rope.position.copy(a).addScaledVector(d, 0.5); rope.scale.set(1, len, 1); rope.quaternion.setFromUnitVectors(UP, d.normalize()); handle.position.copy(a);
  }

  hudT -= dt; if (hudDirty || hudT <= 0){ hudT = 0.5; renderHUD(); }
  renderer.render(scene, camera);
  requestAnimationFrame(step);
}
requestAnimationFrame(step);
}
