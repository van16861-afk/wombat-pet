// "Ghibli" art style: a painted sky dome with drifting cumulus clouds, plus one post-processing pass that
// turns the render into something like a watercolour background painting: soft painterly smoothing (a small
// Kuwahara filter), warm highlights with cool blue-green shade, a bit more colour, faint ink edges and paper grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i=0; i<5; i++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }`;

// --- sky: zenith-to-horizon gradient + big soft cumulus with sunlit tops and lavender-grey bellies ---
const skyMat = new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0}, uZenith:{value:new THREE.Color()}, uHorizon:{value:new THREE.Color()}, uCloud:{value:new THREE.Color()}, uShade:{value:new THREE.Color()},
    uCover:{value:0.5}, uSun:{value:new THREE.Vector3(0, 1, 0)}, uGlow:{value:new THREE.Color()}, uNight:{value:0}},
  vertexShader:`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader:NOISE + `
    uniform float uTime, uCover, uNight; uniform vec3 uZenith, uHorizon, uCloud, uShade, uSun, uGlow; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir); float h = max(d.y, 0.0);
      vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.4, h), 0.8));
      float sd = max(dot(d, normalize(uSun)), 0.0); col += uGlow*(pow(sd, 6.0)*0.35 + pow(sd, 64.0)*0.4);   // warm glow around the sun
      // clouds: project onto a high flat layer, so they bunch up and shrink toward the horizon like real cumulus
      vec2 uv = d.xz/(d.y + 0.18)*0.85 + vec2(uTime*0.006, uTime*0.0025);
      float n = fbm(uv), body = smoothstep(1.0 - uCover, 1.0 - uCover + 0.1, n);
      float lit = clamp((n - fbm(uv + normalize(uSun.xz + 0.001)*0.09))*6.0 + 0.55, 0.0, 1.0);   // the side facing the sun is bright
      vec3 cc = mix(uShade, uCloud, lit); cc = mix(cc, uCloud*1.06, smoothstep(0.75, 1.0, n)*0.5);
      float a = body*smoothstep(0.0, 0.05, d.y)*(1.0 - uNight*0.75);
      col = mix(col, cc, a);
      gl_FragColor = vec4(col, 1.0);
    }`,
  side:THREE.BackSide, depthWrite:false, depthTest:false, fog:false,
});

// --- the painting pass ---
const PaintShader = {
  uniforms:{tDiffuse:{value:null}, tDepth:{value:null}, uRes:{value:new THREE.Vector2(1, 1)}, uAmt:{value:0.75}, uNight:{value:0}, uTime:{value:0}, uCover:{value:0.5},
    uInvProj:{value:new THREE.Matrix4()}, uCamWorld:{value:new THREE.Matrix4()}},
  vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
  fragmentShader:NOISE + `
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uAmt, uNight, uTime, uCover; uniform mat4 uInvProj, uCamWorld; varying vec2 vUv;
    vec3 tx(vec2 o){ return texture2D(tDiffuse, vUv + o/uRes).rgb; }
    void main(){
      vec3 src = tx(vec2(0));
      // Kuwahara (radius 2): take the mean of whichever of the four quadrants is flattest -> flat painted patches, kept edges
      vec3 m[4]; vec3 s[4];
      for (int k=0;k<4;k++){ m[k] = vec3(0); s[k] = vec3(0); }
      for (int j=-2;j<=2;j++) for (int i=-2;i<=2;i++){
        vec3 c = tx(vec2(i, j)), c2 = c*c;
        if (i <= 0 && j <= 0){ m[0] += c; s[0] += c2; } if (i >= 0 && j <= 0){ m[1] += c; s[1] += c2; }
        if (i <= 0 && j >= 0){ m[2] += c; s[2] += c2; } if (i >= 0 && j >= 0){ m[3] += c; s[3] += c2; } }
      vec3 paint = src; float best = 1e9;
      for (int k=0;k<4;k++){ vec3 mu = m[k]/9.0, v = abs(s[k]/9.0 - mu*mu); float sv = v.r + v.g + v.b; if (sv < best){ best = sv; paint = mu; } }
      vec3 c = mix(src, paint, uAmt);
      // faint ink edges where the brightness changes sharply
      float l0 = dot(tx(vec2(-1, 0)), vec3(0.33)) - dot(tx(vec2(1, 0)), vec3(0.33)), l1 = dot(tx(vec2(0, -1)), vec3(0.33)) - dot(tx(vec2(0, 1)), vec3(0.33));
      c *= 1.0 - smoothstep(0.08, 0.35, length(vec2(l0, l1)))*0.22;
      // soft cloud shadows drifting across the land (world position rebuilt from the depth buffer)
      float z = texture2D(tDepth, vUv).x;
      if (z < 0.9999){ vec4 vp = uInvProj*vec4(vUv*2.0 - 1.0, z*2.0 - 1.0, 1.0); vp /= vp.w; vec3 wp = (uCamWorld*vp).xyz;
        float cs = smoothstep(0.5 - uCover*0.25, 0.68 - uCover*0.25, fbm(wp.xz*0.03 + vec2(uTime*0.05, uTime*0.02)));
        c *= mix(vec3(1.0), vec3(0.8, 0.86, 0.98), cs*(1.0 - uNight)); }
      // grading: cool blue-green shade, warm sunny highlights, richer colour
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c*vec3(0.84, 0.95, 1.12), (1.0 - smoothstep(0.05, 0.6, lum))*0.55*(1.0 - uNight*0.5));
      c += vec3(0.05, 0.03, -0.015)*smoothstep(0.45, 1.0, lum)*(1.0 - uNight);
      c = pow(c, vec3(1.12));                                   // deeper mid-tones (the game's own colours are pale)
      c = mix(c, c*c*(3.0 - 2.0*c), 0.3);                         // gentle S-curve for painted contrast
      float g = max(c.g - max(c.r, c.b), 0.0); c.r += g*0.18; c.b += g*0.12; c.g -= g*0.12;   // tame neon greens toward soft sap/olive greens
      lum = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(lum), c, 1.06);
      // watercolour paper: low-frequency blotches plus fine grain
      vec2 px = vUv*uRes;
      c *= 0.975 + 0.035*fbm(px/90.0) + 0.02*(h21(px) - 0.5);
      // soft vignette
      vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q)*0.35;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createGhibli({renderer, scene, camera, mobile}){
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -100; sky.visible = false; scene.add(sky);
  let composer = null, paint = null, bloom = null, on = false;
  function build(){
    const rt = new THREE.WebGLRenderTarget(1, 1, {type:THREE.HalfFloatType}); rt.depthTexture = new THREE.DepthTexture(1, 1);
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (!mobile){ bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.6, 0.86); composer.addPass(bloom); }
    paint = new ShaderPass(PaintShader); composer.addPass(paint);
    const base = paint.render.bind(paint);   // the depth texture lives on whichever buffer the scene was just drawn into
    paint.render = (r, wb, rb, dt, mask) => { const U = paint.uniforms; U.tDepth.value = rb.depthTexture; U.uInvProj.value.copy(camera.projectionMatrixInverse); U.uCamWorld.value.copy(camera.matrixWorld); base(r, wb, rb, dt, mask); };
    resize();
  }
  function resize(){
    if (!composer) return;
    const pr = renderer.getPixelRatio(), w = innerWidth, h = innerHeight;
    composer.setPixelRatio(pr); composer.setSize(w, h); paint.uniforms.uRes.value.set(w*pr, h*pr);
    if (bloom) bloom.resolution.set(w/2, h/2);
  }
  addEventListener('resize', resize);
  const c = new THREE.Color(), mix = (a, b, t) => c.set(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).clone();
  return {
    get on(){ return on; },
    set(v){ on = !!v; sky.visible = on; if (on && !composer) build(); },
    // sky colours from the time of day and weather; returns the horizon colour (used for the fog)
    update(dt, {night = 0, dusk = 0, grey = 0, sunDir, holiday}){
      const U = skyMat.uniforms; U.uTime.value += dt;
      let zen = mix('#3d86d6', '#0b1430', night), hor = mix('#cfe7ef', '#1c2742', night);
      zen = zen.lerp(new THREE.Color('#6c79b8'), dusk*0.55); hor = hor.lerp(new THREE.Color('#f4b98c'), dusk*0.7);
      zen.lerp(new THREE.Color('#8b95a0'), grey*(1 - night*0.6)); hor.lerp(new THREE.Color('#b9c0c4'), grey*(1 - night*0.6));
      if (holiday) hor.lerp(new THREE.Color(holiday[0]), holiday[1]*0.5);
      U.uZenith.value.copy(zen); U.uHorizon.value.copy(hor);
      U.uCloud.value.copy(mix('#ffffff', '#3a4560', night)).lerp(new THREE.Color('#ffd9b8'), dusk*0.6).lerp(new THREE.Color('#d6dade'), grey);
      U.uShade.value.copy(mix('#a9b4d6', '#1e2638', night)).lerp(new THREE.Color('#b48aa8'), dusk*0.5).lerp(new THREE.Color('#8a9098'), grey);
      U.uGlow.value.copy(mix('#fff1c8', '#000000', night)).lerp(new THREE.Color('#ffa060'), dusk);
      U.uCover.value = 0.52 + grey*0.35; U.uNight.value = night;
      if (sunDir) U.uSun.value.copy(sunDir);
      sky.position.copy(camera.position);
      if (paint){ paint.uniforms.uNight.value = night; paint.uniforms.uTime.value = U.uTime.value; paint.uniforms.uCover.value = 0.4 + grey*0.6; }
      return hor;
    },
    render(){ composer.render(); },
  };
}
