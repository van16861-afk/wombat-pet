// The evolution sequence: 15 real seconds, timed to the music (two 15-second tracks the author cut from songs they made, played
// through Web Audio; the audio clock is the master clock, so the picture never drifts from the beat). Skippable at any time.
//   0.0-2.0   close-up of the wombat's face in the game, the world around it out of focus, energy waking (sfx: awaken)
//   2.0-3.5   pulled through a vortex into its own evolution space: a deep tunnel in the colours of its element      (sfx: portal)
//   3.5-7.0   the real 3D wombat turns, slow then faster; light streams, stardust and its element gather round      (sfx: spin)
//   7.0-hit   faster still, the body turns into a silhouette of its element, light and music climb to the top       (sfx: charge)
//   hit       on the track's strongest beat (≈9.5-10.0): one flash, a shockwave of energy, the new form appears     (sfx: impact)
//   +1.0-12   the new form slows and stops facing the camera, a low hero angle, light rays behind it                (sfx: reveal)
//   12.0-15   「進化完成」, the form's crest / logo and name, held long enough to read, over the final chord     (sfx: logo)
// Each stage looks different: growth = warm forest light, leaves, a fine green-gold crest; mature = stronger elemental effects,
// storms and shockwaves, a metal badge; perfect = its own elemental world, a carved crest; ultimate = the grandest world with its
// own set piece (thunderclouds and arcs for 雷光, the world tree for 森羅, a golden temple for 黃金 …) and a 3D logo.
// Uses the game's own wombat (moved into this scene for the length of the sequence) and the game's WebGL renderer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

// the two tracks: where their strongest hit is, their beat grid, and when the logo lands (measured from the audio files)
export const EVO_TRACKS = {
  A:{file:'assets/music/evolution/evolution_A_build.mp3', flash:9.56, beat0:5.09, beat:0.4465, card:12.26, logo:12.9},
  B:{file:'assets/music/evolution/evolution_B_epic.mp3',  flash:10.05, beat0:0.348, beat:0.441, card:12.26, logo:12.7},
};
export const EVO_LEN = 15;
const STAGE_TRACK = {growth:'A', mature:'A', perfect:'B', ultimate:'B'};
export const trackFor = stage => STAGE_TRACK[stage] || 'A';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a)*t;
const ss = (a, b, t) => { const x = clamp((t - a)/(b - a), 0, 1); return x*x*(3 - 2*x); };
const rnd = (a, b) => a + Math.random()*(b - a);
const C = h => new THREE.Color(h);

// ---------- themes: colours, the element's particles, its set piece ----------
const THEMES = {
  forest:{deep:'#0c2410', mid:'#2f6a2a', glow:'#ffe08a', part:'leaf',   pc:['#9be36b', '#d7f58a', '#ffe07a', '#6fcf5a'], sil:'#d8ffb8', acc:'#ffd56a', ring:['#ffe08a', '#a6f08a', '#fff2c8'], icon:'leaf'},
  bloom: {deep:'#2a0d22', mid:'#7a3a62', glow:'#ffe1ef', part:'petal',  pc:['#ffb3d1', '#ffd9e8', '#fff4c8', '#f58cb8'], sil:'#ffe4f0', acc:'#ffc1dc', ring:['#ffc6e0', '#fff0c8', '#e9a8ff'], icon:'flower'},
  earth: {deep:'#1d1208', mid:'#6b4a24', glow:'#ffc46a', part:'shard',  pc:['#e8a54a', '#ffd27a', '#b88a52', '#fff0c0'], sil:'#ffd89a', acc:'#f0b45a', ring:['#ffc46a', '#e3a85a', '#fff0c8'], icon:'gem'},
  fire:  {deep:'#240804', mid:'#8a2a0c', glow:'#ffd36a', part:'ember',  pc:['#ff8a2a', '#ffcf5a', '#ff5a2a', '#fff0a0'], sil:'#ffc070', acc:'#ff9a3a', ring:['#ffb04a', '#ff6a3a', '#fff0a0'], icon:'flame'},
  wind:  {deep:'#06202a', mid:'#1f6a7a', glow:'#e8fff8', part:'streak', pc:['#a8fff0', '#e8fffa', '#7ad8ff', '#ffffff'], sil:'#e0fffa', acc:'#8ff0e0', ring:['#a8fff0', '#e8fffa', '#9fd0ff'], icon:'wind'},
  frost: {deep:'#081428', mid:'#2a5a8a', glow:'#eaf6ff', part:'snow',   pc:['#d8f0ff', '#ffffff', '#a8d4ff', '#e8e0ff'], sil:'#e8f6ff', acc:'#a8dcff', ring:['#d8f0ff', '#a8c8ff', '#ffffff'], icon:'snow'},
  star:  {deep:'#060a24', mid:'#22307a', glow:'#ffe8a8', part:'star',   pc:['#ffe8a8', '#c8d8ff', '#ffffff', '#a8b8ff'], sil:'#e0e8ff', acc:'#ffd77a', ring:['#ffe08a', '#a8b8ff', '#ffffff'], icon:'star'},
  shadow:{deep:'#0c0418', mid:'#3a1a5a', glow:'#e0a8ff', part:'shard',  pc:['#b878ff', '#e0b8ff', '#7a48d8', '#ffd8ff'], sil:'#d8b0ff', acc:'#c088ff', ring:['#c890ff', '#7a48d8', '#ffd8ff'], icon:'moon'},
  warm:  {deep:'#241008', mid:'#7a3a1a', glow:'#ffe0b0', part:'heart',  pc:['#ffb07a', '#ffd8a8', '#ff8a8a', '#fff0c8'], sil:'#ffe0c0', acc:'#ffb07a', ring:['#ffc08a', '#ff9a9a', '#fff0c8'], icon:'heart'},
  royal: {deep:'#1c0c06', mid:'#6a3a10', glow:'#fff0b0', part:'star',   pc:['#ffd76a', '#fff0b0', '#ff9a4a', '#ffffff'], sil:'#fff0c0', acc:'#ffd76a', ring:['#ffd76a', '#ffb04a', '#fff8d8'], icon:'crown'},
  holy:  {deep:'#2a2010', mid:'#8a7040', glow:'#ffffff', part:'feather',pc:['#ffffff', '#fff4d0', '#ffe6a0', '#fffaf0'], sil:'#ffffff', acc:'#ffe8a0', ring:['#fff8e0', '#ffe6a0', '#ffffff'], icon:'sun'},
  thunder:{deep:'#08061c', mid:'#2a207a', glow:'#e8e0ff', part:'spark', pc:['#a8a0ff', '#e0e8ff', '#7ab8ff', '#ffffff'], sil:'#e0e0ff', acc:'#9a9aff', ring:['#b8b0ff', '#7ab8ff', '#ffffff'], icon:'bolt'},
  murk:  {deep:'#121a08', mid:'#4a5a1a', glow:'#f0ffb0', part:'bubble', pc:['#c8e07a', '#e8f0a8', '#a0b85a', '#fff8c8'], sil:'#e8f0b0', acc:'#c8d870', ring:['#d8e88a', '#a8c060', '#fff8c8'], icon:'leaf'},
};
const FORM_THEME = {m_stinky:'murk', m_chubby:'warm', m_energetic:'wind', m_rock:'earth', m_flower:'bloom', m_warm:'warm', m_night:'star', m_ember:'fire',
  p_royal:'royal', p_forest:'forest', p_wind:'wind', p_flame:'fire', p_frost:'frost', p_stone:'earth', p_astral:'star', p_shadow:'shadow',
  u_gold:'royal', u_worldtree:'forest', u_lightning:'thunder', u_sky:'star', u_abyss:'shadow', u_holy:'holy'};
// the set piece built in each form's own space (perfect forms get a smaller one, ultimate forms the full one)
const FORM_SET = {p_royal:'temple', p_forest:'tree', p_wind:'vortex', p_flame:'firestorm', p_frost:'spires', p_stone:'spires', p_astral:'clouds', p_shadow:'spires',
  u_gold:'temple', u_worldtree:'tree', u_lightning:'storm', u_sky:'clouds', u_abyss:'spires', u_holy:'halo', m_energetic:'vortex', m_ember:'firestorm', m_night:'clouds'};
export const themeOf = (id, stage) => stage === 'growth' ? 'forest' : FORM_THEME[id] || 'forest';

// ---------- textures, drawn once ----------
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; }
const GLYPHS = ['✦', '✧', '★', '☆', '❀', '✿', '☾', '♡', '✶', '❋', '✺', '❁', '✾', '❖', '♢', '✵'];
function glyphAtlas(){
  return canvasTex(512, 512, (x) => { x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i=0;i<64;i++){ const cx = (i % 8)*64 + 32, cy = Math.floor(i/8)*64 + 32;
      if (i % 5 === 4){ x.beginPath(); x.arc(cx, cy + 8, 13, 0, 7); x.fill(); for (let k=0;k<4;k++){ x.beginPath(); x.arc(cx - 15 + k*10, cy - 12 + Math.abs(k - 1.5)*5, 6, 0, 7); x.fill(); } }
      else { x.font = `${36 + (i % 3)*6}px serif`; x.fillText(GLYPHS[i % GLYPHS.length], cx, cy); } } });
}
function magicCircle(seed){
  return canvasTex(1024, 1024, (x, w) => { const c = w/2; x.translate(c, c); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 12;
    const ring = (r, lw) => { x.lineWidth = lw; x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); };
    ring(500, 6); ring(470, 2); ring(360, 4); ring(330, 1.5); ring(180, 3); ring(110, 2);
    const star = (n, r, skip) => { x.lineWidth = 3; x.beginPath(); for (let i=0;i<=n;i++){ const a = i*skip*2*Math.PI/n - Math.PI/2; x[i ? 'lineTo' : 'moveTo'](Math.cos(a)*r, Math.sin(a)*r); } x.stroke(); };
    star(seed ? 6 : 5, 330, 2); if (seed) star(6, 330, 1);
    x.font = '34px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i=0;i<36;i++){ x.save(); x.rotate(i/36*Math.PI*2); x.fillText(GLYPHS[(i*7 + seed*3) % GLYPHS.length], 0, -415); x.restore(); }
    for (let i=0;i<72;i++){ x.save(); x.rotate(i/72*Math.PI*2); x.beginPath(); x.arc(0, -345, i % 6 ? 3 : 7, 0, 7); x.fill(); x.restore(); }
    for (let i=0;i<12;i++){ x.save(); x.rotate(i/12*Math.PI*2); x.fillRect(-2, -180, 4, 70); x.beginPath(); x.arc(0, -255, 14, 0, 7); x.stroke(); x.restore(); } });
}
const glowDot = (x, s, soft = 0.18) => { const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); };
const starTex = () => canvasTex(128, 128, (x) => { glowDot(x, 128); x.fillStyle = '#fff'; for (const r of [0, Math.PI/2]){ x.save(); x.translate(64, 64); x.rotate(r); x.beginPath(); x.moveTo(-62, 0); x.quadraticCurveTo(0, -4, 62, 0); x.quadraticCurveTo(0, 4, -62, 0); x.fill(); x.restore(); } });
// one sprite per kind of element particle (white, tinted per particle)
const PART_TEX = {
  leaf: () => canvasTex(128, 128, (x) => { x.translate(64, 64); x.rotate(0.6); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -54); x.bezierCurveTo(40, -30, 34, 30, 0, 56); x.bezierCurveTo(-34, 30, -40, -30, 0, -54); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -48); x.lineTo(0, 52); x.stroke(); for (let i=-3;i<=3;i++){ x.beginPath(); x.moveTo(0, i*12); x.lineTo(i < 0 ? -18 : 18, i*12 - 14); x.stroke(); } }),
  petal: () => canvasTex(128, 128, (x) => { x.translate(64, 70); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 48); x.bezierCurveTo(-56, 4, -30, -50, -6, -44); x.lineTo(0, -32); x.lineTo(6, -44); x.bezierCurveTo(30, -50, 56, 4, 0, 48); x.fill(); }),
  ember: () => canvasTex(64, 64, (x) => glowDot(x, 64, 0.3)),
  spark: () => canvasTex(64, 64, (x) => { glowDot(x, 64, 0.12); x.fillStyle = '#fff'; x.fillRect(30, 2, 4, 60); x.fillRect(2, 30, 60, 4); }),
  streak: () => canvasTex(128, 32, (x) => { const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.8, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 12, 128, 8); }),
  snow: () => canvasTex(128, 128, (x) => { x.translate(64, 64); x.strokeStyle = '#fff'; x.lineWidth = 6; x.lineCap = 'round';
    for (let i=0;i<6;i++){ x.save(); x.rotate(i*Math.PI/3); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -54); x.moveTo(0, -30); x.lineTo(-14, -44); x.moveTo(0, -30); x.lineTo(14, -44); x.stroke(); x.restore(); } }),
  star: starTex,
  shard: () => canvasTex(64, 128, (x) => { const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, '#999'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, '#bbb'); x.fillStyle = g; x.beginPath(); x.moveTo(32, 2); x.lineTo(60, 64); x.lineTo(32, 126); x.lineTo(4, 64); x.fill(); }),
  heart: () => canvasTex(128, 128, (x) => { x.translate(64, 60); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 46); x.bezierCurveTo(-70, 0, -36, -56, 0, -20); x.bezierCurveTo(36, -56, 70, 0, 0, 46); x.fill(); }),
  feather: () => canvasTex(64, 128, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 4); x.bezierCurveTo(60, 40, 52, 100, 32, 124); x.bezierCurveTo(12, 100, 4, 40, 32, 4); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 8); x.lineTo(32, 124); x.stroke(); }),
  bubble: () => canvasTex(64, 64, (x) => { x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 26, 0, 7); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(22, 22, 6, 0, 7); x.fill(); }),
};
const cloudTex = () => canvasTex(256, 256, (x) => { for (let i=0;i<14;i++){ const px = 128 + rnd(-70, 70), py = 140 + rnd(-40, 30), r = rnd(40, 80), g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); } });
const burstTex = () => canvasTex(1024, 1024, (x, w) => { const c = w/2; x.translate(c, c);
  for (let i=0;i<90;i++){ const a = Math.random()*Math.PI*2, L = rnd(200, 500), wd = rnd(0.004, 0.02); const g = x.createLinearGradient(0, 0, Math.cos(a)*L, Math.sin(a)*L); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a - wd)*L, Math.sin(a - wd)*L); x.lineTo(Math.cos(a + wd)*L, Math.sin(a + wd)*L); x.fill(); }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 260); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 260, 0, 7); x.fill(); });
const ringTex = () => canvasTex(512, 512, (x) => { const g = x.createRadialGradient(256, 256, 150, 256, 256, 256); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); });
const raysTex = () => canvasTex(512, 512, (x) => { x.translate(256, 256); for (let i=0;i<24;i++){ x.rotate(Math.PI*2/24); const g = x.createLinearGradient(0, 0, 0, -256); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(-14 - (i % 3)*8, -256); x.lineTo(14 + (i % 3)*8, -256); x.fill(); } });
function textBand(text, color){
  const t = canvasTex(4096, 160, (x, w, h) => { x.font = 'bold 116px "Huninn","Microsoft JhengHei",sans-serif'; x.textBaseline = 'middle'; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 18;
    const unit = `${text}  ✦  `, uw = x.measureText(unit).width; for (let px = 0; px < w; px += uw) x.fillText(unit, px, h/2 + 6); });
  t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- shaders ----------
const NOISE = `float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i=0;i<4;i++){ s += a*vn(p); p *= 2.03; a *= 0.5; } return s; }`;
function tunnelMat(glyphs){
  return new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, uniforms:{uTime:{value:0}, uScroll:{value:0}, uTwist:{value:0}, uGlyphs:{value:glyphs}, uBright:{value:0}, uFade:{value:0},
      uDeep:{value:C('#0b0618')}, uMid:{value:C('#52205a')}, uGlow:{value:C('#ffd8a0')}},
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader:`uniform float uTime, uScroll, uTwist, uBright, uFade; uniform vec3 uDeep, uMid, uGlow; uniform sampler2D uGlyphs; varying vec2 vUv; ${NOISE}
      void main(){
        float depth = 1.0 - vUv.y;
        vec2 p = vec2(vUv.x + vUv.y*uTwist + uTime*0.03, vUv.y*14.0 - uScroll);
        vec3 base = mix(uDeep, uMid, fbm(vec2(p.x*6.0, p.y*0.5)));
        base += uGlow*0.5*pow(fbm(vec2(p.x*4.0 + 3.0, p.y*0.35)), 3.0)*1.6;
        vec2 g = vec2(p.x*24.0, p.y*1.6), cell = floor(g), f = fract(g); float hh = h21(cell);
        float gl = 0.0; if (hh > 0.5){ float idx = floor(h21(cell + 7.1)*64.0); vec2 at = (vec2(mod(idx, 8.0), 7.0 - floor(idx/8.0)) + f)/8.0; gl = texture2D(uGlyphs, at).a; }
        float streak = pow(abs(sin((p.x*3.14159*36.0))), 60.0)*0.5*smoothstep(0.2, 1.0, depth);
        vec3 col = base + uGlow*gl*(0.6 + uBright) + uGlow*streak;
        col += uGlow*pow(depth, 6.0)*(1.6 + uBright*2.0);
        gl_FragColor = vec4(col*uFade, 1.0);
      }`});
}
// the form's own world (perfect and ultimate): a sky dome of drifting nebula in its colours, stars, a bright horizon
function domeMat(){
  return new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, uniforms:{uTime:{value:0}, uFade:{value:0}, uBright:{value:0}, uDeep:{value:C('#000')}, uMid:{value:C('#333')}, uGlow:{value:C('#fff')}},
    vertexShader:`varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader:`uniform float uTime, uFade, uBright; uniform vec3 uDeep, uMid, uGlow; varying vec3 vP; ${NOISE}
      void main(){
        float h = vP.y, a = atan(vP.z, vP.x);
        vec3 col = mix(uMid*1.1, uDeep, smoothstep(-0.05, 0.75, h));
        col = mix(col, uDeep*0.6, smoothstep(0.0, -0.6, h));
        float n = fbm(vec2(a*2.2 + uTime*0.04, h*3.0 - uTime*0.05));
        col += uMid*pow(n, 2.0)*0.9 + uGlow*pow(fbm(vec2(a*4.0 - uTime*0.03, h*5.0)), 4.0)*0.4;
        col += uGlow*exp(-abs(h + 0.08)*7.0)*(0.12 + uBright*0.14);              // a glow along the horizon (kept low: the bloom lifts it)
        float st = step(0.996, h21(floor(vec2(a*180.0, h*120.0))))*smoothstep(0.0, 0.3, h); col += vec3(st)*(0.6 + 0.4*sin(uTime*3.0 + a*50.0));
        gl_FragColor = vec4(col*uFade, 1.0);
      }`});
}
const additive = (extra) => ({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, ...extra});
function pillarMat(){
  return new THREE.ShaderMaterial(additive({side:THREE.DoubleSide, uniforms:{uTime:{value:0}, uOp:{value:0}, uCol:{value:C('#ffe2a0')}},
    vertexShader:`varying vec2 vUv; varying float vFacing; void main(){ vUv = uv; vec3 n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vFacing = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform float uTime, uOp; uniform vec3 uCol; varying vec2 vUv; varying float vFacing; ${NOISE}
      void main(){ float s = 0.6 + 0.4*vn(vec2(vUv.x*40.0, vUv.y*6.0 - uTime*3.0)); float a = (pow(1.0 - vFacing, 2.0)*0.9 + 0.06)*s*smoothstep(0.0, 0.15, vUv.y)*smoothstep(1.0, 0.5, vUv.y);
        gl_FragColor = vec4(uCol*a*uOp*0.3, 1.0); }`}));
}
// a rising swirl of flame / energy round the wombat (fire storms, wind vortex)
function swirlMat(col){
  return new THREE.ShaderMaterial(additive({side:THREE.DoubleSide, uniforms:{uTime:{value:0}, uOp:{value:0}, uCol:{value:C(col)}, uCol2:{value:C('#ffffff')}},
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader:`uniform float uTime, uOp; uniform vec3 uCol, uCol2; varying vec2 vUv; ${NOISE}
      void main(){ float n = fbm(vec2(vUv.x*8.0 + vUv.y*3.0 - uTime*0.9, vUv.y*3.0 - uTime*2.2)); float a = smoothstep(0.42, 0.85, n)*smoothstep(0.0, 0.2, vUv.y)*smoothstep(1.0, 0.55, vUv.y);
        gl_FragColor = vec4(mix(uCol, uCol2, smoothstep(0.7, 0.95, n))*a*uOp, 1.0); }`}));
}
function ribbonMat(col){
  return new THREE.ShaderMaterial(additive({side:THREE.DoubleSide, uniforms:{uOp:{value:0}, uCol:{value:C(col)}},
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader:`uniform float uOp; uniform vec3 uCol; varying vec2 vUv; void main(){ float a = pow(vUv.x, 2.2)*(1.0 - abs(vUv.y*2.0 - 1.0)); gl_FragColor = vec4(mix(uCol, vec3(1.0), pow(vUv.x, 8.0))*a*uOp*1.6, 1.0); }`}));
}
// particles spiralling round the wombat: stardust (round glints) and the element's own (leaves, embers, snow …, each turning)
function sparkMat(tex, glow = true){
  return new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms:{uTex:{value:tex}, uTime:{value:0}, uSpin:{value:0}, uPull:{value:0}, uBurst:{value:0}, uRise:{value:0.4}, uOp:{value:0}, uScale:{value:300}, uRot:{value:1}},
    vertexShader:`attribute float aR, aA, aH, aS, aSize; attribute vec3 aC; uniform float uTime, uSpin, uPull, uBurst, uRise, uScale, uRot; varying vec3 vC; varying float vTw, vAng, vNear;
      void main(){ float a = aA + uSpin*aS; float r = aR*(1.0 - uPull*0.65) + uBurst*aR*4.0*aS; float h = mod(aH + uTime*uRise*aS, 7.0) - 2.5 + uBurst*(aH - 3.5)*0.8;
        vec4 mv = modelViewMatrix*vec4(cos(a)*r, h, sin(a)*r, 1.0); vC = aC; vTw = 0.6 + 0.4*sin(uTime*8.0*aS + aA*10.0); vAng = (aA*7.0 + uTime*aS*2.5)*uRot;
        vNear = smoothstep(1.2, 3.5, -mv.z);   // (ones flying past the camera fade out instead of filling the screen)
        gl_PointSize = min(aSize*uScale/max(0.5, -mv.z), uScale*0.12); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform sampler2D uTex; uniform float uOp; varying vec3 vC; varying float vTw, vAng, vNear;
      void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vAng), s = sin(vAng); p = mat2(c, -s, s, c)*p + 0.5; if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
        vec4 t = texture2D(uTex, p); float a = t.a*uOp*vTw*vNear; if (a < 0.01) discard; gl_FragColor = vec4(vC*t.rgb*a, a); }`});
}
function particles(n, tex, pal, glow, rMin, rMax, sMin, sMax){
  const geo = new THREE.BufferGeometry(), A = k => new Float32Array(n*k);
  const aR = A(1), aA = A(1), aH = A(1), aS = A(1), aSize = A(1), aC = A(3);
  for (let i=0;i<n;i++){ aR[i] = rnd(rMin, rMax); aA[i] = rnd(0, 6.28); aH[i] = rnd(0, 7); aS[i] = rnd(0.5, 1.5); aSize[i] = rnd(sMin, sMax); const c = pal[i % pal.length]; aC.set([c.r, c.g, c.b], i*3); }
  geo.setAttribute('position', new THREE.BufferAttribute(A(3), 3));
  for (const [nm, a, k] of [['aR', aR, 1], ['aA', aA, 1], ['aH', aH, 1], ['aS', aS, 1], ['aSize', aSize, 1], ['aC', aC, 3]]) geo.setAttribute(nm, new THREE.BufferAttribute(a, k));
  const p = new THREE.Points(geo, sparkMat(tex, glow)); p.frustumCulled = false; return p;
}

// ---------- set pieces: each returns {g, update(t, T, w, pulse, dt)} ----------
function glowMat(col, op = 1){ return new THREE.MeshBasicMaterial(additive({color:C(col), opacity:op})); }
const SETS = {
  // the world tree: a great trunk rising behind, roots spreading over the floor, a crown of glowing leaf-puffs, runes rising up it
  tree(th, big, mobile){
    const g = new THREE.Group(), s = big ? 1 : 0.6, bark = new THREE.MeshStandardMaterial({color:'#5a3a22', roughness:0.9, emissive:C('#2a1a08'), emissiveIntensity:0.4});
    const trunkGeo = new THREE.CylinderGeometry(0.9, 2.2, 14, 18, 24, true), P = trunkGeo.attributes.position;
    for (let i=0;i<P.count;i++){ const y = P.getY(i), a = Math.atan2(P.getZ(i), P.getX(i)) + (y + 7)*0.12, r = Math.hypot(P.getX(i), P.getZ(i))*(1 + 0.12*Math.sin(a*5 + y));
      P.setXYZ(i, Math.cos(a)*r, y, Math.sin(a)*r); }
    trunkGeo.computeVertexNormals(); const trunk = new THREE.Mesh(trunkGeo, bark); trunk.position.y = 7; g.add(trunk);
    for (let i=0;i<9;i++){ const a = i/9*Math.PI*2, root = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 6, 6), bark); root.position.set(Math.cos(a)*2.6, 0.1, Math.sin(a)*2.6); root.rotation.set(0, -a, Math.PI/2 - 0.18); root.rotation.order = 'YXZ'; g.add(root); }
    const crown = new THREE.Group(), leafM = new THREE.MeshStandardMaterial({color:'#4f9a3a', roughness:0.8, emissive:C(th.pc[0]), emissiveIntensity:0.15});
    for (let i=0;i<(mobile ? 16 : 28);i++){ const a = rnd(0, 6.28), r = rnd(0, 6.5), m = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.6, 2.8), 1), leafM); m.position.set(Math.cos(a)*r, 13 + rnd(-1.5, 2.5) - r*0.25, Math.sin(a)*r); crown.add(m); }
    g.add(crown);
    const runes = particles(mobile ? 60 : 120, starTex(), th.pc.map(C), true, 2.2, 2.8, 0.15, 0.3); runes.material.uniforms.uRise.value = 1.2; g.add(runes);
    g.position.set(0, -0.4, -9*s); g.scale.setScalar(s);
    return {g, update(t, T, w, pulse, dt){ const grow = ss(T.SPACE, T.FAST + 1, t); trunk.scale.set(1, Math.max(0.05, grow), 1); trunk.position.y = 7*grow; crown.scale.setScalar(Math.max(0.01, ss(T.FAST - 0.5, T.FLASH, t))); crown.rotation.y += dt*0.05;
      leafM.emissiveIntensity = 0.15 + 0.6*ss(T.FAST, T.FLASH, t) + pulse*0.3 + (t > T.FLASH ? 0.5*(1 - ss(T.FLASH, T.CARD, t)) : 0);
      const u = runes.material.uniforms; u.uTime.value = t; u.uSpin.value += dt*0.3; u.uOp.value = ss(T.SPACE, T.FAST, t)*0.9; u.uScale.value = innerHeight*0.4; }};
  },
  // thunderclouds circling overhead, lightning arcs striking on the beat (never a fast flicker), the big strike at the hit
  storm(th, big, mobile){
    const g = new THREE.Group(), ct = cloudTex(), clouds = [];
    for (let i=0;i<(mobile ? 14 : 24);i++){ const m = new THREE.Sprite(new THREE.SpriteMaterial({map:ct, color:C(i % 3 ? '#3a3470' : '#5a5aa0'), transparent:true, opacity:0, depthWrite:false}));
      const a = i/24*Math.PI*2*1.5, r = rnd(7, 14); m.position.set(Math.cos(a)*r, rnd(3.2, 6), Math.sin(a)*r - 3); m.scale.setScalar(rnd(6, 10)); g.add(m); clouds.push({m, a, r}); }
    const arcs = [];
    for (let i=0;i<6;i++){ const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16*3), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial(additive({color:C(i % 2 ? '#c8c0ff' : '#e8f0ff'), opacity:0}))); g.add(l); arcs.push({l, life:0}); }
    const strike = arc => { const P = arc.l.geometry.attributes.position, a = rnd(0, 6.28), r0 = rnd(5, 11), x0 = Math.cos(a)*r0, z0 = Math.sin(a)*r0 - 3, x1 = Math.cos(a + rnd(-0.4, 0.4))*rnd(1.4, 3), z1 = Math.sin(a)*rnd(1.4, 3);
      for (let k=0;k<16;k++){ const f = k/15, j = Math.sin(f*Math.PI)*0.9; P.setXYZ(k, lerp(x0, x1, f) + rnd(-j, j), lerp(5.5, -0.3, f), lerp(z0, z1, f) + rnd(-j, j)); } P.needsUpdate = true; arc.life = 1; };
    let lastBeat = -1;
    return {g, strike, update(t, T, w, pulse, dt, beatN, red){ const on = ss(T.SUCK + 1, T.SPACE + 1, t);
      clouds.forEach((c, i) => { c.a += dt*(0.05 + w*0.01); c.m.position.x = Math.cos(c.a)*c.r; c.m.position.z = Math.sin(c.a)*c.r - 3; c.m.material.opacity = on*0.85*(0.85 + 0.15*Math.sin(t + i)); c.m.material.color.setHex(pulse > 0.6 && i % 4 === beatN % 4 ? 0x8a88e0 : (i % 3 ? 0x3a3470 : 0x5a5aa0)); });
      if (beatN !== lastBeat && t > T.SPACE && t < T.CARD){ lastBeat = beatN; if (beatN % (t > T.FAST ? 1 : 2) === 0) strike(arcs[beatN % arcs.length]); }
      if (t > T.FLASH && !this.hit){ this.hit = true; arcs.forEach(strike); }
      arcs.forEach(a => { a.life = Math.max(0, a.life - dt*(red ? 2 : 4)); a.l.material.opacity = a.life*(red ? 0.5 : 1); }); }};
  },
  // a golden temple: columns rising out of the floor in a ring, a gold floor, shafts of light from above
  temple(th, big, mobile){
    const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({color:'#e8b84a', metalness:0.6, roughness:0.3, emissive:C('#6a4410'), emissiveIntensity:0.5}), cols = [], n = big ? 12 : 8;
    for (let i=0;i<n;i++){ const a = i/n*Math.PI*2, col = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 7, 14), gold); shaft.position.y = 3.5; col.add(shaft);
      for (const y of [0.15, 6.95]){ const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), gold); cap.position.y = y; col.add(cap); }
      col.position.set(Math.cos(a)*(big ? 8 : 6.5), -7.5, Math.sin(a)*(big ? 8 : 6.5)); g.add(col); cols.push(col); }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(big ? 9.5 : 7.5, 64), new THREE.MeshStandardMaterial({color:'#c89a3a', metalness:0.5, roughness:0.35, emissive:C('#4a3008'), emissiveIntensity:0.6}));
    floor.rotation.x = -Math.PI/2; floor.position.y = -0.45; g.add(floor);
    const shafts = []; for (let i=0;i<(big ? 5 : 3);i++){ const m = new THREE.Mesh(new THREE.ConeGeometry(1.6, 16, 24, 1, true), glowMat('#fff0c0', 0)); m.position.set(rnd(-5, 5), 7.5, rnd(-7, -2)); m.rotation.z = rnd(-0.2, 0.2); g.add(m); shafts.push(m); }
    return {g, update(t, T, w, pulse, dt){ cols.forEach((c, i) => { c.position.y = lerp(-7.5, -0.4, ss(T.SPACE + i*0.12, T.FAST + i*0.08, t)); });
      gold.emissiveIntensity = 0.5 + 0.6*ss(T.FAST, T.FLASH, t) + pulse*0.4; shafts.forEach((m, i) => { m.material.opacity = ss(T.SPACE, T.FAST, t)*(0.08 + 0.04*Math.sin(t*1.5 + i)) + (t > T.FLASH ? 0.12*(1 - ss(T.FLASH, T.CARD, t)) : 0); }); }};
  },
  // holy light: great rings of sunlight turning round each other, wings of light behind
  halo(th, big, mobile){
    const g = new THREE.Group(), rings = [];
    for (let i=0;i<4;i++){ const m = new THREE.Mesh(new THREE.TorusGeometry(3 + i*1.2, 0.05 + 0.02*i, 8, 160), glowMat(['#fff8e0', '#ffe6a0', '#ffffff', '#ffd88a'][i], 0)); m.position.y = 1.2; m.rotation.x = Math.PI/2 + rnd(-0.6, 0.6); m.rotation.y = rnd(-0.6, 0.6); g.add(m); rings.push(m); }
    const wings = new THREE.Group(); wings.position.set(0, 1.4, -1.2); g.add(wings);
    for (const s of [-1, 1]) for (let k=0;k<7;k++){ const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.2 - k*0.25), glowMat('#fff6dc', 0)); f.geometry.translate(0, (3.2 - k*0.25)/2, 0); f.position.x = s*0.4; f.rotation.z = -s*(0.5 + k*0.17); wings.add(f); }
    return {g, update(t, T, w, pulse, dt){ rings.forEach((r, i) => { r.rotation.z += dt*(0.3 + i*0.15)*(i % 2 ? 1 : -1)*(1 + w*0.05); r.material.opacity = ss(T.SPACE + i*0.3, T.FAST, t)*(0.55 + pulse*0.4)*(t > T.CARD ? 0.6 : 1); });
      const wo = ss(T.FAST, T.FLASH, t)*0.25 + (t > T.FLASH ? 0.4*ss(T.FLASH, T.REVEAL, t) : 0); wings.children.forEach(f => { f.material.opacity = wo; }); wings.scale.setScalar(0.6 + 0.6*ss(T.FAST, T.REVEAL, t)); }};
  },
  // a sea of clouds below and drifting veils, constellation lines across the sky
  clouds(th, big, mobile){
    const g = new THREE.Group(), ct = cloudTex(), cl = [];
    for (let i=0;i<(mobile ? 18 : 34);i++){ const m = new THREE.Sprite(new THREE.SpriteMaterial({map:ct, color:C(i % 2 ? '#e8ecff' : '#c8d0ff'), transparent:true, opacity:0, depthWrite:false}));
      m.position.set(rnd(-16, 16), rnd(-2.4, -0.8), rnd(-18, 4)); m.scale.setScalar(rnd(5, 9)); g.add(m); cl.push(m); }
    const pts = []; for (let i=0;i<14;i++) pts.push(new THREE.Vector3(rnd(-9, 9), rnd(3.5, 8), rnd(-14, -8)));
    const lg = new THREE.BufferGeometry().setFromPoints(pts.flatMap((p, i) => i ? [pts[i - 1], p] : [])); const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial(additive({color:C(th.acc), opacity:0}))); g.add(lines);
    return {g, update(t, T, w, pulse, dt){ cl.forEach((m, i) => { m.position.x += dt*(0.3 + (i % 3)*0.15); if (m.position.x > 17) m.position.x = -17; m.material.opacity = ss(T.SUCK + 1.2, T.SPACE + 1, t)*0.75; });
      lines.material.opacity = ss(T.SPACE, T.FAST, t)*(0.35 + pulse*0.4); }};
  },
  // crystal spires bursting up out of the floor in a ring (abyss, ice, stone)
  spires(th, big, mobile){
    const g = new THREE.Group(), sp = [], mat = new THREE.MeshStandardMaterial({color:C(th.mid), roughness:0.25, metalness:0.1, emissive:C(th.acc), emissiveIntensity:0.35, flatShading:true});
    for (let i=0;i<(big ? 16 : 10);i++){ const a = i/(big ? 16 : 10)*Math.PI*2 + rnd(-0.15, 0.15), h = rnd(2.5, big ? 7 : 5), m = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.4, 0.9), h, 5), mat);
      m.geometry.translate(0, h/2, 0); const r = rnd(4.5, 8); m.position.set(Math.cos(a)*r, -0.5, Math.sin(a)*r - 1); m.rotation.set(rnd(-0.25, 0.25), rnd(0, 6), rnd(-0.25, 0.25)); m.userData.d = i*0.08; g.add(m); sp.push(m); }
    return {g, update(t, T, w, pulse, dt){ sp.forEach(m => { m.scale.y = Math.max(0.01, ss(T.SPACE + m.userData.d, T.FAST + m.userData.d, t)); }); mat.emissiveIntensity = 0.35 + 0.7*ss(T.FAST, T.FLASH, t) + pulse*0.4; }};
  },
  // a pillar of fire spiralling up round the wombat
  firestorm(th, big, mobile){
    const g = new THREE.Group(), m1 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 9, 48, 1, true), swirlMat(th.pc[0])), m2 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 7, 48, 1, true), swirlMat(th.pc[1]));
    m1.position.y = 4; m2.position.y = 3.2; g.add(m1, m2);
    return {g, update(t, T, w, pulse, dt){ for (const m of [m1, m2]){ const u = m.material.uniforms; u.uTime.value = t; u.uOp.value = ss(T.SPACE, T.FAST, t)*(0.6 + 0.5*ss(T.FAST, T.FLASH, t) + pulse*0.3)*(t > T.FLASH ? 1 - ss(T.FLASH, T.REVEAL + 0.5, t)*0.8 : 1); }
      m1.rotation.y += dt*(0.6 + w*0.05); m2.rotation.y -= dt*(0.8 + w*0.06); }};
  },
  // a wind vortex: streaming bands of air round and round, faster with the spin
  vortex(th, big, mobile){
    const g = new THREE.Group(), m1 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.6, 8, 48, 1, true), swirlMat(th.pc[0])); m1.position.y = 3.6; g.add(m1);
    return {g, update(t, T, w, pulse, dt){ const u = m1.material.uniforms; u.uTime.value = t*1.6; u.uOp.value = ss(T.SPACE, T.FAST, t)*(0.45 + 0.4*ss(T.FAST, T.FLASH, t))*(t > T.FLASH ? 1 - ss(T.FLASH, T.REVEAL, t)*0.8 : 1); m1.rotation.y += dt*(1.5 + w*0.1); }};
  },
};

// ---------- the crests / logos (DOM, all drawn here: the game's own designs) ----------
const ICON_SVG = {
  leaf:'<path d="M50 14c18 10 24 34 0 72C26 48 32 24 50 14z" fill="url(#gi)"/><path d="M50 22v60" stroke="#5a7a2a" stroke-width="2.5"/>',
  flower:[0, 72, 144, 216, 288].map(a => `<ellipse cx="50" cy="32" rx="11" ry="18" fill="url(#gi)" transform="rotate(${a} 50 50)"/>`).join('') + '<circle cx="50" cy="50" r="8" fill="#fff3b0"/>',
  gem:'<path d="M50 14l24 18-24 54-24-54z" fill="url(#gi)"/><path d="M26 32h48M50 14v72" stroke="rgba(0,0,0,.25)" stroke-width="2"/>',
  flame:'<path d="M50 12c6 18 26 26 22 48-3 16-14 26-22 26s-19-10-22-26c-3-14 6-20 10-30 2 10 8 12 8 12-2-12 0-20 4-30z" fill="url(#gi)"/>',
  wind:'<path d="M18 40h40a10 10 0 1 0-10-10M18 54h54a10 10 0 1 1-10 10M24 68h22" stroke="url(#gi)" stroke-width="7" fill="none" stroke-linecap="round"/>',
  snow:[0, 60, 120].map(a => `<path d="M50 16v68M38 24l12 10 12-10M38 76l12-10 12 10" stroke="url(#gi)" stroke-width="6" fill="none" stroke-linecap="round" transform="rotate(${a} 50 50)"/>`).join(''),
  star:'<path d="M50 12l10 26 28 2-22 17 8 27-24-15-24 15 8-27-22-17 28-2z" fill="url(#gi)"/>',
  moon:'<path d="M62 14a36 36 0 1 0 22 52A30 30 0 1 1 62 14z" fill="url(#gi)"/>',
  heart:'<path d="M50 84C14 60 16 30 34 26c8-2 13 3 16 9 3-6 8-11 16-9 18 4 20 34-16 58z" fill="url(#gi)"/>',
  crown:'<path d="M18 70l6-38 16 18 10-26 10 26 16-18 6 38z" fill="url(#gi)"/><rect x="18" y="72" width="64" height="8" rx="3" fill="url(#gi)"/>',
  sun:'<circle cx="50" cy="50" r="18" fill="url(#gi)"/>' + Array.from({length:12}, (_, i) => `<path d="M50 10l4 14h-8z" fill="url(#gi)" transform="rotate(${i*30} 50 50)"/>`).join(''),
  bolt:'<path d="M56 10L24 56h20l-8 34 34-48H50z" fill="url(#gi)"/>',
};
function crestHTML(stage, th, name, logoUrl){
  if (logoUrl) return `<div class="crest img"><img src="${logoUrl}" alt=""></div>`;
  const icon = ICON_SVG[th.icon] || ICON_SVG.star, a = th.acc, gl = th.glow;
  const grad = `<defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="${a}"/><stop offset="1" stop-color="#b07820"/></linearGradient>
    <linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f6"/><stop offset=".35" stop-color="#9aa0aa"/><stop offset=".55" stop-color="#fbfbfd"/><stop offset="1" stop-color="#6a707a"/></linearGradient>
    <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6cf"/><stop offset=".45" stop-color="#e8b44a"/><stop offset=".7" stop-color="#a86a18"/><stop offset="1" stop-color="#ffe9a8"/></linearGradient></defs>`;
  if (stage === 'growth')   // a fine wreath of leaves, green and gold
    return `<div class="crest growth"><svg viewBox="0 0 200 200">${grad}${Array.from({length:18}, (_, i) => { const k = i < 9 ? -1 : 1, j = i % 9, ang = k*(18 + j*17);
      return `<ellipse cx="100" cy="22" rx="7" ry="15" fill="${j % 2 ? '#8fd06a' : '#d8c060'}" stroke="#4a7a2a" stroke-width="1" transform="rotate(${ang} 100 100) rotate(${k*30} 100 22)"/>`; }).join('')}
      <circle cx="100" cy="100" r="54" fill="none" stroke="url(#gg)" stroke-width="4"/><circle cx="100" cy="100" r="46" fill="rgba(30,60,20,.55)" stroke="#f3d98a" stroke-width="1.5"/>
      <g transform="translate(60 60) scale(.8)">${icon}</g></svg></div>`;
  if (stage === 'mature')   // a bevelled metal badge, a hexagon framed in gold
    return `<div class="crest mature"><svg viewBox="0 0 200 200">${grad}<path d="M100 8l80 46v92l-80 46-80-46V54z" fill="url(#gm)" stroke="#3a3f48" stroke-width="3"/>
      <path d="M100 22l68 39v78l-68 39-68-39V61z" fill="url(#gg)"/><path d="M100 34l58 33v66l-58 33-58-33V67z" fill="${th.mid}" stroke="#fff3c8" stroke-width="2"/>
      <path d="M100 34l58 33v20C120 70 80 70 42 87V67z" fill="rgba(255,255,255,.18)"/><g transform="translate(55 55) scale(.9)">${icon}</g></svg></div>`;
  if (stage === 'perfect')  // a carved crest: a shield with scrollwork, a gem in the element's colour
    return `<div class="crest perfect"><svg viewBox="0 0 220 220">${grad}
      <path d="M30 110c-24-10-26-40-6-52 4 18 18 22 30 18M190 110c24-10 26-40 6-52-4 18-18 22-30 18M60 186c-10 14-34 12-38-6 16 4 26-4 30-14M160 186c10 14 34 12 38-6-16 4-26-4-30-14" fill="none" stroke="url(#gg)" stroke-width="7" stroke-linecap="round"/>
      <path d="M110 14l70 22v62c0 52-36 84-70 104C76 182 40 150 40 98V36z" fill="url(#gg)" stroke="#7a4a10" stroke-width="3"/>
      <path d="M110 30l56 18v50c0 42-28 68-56 84-28-16-56-42-56-84V48z" fill="${th.deep}" stroke="#fff0c0" stroke-width="2"/>
      <path d="M110 30l56 18v50c0 42-28 68-56 84" fill="rgba(255,255,255,.08)"/><g transform="translate(70 66) scale(.8)">${icon}</g>
      <path d="M110 4l8 12h-16z" fill="url(#gg)"/></svg></div>`;
  return `<div class="crest ultimate"><div class="rays"></div><svg viewBox="0 0 240 240">${grad}
    ${Array.from({length:16}, (_, i) => `<path d="M120 8l10 30h-20z" fill="url(#gg)" transform="rotate(${i*22.5} 120 120)"/>`).join('')}
    <circle cx="120" cy="120" r="78" fill="url(#gg)" stroke="#7a4a10" stroke-width="3"/><circle cx="120" cy="120" r="66" fill="${th.deep}" stroke="#fff3c8" stroke-width="2.5"/>
    <circle cx="120" cy="120" r="58" fill="none" stroke="${gl}" stroke-width="1.5" stroke-dasharray="4 6"/><g transform="translate(72 72) scale(.96)">${icon}</g></svg></div>`;
}

export function createEvolution({renderer, mobile, sound}){
  const scene = new THREE.Scene(); scene.background = C('#0b0618');
  const cam = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.05, 400);
  const LI = Math.PI;
  const hemi = new THREE.HemisphereLight('#fff4e0', '#5a3a7a', 0.85*LI); scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffe9c4', 1.1*LI); key.position.set(2, 4, 5); scene.add(key);
  const rimA = new THREE.PointLight('#c48cff', 18, 12, 1.4); rimA.position.set(-2.5, 2.4, -2.2); scene.add(rimA);
  const rimB = new THREE.PointLight('#ffcf7a', 18, 12, 1.4); rimB.position.set(2.6, 1.6, -2.0); scene.add(rimB);
  const glyphs = glyphAtlas(), tStar = starTex(), tBurst = burstTex(), tRing = ringTex(), tRays = raysTex(), tCircle = [magicCircle(0), magicCircle(1)];
  const partTex = {}; const ptex = k => partTex[k] || (partTex[k] = (PART_TEX[k] || PART_TEX.star)());

  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 140, 64, 1, true), tunnelMat(glyphs));   // (wide enough that the orbiting camera never brushes its wall) tunnel.rotation.x = Math.PI/2; tunnel.position.z = -30; scene.add(tunnel);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), domeMat()); dome.visible = false; dome.renderOrder = -3; tunnel.renderOrder = -2; scene.add(dome);   // (the dome behind everything, the tunnel over it)
  const pivot = new THREE.Group(); scene.add(pivot);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 26, 48, 1, true), pillarMat()); pillar.position.y = 10; scene.add(pillar);
  const circleMat = (tex, col) => new THREE.MeshBasicMaterial(additive({map:tex, color:col, opacity:0, side:THREE.DoubleSide}));
  const floorCircle = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), circleMat(tCircle[0], '#ffd27a')); floorCircle.rotation.x = -Math.PI/2; floorCircle.position.y = -0.4; scene.add(floorCircle);
  const backCircle = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), circleMat(tCircle[1], '#c890ff')); backCircle.position.set(0, 1.0, -2.6); scene.add(backCircle);
  const backCircle2 = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), circleMat(tCircle[0], '#ffb3dc')); backCircle2.position.set(0, 1.0, -2.4); scene.add(backCircle2);
  const heroRays = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial(additive({map:tRays, color:'#fff0c8', opacity:0}))); heroRays.position.set(0, 1.2, -3.2); scene.add(heroRays);
  const ribbons = [];
  for (let i=0;i<7;i++){ const m = new THREE.Mesh(new THREE.TorusGeometry(rnd(1.25, 1.9), 0.045, 6, 140, Math.PI*rnd(1.1, 1.6)), ribbonMat('#ffd06a'));
    const g = new THREE.Group(); g.rotation.set(rnd(-1.1, 1.1), rnd(0, 6.28), rnd(-0.6, 0.6)); g.position.y = 1.0; g.add(m); scene.add(g); ribbons.push({g, m, sp:rnd(0.8, 1.6)*(i % 2 ? 1 : -1), k:i}); }
  const sparks = particles(mobile ? 700 : 1600, tStar, ['#ffd36e', '#ffe9b0', '#c98cff', '#ff9fd2', '#fff7e6'].map(C), true, 0.9, 4.2, 0.025, 0.09); sparks.position.y = 0.6; scene.add(sparks);
  let elems = null;   // the element's particles (made per run, for its kind of sprite)
  const NP = mobile ? 140 : 280, pg = new THREE.BufferGeometry(), pp = new Float32Array(NP*3), pv = [];
  for (let i=0;i<NP;i++){ pp.set([rnd(-5, 5), rnd(-1, 6), rnd(-4, 2)], i*3); pv.push(rnd(0.3, 0.8)); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const petals = new THREE.Points(pg, new THREE.PointsMaterial(additive({map:tStar, color:'#ffd88a', size:0.12, opacity:0}))); petals.frustumCulled = false; scene.add(petals);
  const bandMat = tex => new THREE.MeshBasicMaterial(additive({map:tex, opacity:0, side:THREE.DoubleSide}));
  const bandLo = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.62, 96, 1, true), bandMat(null)); bandLo.position.y = 0.15; scene.add(bandLo);
  const bandHi = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.9, 96, 1, true), bandMat(null)); bandHi.position.y = 2.25; scene.add(bandHi);
  const burst = new THREE.Sprite(new THREE.SpriteMaterial(additive({map:tBurst, color:'#fff6e0', opacity:0}))); burst.position.y = 1.0; scene.add(burst);
  const waves = [0, 1, 2, 3].map(i => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(additive({map:tRing, color:'#fff3c8', opacity:0, side:THREE.DoubleSide})));
    m.position.y = 1.0; scene.add(m); return m; });
  // beat rings: a flat ring of energy racing out along the floor on every strong beat
  const beatRings = Array.from({length:4}, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(additive({map:tRing, color:'#ffffff', opacity:0, side:THREE.DoubleSide}))); m.rotation.x = -Math.PI/2; m.position.y = -0.35; scene.add(m); return {m, t0:-9}; });

  let composer = null, bloom = null, after = null;
  function build(){
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {type:THREE.HalfFloatType}));
    composer.addPass(new RenderPass(scene, cam));
    after = new AfterimagePass(0); composer.addPass(after);
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth/2, innerHeight/2), 0.6, 0.5, 0.86);   // (only the brightest things glow) composer.addPass(bloom);
    resize();
  }
  const sz = new THREE.Vector2(), last = new THREE.Vector2(-1, -1); let lastPR = 0;
  function resize(){
    renderer.getSize(sz); const pr = renderer.getPixelRatio(); last.copy(sz); lastPR = pr;
    cam.aspect = sz.x/Math.max(1, sz.y); cam.updateProjectionMatrix();
    if (composer){ composer.setPixelRatio(pr); composer.setSize(sz.x, sz.y); bloom.resolution.set(sz.x/2, sz.y/2); } }
  addEventListener('resize', resize);

  // DOM: input shield, the out-of-focus opening, the vortex, the flash, the title card, sound buttons, skip
  const css = document.createElement('style'); css.textContent = `
    body.evo-on > :not(#evoUI):not(canvas){visibility:hidden!important}
    #evoUI{position:fixed;inset:0;z-index:30;pointer-events:auto;touch-action:none;font-family:"Huninn","Microsoft JhengHei",sans-serif;overflow:hidden}
    #evoUI .focus,#evoUI .vortex,#evoUI .flash,#evoUI .glow{position:absolute;inset:0;pointer-events:none;opacity:0}
    #evoUI .focus{backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);-webkit-mask-image:radial-gradient(ellipse 44% 50% at 50% 48%,transparent 45%,#000 100%);mask-image:radial-gradient(ellipse 44% 50% at 50% 48%,transparent 45%,#000 100%)}
    #evoUI .glow{background:radial-gradient(ellipse 40% 46% at 50% 46%,transparent 30%,var(--g,rgba(255,220,140,.5)) 75%,rgba(10,6,20,.75) 100%)}
    #evoUI .vortex{background:repeating-conic-gradient(from 0deg at 50% 50%,var(--v1,#fff4d0) 0deg 6deg,var(--v2,#5a2a8a) 10deg 22deg);-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0%,#000 30%,transparent 72%);mask-image:radial-gradient(circle at 50% 50%,#000 0%,#000 30%,transparent 72%)}
    #evoUI .flash{background:#fff}
    #evoUI .btns{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));display:flex;gap:8px}
    #evoUI .btns button,#evoUI .skip{padding:9px 14px;border-radius:999px;border:1px solid rgba(255,230,170,.6);background:rgba(30,12,60,.55);color:#ffeec8;font:inherit;font-size:15px;backdrop-filter:blur(4px);cursor:pointer}
    #evoUI .skip{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));letter-spacing:.1em;padding:9px 16px}
    #evoUI .evcard{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);text-align:center;opacity:0;pointer-events:none;width:min(94vw,640px);perspective:700px}
    #evoUI .crest{width:clamp(90px,20vw,140px);height:clamp(90px,20vw,140px);margin:0 auto -6px;position:relative;opacity:0;filter:drop-shadow(0 0 14px var(--acc,#ffd27a))}
    #evoUI .crest svg,#evoUI .crest img{width:100%;height:100%;display:block}
    #evoUI .crest.ultimate .rays{position:absolute;inset:-60%;background:repeating-conic-gradient(var(--acc,#ffd27a) 0 4deg,transparent 4deg 15deg);border-radius:50%;opacity:.45;-webkit-mask-image:radial-gradient(circle,#000 20%,transparent 70%);mask-image:radial-gradient(circle,#000 20%,transparent 70%);animation:evoSpin 9s linear infinite}
    #evoUI .logo{margin:4px 0 2px;font-size:clamp(11px,2.4vw,13px);letter-spacing:.35em;color:#f3cf7a;opacity:0;text-shadow:0 0 8px rgba(255,200,110,.6)}
    #evoUI .sub{color:#fff3d6;font-size:clamp(16px,3.6vw,24px);letter-spacing:.5em;margin:0 0 4px;text-shadow:0 0 12px #ffcf7a;opacity:0}
    #evoUI .name{margin:0;font-size:clamp(38px,9vw,72px);letter-spacing:.12em;line-height:1.15;font-weight:900;filter:drop-shadow(0 0 14px rgba(255,205,110,.9));opacity:0}
    #evoUI .name span{background:linear-gradient(180deg,#fffbe6 0%,#ffe08a 45%,#e2a43a 72%,#fff2c4 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.2px #8a5418}
    #evoUI .evcard.ultimate .name{transform-style:preserve-3d}
    #evoUI .evcard.ultimate .name span{text-shadow:none}
    #evoUI .name .ex{position:absolute;left:0;right:0;top:0;color:#7a4410;-webkit-text-stroke:0;z-index:-1;filter:none}
    #evoUI .stage{color:#e8d4ff;font-size:clamp(13px,2.8vw,17px);letter-spacing:.3em;margin-top:6px;opacity:0}
    #evoUI.card-on .evcard{opacity:1;transition:opacity .25s}
    #evoUI.card-on .sub{animation:evoFade .45s ease-out forwards}
    #evoUI.card-on .name{animation:evoPop .6s cubic-bezier(.2,1.6,.4,1) .15s forwards}
    #evoUI.card-on .stage{animation:evoFade .5s ease-out .5s forwards}
    #evoUI.logo-on .crest{animation:evoCrest .9s cubic-bezier(.2,1.4,.4,1) forwards}
    #evoUI.logo-on .logo{animation:evoFade .6s ease-out .3s forwards}
    #evoUI.logo-on .evcard.ultimate .name{animation:evoPop .6s cubic-bezier(.2,1.6,.4,1) .15s forwards, evoTilt 3s ease-in-out .8s infinite alternate}
    #evoUI.red .crest,#evoUI.red .name{animation-duration:.01s!important}
    @keyframes evoFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes evoPop{0%{opacity:0;transform:scale(1.8)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}
    @keyframes evoCrest{0%{opacity:0;transform:rotateY(-100deg) scale(.4)}100%{opacity:1;transform:none}}
    @keyframes evoTilt{from{transform:rotateX(8deg) rotateY(-10deg)}to{transform:rotateX(4deg) rotateY(10deg)}}
    @keyframes evoSpin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(css);
  const ui = document.createElement('div'); ui.id = 'evoUI'; ui.hidden = true;
  ui.innerHTML = `<div class="focus"></div><div class="glow"></div><div class="vortex"></div><div class="evcard"><div class="crest-slot"></div><p class="logo">小袋二世 ✦ EVOLUTION</p><p class="sub">進化完成</p><h2 class="name"></h2><p class="stage"></p></div><div class="flash"></div>
    <div class="btns"><button class="mus" type="button" aria-label="音樂開關">🎵</button><button class="snd" type="button" aria-label="音效開關">🔊</button></div><button class="skip" type="button">跳過 ▸▸</button>`;
  document.body.appendChild(ui);
  const $u = s => ui.querySelector(s);

  let E = null, T = null, setPiece = null;
  const S = {
    get active(){ return !!E; },
    get t(){ return E ? E.t : 0; },
    get T(){ return T; },
    get inScene(){ return !!E && E.t >= T.SUCK + 0.35 && E.t < T.END - 0.15; },
    // opts: {pet, fromName, toName, toId, stage (growth|mature|perfect|ultimate), stageName, track ('A'|'B'), logoUrl, setWhite(v, colour), onSwap(),
    // onDone(), reduced (gentler: no shaking, no blurring spin, a soft flash), clock() (seconds of the music, or null), music:{on, toggle()}, sound:{on, toggle()}}
    start(opts){
      if (E) return; if (!composer) build();
      const tr = EVO_TRACKS[opts.track] || EVO_TRACKS.A, th = THEMES[themeOf(opts.toId, opts.stage)] || THEMES.forest, stage = opts.stage || 'growth';
      T = {SUCK:2.0, SPACE:3.5, FAST:7.0, FLASH:tr.flash, REVEAL:tr.flash + 0.95, CARD:tr.card, LOGO:tr.logo, OUT:14.55, END:EVO_LEN, beat0:tr.beat0, beat:tr.beat};
      E = {t:0, t0:performance.now(), o:opts, th, stage, big:stage === 'ultimate', world:stage === 'perfect' || stage === 'ultimate', spin:0, swapped:false, cues:{}, red:!!opts.reduced, beatN:-1, pulse:0};
      // theme colours on everything
      const tm = tunnel.material.uniforms; tm.uDeep.value.set(th.deep); tm.uMid.value.set(th.mid); tm.uGlow.value.set(th.glow);
      const dm = dome.material.uniforms; dm.uDeep.value.set(th.deep); dm.uMid.value.set(th.mid); dm.uGlow.value.set(th.glow); dome.visible = E.world;
      scene.background.set(th.deep); pillar.material.uniforms.uCol.value.set(th.glow); floorCircle.material.color.set(th.acc); backCircle.material.color.set(th.ring[1]); backCircle2.material.color.set(th.ring[0]);
      rimA.color.set(th.ring[1]); rimB.color.set(th.acc); heroRays.material.color.set(th.glow);
      ribbons.forEach(r => r.m.material.uniforms.uCol.value.set(th.ring[r.k % 3]));
      waves.forEach((m, i) => m.material.color.set(th.ring[i % 3])); beatRings.forEach(b => b.m.material.color.set(th.acc));
      burst.material.color.set(th.glow); petals.material.color.set(th.acc);
      const sc = sparks.geometry.attributes.aC, pal = [...th.ring, th.glow].map(C); for (let i=0;i<sc.count;i++){ const c = pal[i % pal.length]; sc.setXYZ(i, c.r, c.g, c.b); } sc.needsUpdate = true;
      if (elems){ scene.remove(elems); elems.geometry.dispose(); elems.material.dispose(); }
      const glowK = !['leaf', 'petal', 'feather', 'shard', 'heart'].includes(th.part), nE = Math.round((mobile ? 0.5 : 1)*({growth:260, mature:420, perfect:520, ultimate:680}[stage] || 300));
      elems = particles(nE, ptex(th.part), th.pc.map(C), glowK, 1.2, stage === 'growth' ? 4.5 : 5.5, th.part === 'streak' ? 0.3 : 0.12, th.part === 'streak' ? 0.6 : 0.3); elems.position.y = 0.4; scene.add(elems);
      if (setPiece){ scene.remove(setPiece.g); setPiece = null; }
      const setK = (E.world || stage === 'mature') && FORM_SET[opts.toId]; if (setK && SETS[setK]){ setPiece = SETS[setK](th, E.big, mobile); scene.add(setPiece.g); }
      // DOM
      ui.style.setProperty('--acc', th.acc); ui.style.setProperty('--g', th.glow + '88'); ui.style.setProperty('--v1', th.glow); ui.style.setProperty('--v2', th.mid);
      const card = $u('.evcard'); card.className = 'evcard ' + stage;
      $u('.crest-slot').innerHTML = crestHTML(stage, th, opts.toName, opts.logoUrl);
      const nm = $u('.name'); nm.innerHTML = `<span>${opts.toName}</span>`;
      nm.firstChild.style.filter = stage === 'ultimate' ? Array.from({length:6}, () => 'drop-shadow(0 1.5px 0 #7a4410)').join(' ') + ' drop-shadow(0 6px 10px rgba(0,0,0,.5))' : '';   // (an extruded 3D logo)
      $u('.stage').textContent = opts.stageName || '';
      ui.hidden = false; document.body.classList.add('evo-on'); ui.classList.remove('card-on', 'logo-on'); ui.classList.toggle('red', E.red);
      for (const k of ['.focus', '.glow', '.vortex', '.flash']) $u(k).style.opacity = 0;
      $u('.skip').onclick = () => S.skip();
      const mb = $u('.mus'), sb = $u('.snd'), txt = () => { mb.textContent = opts.music && !opts.music.on ? '🎵✕' : '🎵'; sb.textContent = opts.sound && !opts.sound.on ? '🔇' : '🔊'; };
      mb.hidden = !opts.music; sb.hidden = !opts.sound; mb.onclick = () => { opts.music && opts.music.toggle(); txt(); }; sb.onclick = () => { opts.sound && opts.sound.toggle(); txt(); }; txt();
      bandLo.material.map = textBand(opts.fromName, '#ffffff'); bandHi.material.map = textBand(opts.fromName + ' ✦ EVOLUTION', th.glow);
      for (const m of [bandLo.material, bandHi.material]) m.needsUpdate = true;
      after.uniforms.damp.value = 0;
      cue('awaken');
    },
    skip(){ if (!E) return; if (!E.swapped){ E.swapped = true; E.o.onSwap && E.o.onSwap(); } cue('skip'); finish(); },
    hold:null,   // (testing: freeze the sequence at this time)
    update(dt){ if (!E) return; dt = Math.min(dt, 0.05);
      if (S.hold != null){ while (E.t < S.hold){ E.t += 0.03; step(E.t, 0.03); } E.t = S.hold; step(E.t, 0.016); return; }
      // the clock: the music's own when it is playing, otherwise real time; so it is always 15 real seconds, at any game speed or
      // frame rate (a slow frame is taken in small steps, never runs backwards)
      const c = E.o.clock && E.o.clock(), real = (performance.now() - E.t0)/1000;
      const nt = Math.max(E.t, c != null && Math.abs(c - real) < 0.6 ? c : real);
      for (let d = nt - E.t; d > 1e-4 && E; d -= 0.05){ const h = Math.min(0.05, d); E.t += h; step(E.t, h); }
      if (E && E.t >= T.END) finish(); },
    // the game camera during the opening close-up: 0..1 how close
    zoomIn(){ return E ? ss(0, 1.8, E.t) : 0; },
    render(){ placePet(); renderer.getSize(sz); if (!sz.equals(last) || renderer.getPixelRatio() !== lastPR) resize(); composer.render(); },
  };
  function cue(n){ if (!E || E.cues[n]) return; E.cues[n] = true; sound && sound.play && sound.play(n, E); }
  let saved = null;
  // the wombat's size on screen: its skinned body as the bones pose it (accessories, fur shells and effects left out); a model
  // without one (a stand-in) is measured from all its solid parts
  function petBox(p){
    const b = new THREE.Box3(), v = new THREE.Vector3(); p.updateMatrixWorld(true);
    let body = null; p.traverse(o => { if (!body && o.isSkinnedMesh && o.userData.kind === 'pet') body = o; });
    const add = (o, g) => { for (const c of [[g.min.x, g.min.y, g.min.z], [g.max.x, g.max.y, g.max.z], [g.min.x, g.max.y, g.max.z], [g.max.x, g.min.y, g.min.z]]) b.expandByPoint(v.set(...c).applyMatrix4(o.matrixWorld)); };
    if (body){ body.computeBoundingBox(); add(body, body.boundingBox); return b; }
    p.traverse(o => { if (!o.isMesh || !o.geometry || o.material.visible === false || o.material.transparent || o.material.opacity === 0) return; for (let x = o; x && x !== p; x = x.parent) if (!x.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); add(o, o.geometry.boundingBox); });
    return b; }
  function takePet(){ const p = E.o.pet; saved = {parent:p.parent, pos:p.position.clone(), rot:p.rotation.clone()}; p.parent && p.parent.remove(p); pivot.add(p);
    pivot.scale.setScalar(1); pivot.position.set(0, 0, 0); placePet();   // (measured here, without the game's own parent scale)
    const b = petBox(p); const h = Math.max(0.1, b.max.y - b.min.y); E.fit = 1.7/h; E.fitNow = E.fit; }
  function placePet(){ const p = E && E.o.pet; if (!p || p.parent !== pivot) return; p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); }
  function givePet(){ const p = E.o.pet; if (p.parent === pivot){ pivot.remove(p); saved.parent && saved.parent.add(p); p.position.copy(saved.pos); p.rotation.copy(saved.rot); } }
  function finish(){
    if (!E) return; const o = E.o;
    if (E.o.pet.parent === pivot) givePet();
    if (setPiece){ scene.remove(setPiece.g); setPiece = null; }
    pivot.rotation.set(0, 0, 0);
    o.setWhite && o.setWhite(0); ui.hidden = true; document.body.classList.remove('evo-on'); ui.classList.remove('card-on', 'logo-on'); E = null; o.onDone && o.onDone();
  }

  function step(t, dt){
    const o = E.o, th = E.th, mob = mobile ? 0.8 : 1, red = E.red;
    // the beat: which beat we are on and a 0..1 pulse that decays after it (lights and rings kick on it)
    const bi = Math.floor((t - T.beat0)/T.beat), since = t - (T.beat0 + bi*T.beat);
    if (bi !== E.beatN && t > T.beat0){ E.beatN = bi; if (t > T.SPACE && t < T.FLASH && bi % 2 === 0){ const r = beatRings[(bi/2) % beatRings.length | 0]; r.t0 = t; } }
    const build_ = ss(T.SPACE, T.FLASH, t), pulse = t > T.beat0 ? Math.pow(Math.max(0, 1 - since/0.32), 2)*(0.25 + 0.75*build_) : 0; E.pulse = pulse;
    // ---- shot 1 (0-2 s) in the game: the close-up, edges out of focus, the element's glow waking; then the vortex pulls it in
    $u('.focus').style.opacity = ss(0.1, 0.9, t)*(1 - ss(T.SUCK + 0.2, T.SUCK + 0.4, t));
    $u('.glow').style.opacity = (ss(0.3, 1.8, t)*(0.55 + 0.2*Math.sin(t*6)))*(1 - ss(T.SUCK + 0.2, T.SUCK + 0.4, t));
    const vx = t < T.SUCK ? 0 : t < T.SUCK + 0.3 ? ss(T.SUCK, T.SUCK + 0.3, t) : 1 - ss(T.SUCK + 0.3, T.SUCK + 0.7, t), vortex = $u('.vortex');   // (only the instant of being pulled in: the vortex itself is the 3D tunnel)
    vortex.style.opacity = vx*0.45; vortex.style.transform = `rotate(${(t - T.SUCK)*(red ? 60 : 320)}deg) scale(${lerp(0.2, 2.6, ss(T.SUCK, T.SUCK + 1.1, t))})`;
    if (t < T.SUCK){ o.setWhite && o.setWhite(ss(0.6, 1.9, t)*0.14*(0.7 + 0.3*Math.sin(t*7)), th.sil); }
    if (t >= T.SUCK) cue('portal');
    if (t >= T.SUCK + 0.35 && !E.took){ E.took = true; takePet(); }
    if (!E.took) return;
    // ---- the spin: slow from 3.5 s, faster to 7, a blur by the hit, braking after it and stopping to face the camera
    let w;
    if (t < T.SPACE) w = 0.3;
    else if (t < T.FAST) w = lerp(0.3, 2.2, ss(T.SPACE, T.FAST, t));
    else if (t < T.FLASH) w = 2.2 + Math.pow((t - T.FAST)/(T.FLASH - T.FAST), 2.1)*24;
    else if (t < T.REVEAL) w = 26*(1 - ss(T.FLASH, T.REVEAL, t)) + 1.5;
    else w = 0;
    if (red) w = Math.min(w, 2.2);
    E.spin += w*dt;
    const heroYaw = 0;   // (facing the camera)
    if (t >= T.REVEAL){ const tgt = Math.round((E.spin - heroYaw)/(Math.PI*2))*Math.PI*2 + heroYaw; E.spin += (tgt - E.spin)*Math.min(1, dt*3.4); }
    pivot.rotation.y = E.spin;
    pivot.rotation.x = t > T.REVEAL ? -0.1*ss(T.REVEAL, T.REVEAL + 0.8, t) : 0;   // (chin up: the hero pose)
    const lift = t < T.SPACE ? ss(T.SUCK + 0.4, T.SPACE, t)*0.55 : t < T.REVEAL ? 0.55 + Math.sin(t*2.4)*0.07 : lerp(0.55, 0.15, ss(T.REVEAL, T.CARD, t));
    pivot.position.y = lift;
    E.fitT = (E.fitT || 0) - dt; if (E.fitT <= 0){ E.fitT = 0.25; const b = petBox(o.pet); E.fit = (E.swapped ? 1.85 : 1.7)/Math.max(0.1, (b.max.y - b.min.y)/Math.max(1e-3, pivot.scale.y)); }   // (kept to the same size on screen, whatever its own scale does)
    const pop = t > T.REVEAL && t < T.REVEAL + 0.6 ? 1 + 0.08*Math.sin(ss(T.REVEAL, T.REVEAL + 0.6, t)*Math.PI) : 1;
    E.fitNow = lerp(E.fitNow, E.fit, Math.min(1, dt*4)); pivot.scale.setScalar(E.fitNow*pop);
    // ---- the body turns into a silhouette of its element as the charge builds, pure light at the hit, then the new form
    const white = t < T.FAST ? ss(T.SPACE, T.FAST, t)*0.15 : t < T.FLASH ? lerp(0.15, 0.62, Math.pow(ss(T.FAST, T.FLASH, t), 1.6)) : 1 - ss(T.FLASH + 0.3, T.REVEAL - 0.15, t);   // (the new form shows clearly by the time it starts to slow)
    o.setWhite && o.setWhite(white, th.sil);
    if (!E.swapped && t >= T.FLASH + 0.15){ E.swapped = true; o.onSwap && o.onSwap(); }
    // ---- where it is: the tunnel (2-3.5 s; growth and mature stay in a tunnel of their colours), then its own world
    const tm = tunnel.material.uniforms, outF = 1 - ss(T.OUT, T.END, t);
    E.scroll = (E.scroll || 0) + dt*(t < T.SPACE ? lerp(14, 1.2, ss(T.SUCK + 0.35, T.SPACE, t)) : t < T.FLASH ? 1.2 + w*0.12 : 0.6);
    tm.uScroll.value = E.scroll; tm.uTime.value = t; tm.uTwist.value = (t < T.SPACE ? lerp(red ? 2 : 6, 0.4, ss(T.SUCK + 0.35, T.SPACE, t)) : lerp(0.4, 2.6, ss(T.SPACE, T.FLASH, t))) - (t > T.REVEAL ? 1.6*ss(T.REVEAL, T.CARD, t) : 0);   // (pulled in down a twisting spiral)
    tm.uBright.value = (t < T.FLASH ? build_*1.4 : t < T.REVEAL ? 2.5 : 0.6) + pulse*0.5;
    const tunnelOn = ss(T.SUCK + 0.3, T.SUCK + 0.55, t)*(E.world ? 1 - ss(T.SPACE - 0.3, T.SPACE + 0.6, t) : 1);
    tm.uFade.value = tunnelOn*(t > T.REVEAL ? lerp(1, 0.55, ss(T.REVEAL, T.CARD, t)) : 1)*outF; tunnel.visible = tunnelOn > 0.001;
    if (E.world){ const du = dome.material.uniforms; du.uTime.value = t; du.uBright.value = build_ + pulse*0.6 + (t > T.FLASH ? 1 - ss(T.FLASH, T.CARD, t) : 0); du.uFade.value = ss(T.SPACE - 0.4, T.SPACE + 0.5, t)*outF; dome.visible = du.uFade.value > 0.001; }
    // ---- camera: the rush in, a slow orbit pushing closer as it charges, a kick back at the hit, the low hero angle
    let cp, look = new THREE.Vector3(0, 1.0, 0);
    if (t < T.SPACE){ const k = ss(T.SUCK + 0.35, T.SPACE, t); cp = new THREE.Vector3(0, lerp(1.4, 1.25, k), lerp(red ? 11 : 46, 6.6, 1 - Math.pow(1 - k, 3))); }
    else if (t < T.FLASH){ const a = Math.sin((t - T.SPACE)*0.45)*0.5, d = lerp(7.0, 5.8, ss(T.FAST - 1, T.FLASH, t)); cp = new THREE.Vector3(Math.sin(a)*d, lerp(1.25, 0.95, ss(T.FAST, T.FLASH, t)) + Math.sin(t*0.8)*0.08, Math.cos(a)*d); }
    else if (t < T.REVEAL){ const k = ss(T.FLASH, T.REVEAL, t), d = lerp(5.6, 6.8, k); cp = new THREE.Vector3(0, 1.1, d); }
    else { const k = ss(T.REVEAL, T.CARD, t), a = lerp(0.35, 0.12, k), d = lerp(6.0, 8.2, k) + ss(T.CARD, T.END, t)*0.4; cp = new THREE.Vector3(Math.sin(a)*d, lerp(0.55, 0.6, k), Math.cos(a)*d); look.y = lerp(1.2, -0.55, ss(T.REVEAL + 0.4, T.CARD + 0.3, t)); }
    const shake = (t > T.FAST && t < T.FLASH ? ss(T.FAST, T.FLASH, t)*0.05 : 0) + (t > T.FLASH && t < T.FLASH + 0.5 ? 0.2*(1 - (t - T.FLASH)/0.5) : 0) + pulse*0.015*build_;
    if (!red){ cp.x += (Math.random() - 0.5)*shake; cp.y += (Math.random() - 0.5)*shake; }
    cam.position.copy(cp); cam.lookAt(look); cam.fov = t < T.FLASH ? lerp(46, 40, ss(T.SPACE, T.FLASH, t)) : lerp(54, 42, ss(T.FLASH, T.CARD, t));
    if (cam.aspect < 1.3) cam.fov = Math.min(110, 2*Math.atan(Math.tan(cam.fov*Math.PI/360)*1.3/cam.aspect)*180/Math.PI);
    cam.updateProjectionMatrix();
    // ---- pillar, magic circles, ribbons, the hero's light rays
    const b0 = ss(T.SUCK + 0.6, T.SPACE + 0.4, t);
    pillar.material.uniforms.uTime.value = t; pillar.material.uniforms.uOp.value = (t < T.REVEAL ? b0*(0.7 + 0.6*ss(T.FAST, T.FLASH, t) + pulse*0.3) : 0.35*(1 - ss(T.REVEAL, T.CARD, t)))*outF;
    pillar.scale.set(1 + ss(T.FAST, T.FLASH, t)*0.15, 1, 1 + ss(T.FAST, T.FLASH, t)*0.15);
    floorCircle.rotation.z += dt*(0.3 + w*0.05); floorCircle.material.opacity = b0*(0.9 + pulse*0.3)*outF; floorCircle.scale.setScalar((E.world ? 1.5 : 1)*(0.6 + b0*0.4 + (t > T.FLASH ? ss(T.FLASH, T.REVEAL, t)*0.5 : 0)));
    backCircle.rotation.z -= dt*(0.15 + w*0.03); backCircle2.rotation.z += dt*(0.35 + w*0.06);
    const bc = ss(T.SPACE, T.FAST, t)*(t < T.REVEAL ? 1 : 0.55)*outF; backCircle.material.opacity = bc*(0.7 + pulse*0.3); backCircle2.material.opacity = bc*0.6;
    heroRays.material.opacity = ss(T.REVEAL - 0.2, T.REVEAL + 0.6, t)*(E.big ? 0.28 : 0.18)*outF; heroRays.rotation.z += dt*0.12;
    for (const r of ribbons){ const on = ss(T.SPACE + r.k*0.35, T.SPACE + r.k*0.35 + 0.5, t)*(t < T.REVEAL ? 1 : 1 - ss(T.REVEAL, T.CARD, t)*0.85)*outF; r.m.material.uniforms.uOp.value = on*(0.45 + pulse*0.25); r.m.rotation.z += dt*(1.2 + Math.min(w, 7)*0.45)*r.sp; }
    // ---- stardust and the element spiral in faster and faster, burst at the hit; drifting motes at the reveal
    for (const [pts, base, rot] of [[sparks, 0.42, 0], [elems, E.stage === 'growth' ? 0.55 : 0.65, 1]]){ const su = pts.material.uniforms; su.uTime.value = t; su.uSpin.value += dt*(0.4 + w*0.35); su.uRot.value = rot;
      su.uPull.value = ss(T.SPACE, T.FLASH, t)*(t < T.FLASH ? 1 : 1 - ss(T.FLASH, T.REVEAL, t));
      su.uBurst.value = t > T.FLASH ? ss(T.FLASH, T.FLASH + 0.8, t) : 0; su.uRise.value = t < T.REVEAL ? 0.4 + w*0.05 : 0.15;
      su.uOp.value = (pts === elems ? ss(T.SPACE - 0.3, T.FAST - 1, t) : ss(T.SUCK + 0.5, T.SPACE, t))*(t > T.FLASH + 0.8 ? 0.35 : base)*outF*mob*(1 + pulse*0.3);
      su.uScale.value = innerHeight*0.55*renderer.getPixelRatio(); }
    const pa = pg.attributes.position; for (let i=0;i<NP;i++){ let y = pa.getY(i) - pv[i]*dt; if (y < -1) y += 7; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(t*1.3 + i)*dt*0.2); } pa.needsUpdate = true;
    petals.material.opacity = ss(T.REVEAL, T.REVEAL + 0.6, t)*outF;
    // ---- the names circling while it charges
    bandLo.rotation.y += dt*(0.3 + w*0.08); bandHi.rotation.y -= dt*(0.22 + w*0.06);
    const bo = ss(T.SPACE, T.FAST, t)*(1 - ss(T.FLASH - 0.4, T.FLASH, t)); bandLo.material.opacity = bo*0.2; bandHi.material.opacity = bo*0.16;
    // ---- beat rings racing out along the floor; the burst, shockwaves and a single soft flash at the hit
    beatRings.forEach(b => { const k = clamp((t - b.t0)/0.9, 0, 1); b.m.visible = k > 0 && k < 1; b.m.scale.setScalar(1 + k*(E.world ? 16 : 10)); b.m.material.opacity = (1 - k)*0.55*(E.stage === 'growth' ? 0.6 : 1); });
    const fb = t < T.FAST ? 0 : t < T.FLASH ? ss(T.FAST + 1.2, T.FLASH, t)*0.25 : 1 - ss(T.FLASH + 0.15, T.REVEAL - 0.1, t);
    burst.material.opacity = fb; burst.material.rotation += dt*(0.4 + w*0.04); const bs = t < T.FLASH ? lerp(0.6, 2.2, ss(T.FAST, T.FLASH, t)) + pulse*0.25*build_ : lerp(3.2, 12, ss(T.FLASH, T.REVEAL, t));
    burst.scale.setScalar(bs);
    const nW = E.stage === 'growth' ? 2 : E.stage === 'mature' ? 3 : 4;
    waves.forEach((m, i) => { const t0 = T.FLASH + i*0.12, k = ss(t0, t0 + 0.8, t); m.visible = i < nW && t > t0; m.scale.setScalar(0.5 + k*(14 + i*5)*(E.big ? 1.3 : 1)); m.material.opacity = (1 - k)*0.9; m.lookAt(cam.position); });
    const fl = t < T.FLASH ? 0 : t < T.FLASH + 0.1 ? ss(T.FLASH, T.FLASH + 0.1, t) : 1 - ss(T.FLASH + 0.15, T.REVEAL - 0.2, t);   // (one flash, rising in 0.1 s and fading over most of a second: no strobing)
    $u('.flash').style.opacity = Math.max(fl*(red ? 0.35 : 0.85), 0);
    bloom.strength = ((t < T.FLASH ? lerp(0.4, 0.75, build_) : t < T.REVEAL ? lerp(1.9, 0.9, ss(T.FLASH + 0.2, T.REVEAL, t)) : lerp(0.9, 0.55, ss(T.REVEAL, T.CARD, t))) + pulse*0.18)*(mobile ? 0.85 : 1);
    after.uniforms.damp.value = red ? 0.2 : t < T.SPACE ? 0.6 : t < T.FLASH ? lerp(0.45, 0.66, ss(T.FAST, T.FLASH, t)) : t < T.REVEAL ? 0.45 : 0.15;
    if (setPiece) setPiece.update(t, T, w, pulse, dt, E.beatN, red);
    // ---- sound cues on the music's marks
    if (t >= T.SPACE) cue('spin'); if (t >= T.FAST) cue('charge'); if (t >= T.FLASH) cue('impact'); if (t >= T.REVEAL) cue('reveal'); if (t >= T.LOGO) cue('logo');
    // ---- the title card on the downbeat after 12 s, the crest / logo on the next hit, held, then home
    if (t >= T.CARD && !E.card){ E.card = true; ui.classList.add('card-on'); }
    if (t >= T.LOGO && !E.logo){ E.logo = true; ui.classList.add('logo-on'); }
    if (t >= T.OUT){ const k = ss(T.OUT, T.END, t); $u('.evcard').style.opacity = 1 - k; $u('.flash').style.opacity = 0; $u('.glow').style.opacity = k*0.9; $u('.glow').style.background = '#0b0618'; } else { $u('.evcard').style.opacity = ''; $u('.glow').style.background = ''; }
  }
  S._dbg = {get bloom(){ return bloom; }, get after(){ return after; }, pillar, sparks, ribbons, floorCircle, backCircle, backCircle2, burst, tunnel, dome, bandLo, bandHi, get setPiece(){ return setPiece; }, get elems(){ return elems; }};
  return S;
}
