// Google sign-in + cloud save (Firebase Auth + Firestore).
// The SDK is imported lazily so the game still starts when offline.
//
// One document per player: saves/{uid} = {save: JSON string, rev, deviceId, lastSeen, ...}.
// Every write bumps `rev`. A device "claims" the save when it starts; if another device
// writes after that, this device gets a 'takeover' event and stops saving, so two open
// copies never overwrite each other.
import { firebaseConfig } from './firebase-config.js';

const CDN = 'https://www.gstatic.com/firebasejs/11.0.2/';
const PUSH_EVERY = 30000;
const DEVICE = (() => {
  try {
    let d = localStorage.getItem('wombat-device');
    if (!d){ d = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('wombat-device', d); }
    return d;
  } catch(e){ return 'tmp-' + Math.random().toString(36).slice(2); }
})();

let fb = null, auth = null, db = null;
// myRev: undefined = never checked against the cloud (started offline),
//        null = checked and there was no cloud save, number = last rev we wrote or accepted.
let myRev, baseline = 0, claimed = false, forceNext = false, busy = false, again = null, lastPush = 0, unwatch = null;
const listeners = {};
const emit = (ev, x) => (listeners[ev] || []).forEach(f => f(x));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const ref = () => fb.doc(db, 'saves', auth.currentUser.uid);
class Takeover extends Error { constructor(reason){ super(reason); this.reason = reason; } }

function setStatus(s){ cloud.status = s; emit('change'); }
function stop(){ claimed = false; if (unwatch){ unwatch(); unwatch = null; } }
function watch(){
  if (unwatch) unwatch();
  unwatch = fb.onSnapshot(ref(), snap => {
    if (!snap.exists() || !claimed) return;
    const d = snap.data();
    if (d.deviceId !== DEVICE && myRev !== undefined && (d.rev || 0) > (myRev || 0)){ stop(); emit('takeover', 'device'); }
  }, () => {});
}

export const cloud = {
  available: false, user: null, status: 'idle', lastSync: 0,
  on(ev, f){ (listeners[ev] ||= []).push(f); },

  // Resolves {user, remote, checked}. `checked` is false when the cloud could not be reached.
  async init(ms){
    const out = {user:null, remote:null, checked:false};
    try {
      const [app, a, f] = await withTimeout(Promise.all(
        ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(m => import(CDN + m))), ms);
      fb = {...a, ...f};
      const inst = app.initializeApp(firebaseConfig);
      auth = a.getAuth(inst); db = f.getFirestore(inst);
      cloud.available = true;
      out.user = cloud.user = await withTimeout(new Promise(res => { const off = a.onAuthStateChanged(auth, u => { off(); res(u); }); }), ms);
      a.onAuthStateChanged(auth, u => { cloud.user = u; if (!u){ stop(); cloud.status = 'idle'; } emit('change'); });
      if (out.user){ out.remote = await withTimeout(cloud.fetch(), ms); out.checked = true; }
    } catch(e){ console.warn('[cloud] init:', e); }
    return out;
  },

  async fetch(){
    const snap = await fb.getDoc(ref());
    if (!snap.exists()) return null;
    const d = snap.data();
    let save = null; try { save = JSON.parse(d.save); } catch(e){}
    return {save, rev: d.rev || 0, deviceId: d.deviceId, lastSeen: d.lastSeen || 0};
  },

  // Returns the user, or null when it fell back to a full-page redirect.
  async signIn(){
    const p = new fb.GoogleAuthProvider();
    p.setCustomParameters({prompt: 'select_account'});
    try { const r = await fb.signInWithPopup(auth, p); cloud.user = r.user; emit('change'); return r.user; }
    catch(e){
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment'){ await fb.signInWithRedirect(auth, p); return null; }
      throw e;
    }
  },

  async signOut(){ stop(); await fb.signOut(auth); },

  // Start syncing `S` to the cloud. knownRev is the cloud rev this device has seen
  // (see myRev). force = overwrite the cloud even if it changed (used after importing a save code).
  claim(S, knownRev, force){
    if (!cloud.user) return;
    myRev = knownRev; baseline = S.lastSeen || 0; claimed = true; forceNext = !!force;
    watch(); cloud.push(S);
  },

  // Called on every local save; uploads at most every PUSH_EVERY ms unless forced.
  save(S, force){
    if (!claimed || !auth || !auth.currentUser) return;
    if (force || Date.now() - lastPush >= PUSH_EVERY) cloud.push(S);
  },

  async push(S){
    if (!claimed || !auth.currentUser) return;
    if (busy){ again = S; return; }
    busy = true; setStatus('saving');
    const json = JSON.stringify(S), meta = {name: S.name || '', stage: S.stage, coins: S.coins, lastSeen: S.lastSeen || Date.now()};
    try {
      const rev = await withTimeout(fb.runTransaction(db, async tx => {
        const snap = await tx.get(ref()), d = snap.exists() ? snap.data() : null;
        if (d && d.rev !== myRev && d.deviceId !== DEVICE && !forceNext){
          if (myRev !== undefined) throw new Takeover('device');
          if ((d.lastSeen || 0) > baseline) throw new Takeover('newer');
        }
        const next = (d && d.rev || 0) + 1;
        tx.set(ref(), {save: json, rev: next, deviceId: DEVICE, updatedAt: fb.serverTimestamp(), ...meta});
        return next;
      }), 15000);
      myRev = rev; forceNext = false; lastPush = cloud.lastSync = Date.now();
      setStatus('synced'); emit('synced');
    } catch(e){
      lastPush = Date.now(); // wait a full interval before retrying
      if (e instanceof Takeover){ stop(); setStatus('idle'); emit('takeover', e.reason); }
      else { console.warn('[cloud] push:', e); setStatus(navigator.onLine === false || e.message === 'timeout' || e.code === 'unavailable' ? 'offline' : 'error'); }
    } finally {
      busy = false;
      if (again && claimed){ const s = again; again = null; cloud.push(s); }
    }
  }
};
