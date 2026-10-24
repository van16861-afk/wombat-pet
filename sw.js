// Service worker: lets the game open offline and install to the home screen.
// - Game files (same origin): network first, so updates show up right away; cache when offline.
// - Libraries and fonts (versioned CDN URLs): cache first.
// - Firebase sign-in and database traffic is never cached.
const CACHE = 'wombat-v69';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/game.js', 'js/cloud.js', 'js/firebase-config.js', 'js/world.js', 'js/fauna.js', 'js/wildlife.js', 'js/ghibli.js',
  'manifest.webmanifest', 'assets/models/wombat.glb', 'assets/models/props.glb', 'assets/models/animals.glb', 'assets/models/trees.glb', 'assets/models/nature.glb', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const LIBS = ['https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js'];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/|www\.gstatic\.com\/firebasejs\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(LIBS.map(u => c.add(u).catch(() => {}))); // best effort; runtime caching fills gaps
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin){
    if (url.pathname.includes('/__/')) return; // Firebase auth helper pages
    e.respondWith(fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true}).then(r =>
      r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  } else if (CDN.test(req.url)){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
