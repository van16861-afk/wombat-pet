// The 27-form web of evolutions (data: js/evo27_config.js, from data/wombat_evolution_27_config.json).
// Pure logic, no drawing: the phase statistics the rules read (time-weighted averages and ratios, counted events, element
// leanings), the care calls and care mistakes, lifetime incidents, the rule evaluation (whitelisted comparisons over the JSON's
// all/any/metric/always tree - nothing is ever eval'd), the skills' effects with their cooldowns and per-game-day caps, and the
// save migration. Everything runs on game minutes, so 1x, 10x and 60x play out the same.
import { EVO_CONFIG, EVO_ASSETS } from './evo27_config.js';

export const CFG = EVO_CONFIG;
export const FORM27 = Object.fromEntries(CFG.forms.map(f => [f.id, f]));
export const FORM_IDS = CFG.forms.map(f => f.id);
export const ASSET27 = Object.fromEntries(EVO_ASSETS.map(a => [a.formId, a]));
// the 7 sheets added last are provisional (to be replaced by final high-resolution turnarounds)
export const PROVISIONAL = new Set(['g_good', 'm_warm', 'm_night', 'm_ember', 'p_stone', 'p_astral', 'p_shadow']);
export const STAGE27 = {growth:'成長期', mature:'成熟期', perfect:'完全體', ultimate:'究極體'};
// the game's own stage keys (kept so old saves load unchanged) and the spec's
export const GAME_STAGE = {child:'growth', adult:'mature', perfect:'perfect', ultimate:'ultimate'};
export const SPEC_TO_GAME = {growth:'child', mature:'adult', perfect:'perfect', ultimate:'ultimate'};
// how long each stage lasts once entered (game minutes); the baby stage covers 幼年期Ⅰ (5) + 幼年期Ⅱ (15)
export const STAGE_MIN = {baby:20, child:360, adult:2880, perfect:5760};
export const BABY1_MIN = 5, RECHECK_MIN = 360, AGING_MIN = CFG.time.aging_start_game_minutes;
export const EDGES = CFG.edges;
export const edgesFrom = id => EDGES.filter(e => e.from === id);
export const edgesTo = id => EDGES.filter(e => e.to === id);
// each form's element, for the tie-break (equal priority: the form whose element the wombat leans to more wins)
const FORM_AFF = {m_rock:'earth', p_stone:'earth', m_flower:'nature', p_forest:'nature', u_worldtree:'nature', g_naughty:'wind', m_energetic:'wind', p_wind:'wind', u_lightning:'wind',
  m_ember:'fire', p_flame:'fire', g_glutton:'fire', m_warm:'star', m_night:'star', p_frost:'star', p_astral:'star', u_sky:'star', u_holy:'star', p_shadow:'abyss', u_abyss:'abyss'};
const AFFS = ['earth', 'nature', 'wind', 'fire', 'star', 'abyss'];
// what each counted activity leans toward (scoring.actions_to_affinity)
const ACT_AFF = CFG.scoring.actions_to_affinity;   // dig, flower, chase, vigorous_play, regular_sleep, night_explore, care_bond_event
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- the condition language (whitelist only) ----------
const OPS = {'>=':(a, b) => a >= b, '<=':(a, b) => a <= b, '>':(a, b) => a > b, '<':(a, b) => a < b, '==':(a, b) => a === b};
export function test(w, M){
  if (!w || typeof w !== 'object') return false;
  if (w.always === true) return true;
  if (Array.isArray(w.all)) return w.all.every(x => test(x, M));
  if (Array.isArray(w.any)) return w.any.some(x => test(x, M));
  if (typeof w.metric === 'string'){ const f = OPS[w.op]; if (!f || !(w.metric in M)) return false; return f(+M[w.metric], +w.value); }
  return false;
}
// The decision: the current form's edges, eligible ones sorted by priority, then the leaning toward the target's element, then id.
// A fallback edge is used only when nothing else qualifies. Perfect forms have none: no match means it stays (and is rechecked).
export function decide(fromId, M){
  const out = edgesFrom(fromId); if (!out.length) return {eligible:false, from:fromId, to:null, reason:'no edges', priority:-1};
  const ok = out.filter(e => !e.fallback && test(e.when, M));
  ok.sort((a, b) => b.priority - a.priority || (M['aff_' + (FORM_AFF[b.to] || '')] || 0) - (M['aff_' + (FORM_AFF[a.to] || '')] || 0) || (a.to < b.to ? -1 : 1));
  const e = ok[0] || out.find(e => e.fallback);
  return e ? {eligible:true, from:fromId, to:e.to, reason:e.fallback ? 'fallback' : e.human_condition, priority:e.priority} : {eligible:false, from:fromId, to:null, reason:'no rule met', priority:-1};
}

// ---------- state ----------
const ZEROS = () => ({hunger:0, thirst:0, hygiene:0, mood:0, health:0, bond:0});
export function newPhase(carry){
  return {t:0, sum:ZEROS(), lowHunger:0, lowHyg:0, highSat:0, sick:0, sickRun:0, sickMax:0,
    ev:{feed:0, drink:0, clean:0, play:0, dig:0, flower:0, chase:0, heat:0, night:0, overfeed:0, med:0, sleepReg:0, bond:0},
    nights:0, slept:0, inNight:false, sleptThis:false, mistakes:0, carry:{...(carry || {})}};
}
export function newEvo(ageMin = 0){
  return {v:2, stageStart:ageMin, phase:newPhase(), life:{major:0, bond:0, inc:{}, recent:[]}, calls:{}, unlocked:[], history:[],
    cd:{}, fx:{}, daily:{day:-1}, trig:{}, recheckAt:null, last:{}, log:[], seed:Math.floor(Math.random()*1e9)};
}
export function logEvo(E, msg){ E.log.push(msg); if (E.log.length > 200) E.log.splice(0, E.log.length - 200); }

// One slice of game time (dt game minutes) with the wombat's current state `s` (0..100 values; sick, asleep, night flags).
// `real` is the real clock in ms (a missed call needs both 10 game minutes and 30 real seconds). `freeze` stops the phase clock
// (the 30-second grace before an evolution at high speed) while calls and incidents still run.
export function tick(E, dt, s, real, ageMin, freeze){
  const P = E.phase;
  if (!freeze && dt > 0){
    P.t += dt; for (const k in P.sum) P.sum[k] += (s[k] || 0)*dt;
    if (s.hunger < 35) P.lowHunger += dt; if (s.hygiene < 30) P.lowHyg += dt; if (s.hunger >= 80) P.highSat += dt;
    if (s.sick){ P.sick += dt; P.sickRun += dt; P.sickMax = Math.max(P.sickMax, P.sickRun); } else P.sickRun = 0;
  }
  // nights: each one counts once; sleeping at some point during it makes it a regular night's sleep (leans to the stars)
  if (s.night && !P.inNight){ P.inNight = true; P.sleptThis = false; P.nights++; }
  if (!s.night) P.inNight = false;
  if (s.night && s.asleep && !P.sleptThis){ P.sleptThis = true; P.slept++; P.ev.sleepReg++; }
  // care calls: one mistake per call at most, however long it goes unanswered
  const need = {hunger:s.hunger < 25, thirst:s.thirst < 25, health:s.health < 35, sleep:s.energy < 15 && !s.asleep};
  for (const k in need){
    const c = E.calls[k];
    if (!need[k]){ if (c) delete E.calls[k]; continue; }
    if (!c){ E.calls[k] = {g:0, r:real, done:false}; continue; }
    c.g += dt;
    if (!c.done && c.g >= CFG.anti_abuse.missed_call_grace_game_minutes && real - c.r >= CFG.anti_abuse.missed_call_min_real_seconds*1000){ c.done = true; P.mistakes++; E.life.recent.push(ageMin); logEvo(E, `mistake:${k}@${Math.round(ageMin)}`); }
  }
  E.life.recent = E.life.recent.filter(a => ageMin - a < 1440);
  // lifetime incidents (major mistakes): each continuous incident once
  const inc = E.life.inc, rules = [['sick', s.sick, 180], ['zeroHunger', s.hunger <= 0, 120], ['zeroThirst', s.thirst <= 0, 120], ['critical', s.health <= 10, 60]];
  let fresh = 0;
  for (const [k, on, lim] of rules){ const r = inc[k] || (inc[k] = {m:0, done:false});
    if (!on){ r.m = 0; r.done = false; continue; }
    r.m += dt; if (!r.done && r.m >= lim){ r.done = true; E.life.major++; fresh++; logEvo(E, `major:${k}@${Math.round(ageMin)}`); } }
  return fresh;   // (new major incidents this tick)
}
// A counted interaction. Repeats of one kind within 5 real seconds don't count (no tap farming); returns whether it counted.
export function event(E, type, real, n = 1){
  const gap = CFG.anti_abuse.per_action_event_cooldown_real_seconds*1000;
  if (E.last[type] != null && real - E.last[type] < gap) return false;
  E.last[type] = real; E.phase.ev[type] = (E.phase.ev[type] || 0) + n; return true;
}

// ---------- the numbers the rules read ----------
export function metrics(E){
  const P = E.phase, T = P.t || 0, avg = k => T > 0 ? P.sum[k]/T : 0, r = x => T > 0 ? x/T : 0, ev = P.ev;
  const plays = ev.play, inter = ev.feed + ev.drink + ev.clean + ev.play + ev.med, share = (a, b) => b > 0 ? a/b : 0;
  const M = {avg_hunger:avg('hunger'), avg_thirst:avg('thirst'), avg_hygiene:avg('hygiene'), avg_mood:avg('mood'), avg_health:avg('health'), avg_bond:avg('bond'),
    hunger_low_ratio:r(P.lowHunger), hygiene_low_ratio:r(P.lowHyg), sick_untreated_ratio:r(P.sick), untreated_sick_minutes:P.sickMax, high_satiety_ratio:r(P.highSat),
    overfeeds:ev.overfeed, play_sessions:plays, play_share:share(plays, inter), dig_sessions:ev.dig, dig_share:share(ev.dig, plays), flower_sessions:ev.flower, flower_share:share(ev.flower, plays),
    heat_play_sessions:ev.heat, heat_play_share:share(ev.heat, plays), night_explore_sessions:ev.night, sleep_routine_ratio:share(P.slept, P.nights),
    care_mistakes:P.mistakes, major_mistakes_lifetime:E.life.major, bond_event_count:E.life.bond};
  M.care_score = clamp(0.16*M.avg_hunger + 0.11*M.avg_thirst + 0.15*M.avg_hygiene + 0.13*M.avg_mood + 0.20*M.avg_health + 0.15*M.avg_bond + 0.10*M.sleep_routine_ratio*100, 0, 100);
  // element leanings: this phase's share of activities (in %) blended with last phase's final score
  const tags = {earth:0, nature:0, wind:0, fire:0, star:0, abyss:0}, add = (act, n) => (ACT_AFF[act] || []).forEach(a => tags[a] += n);
  add('dig', ev.dig); add('flower', ev.flower); add('chase', ev.chase); add('vigorous_play', ev.heat); add('regular_sleep', ev.sleepReg); add('night_explore', ev.night); add('care_bond_event', ev.bond);
  const denom = plays + ev.sleepReg + ev.bond;
  for (const a of AFFS) M['aff_' + a] = clamp(0.25*(P.carry[a] || 0) + 0.75*(denom > 0 ? tags[a]/denom*100 : 0), 0, 100);
  return M;
}
// close a phase: the leanings carry into the next one as its seed
export function closePhase(E, ageMin){ const M = metrics(E), carry = Object.fromEntries(AFFS.map(a => [a, M['aff_' + a]])); E.phase = newPhase(carry); E.stageStart = ageMin; E.recheckAt = null; return M; }

// ---------- skills ----------
export const skillOf = id => (FORM27[id] || {}).skill || null;
// passive effects only: an active skill's numbers describe what it does when used (game.js / useSkill), not an always-on bonus
const fx = id => { const s = skillOf(id); return s && s.type === 'passive' ? s.effects || {} : {}; };
export const gameDay = ageMin => Math.floor(ageMin/1440);
function dayReset(E, ageMin){ const d = gameDay(ageMin); if (E.daily.day !== d) E.daily = {day:d}; return E.daily; }
// a passive multiplier (or 1); active boosts and the star shield stack on top
export function mult(E, id, key, ageMin){
  let v = fx(id)[key]; v = typeof v === 'number' ? v : 1;
  if (key.endsWith('_decay_multiplier') && E.fx.shield && E.fx.shield.until > ageMin) v *= E.fx.shield.k;
  return v;
}
// capped coin/mood rewards: per game day (so 60x can't farm them) and per-trigger cooldowns in game minutes
export function dailyTake(E, key, cap, ageMin){ const D = dayReset(E, ageMin); if ((D[key] || 0) >= cap) return false; D[key] = (D[key] || 0) + 1; return true; }
export function trigOK(E, key, coolMin, ageMin){ if (E.trig[key] != null && ageMin < E.trig[key]) return false; E.trig[key] = ageMin + coolMin; return true; }
export function cooldownLeft(E, id, ageMin){ const u = E.cd[id]; return u && u > ageMin ? u - ageMin : 0; }
// using an active skill: returns the effects to apply (game.js applies them to the stats), or null if it is cooling down
export function useSkill(E, id, ageMin){
  const sk = skillOf(id); if (!sk || sk.type !== 'active') return null;
  if (cooldownLeft(E, id, ageMin) > 0) return null;
  E.cd[id] = ageMin + (sk.cooldown_game_minutes || 0);
  const ef = sk.effects;
  if (ef.next_play_count) E.fx.play = {n:ef.next_play_count, mood:ef.play_mood_multiplier || 1, hunger:ef.play_hunger_cost_multiplier || 1, vfx:ef.vfx};
  if (ef.duration_game_minutes) E.fx.shield = {until:ageMin + ef.duration_game_minutes, k:ef.needs_decay_multiplier || 1};
  logEvo(E, `skill:${id}@${Math.round(ageMin)}`);
  return ef;
}
// a play just finished: the mood and hunger factors for it (passives, then a pending boost from an active skill, used up)
export function playFactors(E, id, {heat = false, night = false} = {}, ageMin){
  const f = fx(id); let mood = f.play_mood_multiplier || 1, hunger = f.play_hunger_cost_multiplier || 1;
  if (heat){ mood *= f.active_play_mood_multiplier || 1; hunger *= f.active_play_hunger_cost_multiplier || 1; }
  if (night) mood *= f.night_play_mood_multiplier || 1;
  if (E.fx.play && E.fx.play.n > 0){ mood *= E.fx.play.mood; hunger *= E.fx.play.hunger; if (--E.fx.play.n <= 0) delete E.fx.play; }
  return {mood, hunger};
}

// ---------- the life timeline ----------
export const stageEnd = (stage, E) => STAGE_MIN[stage] != null ? E.stageStart + STAGE_MIN[stage] : Infinity;
export const babySub = (E, ageMin) => ageMin - E.stageStart < BABY1_MIN ? 'baby1' : 'baby2';

// ---------- save migration (schema 1 -> 2) ----------
// Old forms map onto the new web by stage; nothing about the pet is reset. Old stages used cumulative ages (20 / 360 / 2880 / 5760
// minutes); the new ones count from entering the stage, so time already spent in the current stage is kept.
const OLD_AT = {baby:0, child:20, adult:360, perfect:2880, ultimate:5760};
const OLD_FORM = {
  child:{skinny:'g_skinny', sickly:'g_sick', chubby:'g_glutton', sporty:'g_naughty', stinky:'g_good', normal:'g_good'},
  adult:{skinny:'m_warm', sickly:'m_warm', stinky:'m_stinky', chubby:'m_chubby', sporty:'m_energetic', normal:'m_warm'},
  perfect:{royal:'p_royal', forest:'p_forest', wind:'p_wind', golden:'p_royal', forestx:'p_forest', thunder:'p_wind', sickly:'p_frost', skinny:'p_frost', stinky:'p_stone', chubby:'p_stone', sporty:'p_wind', normal:'p_frost'},
  ultimate:{golden:'u_gold', forestx:'u_worldtree', thunder:'u_lightning', royal:'u_gold', forest:'u_worldtree', wind:'u_lightning', normal:'u_sky', sporty:'u_lightning', chubby:'u_sky', skinny:'u_sky', sickly:'u_sky', stinky:'u_abyss'}};
export const OLD_SEEN = {skinny:'g_skinny', sickly:'g_sick', stinky:'m_stinky', chubby:'m_chubby', sporty:'m_energetic', royal:'p_royal', forest:'p_forest', wind:'p_wind', golden:'u_gold', forestx:'u_worldtree', thunder:'u_lightning'};
export function migrateSave(S, ageMin){
  if (S.evo && S.evo.v >= 2) return false;
  const E = newEvo(ageMin);
  if (OLD_FORM[S.stage]) S.form = OLD_FORM[S.stage][S.form] || OLD_FORM[S.stage].normal;
  else if (S.stage === 'baby' || S.stage === 'egg') S.form = 'normal';
  if (OLD_AT[S.stage] != null) E.stageStart = Math.min(ageMin, Math.max(OLD_AT[S.stage], 0));   // time already spent in this stage counts
  if (FORM27[S.form]) E.unlocked.push(S.form);
  for (const [o, n] of Object.entries(S.formsSeen || {})) if (OLD_SEEN[o] && !E.unlocked.includes(OLD_SEEN[o])) E.unlocked.push(OLD_SEEN[o]);
  S.evo = E; return true;
}
