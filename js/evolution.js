// The evolution sequence (數碼寶貝-style, re-imagined as a fairy-tale dream space): about 8.6 seconds, skippable.
//   0.0-1.0  shot 1  the game camera rushes in on the wombat, the screen trembles, golden motes rise   (sfx: start chime)
//   1.0-1.4          a gold-white wipe pulls it into the evolution space                                  (sfx: whoosh)
//   1.4-2.4  shot 2  flying down a dream tunnel (violet nebula, rune glyphs spiralling to a bright core); the wombat
//                    rises in a pillar of light over a magic circle                                       (BGM starts)
//   2.4-3.6  shot 3  it starts to turn, slowly: light ribbons orbit, sparkles spiral in, its name circles in bands
//   3.6-5.0  shot 4  the turn speeds up (ease-in), motion trails, crystals, more rings, brighter, the camera shakes (riser)
//   5.0-5.6  shot 5  white-out: a starburst at the centre, shockwaves, crystals burst outward; the form changes  (boom)
//   5.6-6.9  shot 6  the new form slows to a stop at a 3/4 hero angle, its new name huge behind it, gold petals fall
//   6.9-8.2  shot 7  the title card: 「進化完成」 small, the form's name big, in a gold frame with a sweep of light (reveal)
//   8.2-8.6  shot 8  fade back to the game
// Uses the game's own wombat (moved into this scene for the length of the sequence) and the game's WebGL renderer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

const T_IN = 1.0, T_SPACE = 1.4, T_SPIN = 2.4, T_FAST = 3.6, T_FLASH = 5.0, T_REVEAL = 5.6, T_CARD = 6.9, T_OUT = 8.2, T_END = 8.6;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a)*t;
const ss = (a, b, t) => { const x = clamp((t - a)/(b - a), 0, 1); return x*x*(3 - 2*x); };
const rnd = (a, b) => a + Math.random()*(b - a);

// ---------- textures, drawn once ----------
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; }
const GLYPHS = ['✦', '✧', '★', '☆', '❀', '✿', '☾', '♡', '✶', '❋', '✺', '❁', '✾', '❖', '♢', '✵'];
function glyphAtlas(){   // 8×8 cells of fairy runes (white on clear)
  return canvasTex(512, 512, (x, w) => { x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i=0;i<64;i++){ const cx = (i % 8)*64 + 32, cy = Math.floor(i/8)*64 + 32;
      if (i % 5 === 4){ x.beginPath(); x.arc(cx, cy + 8, 13, 0, 7); x.fill(); for (let k=0;k<4;k++){ x.beginPath(); x.arc(cx - 15 + k*10, cy - 12 + Math.abs(k - 1.5)*5, 6, 0, 7); x.fill(); } }   // paw prints
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
const starTex = () => canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); x.fillStyle = '#fff'; for (const r of [0, Math.PI/2]){ x.save(); x.translate(64, 64); x.rotate(r); x.beginPath(); x.moveTo(-62, 0); x.quadraticCurveTo(0, -4, 62, 0); x.quadraticCurveTo(0, 4, -62, 0); x.fill(); x.restore(); } });
const burstTex = () => canvasTex(1024, 1024, (x, w) => { const c = w/2; x.translate(c, c);
  for (let i=0;i<90;i++){ const a = Math.random()*Math.PI*2, L = rnd(200, 500), wd = rnd(0.004, 0.02); const g = x.createLinearGradient(0, 0, Math.cos(a)*L, Math.sin(a)*L); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a - wd)*L, Math.sin(a - wd)*L); x.lineTo(Math.cos(a + wd)*L, Math.sin(a + wd)*L); x.fill(); }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 260); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 260, 0, 7); x.fill(); });
const ringTex = () => canvasTex(512, 512, (x) => { const g = x.createRadialGradient(256, 256, 150, 256, 256, 256); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); });
function textBand(text, color){   // a strip of repeated name text, wrapped round a cylinder (the 數碼寶貝 name typography)
  const t = canvasTex(4096, 160, (x, w, h) => { x.font = 'bold 116px "Huninn","Microsoft JhengHei",sans-serif'; x.textBaseline = 'middle'; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 18;
    const unit = `${text}  ✦  `, uw = x.measureText(unit).width; for (let px = 0; px < w; px += uw) x.fillText(unit, px, h/2 + 6); });
  t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- shaders ----------
const NOISE = `float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i=0;i<4;i++){ s += a*vn(p); p *= 2.03; a *= 0.5; } return s; }`;
function tunnelMat(glyphs){
  return new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, uniforms:{uTime:{value:0}, uScroll:{value:0}, uTwist:{value:0}, uGlyphs:{value:glyphs}, uBright:{value:0}, uFade:{value:0}},
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader:`uniform float uTime, uScroll, uTwist, uBright, uFade; uniform sampler2D uGlyphs; varying vec2 vUv; ${NOISE}
      void main(){
        float depth = 1.0 - vUv.y;                                  // 1 at the far end, where the light is
        vec2 p = vec2(vUv.x + vUv.y*uTwist + uTime*0.03, vUv.y*14.0 - uScroll);
        vec3 base = mix(vec3(0.07, 0.03, 0.16), vec3(0.32, 0.12, 0.42), fbm(vec2(p.x*6.0, p.y*0.5)));
        base += vec3(0.55, 0.32, 0.12)*pow(fbm(vec2(p.x*4.0 + 3.0, p.y*0.35)), 3.0)*1.6;   // warm gold drifts
        vec2 g = vec2(p.x*24.0, p.y*1.6), cell = floor(g), f = fract(g); float hh = h21(cell);
        float gl = 0.0; if (hh > 0.5){ float idx = floor(h21(cell + 7.1)*64.0); vec2 at = (vec2(mod(idx, 8.0), 7.0 - floor(idx/8.0)) + f)/8.0; gl = texture2D(uGlyphs, at).a; }
        vec3 gc = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.55, 0.85), h21(cell + 3.3));
        float streak = pow(abs(sin((p.x*3.14159*36.0))), 60.0)*0.5*smoothstep(0.2, 1.0, depth);
        vec3 col = base + gc*gl*(0.6 + uBright) + vec3(1.0, 0.9, 0.7)*streak;
        col += vec3(1.0, 0.86, 0.6)*pow(depth, 6.0)*(1.6 + uBright*2.0);   // the bright core ahead
        gl_FragColor = vec4(col*uFade, 1.0);
      }`});
}
const additive = (extra) => ({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, ...extra});
function pillarMat(){
  return new THREE.ShaderMaterial(additive({side:THREE.DoubleSide, uniforms:{uTime:{value:0}, uOp:{value:0}, uCol:{value:new THREE.Color('#ffe2a0')}},
    vertexShader:`varying vec2 vUv; varying float vFacing; void main(){ vUv = uv; vec3 n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vFacing = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform float uTime, uOp; uniform vec3 uCol; varying vec2 vUv; varying float vFacing; ${NOISE}
      void main(){ float s = 0.6 + 0.4*vn(vec2(vUv.x*40.0, vUv.y*6.0 - uTime*3.0)); float a = (pow(1.0 - vFacing, 2.0)*0.9 + 0.06)*s*smoothstep(0.0, 0.15, vUv.y)*smoothstep(1.0, 0.5, vUv.y);   // (a glowing tube: bright at its edges, clear in the middle)
        gl_FragColor = vec4(uCol*a*uOp*0.3, 1.0); }`}));
}
function ribbonMat(col){
  return new THREE.ShaderMaterial(additive({side:THREE.DoubleSide, uniforms:{uOp:{value:0}, uCol:{value:new THREE.Color(col)}},
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader:`uniform float uOp; uniform vec3 uCol; varying vec2 vUv; void main(){ float a = pow(vUv.x, 2.2)*(1.0 - abs(vUv.y*2.0 - 1.0)); gl_FragColor = vec4(mix(uCol, vec3(1.0), pow(vUv.x, 8.0))*a*uOp*1.6, 1.0); }`}));
}
function sparkMat(tex){
  return new THREE.ShaderMaterial(additive({uniforms:{uTex:{value:tex}, uTime:{value:0}, uSpin:{value:0}, uPull:{value:0}, uBurst:{value:0}, uRise:{value:0.4}, uOp:{value:0}, uScale:{value:300}},
    vertexShader:`attribute float aR, aA, aH, aS, aSize; attribute vec3 aC; uniform float uTime, uSpin, uPull, uBurst, uRise, uScale; varying vec3 vC; varying float vTw;
      void main(){ float a = aA + uSpin*aS; float r = aR*(1.0 - uPull*0.65) + uBurst*aR*4.0*aS; float h = mod(aH + uTime*uRise*aS, 7.0) - 2.5 + uBurst*(aH - 3.5)*0.8;
        vec4 mv = modelViewMatrix*vec4(cos(a)*r, h, sin(a)*r, 1.0); vC = aC; vTw = 0.6 + 0.4*sin(uTime*8.0*aS + aA*10.0);
        gl_PointSize = aSize*uScale/max(0.5, -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform sampler2D uTex; uniform float uOp; varying vec3 vC; varying float vTw; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC*t.a*uOp*vTw, 1.0); }`}));
}

export function createEvolution({renderer, mobile, sound}){
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0618');
  const cam = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.05, 400);
  const LI = Math.PI;
  scene.add(new THREE.HemisphereLight('#fff4e0', '#5a3a7a', 0.85*LI));
  const key = new THREE.DirectionalLight('#ffe9c4', 1.1*LI); key.position.set(2, 4, 5); scene.add(key);
  const rimA = new THREE.PointLight('#c48cff', 18, 12, 1.4); rimA.position.set(-2.5, 2.4, -2.2); scene.add(rimA);
  const rimB = new THREE.PointLight('#ffcf7a', 18, 12, 1.4); rimB.position.set(2.6, 1.6, -2.0); scene.add(rimB);
  const glyphs = glyphAtlas(), tStar = starTex(), tBurst = burstTex(), tRing = ringTex(), tCircle = [magicCircle(0), magicCircle(1)];

  // the dream tunnel, along -Z
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 140, 64, 1, true), tunnelMat(glyphs)); tunnel.rotation.x = Math.PI/2; tunnel.position.z = -30; scene.add(tunnel);
  // the stage: pivot (the wombat turns and lifts on it), pillar, magic circles, ribbons, sparks, crystals, name bands, burst, shockwaves
  const pivot = new THREE.Group(); scene.add(pivot);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 26, 48, 1, true), pillarMat()); pillar.position.y = 10; scene.add(pillar);
  const circleMat = (tex, col) => new THREE.MeshBasicMaterial(additive({map:tex, color:col, opacity:0, side:THREE.DoubleSide}));
  const floorCircle = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), circleMat(tCircle[0], '#ffd27a')); floorCircle.rotation.x = -Math.PI/2; floorCircle.position.y = -0.4; scene.add(floorCircle);
  const backCircle = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), circleMat(tCircle[1], '#c890ff')); backCircle.position.set(0, 1.0, -2.6); scene.add(backCircle);
  const backCircle2 = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), circleMat(tCircle[0], '#ffb3dc')); backCircle2.position.set(0, 1.0, -2.4); scene.add(backCircle2);
  const ribbons = [];
  for (let i=0;i<7;i++){ const col = ['#ffd06a', '#c78bff', '#ff9ccf', '#fff2c8'][i % 4], m = new THREE.Mesh(new THREE.TorusGeometry(rnd(1.25, 1.9), 0.045, 6, 140, Math.PI*rnd(1.1, 1.6)), ribbonMat(col));
    const g = new THREE.Group(); g.rotation.set(rnd(-1.1, 1.1), rnd(0, 6.28), rnd(-0.6, 0.6)); g.position.y = 1.0; g.add(m); scene.add(g); ribbons.push({g, m, sp:rnd(0.8, 1.6)*(i % 2 ? 1 : -1), on:i < 3 ? T_SPIN : T_FAST + (i - 3)*0.25}); }
  const N = mobile ? 900 : 2000, geo = new THREE.BufferGeometry(), A = k => new Float32Array(N*k);
  const aR = A(1), aA = A(1), aH = A(1), aS = A(1), aSize = A(1), aC = A(3), pos0 = A(3);
  const PAL = ['#ffd36e', '#ffe9b0', '#c98cff', '#ff9fd2', '#fff7e6'].map(c => new THREE.Color(c));
  for (let i=0;i<N;i++){ aR[i] = rnd(0.9, 4.2); aA[i] = rnd(0, 6.28); aH[i] = rnd(0, 7); aS[i] = rnd(0.5, 1.5); aSize[i] = rnd(0.025, 0.09); const c = PAL[i % PAL.length]; aC.set([c.r, c.g, c.b], i*3); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos0, 3));
  for (const [n, a, k] of [['aR', aR, 1], ['aA', aA, 1], ['aH', aH, 1], ['aS', aS, 1], ['aSize', aSize, 1], ['aC', aC, 3]]) geo.setAttribute(n, new THREE.BufferAttribute(a, k));
  const sparks = new THREE.Points(geo, sparkMat(tStar)); sparks.frustumCulled = false; sparks.position.y = 0.6; scene.add(sparks);
  // gold petals drifting down at the reveal
  const NP = mobile ? 160 : 320, pg = new THREE.BufferGeometry(), pp = new Float32Array(NP*3), pv = [];
  for (let i=0;i<NP;i++){ pp.set([rnd(-5, 5), rnd(-1, 6), rnd(-4, 2)], i*3); pv.push(rnd(0.3, 0.8)); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const petals = new THREE.Points(pg, new THREE.PointsMaterial(additive({map:tStar, color:'#ffd88a', size:0.16, opacity:0}))); petals.frustumCulled = false; scene.add(petals);
  const crystals = [];
  for (let i=0;i<(mobile ? 14 : 24);i++){ const m = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.08, 0.2), 0), new THREE.MeshBasicMaterial(additive({color:['#e8b8ff', '#ffd27a', '#ff9fd0', '#bfe3ff'][i % 4], opacity:0})));
    m.scale.y = 1.8; scene.add(m); crystals.push({m, r:rnd(1.6, 3.4), a:rnd(0, 6.28), h:rnd(-0.2, 2.6), sp:rnd(0.6, 1.4), out:0}); }
  const bandMat = tex => new THREE.MeshBasicMaterial(additive({map:tex, opacity:0, side:THREE.DoubleSide}));
  const bandLo = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.62, 96, 1, true), bandMat(null)); bandLo.position.y = 0.15; scene.add(bandLo);
  const bandHi = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.9, 96, 1, true), bandMat(null)); bandHi.position.y = 2.25; scene.add(bandHi);
  const bigName = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2), bandMat(null)); bigName.position.set(0, 1.2, -3.6); scene.add(bigName);
  const burst = new THREE.Sprite(new THREE.SpriteMaterial(additive({map:tBurst, color:'#fff6e0', opacity:0}))); burst.position.y = 1.0; scene.add(burst);
  const waves = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(additive({map:tRing, color:['#fff3c8', '#e2b4ff', '#ffc6e4'][i], opacity:0, side:THREE.DoubleSide})));
    m.position.y = 1.0; scene.add(m); return m; });

  // post: glow (bloom) and motion trails (afterimage)
  let composer = null, bloom = null, after = null;
  function build(){
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {type:THREE.HalfFloatType}));
    composer.addPass(new RenderPass(scene, cam));
    after = new AfterimagePass(0); composer.addPass(after);
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth/2, innerHeight/2), 0.6, 0.55, 0.72); composer.addPass(bloom);
    resize();
  }
  const sz = new THREE.Vector2(), last = new THREE.Vector2(-1, -1); let lastPR = 0;
  function resize(){   // (follows the renderer's own size: the game resizes it after the window changes)
    renderer.getSize(sz); const pr = renderer.getPixelRatio(); last.copy(sz); lastPR = pr;
    cam.aspect = sz.x/Math.max(1, sz.y); cam.updateProjectionMatrix();
    if (composer){ composer.setPixelRatio(pr); composer.setSize(sz.x, sz.y); bloom.resolution.set(sz.x/2, sz.y/2); } }
  addEventListener('resize', resize);

  // DOM: the input shield, the wipe, the flash, the title card, the skip button
  const css = document.createElement('style'); css.textContent = `
    body.evo-on > :not(#evoUI):not(canvas){visibility:hidden!important}
    #evoUI{position:fixed;inset:0;z-index:30;pointer-events:auto;touch-action:none;font-family:"Huninn","Microsoft JhengHei",sans-serif}
    #evoUI .wipe,#evoUI .flash{position:absolute;inset:0;pointer-events:none;opacity:0}
    #evoUI .wipe{background:radial-gradient(circle at 50% 48%,#fffdf5 0%,#ffe7a8 35%,#c890ff 75%,#2a1450 100%)}
    #evoUI .flash{background:#fff}
    #evoUI .skip{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));padding:9px 16px;border-radius:999px;border:1px solid rgba(255,230,170,.6);
      background:rgba(30,12,60,.55);color:#ffeec8;font:inherit;font-size:15px;letter-spacing:.1em;backdrop-filter:blur(4px);cursor:pointer}
    #evoUI .card{position:absolute;left:50%;bottom:11%;transform:translateX(-50%);text-align:center;opacity:0;pointer-events:none;width:min(92vw,620px)}
    #evoUI .frame{position:relative;padding:18px 28px 20px;border-radius:22px;background:linear-gradient(180deg,rgba(60,26,110,.82),rgba(26,10,56,.88));
      border:2px solid #f3cf7a;box-shadow:0 0 0 4px rgba(243,207,122,.25),0 0 40px rgba(255,200,110,.55),inset 0 0 22px rgba(255,214,140,.35);overflow:hidden}
    #evoUI .frame::before,#evoUI .frame::after{content:"✦";position:absolute;top:50%;transform:translateY(-50%);color:#ffe3a0;font-size:26px;text-shadow:0 0 10px #ffd27a}
    #evoUI .frame::before{left:10px} #evoUI .frame::after{right:10px}
    #evoUI .crown{position:absolute;left:50%;top:-34px;transform:translateX(-50%);font-size:40px;filter:drop-shadow(0 0 10px #ffd27a)}
    #evoUI .sub{color:#fff3d6;font-size:clamp(16px,3.6vw,24px);letter-spacing:.5em;margin:0 0 4px;text-shadow:0 0 12px #ffcf7a;opacity:0}
    #evoUI .name{margin:0;font-size:clamp(40px,10vw,76px);letter-spacing:.12em;line-height:1.15;font-weight:900;filter:drop-shadow(0 0 14px rgba(255,205,110,.9));opacity:0;transform:scale(1.8)}
    #evoUI .name span{background:linear-gradient(180deg,#fffbe6 0%,#ffe08a 45%,#e2a43a 72%,#fff2c4 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.2px #8a5418}
    #evoUI .stage{color:#e8d4ff;font-size:clamp(13px,2.8vw,17px);letter-spacing:.3em;margin-top:6px;opacity:0}
    #evoUI .shine{position:absolute;top:0;bottom:0;width:30%;left:-40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-18deg)}
    #evoUI.card-on .card{opacity:1;transition:opacity .25s}
    #evoUI.card-on .sub{animation:evoFade .45s ease-out forwards}
    #evoUI.card-on .name{animation:evoPop .6s cubic-bezier(.2,1.6,.4,1) .2s forwards}
    #evoUI.card-on .stage{animation:evoFade .5s ease-out .55s forwards}
    #evoUI.card-on .shine{animation:evoShine 1s ease-in-out .7s forwards}
    @keyframes evoFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes evoPop{0%{opacity:0;transform:scale(1.8)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}
    @keyframes evoShine{to{left:120%}}`;
  document.head.appendChild(css);
  const ui = document.createElement('div'); ui.id = 'evoUI'; ui.hidden = true;
  ui.innerHTML = `<div class="wipe"></div><div class="card"><div class="frame"><div class="crown"></div><p class="sub">進化完成</p><h2 class="name"></h2><p class="stage"></p><div class="shine"></div></div></div><div class="flash"></div><button class="skip" type="button">跳過 ▸▸</button>`;
  document.body.appendChild(ui);
  const $u = s => ui.querySelector(s);

  let E = null;   // the running sequence
  const S = {
    get active(){ return !!E; },
    get t(){ return E ? E.t : 0; },
    get inScene(){ return !!E && E.t >= T_SPACE - 0.2 && E.t < T_END - 0.15; },   // (before that the game scene is shown, being zoomed into)
    // opts: {pet, petParent, fromName, toName, stageName, icon, setWhite(v), onSwap(), onDone(), glow}
    start(opts){
      if (E) return; if (!composer) build();
      E = {t:0, o:opts, spin:0, swapped:false, done:false, cues:{}, shake:0};
      $u('.name').innerHTML = `<span>${opts.toName}</span>`; $u('.stage').textContent = opts.stageName || ''; $u('.crown').textContent = opts.icon || '👑';
      ui.hidden = false; document.body.classList.add('evo-on'); ui.classList.remove('card-on'); $u('.wipe').style.opacity = 0; $u('.flash').style.opacity = 0;
      $u('.skip').onclick = () => S.skip();
      bandLo.material.map = textBand(opts.fromName, '#ffffff'); bandHi.material.map = textBand(opts.fromName + ' ✦ EVOLUTION', '#ffe8b0'); bigName.material.map = textBand(opts.toName, '#ffd27a');
      for (const m of [bandLo.material, bandHi.material, bigName.material]) m.needsUpdate = true;
      bigName.material.map.repeat.x = 0.25;
      after.uniforms.damp.value = 0;
      sound && sound.preload && sound.preload();
      cue('start');
    },
    skip(){ if (!E) return; if (!E.swapped){ E.swapped = true; E.o.onSwap && E.o.onSwap(); } finish(); },
    hold:null,   // (testing: freeze the sequence at this time)
    update(dt){ if (!E) return; if (S.hold != null){ while (E.t < S.hold) { E.t += 0.03; step(E.t, 0.03); } E.t = S.hold; step(E.t, 0.016); return; } E.t += Math.min(dt, 0.05); step(E.t, Math.min(dt, 0.05)); if (E && E.t >= T_END) finish(); },
    // the game asks where to hold its camera during shot 1 (rushing in on the wombat): returns 0..1 how close
    zoomIn(){ return E ? ss(0, T_IN, E.t) : 0; },
    render(){ placePet(); renderer.getSize(sz); if (!sz.equals(last) || renderer.getPixelRatio() !== lastPR) resize(); composer.render(); },
  };
  function cue(n){ if (!E || E.cues[n]) return; E.cues[n] = true; sound && sound.play && sound.play(n, E); }
  let saved = null;
  function petBox(p){   // the wombat's visible skin only (its invisible tap areas would make it look bigger than it is)
    const b = new THREE.Box3(), v = new THREE.Vector3(); p.updateMatrixWorld(true);
    p.traverse(o => { if (!o.isMesh || !o.geometry || o.material.visible === false || o.material.opacity === 0) return; let x = o; while (x && x !== p){ if (!x.visible) return; x = x.parent; }
      o.geometry.computeBoundingBox(); const g = o.geometry.boundingBox; for (const c of [[g.min.x, g.min.y, g.min.z], [g.max.x, g.max.y, g.max.z], [g.min.x, g.max.y, g.max.z], [g.max.x, g.min.y, g.min.z]]) b.expandByPoint(v.set(...c).applyMatrix4(o.matrixWorld)); });
    return b; }
  function takePet(){ const p = E.o.pet; saved = {parent:p.parent, pos:p.position.clone(), rot:p.rotation.clone()}; p.parent && p.parent.remove(p); pivot.add(p);
    const b = petBox(p); const h = Math.max(0.3, b.max.y - b.min.y); E.fit = 1.7/h; E.fitNow = E.fit; }
  function placePet(){ const p = E && E.o.pet; if (!p || p.parent !== pivot) return; p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); }
  function givePet(){ const p = E.o.pet; if (p.parent === pivot){ pivot.remove(p); saved.parent && saved.parent.add(p); p.position.copy(saved.pos); p.rotation.copy(saved.rot); } }
  function finish(){
    if (!E) return; const o = E.o;
    if (E.o.pet.parent === pivot) givePet();
    o.setWhite && o.setWhite(0); ui.hidden = true; document.body.classList.remove('evo-on'); ui.classList.remove('card-on'); E = null; o.onDone && o.onDone();
  }

  function step(t, dt){
    const o = E.o, mob = mobile ? 0.8 : 1;
    // ---- shot 1 in the game scene; the wipe covers the cut into the dream space
    const wipe = t < T_IN ? 0 : t < T_IN + 0.25 ? ss(T_IN, T_IN + 0.25, t) : 1 - ss(T_SPACE, T_SPACE + 0.5, t);
    $u('.wipe').style.opacity = t > T_SPACE + 0.6 ? 0 : wipe;
    if (t >= T_IN && !E.cues.whoosh) cue('whoosh');
    if (t >= T_SPACE - 0.2 && !E.took){ E.took = true; takePet(); cue('bgm'); }
    if (!E.took) return;
    const tm = tunnel.material.uniforms;
    // ---- the spin: slow float, then an ease-in acceleration to a blur, braking hard at the flash, settling 3/4 at the reveal
    let w;
    if (t < T_SPIN) w = 0.25;
    else if (t < T_FAST) w = lerp(0.25, 1.4, ss(T_SPIN, T_FAST, t));
    else if (t < T_FLASH) w = 1.4 + Math.pow((t - T_FAST)/(T_FLASH - T_FAST), 2.2)*24;
    else if (t < T_REVEAL) w = 26*(1 - ss(T_FLASH, T_REVEAL, t)) + 2;
    else w = 0;
    E.spin += w*dt;
    const heroYaw = -0.08;   // (the camera sits at +0.42: a slight 3/4 turn toward it)
    if (t >= T_REVEAL){ const tgt = Math.round((E.spin - heroYaw)/(Math.PI*2))*Math.PI*2 + heroYaw; E.spin += (tgt - E.spin)*Math.min(1, dt*3.2); }
    pivot.rotation.y = E.spin;
    const lift = t < T_SPIN ? ss(T_SPACE, T_SPIN, t)*0.55 : t < T_REVEAL ? 0.55 + Math.sin(t*2.4)*0.07 : lerp(0.55, 0.15, ss(T_REVEAL, T_CARD, t));
    pivot.position.y = lift;
    if (E.swapped && !E.refit){ E.refit = true; const p = o.pet; const b = petBox(p); E.fit = 1.85/Math.max(0.3, (b.max.y - b.min.y)/pivot.scale.y); }
    E.fitNow = lerp(E.fitNow, E.fit, Math.min(1, dt*4)); pivot.scale.setScalar(E.fitNow);
    // ---- the white-out on the wombat itself (the fur turns to light, a silhouette, then the new form)
    const white = t < T_FAST ? ss(T_SPIN, T_FAST, t)*0.12 : t < T_FLASH ? lerp(0.12, 0.45, Math.pow(ss(T_FAST, T_FLASH, t), 2)) : t < T_REVEAL ? 1 : 1 - ss(T_REVEAL, T_REVEAL + 0.7, t);   // (a silhouette of light only at the flash)
    o.setWhite && o.setWhite(white);
    if (!E.swapped && t >= T_FLASH + 0.2){ E.swapped = true; o.onSwap && o.onSwap(); }
    // ---- the tunnel: flying in fast, then drifting; glyphs twist harder as the spin builds
    E.scroll = (E.scroll || 0) + dt*(t < T_SPIN ? lerp(9, 1.2, ss(T_SPACE, T_SPIN, t)) : t < T_FLASH ? 1.2 + w*0.12 : 0.6);
    tm.uScroll.value = E.scroll; tm.uTime.value = t; tm.uTwist.value = lerp(0.4, 2.6, ss(T_SPIN, T_FLASH, t)) - (t > T_REVEAL ? 1.6*ss(T_REVEAL, T_CARD, t) : 0);
    tm.uBright.value = t < T_FLASH ? ss(T_SPIN, T_FLASH, t)*1.4 : t < T_REVEAL ? 2.5 : 0.6;
    tm.uFade.value = ss(T_SPACE - 0.2, T_SPACE + 0.4, t)*(t > T_REVEAL ? lerp(1, 0.55, ss(T_REVEAL, T_CARD, t)) : 1)*(1 - ss(T_OUT, T_END, t));
    // ---- camera: the rush down the tunnel, a slow orbit, shaking as it builds, then the low hero angle
    let cp, look = new THREE.Vector3(0, 1.0, 0);
    if (t < T_SPIN){ const k = ss(T_SPACE - 0.2, T_SPIN, t); cp = new THREE.Vector3(0, lerp(1.4, 1.25, k), lerp(46, 6.4, 1 - Math.pow(1 - k, 3))); }
    else if (t < T_REVEAL){ const a = Math.sin((t - T_SPIN)*0.5)*0.35, d = lerp(6.4, 5.2, ss(T_SPIN, T_FLASH, t)); cp = new THREE.Vector3(Math.sin(a)*d, 1.25 + Math.sin(t*0.8)*0.1, Math.cos(a)*d); }
    else { const k = ss(T_REVEAL, T_CARD, t), d = lerp(6.4, 7.8, k) - ss(T_CARD, T_OUT, t)*0.3; cp = new THREE.Vector3(Math.sin(0.42)*d, lerp(1.3, 0.8, k), Math.cos(0.42)*d); look.y = lerp(1.0, 0.05, k); }   // (low and a little below it: the wombat stands above the title card)
    const shake = (t > T_FAST && t < T_FLASH ? ss(T_FAST, T_FLASH, t)*0.06 : 0) + (t > T_FLASH && t < T_FLASH + 0.5 ? 0.22*(1 - (t - T_FLASH)/0.5) : 0) + (t < T_IN ? 0 : 0);
    cp.x += (Math.random() - 0.5)*shake; cp.y += (Math.random() - 0.5)*shake;
    cam.position.copy(cp); cam.lookAt(look); cam.fov = t < T_FLASH ? lerp(46, 38, ss(T_SPIN, T_FLASH, t)) : lerp(52, 40, ss(T_FLASH, T_CARD, t)); cam.updateProjectionMatrix();
    // ---- pillar, circles, ribbons
    const build_ = ss(T_SPACE, T_SPIN + 0.4, t), outF = 1 - ss(T_OUT, T_END, t);
    pillar.material.uniforms.uTime.value = t; pillar.material.uniforms.uOp.value = (t < T_REVEAL ? build_*(0.7 + 0.6*ss(T_FAST, T_FLASH, t)) : 0.35*(1 - ss(T_REVEAL, T_CARD, t)))*outF;
    pillar.scale.set(1 + ss(T_FAST, T_FLASH, t)*0.15, 1, 1 + ss(T_FAST, T_FLASH, t)*0.15);
    floorCircle.rotation.z += dt*(0.3 + w*0.05); floorCircle.material.opacity = build_*0.9*outF; floorCircle.scale.setScalar(0.6 + build_*0.4 + (t > T_FLASH ? ss(T_FLASH, T_REVEAL, t)*0.5 : 0));
    backCircle.rotation.z -= dt*(0.15 + w*0.03); backCircle2.rotation.z += dt*(0.35 + w*0.06);
    const bc = ss(T_SPIN, T_FAST, t)*(t < T_REVEAL ? 1 : 0.55)*outF; backCircle.material.opacity = bc*0.7; backCircle2.material.opacity = bc*0.6;
    for (const r of ribbons){ const on = ss(r.on, r.on + 0.5, t)*(t < T_REVEAL ? 1 : 1 - ss(T_REVEAL, T_CARD, t)*0.85)*outF; r.m.material.uniforms.uOp.value = on*0.6; r.m.rotation.z += dt*(1.2 + Math.min(w, 7)*0.45)*r.sp; }   // (capped: faster, the trails would fill a solid disc)
    // ---- sparks spiral in faster and faster, burst at the flash; petals at the reveal; crystals orbit and fly out
    const su = sparks.material.uniforms; su.uTime.value = t; su.uSpin.value += dt*(0.4 + w*0.35); su.uPull.value = ss(T_SPIN, T_FLASH, t)*(t < T_FLASH ? 1 : 1 - ss(T_FLASH, T_REVEAL, t));
    su.uBurst.value = t > T_FLASH ? ss(T_FLASH, T_FLASH + 0.8, t) : 0; su.uRise.value = t < T_REVEAL ? 0.4 + w*0.05 : 0.15; su.uOp.value = ss(T_SPACE, T_SPIN, t)*(t > T_FLASH + 0.8 ? 0.35 : 0.6)*outF*mob;
    su.uScale.value = innerHeight*0.55*renderer.getPixelRatio();
    const pa = pg.attributes.position; for (let i=0;i<NP;i++){ let y = pa.getY(i) - pv[i]*dt; if (y < -1) y += 7; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(t*1.3 + i)*dt*0.2); } pa.needsUpdate = true;
    petals.material.opacity = ss(T_REVEAL, T_REVEAL + 0.6, t)*outF;
    for (const c of crystals){ c.a += dt*c.sp*(0.5 + w*0.3); if (t > T_FLASH) c.out += dt*9*(1 - c.out/8);
      const r = c.r*(t < T_FLASH ? lerp(1, 0.7, ss(T_FAST, T_FLASH, t)) : 1) + c.out; c.m.position.set(Math.cos(c.a)*r, c.h + (t > T_FLASH ? c.out*0.15 : 0), Math.sin(c.a)*r); c.m.rotation.y += dt*3; c.m.rotation.x += dt*2;
      c.m.material.opacity = ss(T_FAST - 0.4, T_FAST + 0.4, t)*(1 - ss(T_FLASH + 0.2, T_REVEAL + 0.4, t)); }
    // ---- the names: the old name circling while it charges; the new name huge behind it at the reveal
    bandLo.rotation.y += dt*(0.3 + w*0.08); bandHi.rotation.y -= dt*(0.22 + w*0.06);
    const bo = ss(T_SPIN, T_FAST, t)*(1 - ss(T_FLASH - 0.3, T_FLASH, t)); bandLo.material.opacity = bo*0.38; bandHi.material.opacity = bo*0.28;
    bigName.material.map.offset.x += dt*0.03; bigName.material.opacity = ss(T_REVEAL + 0.2, T_CARD, t)*0.45*outF;
    // ---- the burst: a starburst at the centre swelling to white, shockwaves racing out
    const fb = t < T_FAST ? 0 : t < T_FLASH ? ss(T_FAST + 0.6, T_FLASH, t)*0.45 : t < T_REVEAL ? 1 : 1 - ss(T_REVEAL, T_REVEAL + 0.8, t);
    burst.material.opacity = fb; burst.material.rotation += dt*(0.4 + w*0.04); const bs = t < T_FLASH ? lerp(0.6, 2.2, ss(T_FAST, T_FLASH, t)) + Math.sin(t*30)*0.12*ss(T_FAST, T_FLASH, t) : lerp(3.2, 12, ss(T_FLASH, T_REVEAL, t));
    burst.scale.setScalar(bs); burst.material.color.set(t < T_FLASH ? '#ffe6b0' : '#ffffff');
    waves.forEach((m, i) => { const t0 = T_FLASH + i*0.12, k = ss(t0, t0 + 0.75, t); m.visible = t > t0; m.scale.setScalar(0.5 + k*(14 + i*5)); m.material.opacity = (1 - k)*0.9; m.lookAt(cam.position); });
    // ---- full-screen flash, glow and trails
    const fl = t < T_FLASH ? 0 : t < T_FLASH + 0.12 ? ss(T_FLASH, T_FLASH + 0.12, t) : 1 - ss(T_FLASH + 0.2, T_REVEAL + 0.15, t);
    $u('.flash').style.opacity = Math.max(fl*0.95, ss(T_OUT, T_END, t)*0.0);
    bloom.strength = (t < T_FLASH ? lerp(0.45, 0.9, ss(T_SPIN, T_FLASH, t)) : t < T_REVEAL ? 2.2 : lerp(1.2, 0.6, ss(T_REVEAL, T_CARD, t)))*(mobile ? 0.85 : 1);
    after.uniforms.damp.value = t < T_SPIN ? 0.6 : t < T_FLASH ? lerp(0.5, 0.74, ss(T_FAST, T_FLASH, t)) : t < T_REVEAL ? 0.5 : 0.15;
    // ---- sound cues on the beats
    if (t >= T_SPIN) cue('spin'); if (t >= T_FAST) cue('charge'); if (t >= T_FLASH) cue('flash'); if (t >= T_REVEAL) cue('reveal'); if (t >= T_CARD) cue('card');
    // ---- the title card, and the fade home
    if (t >= T_CARD && !E.card){ E.card = true; ui.classList.add('card-on'); }
    if (t >= T_OUT){ const k = ss(T_OUT, T_END, t); $u('.card').style.opacity = 1 - k; $u('.wipe').style.opacity = k*0.9; } else $u('.card').style.opacity = '';
  }
  S._dbg = {get bloom(){ return bloom; }, get after(){ return after; }, pillar, sparks, ribbons, floorCircle, backCircle, backCircle2, burst, tunnel, bandLo, bandHi};
  return S;
}
