// Tests for js/evo27.js (the spec's list, run by tools/evo-test.html and the in-game test panel). Each returns {name, ok, info}.
import * as X from './evo27.js';

const ORDER = ['egg', 'baby1', 'baby2', 'growth', 'mature', 'perfect', 'ultimate'];
const stageOf = id => (X.FORM27[id] || {}).stage || id;
// a plain, unremarkable phase: middling averages, nothing counted, no leanings
export function neutral(){ const M = X.metrics(X.newEvo()); for (const k of ['avg_hunger', 'avg_thirst', 'avg_hygiene', 'avg_mood', 'avg_health', 'avg_bond']) M[k] = 55; M.care_score = 55; return M; }
// metrics that meet one edge's condition (the smallest values that pass), everything else plain
export function satisfy(edge, M = neutral()){
  const put = w => { if (w.always) return; if (w.all) return w.all.forEach(put); if (w.any) return put(w.any[0]);
    const v = +w.value, cur = M[w.metric];   // (several conditions on one number: keep the strictest)
    M[w.metric] = w.op === '==' ? v : w.op === '>=' ? Math.max(cur, v) : w.op === '>' ? Math.max(cur, v + 0.01) : w.op === '<=' ? Math.min(cur, v) : Math.min(cur, v - 0.01); };
  put(edge.when); return M;
}
// game-side checks the page supplies (save migration on a real old save, the skip button, old age) are added by the caller
export function runAll(extra = []){
  const R = [], t = (name, fn) => { try { const r = fn(); R.push({name, ok:r === true || (r && r.ok), info:(r && r.info) || ''}); } catch (e){ R.push({name, ok:false, info:String(e)}); } };
  const F = X.CFG.forms, E = X.EDGES;
  t('form_count_27', () => ({ok:F.length === 27 && new Set(F.map(f => f.id)).size === 27, info:`${F.length} forms`}));
  t('growth5_mature8_perfect8_ultimate6', () => { const c = s => F.filter(f => f.stage === s).length; return {ok:c('growth') === 5 && c('mature') === 8 && c('perfect') === 8 && c('ultimate') === 6, info:[c('growth'), c('mature'), c('perfect'), c('ultimate')].join('/')}; });
  t('edge_count_69', () => ({ok:E.length === 69, info:`${E.length} edges`}));
  t('each_edge_valid_stage_progression', () => { const bad = E.filter(e => ORDER.indexOf(stageOf(e.to)) !== ORDER.indexOf(stageOf(e.from)) + 1); return {ok:!bad.length, info:bad.map(e => e.from + '>' + e.to).join(' ')}; });
  t('each_growth_and_mature_source_has_one_fallback', () => { const src = ['baby2', ...F.filter(f => f.stage === 'growth' || f.stage === 'mature').map(f => f.id)];
    const bad = src.filter(s => X.edgesFrom(s).filter(e => e.fallback && e.when.always).length !== 1); return {ok:!bad.length, info:bad.join(' ')}; });
  t('perfect_sources_have_no_fallback', () => { const bad = F.filter(f => f.stage === 'perfect' && X.edgesFrom(f.id).some(e => e.fallback)); return {ok:!bad.length, info:bad.map(f => f.id).join(' ')}; });
  t('every_form_reachable_from_egg', () => { const seen = new Set(['egg']); let more = true; while (more){ more = false; for (const e of E) if (seen.has(e.from) && !seen.has(e.to)){ seen.add(e.to); more = true; } }
    const miss = F.filter(f => !seen.has(f.id)); return {ok:!miss.length, info:miss.map(f => f.id).join(' ')}; });
  // every one of the 69 edges can actually be taken: its condition met (and nothing above it) leads exactly there
  t('all_69_edges_take_their_target', () => { const bad = [];
    for (const e of E){ if (['egg', 'baby1'].includes(e.from)) continue;
      const M = e.fallback ? neutral() : satisfy(e); const d = X.decide(e.from, M);
      if (d.to !== e.to) bad.push(`${e.from}>${e.to} got ${d.to}`); }
    return {ok:!bad.length, info:bad.length ? bad.join('; ') : '67 branching edges + 2 fixed'}; });
  t('rare_holy_priority_higher_than_gold', () => { const M = neutral(); for (const e of X.edgesFrom('p_royal')) satisfy(e, M); M.major_mistakes_lifetime = 0; M.care_mistakes = 0;
    const d = X.decide('p_royal', M); return {ok:d.to === 'u_holy', info:`chose ${d.to}`}; });
  t('perfect_unmet_stays', () => { const d = X.decide('p_stone', neutral()); return {ok:!d.eligible && d.to === null, info:d.reason}; });
  t('speed_1_10_60_same_game_clock_same_outcome_for_equal_events', () => {
    // one 6-hour 成長期 phase: the same states and events on the same game clock, ticked at 1x, 10x and 60x frame sizes
    const run = speed => { const Ev = X.newEvo(), dt = speed/1800; let g = 0, real = 0, nextEv = 0;
      while (g < 360){ const h = g < 120 ? 30 : 70, hy = g > 200 && g < 320 ? 20 : 80, night = g >= 240 && g < 300;
        X.tick(Ev, dt, {hunger:h, thirst:60, hygiene:hy, mood:65, health:80, bond:60, energy:60, sick:false, asleep:night, night}, real, g, false);
        if (g >= nextEv){ X.event(Ev, 'play', real + 1e9*nextEv); if (nextEv % 60 === 0) X.event(Ev, 'dig', real + 1e9*nextEv); nextEv += 30; }
        g += dt; real += 1000/30; }
      return X.metrics(Ev); };
    const a = run(1), b = run(10), c = run(60), keys = ['avg_hunger', 'hunger_low_ratio', 'hygiene_low_ratio', 'care_score', 'aff_earth', 'sleep_routine_ratio'];
    const off = keys.filter(k => Math.abs(a[k] - b[k]) > 0.01*Math.max(1, Math.abs(a[k])) || Math.abs(a[k] - c[k]) > 0.01*Math.max(1, Math.abs(a[k])));
    const same = a.play_sessions === b.play_sessions && b.play_sessions === c.play_sessions && X.decide('g_good', a).to === X.decide('g_good', c).to;
    return {ok:!off.length && same, info:`plays ${a.play_sessions}/${b.play_sessions}/${c.play_sessions}, hunger<35 ${a.hunger_low_ratio.toFixed(3)}/${c.hunger_low_ratio.toFixed(3)} ${off.join(',')}`}; });
  t('skill_daily_caps_no_bypass_at_60x', () => { const Ev = X.newEvo(); let got = 0;
    for (let g = 0; g < 1440; g += 0.5) if (X.dailyTake(Ev, 'gold', 5, g)) got++;   // a valid care act every half game minute for a whole game day
    let next = 0; for (let g = 1440; g < 1450; g++) if (X.dailyTake(Ev, 'gold', 5, g)) next++;
    return {ok:got === 5 && next === 5, info:`day 1: ${got}, day 2: ${next}`}; });
  t('active_skill_cooldown_in_game_minutes', () => { const Ev = X.newEvo(); const a = !!X.useSkill(Ev, 'm_stinky', 100), b = !!X.useSkill(Ev, 'm_stinky', 200), c = !!X.useSkill(Ev, 'm_stinky', 461);
    return {ok:a && !b && c, info:`${a} ${b} ${c}`}; });
  t('play_boost_used_up_after_two', () => { const Ev = X.newEvo(); X.useSkill(Ev, 'u_lightning', 0); const m = [1, 2, 3].map(() => X.playFactors(Ev, 'u_lightning', {}, 1).mood);
    return {ok:m[0] === 2 && m[1] === 2 && m[2] === 1, info:m.join(',')}; });
  t('no_eval_condition_dsl', () => { const bad = X.test({metric:'care_score', op:'; alert(1)', value:0}, {care_score:99}) === false && X.test({metric:'constructor', op:'>=', value:0}, {}) === false && X.test('1==1', {}) === false;
    return {ok:bad, info:'unknown operators, metrics and strings are rejected'}; });
  t('long_sickness_no_repeat_mistakes', () => { const Ev = X.newEvo(); let real = 0;
    for (let g = 0; g < 600; g += 1){ X.tick(Ev, 1, {hunger:60, thirst:60, hygiene:60, mood:50, health:20, bond:50, energy:60, sick:true, asleep:false, night:false}, real, g, false); real += 2000; }
    return {ok:Ev.phase.mistakes === 1 && Ev.life.major === 1, info:`mistakes ${Ev.phase.mistakes}, major ${Ev.life.major}`}; });
  t('missed_call_waits_30_real_seconds', () => { const Ev = X.newEvo(); let real = 0;   // 60x: 10 game minutes pass in 10 real seconds; not a mistake yet
    for (let g = 0; g < 20; g += 0.5){ X.tick(Ev, 0.5, {hunger:10, thirst:60, hygiene:60, mood:50, health:80, bond:50, energy:60}, real, g, false); real += 500; }
    const early = Ev.phase.mistakes; for (let i=0;i<50;i++){ X.tick(Ev, 0.5, {hunger:10, thirst:60, hygiene:60, mood:50, health:80, bond:50, energy:60}, real, 20 + i, false); real += 500; }
    return {ok:early === 0 && Ev.phase.mistakes === 1, info:`${early} then ${Ev.phase.mistakes}`}; });
  t('independent_phase_stats_reset_and_lifetime_persists', () => { const Ev = X.newEvo(); X.event(Ev, 'dig', 0); X.event(Ev, 'play', 0); Ev.life.major = 2;
    const before = X.metrics(Ev).aff_earth; X.closePhase(Ev, 100); const M = X.metrics(Ev);
    return {ok:M.dig_sessions === 0 && M.play_sessions === 0 && Ev.life.major === 2 && Math.abs(M.aff_earth - 0.25*before) < 1e-9, info:`earth ${before.toFixed(1)} -> seed ${M.aff_earth.toFixed(1)}`}; });
  t('tap_farming_ignored', () => { const Ev = X.newEvo(); let n = 0; for (let i=0;i<20;i++) if (X.event(Ev, 'feed', i*200)) n++; return {ok:n === 1, info:`${n} of 20 taps in 4 s counted`}; });
  t('save_migration_preserves_existing_pet', () => { const S = {stage:'adult', form:'sporty', coins:321, st:{hunger:44}, ageMs:2000*60000, formsSeen:{skinny:true, sporty:true}, name:'阿寶'};
    const ch = X.migrateSave(S, 2000), again = X.migrateSave(S, 2000);
    return {ok:ch && !again && S.stage === 'adult' && S.form === 'm_energetic' && S.coins === 321 && S.st.hunger === 44 && S.name === '阿寶' && S.evo.stageStart === 360 && S.evo.unlocked.includes('g_skinny'),
      info:`form ${S.form}, stage start ${S.evo.stageStart}, unlocked ${S.evo.unlocked.join(',')}`}; });
  t('asset_paths_27', () => { const miss = X.FORM_IDS.filter(id => !X.ASSET27[id]); return {ok:!miss.length, info:miss.join(' ') || '27 sheets listed'}; });
  extra.forEach(([name, fn]) => t(name, fn));
  return R;
}
