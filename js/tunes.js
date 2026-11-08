// Songs for the dolphin's music hall (猜歌 and 節奏). Only melodies whose composers died long ago, or folk tunes with no
// known composer, so anyone may play them; the game's own instruments play them (melody, chords, bass, a little percussion).
//
// mel is numbered notation (簡譜), one bar between each |:
//   1-7 = do..ti of the key (key: the MIDI note of 1), 0 = a rest, - = hold the last note one more beat
//   ' after a note = an octave up (each ' one more), , = an octave down; # or b before it = sharp / flat
//   a note is one beat; _ after it halves that (an eighth), = quarters it (a sixteenth), . after that adds half again
// ch: the chords of each bar, in the same order (two names in a bar split it in half; - or nothing = no chord)
// ok: false = written from memory and not yet checked by ear; those stay out of the quiz and show in the song list
// for checking.
export const TUNES = [
  // children's songs
  {id:'twinkle', name:'小星星', kind:'兒歌', bpm:100, key:60, mel:'1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - | 5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 -', ch:'C | F C | F C | G C | C F | C G | C F | C G'},
  {id:'tigers', name:'兩隻老虎', kind:'兒歌', bpm:120, key:60, mel:'1 2 3 1 | 1 2 3 1 | 3 4 5 - | 3 4 5 - | 5_ 6_ 5_ 4_ 3 1 | 5_ 6_ 5_ 4_ 3 1 | 1 5, 1 - | 1 5, 1 -', ch:'C | C | C | C | C | C | C G C | C G C'},
  {id:'bee', name:'小蜜蜂', kind:'兒歌', bpm:112, key:60, mel:'5 3 3 - | 4 2 2 - | 1 2 3 4 | 5 5 5 - | 5 3 3 - | 4 2 2 - | 1 3 5 5 | 3 - - -', ch:'C | G | C | C | C | G | C | C'},
  {id:'london', name:'倫敦鐵橋垮下來', kind:'兒歌', bpm:112, key:60, mel:'5. 6_ 5 4 | 3 4 5 - | 2 3 4 - | 3 4 5 - | 5. 6_ 5 4 | 3 4 5 - | 2 - 5 - | 3 1 - -', ch:'C | C | G | C | C | C | G | C'},
  {id:'lamb', name:'瑪莉有隻小綿羊', kind:'兒歌', bpm:112, key:60, mel:'3. 2_ 1 2 | 3 3 3 - | 2 2 2 - | 3 5 5 - | 3. 2_ 1 2 | 3 3 3 3 | 2 2 3 2 | 1 - - -', ch:'C | C | G | C | C | C | G | C'},
  {id:'farm', name:'王老先生有塊地', kind:'兒歌', bpm:120, key:60, mel:'1 1 1 5, | 6, 6, 5, - | 3 3 2 2 | 1 - - 5, | 1 1 1 5, | 6, 6, 5, - | 3 3 2 2 | 1 - - -', ch:'C | F C | G | C | C | F C | G | C'},
  {id:'birthday', name:'生日快樂', kind:'兒歌', bpm:96, key:60, mel:'5,_. 5,= | 6, 5, 1 | 7, - 5,_. 5,= | 6, 5, 2 | 1 - 5,_. 5,= | 5 3 1 | 7, 6, 4_. 4= | 3 1 2 | 1 - -', ch:'- | C | G | G | C | C | F | C G | C'},
  {id:'jingle', name:'鈴兒響叮噹', kind:'兒歌', bpm:120, key:60, mel:'3 3 3 - | 3 3 3 - | 3 5 1. 2_ | 3 - - - | 4 4 4. 4_ | 4 3 3 3_ 3_ | 3 2 2 3 | 2 - 5 -', ch:'C | C | C | C | F | C | D7 | G'},
  {id:'silent', name:'平安夜', kind:'兒歌', bpm:84, key:60, mel:'5. 6_ 5 | 3 - - | 5. 6_ 5 | 3 - - | 2\' - 2\' | 7 - - | 1\' - 1\' | 5 - -', ch:'C | C | C | C | G | G | C | C'},
  {id:'susanna', name:'噢！蘇珊娜', kind:'兒歌', bpm:120, key:60, mel:'1_ 2_ | 3 5 5. 6_ | 5 3 1. 2_ | 3 3 2 1 | 2 - - 1_ 2_ | 3 5 5. 6_ | 5 3 1. 2_ | 3 3 2 2 | 1 - -', ch:'- | C | C | C | G | C | C | G | C'},
  // classical
  {id:'joy', name:'歡樂頌', kind:'古典', bpm:112, key:60, mel:'3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3. 2_ 2 - | 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2. 1_ 1 -', ch:'C | G | C | G | C | G | C | G C'},
  {id:'elise', name:'給愛麗絲', kind:'古典', bpm:66, key:60, mel:'3\'= #2\'= | 3\'= #2\'= 3\'= 7= 2\'= 1\'= | 6_ 0= 1= 3= 6= | 7_ 0= 3= #5= 7= | 1\'_ 0= 3= 3\'= #2\'= | 3\'= #2\'= 3\'= 7= 2\'= 1\'= | 6_ 0= 1= 3= 6= | 7_ 0= 3= 1\'= 7= | 6_.', ch:'- | - | Am | E | Am | - | Am | E | Am'},
  {id:'turkish', name:'土耳其進行曲', kind:'古典', bpm:72, key:60, mel:'7= 6= #5= 6= | 1\'_ 0_ 2\'= 1\'= 7= 1\'= | 3\'_ 0_ 4\'= 3\'= #2\'= 3\'= | 7\'= 6\'= #5\'= 6\'= 7\'= 6\'= #5\'= 6\'= | 1\'\'_ 0_ 6\'_ 1\'\'_', ch:'- | Am | Am | Am | Am'},
  {id:'swan', name:'天鵝湖', kind:'古典', bpm:76, key:60, mel:'3 - - 6,_ 7,_ | 1_ 2_ 3. 1_ 3. | 1_ 3. 1_ 6,_ 1_ 6,_ 4,_ | 1_ 6, - - | 6,_', ch:'Am | Am | F Am | Am | -'},
  {id:'wedding', name:'結婚進行曲', kind:'古典', bpm:80, key:60, mel:'5, | 1. 1_ 1 - | 5, 2 7, 1 - | 5, 1 4. 4_ 4 - | 3 2 1 7, | 1 2 - -', ch:'- | C | G C | F | C G | C G'},
  {id:'largo', name:'念故鄉（新世界）', kind:'古典', bpm:66, key:60, mel:'3. 5_ 5 - | 3. 2_ 1 - | 2 3 5 3 | 2 - - - | 3. 5_ 5 - | 3. 2_ 1 - | 2 3 2. 1_ | 1 - - -', ch:'C | C | C G | G | C | C | G | C'},
  {id:'canon', name:'卡農', kind:'古典', bpm:72, key:60, mel:'3\' - 2\' - | 1\' - 7 - | 6 - 5 - | 6 - 7 - | 1\' - 7 - | 6 - 5 - | 4 - 3 - | 4 - 2 -', ch:'C G | Am Em | F C | F G | C G | Am Em | F C | F G'},
  {id:'kleine', name:'小夜曲（莫札特）', kind:'古典', bpm:120, key:60, mel:'1\' 0_ 5_ 1\' 0_ 5_ | 1\'_ 5_ 1\'_ 3\'_ 5\' 0 | 4\' 0_ 2\'_ 4\' 0_ 2\'_ | 4\'_ 2\'_ 7_ 2\'_ 5 0', ch:'C | C | G | G'},
  {id:'surprise', name:'驚愕交響曲', kind:'古典', bpm:100, key:60, mel:'1 1 3 3 | 5 5 3 - | 4 4 2 2 | 7, 7, 5, - | 1 1 3 3 | 5 5 3 - | 4 4 2 2 | 7, - - -', ch:'C | C | G | G | C | C | G | G'},
  {id:'brahms', name:'搖籃曲（布拉姆斯）', kind:'古典', bpm:88, key:60, mel:'3_ 3_ | 5 - 3_ 3_ | 5 - 3_ 5_ | 1\' 7 6 | 6 5 2_ 3_ | 4 2 2_ 3_ | 4 - 2_ 4_ | 7_ 6_ 5 7 | 1\' - -', ch:'- | C | C | C F | C G | G | G | G | C'},
  // Taiwanese songs: 鄧雨賢's melodies (he died in 1944) read off printed numbered scores (sax.tw), and the folk song
  // 丟丟銅仔 from a note-by-note listing (pitch and length of every note) on cariahwang.pixnet.net
  {id:'springwind', name:'望春風', kind:'台灣歌謠', bpm:76, key:60, mel:'5,. 5,_ 6, 1 | 2 1_ 2_ 3 - | 5. 3_ 3_ 2_ 1 | 2 - - - | 3. 5_ 5 3_ 5_ | 1. 2_ 2 - | 5. 3_ 3 2_ 1= 2= | 1 - - - | 2. 2_ 3 2_ 1_ | 6, 5,_ 6,_ 1 - | 6,. 1_ 2 3 | 5 - - - | 5. 5_ 6 5_ 3_ | 3 2_ 1_ 6, - | 5. 3_ 3 2_ 1= 2= | 1 - - -',
    ch:'C F | G7 E7 | G7 | Dm G7 | C | C | C C7 | C | Dm E7 | F C | Am G7 | G7 | C Am | G7 Am | C G7 | C'},
  {id:'rainflower', name:'雨夜花', kind:'台灣歌謠', bpm:104, key:60, mel:'5,_ 6,_ 5, 3 | 3_ 2_ 1_ 6,_ 5, | 1_ 2_ 3 5_ 1= 2= | 3_ 3_ 2 - | 2 - - | 5_ 5_ 5_ 3= 5= 3 | 3_ 2= 3= 2_ 1_ 6, | 5,_ 6,_ 5, 3 | 3_ 2_ 1 - | 1 - -',
    ch:'C | F | C A7 | Dm | G7 | C | Am | G7 | C | C'},
  {id:'moonsorrow', name:'月夜愁', kind:'台灣歌謠', bpm:80, key:60, mel:'0 3, 5, 6, | 5, - - - | 0 6,_ 5,_ 1 2 | 3 - - - | 0 4 3 4 | 5 - - - | 0 5,_ 6,_ 5, 2 | 2 - - - | 0 3_ 2_ 1 2 | 1 - - - | 0 3_ 4_ 5 6 | 5 3_ 2_ 1 2 | 1 6,_ 1_ 6, 5,_ 6,_ | 5, - - 5 | 3 - - - | 0 2_ 3_ 2_ 1_ 5,_ 6,_ | 1 - - -',
    ch:'- | C | Am | E7 | F | G7 | C G7 | Dm7 | G7 | C | Em7 | G7 C | F G7 | G7 | C | - | C'},
  {id:'diudiu', name:'丟丟銅仔', kind:'台灣民謠', bpm:120, key:60, mel:'2\' 3\' | 2\'_ 3\'_ 2\'_ 1\'_ | 2\'_ 3\'_ 2\'_ 1\'_ | 2\' 1\'_ 6_ | 5 6_ 1\'_ | 5 - | 6 2\' | 6_ 1\'_ 1\'_ 6_ | 2\' 2\' | 6_ 1\'_ 1\'_ 6_ | 5_ 5_ 5_ 5_ | 6_ 1\'_ 6_ 5_ | 2 6 | 5 -',
    ch:'G | G | G | Am | C | C | Dm G | Am | G | Am | C | Am C | G | C'},
  {id:'fourseasons', name:'四季紅', kind:'台灣歌謠', bpm:112, key:60, mel:'5 1\' 1\'. 2\'_ | 3\'_ 2\'_ 1\'_ 2\'_ 3\' - | 5 3\' 3\'. 4\'_ | 3\' 2\'_ 1\'_ 2\' - | 1\' 2\'_ 3\'_ 2\' 1\' | 2\'_ 1\'_ 7_ 6_ 5 - | 3 5_ 6_ 5 2\'_ 7_ | 7_ 1\'_ 1\' - 0 | 5\' 2\'_ 3\'_ 5\' 0 | 5\'_ 5\'_ 2\'_ 3\'_ 2\' 0 | 1\' 6_ 1\'_ 5. 6_ | 5_ 2\' 3\'_ 1\' - | 5\'. 5\'_ 6\' 6\' | 5\'. 6\'_ 5\'_ 3\'_ 2\'_ 3\'_ | 5\' - - - | 5\' - - 0',
    ch:'C | C | Em Am | Dm G | C F | D G | C G | C | C | C G7 | F C | G C | C F | C G | G | G'},
  {id:'grasshopper', name:'草螟弄雞公', kind:'台灣民謠', bpm:100, key:60, mel:'6 3 6_ 1\'_ 6_ 5_ | 3 6_ 5_ 3 - | 6 3 6_ 1\'_ 6_ 5_ | 3_ 2_ 3_ 5_ 6 - | 6 1\' 6_ 1\'_ 6_ 5_ | 3 6_ 5_ 3 - | 6 3 6_ 1\'_ 6_ 5_ | 3_ 2_ 3_ 5_ 6_ 1\'_ 6_ 5_ | 3 6 3_ 5_ 3_ 2_ | 1 2_ 1_ 6, - | 3= 3= 2_ 1_ 2_ 3. 5_ | 2_ 3_ 2_ 1_ 6, -',
    ch:'Am | Am | Am | C Am | F | Am | Am | C Am | Am C | F Am | C | G Am'},
  // folk songs of China (old folk tunes, read off printed numbered scores) and an old song with a 19th-century American melody
  {id:'purplebamboo', name:'紫竹調', kind:'中國民謠', bpm:72, key:60, mel:'5_. 6= 1\'_ 2\'_ | 6_ 5_ 3 | 5_ 2_ 3_ 5_ | 5_ 1. | 3_ 5_ 3_ 5_ | 2= 3= 2= 1= 1 | 1_ 5,. | 2\'_ 2\'= 1\'= 6_ 5= 3= | 5 - | 3= 5= 3= 5= 6= 5= 6= 1\'= | 5 - | 5_. 6= 1\'_ 2\'_ | 6_ 5_ 5= 3= 2_ | 5_ 2_ 3_ 5_ | 5_ 1. | 1_. 6,= 5_ 5= 3= | 2= 3= 2= 1= 2 | 3_ 3= 5= 5_ 6_ | 1\'_. 2\'= 7= 6= 5_ | 6 -',
    ch:'C | Am C | G C | C | C | G C | C | G Am | C | C Am | C | C | Am G | G C | C | C Am | G | C | G Em | Am'},
  {id:'fengyang', name:'鳳陽花鼓', kind:'中國民謠', bpm:108, key:60, mel:'5_ 3_ 2_ 3_ 5 - | 3_ 5_ 6_ 1\'_ 5 - | 5_ 5_ 1\' 6 5_ 3_ | 2_ 5_ 3_ 2_ 1 - | 1_ 1_ 6, 5 5_ 3_ | 2_ 1_ 2_ 3_ 5 - | 5_ 5_ 1\' 6 5_ 3_ | 2_ 5_ 3_ 2_ 1 - | 5 5_ 3= 2= 1_ 2_ 3_ 5_ | 2_ 1_ 6,_ 2_ 1 - | 5_. 6= 3_ 2_ 1_ 6,_ 1 | 5_. 6= 3_ 2_ 1_ 6,_ 1 | 5 1_ 0_ 5 1_ 0_ | 5_ 1_ 5_ 1_ 1_ 6,_ 1 | 1_ 1_ 1_ 6,_ 1 -',
    ch:'C | C | C F | G C | C Am | G C | C F | G C | C | G C | C Am | C Am | C | C Am | C'},
  {id:'jasmine', name:'茉莉花', kind:'中國民謠', bpm:72, key:60, mel:'3 3_ 5_ 6_ 1\'_ 1\'_ 6_ | 5 5_ 6_ 5 - | 3 3_ 5_ 6_ 1\'_ 1\'_ 6_ | 5 5_ 6_ 5 - | 5 5 5 3_ 5_ | 6 6 5 - | 3 2_ 3_ 5 3_ 2_ | 1 1_ 2_ 1 -', ch:'C | C | C | C | C | F C | Am G | C'},
  {id:'farewell', name:'送別', kind:'中國民謠', bpm:76, key:60, mel:'5 3_ 5_ 1\' - | 6 1\' 5 - | 5 1_ 2_ 3 2_ 1_ | 2 - - - | 5 3_ 5_ 1\'. 7_ | 6 1\' 5 - | 5 2_ 3_ 4. 7,_ | 1 - - -', ch:'C | F C | C | G | C | F C | G | C'},
];

const SCALE = [0, 2, 4, 5, 7, 9, 11], ROOT = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
// a chord name -> its notes as semitones above C (root, third, fifth, and a seventh for "7")
export function chordNotes(name){
  const m = name.match(/^([A-G])([#b]?)(m?)(7?)$/); if (!m) return null;
  const r = ROOT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), n = [r, r + (m[3] ? 3 : 4), r + 7];
  if (m[4]) n.push(r + 10); return n;
}
// notation -> {notes:[{m, b, len}] (MIDI note, start beat, length in beats), chords:[{n, b, len}], beats}
export function parseTune(T){
  const notes = [], chords = [], chs = (T.ch || '').split('|'); let beat = 0, last = null;
  T.mel.split('|').forEach((bar, bi) => {
    const b0 = beat;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)){
      if (tok === '-'){ if (last) last.len += 1; beat += 1; continue; }
      const m = tok.match(/^([#b]?)([0-7])([',]*)([_=]*)(\.?)$/); if (!m) throw new Error(`${T.id}: can't read "${tok}"`);
      let len = 1; for (const c of m[4]) len /= c === '_' ? 2 : 4; if (m[5]) len *= 1.5;
      if (m[2] === '0') last = null;
      else { let p = T.key + SCALE[+m[2] - 1] + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0); for (const o of m[3]) p += o === "'" ? 12 : -12; last = {m:p, b:beat, len}; notes.push(last); }
      beat += len;
    }
    const names = (chs[bi] || '').trim().split(/\s+/).filter(x => x && x !== '-'), span = (beat - b0)/Math.max(1, names.length);
    names.forEach((n, k) => { const c = chordNotes(n); if (c) chords.push({n:c, b:b0 + k*span, len:span}); });
  });
  return {notes, chords, beats:beat};
}
