// Area masters (館主): one per special region, living in a house built from what that place's animals use. Tapping a master
// opens a visual-novel style talk (portrait, name plate, text box) and from there its challenge: a fight, a minigame, a
// puzzle, riddles, rhythm or song guessing. Winning gives coins and a badge (once in each of the wombat's lives), and the
// first win ever also unlocks a building and teaches a life skill; after that a win pays a little once a day.
// 烏龜爺爺, the old tortoise by the lily pond, sets lantern riddles (燈謎); 海豚姊姊, the dolphin off the north-east beach,
// runs the music hall: guess the song, then tap along in time (節奏).
import * as THREE from 'three';
import { PLOT, BIO, WATER_Y } from './world.js';
import { TUNES, parseTune } from './tunes.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random()*(b - a);
const pick = a => a[Math.floor(Math.random()*a.length)];
const wrapA = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const MASTERS = {
  turtle:{name:'烏龜爺爺', area:BIO.pond, areaName:'荷花池塘', model:'tortoise', size:1.6, game:'riddle', gameName:'猜燈謎',
    badge:{icon:'🏮', name:'燈謎徽章'}, building:'riddlelanterns', skill:'slowlife', coins:100, daily:20, need:4, rounds:5, song:'riddle', call:'爺爺', voice:true},
  dolphin:{name:'海豚姊姊', area:'1,-1', areaName:'東北邊的海岸', model:'dolphin', size:0.62, por:[1, 0.35, -0.75], porD:1.3, game:'music', gameName:'音樂挑戰', sea:true,
    badge:{icon:'🎵', name:'音樂徽章'}, building:'shellstage', skill:'rhythm', coins:100, daily:20, need:4, rounds:5, pass:80, song:'seaside', call:'姊姊'},
};
// the songs the rhythm game uses (steady, not too fast)
const RHYTHM = ['twinkle', 'bee', 'lamb', 'joy', 'london', 'tigers', 'farm', 'surprise', 'largo'];
const LEADS = ['marimba', 'flute', 'acoustic_grand_piano', 'music_box', 'ocarina'];

// Lantern riddles. The traditional ones are old folk riddles, free for anyone; the last group is about this game's world.
// q: the riddle, c: what kind of thing the answer is, a: the answer, o: three wrong choices of the same kind, w: why (for the
// character riddles, read off the strokes)
export const RIDDLES = [
  {q:'千條線，萬條線，掉到水裡看不見。', c:'打一自然現象', a:'雨', o:['雪', '霧', '風']},
  {q:'麻屋子，紅帳子，裡面住著白胖子。', c:'打一食物', a:'花生', o:['紅豆', '栗子', '蒜頭']},
  {q:'頭戴紅帽子，身穿白袍子，走路擺架子，說話伸脖子。', c:'打一動物', a:'鵝', o:['鴨子', '麻雀', '鴿子']},
  {q:'小小諸葛亮，獨坐中軍帳，擺下八卦陣，專捉飛來將。', c:'打一動物', a:'蜘蛛', o:['螞蟻', '蝴蝶', '蚯蚓'], w:'八卦陣就是牠織的網，飛來將是飛進網裡的蟲。'},
  {q:'身穿綠衣裳，肩扛兩把刀，草叢裡面走，捉蟲本領高。', c:'打一動物', a:'螳螂', o:['蚱蜢', '蜻蜓', '青蛙']},
  {q:'小時穿黑衣，大時穿綠袍，水裡過日子，岸上來睡覺。', c:'打一動物', a:'青蛙', o:['烏龜', '魚', '鴨子'], w:'小時候是黑黑的蝌蚪，長大變成綠色的青蛙。'},
  {q:'有頭沒有頸，身上冷冰冰，有翅不能飛，無腳也能行。', c:'打一動物', a:'魚', o:['蛇', '烏龜', '蝸牛'], w:'魚的「翅」是魚鰭。'},
  {q:'紅公雞，綠尾巴，一頭鑽到地底下。', c:'打一蔬菜', a:'紅蘿蔔', o:['白蘿蔔', '地瓜', '番茄']},
  {q:'一物生得真奇怪，腰裡長出鬍子來，拔掉鬍子剝開看，露出牙齒一排排。', c:'打一植物', a:'玉米', o:['稻子', '甘蔗', '竹筍'], w:'鬍子是玉米鬚，牙齒是一排排的玉米粒。'},
  {q:'有面沒有口，有腳沒有手，雖有四隻腳，自己不會走。', c:'打一物品', a:'桌子', o:['書包', '時鐘', '門']},
  {q:'上邊毛，下邊毛，中間一顆黑葡萄。', c:'打一身體部位', a:'眼睛', o:['鼻子', '耳朵', '嘴巴'], w:'上下的毛是睫毛，黑葡萄是眼珠。'},
  {q:'姐妹二人一樣長，酸甜苦辣她先嘗。', c:'打一餐具', a:'筷子', o:['湯匙', '叉子', '碗']},
  {q:'有時落在山腰，有時掛在樹梢，有時像面圓鏡，有時像把鐮刀。', c:'打一天體', a:'月亮', o:['太陽', '星星', '彩虹']},
  {q:'耳朵長，尾巴短，愛吃菜，跳得快。', c:'打一動物', a:'兔子', o:['小狗', '小貓', '老鼠']},
  {q:'一物像人又像狗，爬竿上樹是能手。', c:'打一動物', a:'猴子', o:['兔子', '鴨子', '刺蝟']},
  {q:'一口咬掉牛尾巴。', c:'打一字', a:'告', o:['牛', '吉', '舌'], w:'「牛」去掉下面的尾巴，再加一個「口」，就是「告」。'},
  {q:'一加一不是二。', c:'打一字', a:'王', o:['三', '土', '主'], w:'「一」加上「十」再加「一」，疊起來是「王」。'},
  {q:'十張口，一顆心。', c:'打一字', a:'思', o:['想', '田', '念'], w:'「十」和「口」合成「田」，下面一顆「心」，就是「思」。'},
  {q:'上不在上，下不在下，天沒有它大，人有它大。', c:'打一字', a:'一', o:['二', '人', '大'], w:'「上」「下」都有「一」；「天」少了「一」變「大」，「人」加上「一」變「大」。'},
  {q:'半個月亮。', c:'打一字', a:'胖', o:['明', '朋', '肚'], w:'「半」加上「月」，就是「胖」。'},
  {q:'有水可養魚蝦，有土可種莊稼，有人不是你我，有馬跑遍天下。', c:'打一字', a:'也', o:['力', '包', '青'], w:'加水是「池」，加土是「地」，加人是「他」，加馬是「馳」。'},
  // about this game's world
  {q:'沒有腳也沒有手，背著房子慢慢走，下雨天裡最開心，留下一條亮亮路。', c:'打一動物', a:'蝸牛', o:['烏龜', '蚯蚓', '毛毛蟲']},
  {q:'頭小頸長四腳短，背著房子到處走，遇到危險縮進殼。', c:'打一動物', a:'烏龜', o:['蝸牛', '螃蟹', '刺蝟'], w:'呵呵，就是爺爺我呀。'},
  {q:'白天睡大覺，晚上出來挖地洞，大便是方方的。', c:'打一動物', a:'袋熊', o:['兔子', '老鼠', '刺蝟'], w:'袋熊的大便是方塊形的，牠會拿來做記號。'},
  {q:'尾巴扁扁拍水面，牙齒啃樹本領大，河上蓋起大水壩。', c:'打一動物', a:'河狸', o:['鱷魚', '青蛙', '鴨子']},
  {q:'肚子前面有口袋，後腳一蹬跳好遠。', c:'打一動物', a:'袋鼠', o:['青蛙', '兔子', '無尾熊']},
  {q:'抱著大樹睡整天，只吃尤加利樹葉。', c:'打一動物', a:'無尾熊', o:['猴子', '松鼠', '貓頭鷹']},
  {q:'晚上睜大眼，頭能轉一大圈，白天在樹上睡覺。', c:'打一動物', a:'貓頭鷹', o:['老鷹', '蝙蝠', '狼']},
  {q:'月亮出來仰頭叫，住在高地山洞裡。', c:'打一動物', a:'狼', o:['老虎', '梅花鹿', '袋鼠']},
  {q:'身上開滿白花點，頭上長著樹枝角。', c:'打一動物', a:'梅花鹿', o:['斑馬', '駝鹿', '馬']},
  {q:'泥巴水裡曬太陽，嘴巴長長牙齒尖，只露眼睛等獵物。', c:'打一動物', a:'鱷魚', o:['蜥蜴', '青蛙', '蛇']},
  {q:'池塘裡面一把傘，下雨也不收起來，青蛙坐在傘上面。', c:'打一植物', a:'荷葉', o:['香菇', '睡蓮花', '浮萍']},
];

// what the tortoise says
const TALK = {
  turtle:{
    first:['呵呵……是一隻小袋熊呀。我是住在荷花池塘邊的烏龜爺爺，已經在這裡住了一百多年囉。',
      '老人家沒什麼本事，就喜歡出燈謎。五題裡面答對四題，就算你過關。', '過關的話，爺爺有禮物送你。要不要試試看？'],
    again:['又來看爺爺啦？今天要不要猜猜燈謎？', '呵呵，池塘今天很安靜，正適合動動腦。', '來得正好，爺爺剛想到幾個好謎題。'],
    cleared:['你上次答得真好。爺爺又想了幾題，要再玩玩嗎？', '燈籠還亮著呢，再來猜幾題吧？'],
    night:['（打了個大哈欠）嗯……這麼晚了還來找爺爺？', '（慢慢把頭伸出殼）晚上的池塘有青蛙在唱歌，你也睡不著嗎？'],
    rain:['下雨天最適合待在家裡想謎題了。', '雨打在荷葉上，滴滴答答的，真好聽。'],
    chat:['慢慢走，也能走得很遠。爺爺就是這樣走了一百年的。', '池塘的青蛙每天晚上都在唱歌，吵是吵了點，聽久了也挺好聽。',
      '鯉魚跳出水面的時候，記得許個願。', '猜燈謎啊，要先看清楚是「打一什麼」，再從字面上慢慢想。', '肚子餓的時候不要想事情，先去吃點草。',
      '你知道嗎？爺爺的殼上每一塊花紋，都會跟著年紀一圈一圈長大。', '聽說西邊的沼澤住著一隻很兇的鱷魚，你要小心喔。',
      '天氣好的時候，池塘裡的小烏龜會爬到石頭上曬太陽。牠們都是爺爺的曾曾曾孫。'],
    start:['好，第一題來囉。慢慢想，不用急。'],
    right:['答對了！真聰明。', '呵呵，一下就被你猜到了。', '沒錯沒錯！', '好眼力！'],
    wrong:['可惜，答案是「%」。', '差一點點，答案是「%」。', '呵呵，被考倒了吧？答案是「%」。'],
    win:['了不起！%題答對了%題。燈謎館這一關，你過了！'],
    lose:['%題答對了%題，差一點點。休息一下再來吧，爺爺隨時都在。'],
    bye:['慢走啊，路上小心。', '有空再來陪爺爺說說話。', '下次見，小袋熊。'],
    more:'還有什麼想跟爺爺說的嗎？', gift:['這些都是你的了。有空常來陪爺爺說說話。', '今天的禮物已經送過囉，不過答得好，爺爺還是很開心。'], thanks:'謝謝爺爺',
  },
  dolphin:{
    first:['嗨嗨～你就是新來的小袋熊吧？我是住在這片海裡的海豚姊姊！', '我最喜歡音樂了！這座貝殼音樂廳，是我跟海浪一起蓋的喔。',
      '我的挑戰有兩關：先猜歌，五首猜對四首；再跟著音樂打節奏，拿到 80 分就過關！', '過關的話，姊姊有超棒的禮物送你！要不要來試試看？'],
    again:['又來找姊姊玩啦？今天要不要挑戰音樂？', '海浪今天的節奏好棒喔，你聽到了嗎？', '來來來，姊姊剛練好幾首新歌！'],
    cleared:['上次你好厲害喔！要不要再來一場？', '音樂徽章戴起來很帥吧？再來玩嘛～'],
    night:['（在水面上輕輕漂著）嗯……晚上的海好安靜，唱歌要小聲一點喔。', '（睜開一隻眼睛）月亮好亮喔，你也睡不著嗎？'],
    rain:['下雨了！雨滴打在海面上，滴滴答答的，好像在打鼓！', '雨天最適合在水裡跳舞了～'],
    chat:['你知道嗎？海豚會用口哨聲叫彼此的名字，每隻海豚的口哨都不一樣喔。', '我們睡覺的時候，只讓一半的腦袋休息，另一半還醒著注意四周。',
      '鯨魚大哥唱歌超好聽，有時候整片海都聽得到。', '海鷗老是想偷吃我的魚，真是的！', '烏龜爺爺的燈謎好難喔，我都猜不出來。',
      '音樂就是要開心！唱錯了也沒關係，大聲唱就對了！', '跳出水面之前，要先吸一大口氣喔。', '看到我們一群一起游過去，就是要去找好吃的魚了。'],
    start:['好，第一關：猜歌！仔細聽，這是哪一首歌？'],
    ask:'這是哪一首歌呢？',
    right:['答對了！耳朵好靈喔！', '沒錯～就是這首！', '哇，一下就聽出來了！', '好厲害，完全正確！'],
    wrong:['可惜～這首是「%」。', '差一點點！答案是「%」。', '嘻嘻，被考倒了吧？是「%」喔。'],
    lose:['%首猜對了%首，差一點點！多聽幾次就會了，下次再來喔。'],
    beat:['第一關過了！第二關：打節奏！音符掉到線上的時候，點下面一樣顏色的按鈕。拿到 80 分就過關！'],
    beatWin:['%分！太棒了，你的節奏感跟我一樣好！兩關都過了！'],
    beatLose:['%分，差一點點！要 80 分才過關喔，再試一次吧！'],
    bye:['掰掰～記得常來玩喔！', '下次見，小袋熊！', '要來聽我唱歌喔～掰掰！'],
    more:'還有什麼想跟姊姊聊的嗎？', gift:['這些都是你的了！有空常來找姊姊玩喔！', '今天的禮物已經送過囉，不過你玩得好棒，姊姊好開心！'], thanks:'謝謝姊姊',
  },
};

export function createMasters(G){
  const { scene, renderer, world, gy, mat, glowMat, canvasTex } = G;
  const M = {list:[], pick:[]};

  // ---------- the old tortoise's house: a tortoise-shell dome with a riddle-lantern frame in front ----------
  function shellTex(){
    return canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = '#5f4f2c'; x.fillRect(0, 0, w, h);
      const R = 34, cols = ['#7a6438', '#8a7444', '#6d5a32', '#806a3c'];
      for (let row = -1; row < h/(R*1.5) + 1; row++) for (let col = -1; col < w/(R*1.73) + 1; col++){
        const cx = col*R*1.73 + (row % 2 ? R*0.87 : 0), cy = row*R*1.5;
        const hex = s => { x.beginPath(); for (let i=0;i<6;i++){ const a = Math.PI/6 + i*Math.PI/3; x.lineTo(cx + Math.cos(a)*R*s, cy + Math.sin(a)*R*s); } x.closePath(); };
        hex(0.94); x.fillStyle = pick(cols); x.fill();
        x.strokeStyle = 'rgba(40,30,15,.35)'; x.lineWidth = 2; for (const s of [0.72, 0.5, 0.28]){ hex(s); x.stroke(); }   // growth rings
        hex(0.94); x.strokeStyle = '#c9b47a'; x.lineWidth = 5; x.stroke();
      }
    });
  }
  function signTex(txt){
    return canvasTex(256, 96, (x, w, h) => { x.fillStyle = '#b98b5a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#6b4a2a'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
      x.fillStyle = '#3a2614'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w/2, h/2 + 2); });
  }
  function lantern(red, gold, strip){
    const g = new THREE.Group(), l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), red); l.scale.y = 1.15; g.add(l);
    for (const y of [0.24, -0.24]){ const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), gold); c.position.y = y; g.add(c); }
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.36), strip); s.position.y = -0.47; g.add(s);   // the paper slip with the riddle on it
    const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.14, 6), red); ts.position.y = -0.72; g.add(ts);
    return g;
  }
  M.riddleLanterns = function(){   // the frame of riddle lanterns, also the reward building (its front faces +z)
    const g = new THREE.Group(), bamboo = mat('#a8a058', 0.7), red = glowMat('#d23b32', '#ff7a3c'), gold = mat('#e2b53b', 0.4);
    const strip = new THREE.MeshStandardMaterial({color:'#f4ead2', roughness:0.9, side:THREE.DoubleSide});
    for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8), bamboo); p.position.set(1.3*s, 1.15, 0); g.add(p);
      for (let k=0;k<4;k++){ const n = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 12), bamboo); n.rotation.x = Math.PI/2; n.position.set(1.3*s, 0.4 + k*0.5, 0); g.add(n); } }   // bamboo joints
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 8), bamboo); rod.rotation.z = Math.PI/2; rod.position.y = 2.2; g.add(rod);
    for (const x of [-0.8, 0, 0.8]){ const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), mat('#3b2a1c')); str.position.set(x, 2.08, 0); g.add(str);
      const l = lantern(red, gold, strip); l.position.set(x, 1.75, 0); g.add(l); }
    return g;
  };
  function turtleHouse(){
    const g = new THREE.Group(), wood = mat('#8a6440', 0.85), dark = new THREE.MeshBasicMaterial({color:'#1a1410'});
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.45, 1.4, 40), mat('#a39a84', 0.95)); base.position.y = -0.55; g.add(base);   // (reaches down into sloping ground)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.0, 48, 20, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshStandardMaterial({map:shellTex(), roughness:0.75}));
    dome.scale.y = 0.72; dome.position.y = 0.15; g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.03, 0.15, 8, 48), mat('#c9b47a', 0.7)); rim.rotation.x = Math.PI/2; rim.position.y = 0.18; g.add(rim);
    // the front door in a little wooden porch, under a lotus-leaf awning
    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.7), wood); porch.position.set(0, 0.65, 1.75); g.add(porch);
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.7, 24, 1, false, 0, Math.PI), wood); arch.rotation.z = Math.PI/2; arch.rotation.y = Math.PI/2; arch.position.set(0, 1.15, 1.75); g.add(arch);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.72), dark); door.position.set(0, 0.52, 2.105); g.add(door);
    const dtop = new THREE.Mesh(new THREE.CircleGeometry(0.31, 20, 0, Math.PI), dark); dtop.position.set(0, 0.88, 2.105); g.add(dtop);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28, Math.PI/2 + 0.2, Math.PI*2 - 0.4), new THREE.MeshStandardMaterial({color:'#5e9a4a', roughness:0.7, side:THREE.DoubleSide}));
    leaf.rotation.x = -Math.PI/2 + 0.22; leaf.position.set(0, 1.84, 1.85); g.add(leaf);
    // round windows that light up at night
    const win = glowMat('#f3e2b0', '#ffcf6b');
    for (const s of [-1, 1]){ const a = s*0.9, y = 0.62, r = 2.0*Math.sqrt(1 - ((y - 0.15)/1.44)**2) + 0.02;
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), win), f = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 6, 20), wood);
      for (const o of [w, f]){ o.position.set(Math.sin(a)*r, y, Math.cos(a)*r); o.lookAt(Math.sin(a)*r*2, y + 0.3, Math.cos(a)*r*2); g.add(o); } }
    // a lotus leaf and flower on the roof
    const roofLeaf = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24, 0.3, Math.PI*2 - 0.6), new THREE.MeshStandardMaterial({color:'#6aa552', roughness:0.7, side:THREE.DoubleSide}));
    roofLeaf.rotation.x = -Math.PI/2; roofLeaf.position.y = 1.62; g.add(roofLeaf);
    const pink = mat('#f2a6be', 0.6);
    for (let i=0;i<8;i++){ const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), pink); p.scale.set(0.55, 1.3, 0.35); const a = i/8*Math.PI*2;
      p.position.set(Math.cos(a)*0.1, 1.78, Math.sin(a)*0.1); p.rotation.set(Math.sin(a)*0.5, 0, -Math.cos(a)*0.5); g.add(p); }
    const seed = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.08, 12), mat('#e2c34a', 0.6)); seed.position.y = 1.8; g.add(seed);
    // the riddle lanterns and a sign: 燈謎館
    const lt = M.riddleLanterns(); lt.scale.setScalar(0.85); lt.position.set(-2.6, 0, 1.9); lt.rotation.y = 0.35; g.add(lt);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), wood); post.position.set(1.75, 0.6, 2.1); g.add(post);
    const side = mat('#b98b5a'); const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.36, 0.06), [side, side, side, side, new THREE.MeshStandardMaterial({map:signTex('燈謎館'), roughness:0.9}), side]);
    sign.position.set(1.75, 1.2, 2.14); g.add(sign);
    return g;
  }

  // ---------- the dolphin's music hall: a scallop-shell band shell on the sand, open to the sea, with coral columns ----------
  function scallopTex(){
    return canvasTex(512, 256, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fbe3d6'); gr.addColorStop(1, '#f2b9a6'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      for (let i=0;i<18;i++){ const cx = (i + 0.5)/18*w; x.fillStyle = i % 2 ? 'rgba(214,120,110,.28)' : 'rgba(255,255,255,.35)'; x.fillRect(cx - w/36, 0, w/18*0.55, h); }   // the shell's ribs
      x.strokeStyle = 'rgba(160,80,70,.25)'; x.lineWidth = 3; for (let y = 30; y < h; y += 34){ x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }   // growth lines
    });
  }
  function noteTex(ch, col){ return canvasTex(128, 128, (x, w, h) => { x.font = 'bold 96px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 8; x.strokeStyle = '#fff'; x.strokeText(ch, w/2, h/2); x.fillStyle = col; x.fillText(ch, w/2, h/2); }); }
  function coral(h, col){
    const g = new THREE.Group(), m_ = mat(col, 0.8), trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h, 10), m_); trunk.position.y = h/2; g.add(trunk);
    for (let i=0;i<5;i++){ const a = i*2.4, y = h*(0.35 + i*0.12), br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.6, 8), m_);
      br.position.set(Math.cos(a)*0.22, y, Math.sin(a)*0.22); br.rotation.set(Math.sin(a)*0.7, 0, -Math.cos(a)*0.7); g.add(br);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), m_); tip.position.set(Math.cos(a)*0.42, y + 0.25, Math.sin(a)*0.42); g.add(tip); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), m_); top.position.y = h; g.add(top);
    return g;
  }
  function shellBack(R){   // half a dome, ribbed like a scallop, open toward +z, with a scalloped rim and pearls
    const g = new THREE.Group(), shellM = new THREE.MeshStandardMaterial({map:scallopTex(), roughness:0.55, side:THREE.DoubleSide});
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 16, Math.PI, Math.PI, 0, Math.PI/2), shellM); dome.scale.y = 1.15; g.add(dome);   // (phi π..2π: the back half, -z)
    const rimM = mat('#f6d2c2', 0.5);
    for (let i=0;i<=14;i++){ const a = Math.PI*i/14, b = new THREE.Mesh(new THREE.SphereGeometry(R*0.075, 10, 8), rimM); b.position.set(Math.cos(a)*R, Math.sin(a)*R*1.15, 0.02); g.add(b); }
    const pearl = new THREE.MeshStandardMaterial({color:'#fffaf0', roughness:0.15, metalness:0.2, emissive:'#fff4d6', emissiveIntensity:0.15});
    for (const a of [0.25, 0.5, 0.75]){ const p = new THREE.Mesh(new THREE.SphereGeometry(R*0.06, 14, 10), pearl); p.position.set(Math.cos(a*Math.PI)*R*0.86, Math.sin(a*Math.PI)*R*1.0, -0.05); g.add(p); }
    return g;
  }
  function starfish(col){
    const sh = new THREE.Shape(); for (let i=0;i<10;i++){ const a = i/10*Math.PI*2 + Math.PI/2, r = i % 2 ? 0.08 : 0.2; i ? sh.lineTo(Math.cos(a)*r, Math.sin(a)*r) : sh.moveTo(Math.cos(a)*r, Math.sin(a)*r); }
    const s = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {depth:0.04, bevelEnabled:true, bevelSize:0.02, bevelThickness:0.02, bevelSegments:1}), mat(col, 0.8)); s.rotation.x = -Math.PI/2; return s;
  }
  function musicHall(){
    const g = new THREE.Group(), sand = mat('#e6cf9e', 0.95);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 1.1, 40, 1, false, -Math.PI/2, Math.PI*2), sand); stage.position.y = -0.3; g.add(stage);   // (reaches down into the sloping sand)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.06, 40), mat('#c8a676', 0.8)); top.position.y = 0.27; g.add(top);
    const back = shellBack(2.3); back.position.set(0, 0.3, -0.4); g.add(back);
    for (const s of [-1, 1]){ const c = coral(2.6, s < 0 ? '#ef8a7a' : '#f3a35c'); c.position.set(s*2.3, 0.25, 0.9); g.add(c); }
    const sf1 = starfish('#e2764e'); sf1.position.set(-1.0, 0.31, 1.3); sf1.rotation.z = 0.4; g.add(sf1);
    const sf2 = starfish('#f0c04a'); sf2.position.set(1.2, 0.31, 1.6); g.add(sf2);
    // a big conch on the stage, like a horn, and floating music notes that bob in the sea breeze
    const conch = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 14, 1, true), new THREE.MeshStandardMaterial({color:'#f7d9b8', roughness:0.5, side:THREE.DoubleSide})); conch.rotation.z = Math.PI/2.4; conch.position.set(0.9, 0.62, -0.2); g.add(conch);
    g.userData.notes = [];
    [['♪', '#3a7bd5', -1.0, 2.9], ['♫', '#d5456a', 0.2, 3.3], ['♪', '#2fa36b', 1.3, 2.8]].forEach(([c, col, x, y], i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:noteTex(c, col), transparent:true, depthWrite:false}));
      sp.scale.setScalar(0.7); sp.position.set(x, y, 0.2); sp.userData = {y, ph:i*2.1}; g.add(sp); g.userData.notes.push(sp); });
    const wood = mat('#8a6440', 0.85), post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), wood); post.position.set(-2.0, 0.6, 2.4); g.add(post);
    const side = mat('#b98b5a'), sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.36, 0.06), [side, side, side, side, new THREE.MeshStandardMaterial({map:signTex('音樂館'), roughness:0.9}), side]);
    sign.position.set(-2.0, 1.2, 2.44); g.add(sign);
    return g;
  }
  M.shellStage = function(){   // the reward: a little shell stage (its front faces +z)
    const g = new THREE.Group(), sand = mat('#e6cf9e', 0.95);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.3, 28), sand); stage.position.y = 0.15; g.add(stage);
    const back = shellBack(0.95); back.position.set(0, 0.3, -0.2); g.add(back);
    const sf = starfish('#e2764e'); sf.position.set(0.4, 0.31, 0.5); sf.scale.setScalar(0.7); g.add(sf);
    const n = new THREE.Sprite(new THREE.SpriteMaterial({map:noteTex('♫', '#3a7bd5'), transparent:true, depthWrite:false})); n.scale.setScalar(0.45); n.position.set(-0.3, 1.7, 0); g.add(n);
    return g;
  };
  M.stagePlay = async () => {   // the shell stage plays one of the songs (when the wombat walks up to it)
    const t = pick(TUNES.filter(x => x.ok !== false)), lead = pick(LEADS); await G.tune.load(lead);
    if (!M.talking) G.tune.play(parseTune(t), {bpm:t.bpm, lead});
  };

  // ---------- where each master lives: a dry, level, clear spot near its place (found once, then kept in the save) ----------
  function findSpot(id, m){
    const S = G.S(), saved = (S.masterSpots || {})[id]; if (saved) return saved;
    if (m.sea) return seaSpot(id, m);
    const [cx, cz] = m.area.split(',').map(v => v*PLOT), P = world.data.bio.pond;
    const dry = (x, z) => world.inWorld(x, z) && !world.isWater(x, z) && world.slope(x, z) < 0.5;
    let best = null, bs = 1e9;
    for (let x = cx - PLOT/2 + 4.5; x <= cx + PLOT/2 - 4.5; x += 0.75) for (let z = cz - PLOT/2 + 4.5; z <= cz + PLOT/2 - 4.5; z += 0.75){
      let ok = dry(x, z) && G.clear(x, z, 3.0);
      for (let i=0;i<12 && ok;i++){ const a = i/12*Math.PI*2; for (const r of [1.5, 2.6, 3.4]) if (!dry(x + Math.cos(a)*r, z + Math.sin(a)*r)){ ok = false; break; } }
      // the lantern frame (front left) and the master's own spot (front right) need clear, dry ground too
      const ry = Math.atan2(-x, -z), lay = (f, s) => [x + Math.sin(ry)*f + Math.cos(ry)*s, z + Math.cos(ry)*f - Math.sin(ry)*s];
      for (const [f, s, r] of [[1.9, -2.6, 1.6], [3.3, 1.2, 1.6]]){ if (!ok) break; const [px, pz] = lay(f, s); ok = dry(px, pz) && G.clear(px, pz, r); }
      if (!ok) continue;
      // close to the pond's shore (but not on it), and on the side facing home
      const shore = world.pondD(x, z) - P.r, sc = Math.abs(shore - 4.5) + Math.max(0, cz - z)*0.15;
      if (sc < bs){ bs = sc; best = {x, z}; }
    }
    if (!best) return null;
    const ry = Math.atan2(-best.x, -best.z);   // the door faces home
    const out = {x:+best.x.toFixed(2), z:+best.z.toFixed(2), ry:+ry.toFixed(3)};
    S.masterSpots = {...(S.masterSpots || {}), [id]:out}; G.save(); return out;
  }
  // a sea master: the hall on the sand a few steps up from the waterline, facing the sea (+x), and deep, open water in front
  // of it for the master to swim in
  function seaSpot(id, m, loose){
    const S = G.S(), [, cz] = m.area.split(',').map(v => v*PLOT), sx = world.shoreX;
    const dry = (x, z) => world.inWorld(x, z) && !world.isWater(x, z) && world.slope(x, z) < 0.6;
    const deep = (x, z) => x > sx(z) + 1 && world.H(x, z) < WATER_Y - 0.45;   // (the open sea runs on past the world's edge, where isSea says no)
    let best = null, bs = 1e9;
    for (let z = cz - PLOT/2 + 5; z <= cz + PLOT/2 - 5; z += 0.75){
      const x = sx(z) - 5.2;
      let ok = dry(x, z) && (loose || G.clear(x, z, 3.0));
      for (let i=0;i<12 && ok;i++){ const a = i/12*Math.PI*2; if (!dry(x + Math.cos(a)*2.6, z + Math.sin(a)*2.6)) ok = false; }
      if (!loose) for (const [f, sd] of [[3.4, 0], [2.4, -2.0]]){ if (!ok) break; const px = x + Math.sin(-0.35)*f + Math.cos(-0.35)*sd, pz = z + Math.cos(-0.35)*f - Math.sin(-0.35)*sd; ok = G.clear(px, pz, 1.3); }   // (the open front and the sign stay clear of trees too)
      const wx = sx(z) + 6; for (let i=0;i<9 && ok;i++){ const a = i/9*Math.PI*2; if (!deep(wx + Math.cos(a)*(i ? 2.5 : 0), z + Math.sin(a)*(i ? 2.5 : 0))) ok = false; }
      if (!ok) continue;
      const sc = Math.abs(z - cz) + world.slope(x, z)*4; if (sc < bs){ bs = sc; best = {x, z, wx}; }
    }
    if (!best) return loose ? null : seaSpot(id, m, true);   // (a crowded beach: then trees may stand close by)
    const out = {x:+best.x.toFixed(2), z:+best.z.toFixed(2), ry:-0.35, wx:+best.wx.toFixed(2)};   // (the shell opens along the beach, a little toward land, so it is seen from the shore; she swims beside it)
    S.masterSpots = {...(S.masterSpots || {}), [id]:out}; G.save(); return out;
  }

  // ---------- the masters in the world ----------
  function zzzTex(){ return canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#f4f1ea'; x.strokeStyle = '#2c3a31'; x.lineWidth = 6; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.strokeText('z', w/2, h*0.7); x.fillText('z', w/2, h*0.7); }); }
  function place(id){
    const m = MASTERS[id], sp = findSpot(id, m); if (!sp) return;
    const home = new THREE.Group(); home.position.set(sp.x, gy(sp.x, sp.z), sp.z); home.rotation.y = sp.ry; scene.add(home);
    const house = m.sea ? musicHall() : turtleHouse(); home.add(house);
    const hhb = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), G.hbMat); hhb.position.y = 0.8; hhb.userData = {kind:'master', ref:id}; home.add(hhb);
    const body = G.real(m.model); if (!body) return;
    body.scale.multiplyScalar(m.size);
    // the master sits in front of the house, a little to the side of the door, on the ground
    const fwd = V3(Math.sin(sp.ry), 0, Math.cos(sp.ry)), side = V3(Math.cos(sp.ry), 0, -Math.sin(sp.ry));
    const at = m.sea ? V3(sp.wx, WATER_Y, sp.z) : V3(sp.x, 0, sp.z).addScaledVector(fwd, 3.3).addScaledVector(side, 1.2); if (!m.sea) at.y = gy(at.x, at.z);
    body.position.copy(at); body.rotation.y = sp.ry; scene.add(body);
    const hb = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), G.hbMat); hb.position.y = 0.45/m.size; hb.scale.setScalar(1/m.size); hb.userData = {kind:'master', ref:id}; body.add(hb);
    const zz = new THREE.Sprite(new THREE.SpriteMaterial({map:zzzTex(), transparent:true, depthWrite:false})); zz.scale.setScalar(0.45); zz.visible = false; scene.add(zz);
    const u = body.userData, act = n => u.clips[n] && u.mixer.clipAction(u.clips[n]);
    const a = {id, m, home, house, body, hb, hhb, zz, act, cur:null, t:0, eatT:rnd(15, 30), state:'idle', ry:sp.ry, at, spot:sp, th:0, leapT:rnd(8, 16)};
    if (m.sea){ body.rotation.order = 'YXZ'; hb.scale.multiplyScalar(1.6); }
    M.list.push(a); M.pick.push(hb, hhb); play(a, m.sea ? 'swim' : 'idle');
  }
  // the dolphin: circles in the water in front of her hall, leaping now and then; when the wombat comes close (or while
  // talking) she swims up to the front and holds there with her head out of the water, looking at it; at night she rests
  // at the surface. (Dolphins swim with their tail, so the swim clip plays slower when she is only treading water.)
  function swim(a, dt, petPos){
    const b = a.body, night = G.phase() === 'night' && !M.talking, d = petPos ? Math.hypot(petPos.x - a.at.x, petPos.z - a.at.z) : 99;
    const near = M.talking === a.id || d < 11, ac = a.act('swim');
    a.zz.visible = night; if (night){ const k = (a.t*0.4) % 1; a.zz.position.set(a.at.x, WATER_Y + 1.0 + k*0.8, a.at.z); a.zz.material.opacity = Math.sin(k*Math.PI); }
    let tx, tz, ry, y = WATER_Y - 0.3, pitch = 0, roll = 0;
    if (near || night){
      tx = a.at.x; tz = a.at.z; const look = petPos && !night ? Math.atan2(petPos.x - b.position.x, petPos.z - b.position.z) : a.ry + Math.PI;
      ry = b.rotation.y + wrapA(look - b.rotation.y)*Math.min(1, dt*2); y = WATER_Y - (night ? 0.25 : 0.12) + Math.sin(a.t*1.6)*0.05; pitch = night ? 0 : -0.32 + Math.sin(a.t*2.2)*0.05;
      if (ac) ac.timeScale = night ? 0.25 : 0.55; a.leap = 0;
    } else {
      a.th += dt*0.4; const R = 2.2; tx = a.at.x + Math.cos(a.th)*R; tz = a.at.z + Math.sin(a.th)*R;
      ry = Math.atan2(-Math.sin(a.th), Math.cos(a.th)); roll = 0.18;   // (heading along the circle, leaning into the turn)
      if (ac) ac.timeScale = 1;
      a.leapT -= dt; if (a.leapT <= 0 && !a.leap){ a.leap = 0.0001; a.leapT = rnd(12, 22); }
      if (a.leap){ a.leap += dt/1.5; const u = Math.min(1, a.leap); y += Math.sin(u*Math.PI)*1.7; pitch = -Math.cos(u*Math.PI)*0.75; if (u >= 1) a.leap = 0; }
    }
    const k = Math.min(1, dt*(near ? 1.5 : 4)); b.position.x += (tx - b.position.x)*k; b.position.z += (tz - b.position.z)*k; b.position.y += (y - b.position.y)*Math.min(1, dt*(a.leap ? 20 : 3));
    b.rotation.y = near || night ? ry : b.rotation.y + wrapA(ry - b.rotation.y)*Math.min(1, dt*3);
    b.rotation.x += (pitch - b.rotation.x)*Math.min(1, dt*(a.leap ? 20 : 3)); b.rotation.z += (roll*(near || night ? 0 : 1) - b.rotation.z)*Math.min(1, dt*2);
  }
  function play(a, n, speed = 1, once = false){
    const ac = a.act(n); if (!ac) return; ac.timeScale = speed;
    if (a.cur === ac) return;
    if (once){ ac.setLoop(THREE.LoopOnce, 1); ac.clampWhenFinished = true; } else ac.setLoop(THREE.LoopRepeat, Infinity);
    ac.reset().play(); if (a.cur) a.cur.crossFadeTo(ac, 0.4, false); a.cur = ac;
  }
  M.init = () => { for (const id of Object.keys(MASTERS)) place(id); };
  M.obstacles = () => M.list.filter(a => a.home.visible).flatMap(a => [{c:a.home.position, r:2.7}, {c:a.body.position, r:1.1}]);
  M.blocks = (x, z, pad = 0) => M.list.some(a => Math.hypot(x - a.home.position.x, z - a.home.position.z) < 3.0 + pad || Math.hypot(x - a.body.position.x, z - a.body.position.z) < 1.4 + pad);

  M.update = (dt, petPos) => {
    for (const a of M.list){
      const open = world.isOpenKey(a.m.area); a.home.visible = a.body.visible = open; if (!open){ a.zz.visible = false; continue; }
      a.t += dt; a.body.userData.mixer.update(dt);
      if (a.house.userData.notes) a.house.userData.notes.forEach(n => { n.position.y = n.userData.y + Math.sin(a.t*1.3 + n.userData.ph)*0.15; });
      if (a.m.sea){ swim(a, dt, petPos); continue; }
      const night = G.phase() === 'night' && !M.talking;
      if (night){   // asleep in his shell
        if (a.state !== 'sleep'){ a.state = 'sleep'; play(a, 'hide', 1, true); }
        a.zz.visible = true; const k = (a.t*0.4) % 1; a.zz.position.set(a.at.x, a.at.y + 1.1 + k*0.8, a.at.z); a.zz.material.opacity = Math.sin(k*Math.PI); continue;
      }
      a.zz.visible = false;
      // turns (stepping round on all four legs) to face the wombat when it comes near or while talking; grazes now and then
      const d = petPos ? Math.hypot(petPos.x - a.at.x, petPos.z - a.at.z) : 99;
      // (no wombat out — an egg, asleep in its house: he faces his visitors' way, the door's)
      const want = petPos && (M.talking === a.id || d < 7) ? Math.atan2(petPos.x - a.at.x, petPos.z - a.at.z) : a.ry, diff = wrapA(want - a.body.rotation.y);
      if (a.state === 'sleep'){ a.state = 'idle'; play(a, 'idle'); }
      if (Math.abs(diff) > 0.3){ a.state = 'turn'; play(a, 'walk', 0.7); a.body.rotation.y += Math.sign(diff)*Math.min(Math.abs(diff), dt*0.45); }
      else if (a.state === 'turn'){ a.state = 'idle'; play(a, 'idle'); }
      else if (a.state === 'eat'){ a.eatLeft -= dt; if (a.eatLeft <= 0 || d < 4 || M.talking){ a.state = 'idle'; play(a, 'idle'); a.eatT = rnd(20, 40); } }
      else { a.eatT -= dt; if (a.eatT <= 0 && d > 5 && !M.talking){ a.state = 'eat'; a.eatLeft = rnd(4, 7); play(a, 'eat'); } }
    }
  };

  // ---------- the portrait: the master's own 3D model, posed and lit, rendered once into a picture ----------
  const PORTRAIT = {};
  function portrait(id){
    if (PORTRAIT[id]) return PORTRAIT[id];
    const m = MASTERS[id], o = G.real(m.model); if (!o) return '';
    const sc = new THREE.Scene(); sc.add(o); o.updateMatrixWorld(true); o.traverse(n => { if (n.isMesh) n.frustumCulled = false; });   // (skinned meshes' bounds can be off)
    const cl = o.userData.clips || {}, clip = cl.idle || cl.swim || Object.values(cl)[0];   // (some models only have a swim clip)
    const ac = clip && o.userData.mixer.clipAction(clip); if (ac){ ac.play(); o.userData.mixer.update(0.8); }
    sc.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a60, 2.6)); const dl = new THREE.DirectionalLight(0xfff4e0, 2.4); dl.position.set(-2, 4, 6); sc.add(dl);
    const fl = new THREE.DirectionalLight(0xffffff, 1.2); fl.position.set(3, 1, 4); sc.add(fl);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = V3(0, 0, 0); o.traverse(b => { if (b.isBone) box.expandByPoint(b.getWorldPosition(v)); });
    const head = o.userData.head ? o.userData.head.getWorldPosition(V3(0, 0, 0)) : box.getCenter(V3(0, 0, 0));
    // a three-quarter view from the front, the face a little above the middle and the front of the shell below it
    let size = box.getSize(V3(0, 0, 0)).length(), look = head.clone().lerp(box.getCenter(V3(0, 0, 0)), 0.45);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100); cam.position.copy(look).add(V3(...(m.por || [0.45, 0.22, 1])).normalize().multiplyScalar(size*(m.porD || 1.05))); cam.lookAt(look);
    const N = 512, rt = new THREE.WebGLRenderTarget(N, N, {samples:4}), px = new Uint8Array(N*N*4);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, N, N, px); renderer.setRenderTarget(prev); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), im = x.createImageData(N, N);
    for (let r=0;r<N;r++) im.data.set(px.subarray((N - 1 - r)*N*4, (N - r)*N*4), r*N*4);   // (GL rows run bottom-up)
    x.putImageData(im, 0, 0); return PORTRAIT[id] = cv.toDataURL('image/png');
  }
  M.portrait = (id, fresh) => { if (fresh) delete PORTRAIT[id]; return portrait(id); };   // (for checking the picture in the console)

  // ---------- the talk panel ----------
  const el = document.createElement('div'); el.className = 'talk'; el.hidden = true;
  el.innerHTML = `<div class="talkWrap"><div class="talkPor"><img alt=""></div><div class="talkBox" role="dialog" aria-modal="false" aria-labelledby="talkName">
    <div class="talkHead"><span class="talkName" id="talkName"></span><button class="talkX" aria-label="離開">✕</button></div>
    <div class="talkGame" hidden></div><p class="talkText" aria-live="polite"></p><div class="talkActs"></div></div></div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s), textEl = $('.talkText'), actsEl = $('.talkActs'), gameEl = $('.talkGame');
  let typing = null, closeReq = null;
  // spoken lines: voice/<master>/<key>.mp3, key = FNV-1a of the exact text on screen (made by E:\CosyVoice\make_turtle.py);
  // index.json lists the lines that have a recording, so a line without one just stays silent
  const fnv = t => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const VIDX = {};
  const vindex = id => VIDX[id] = VIDX[id] || !MASTERS[id].voice && Promise.resolve({}) || fetch(`voice/${id}/index.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  async function speak(lines){
    if (!G.voice || !M.talking) return; const id = M.talking, idx = await vindex(id); if (M.talking !== id) return;
    G.voice.play(lines.map(fnv).filter(k => idx[k]).map(k => `voice/${id}/${k}.mp3`));
  }
  // one line of the master's; with choices, resolves to the chosen index; without, waits for a tap to go on
  function say(txt, choices, grid, voice){
    speak(voice || [txt]);
    return new Promise(res => {
      clearInterval(typing); actsEl.innerHTML = ''; actsEl.classList.toggle('grid', !!grid); textEl.textContent = ''; let i = 0;
      const done = () => { clearInterval(typing); typing = null; textEl.textContent = txt; if (choices) show(); else textEl.classList.add('more'); };
      const show = () => choices.forEach((c, k) => { const b = document.createElement('button'); b.className = 'btn' + (c.ghost ? ' ghost' : ''); b.textContent = c.label || c;
        b.onclick = () => { actsEl.innerHTML = ''; res(k); }; actsEl.appendChild(b); });
      textEl.classList.remove('more');
      typing = setInterval(() => { i += 2; textEl.textContent = txt.slice(0, i); if (i >= txt.length) done(); }, 45);
      textEl.parentElement.onclick = e => { if (e.target.closest('button')) return; if (typing){ done(); return; } if (!choices){ textEl.parentElement.onclick = null; textEl.classList.remove('more'); res(-1); } };
      closeReq = () => res(-2);
    });
  }
  $('.talkX').onclick = () => { if (closeReq) closeReq(); end(); };
  function begin(a){
    M.talking = a.id; const m = a.m; $('.talkName').textContent = m.name; $('.talkPor img').src = portrait(a.id); $('.talkPor img').alt = m.name + '的立繪';
    gameEl.hidden = true; el.hidden = false; vindex(a.id); G.music.play(m.song); G.focus(m.sea ? a.home.position.clone().lerp(a.at, 0.55) : a.body.position);
  }
  function end(){ if (!M.talking) return; M.talking = null; G.voice && G.voice.stop(); G.tune && G.tune.stop(); if (rhy) rhy.stop(); clearInterval(typing); el.hidden = true; G.music.play(null); }

  const fill = (s, ...v) => { let k = 0; return s.replace(/%/g, () => v[k++]); };
  const rec = id => { const S = G.S(); S.masters = S.masters || {}; return S.masters[id] = S.masters[id] || {}; };
  M.badge = id => rec(id).gen === G.S().gen;   // won in this life
  M.everWon = id => !!rec(id).ever;

  async function talk(a){
    const id = a.id, T = TALK[id], r = rec(id); begin(a);
    const night = G.phase() === 'night', rain = ['rain', 'storm'].includes(G.weather());
    const first = !r.met;
    if (first){ r.met = true; G.save(); for (const l of T.first.slice(0, -1)) if (await say(l) === -2) return; }
    let line = first ? T.first[T.first.length - 1] : rain ? pick(T.rain) : night ? pick(T.night) : M.badge(id) ? pick(T.cleared) : pick(T.again);
    for (;;){
      const opts = [`挑戰${a.m.gameName}`, '聊聊天', ...(a.m.game === 'music' ? ['🎧 聽歌'] : []), {label:'下次再來', ghost:true}], c = await say(line, opts);
      if (c === 0){ if (await GAMES[a.m.game](a) === 'quit') return; line = pick(T.again); continue; }
      if (c === 1){ if (await say(pick(T.chat)) === -2) return; line = T.more; continue; }
      if (opts[c] === '🎧 聽歌'){ if (await jukebox(a) === 'quit') return; line = T.more; continue; }
      if (c === opts.length - 1){ const bye = say(pick(T.bye)); await Promise.race([bye, new Promise(r => setTimeout(r, 4200))]); }   // (closes by itself after the goodbye)
      end(); return;
    }
  }
  M.tap = id => { const a = M.list.find(x => x.id === id); if (a && !M.talking) talk(a); };

  // ---------- 猜燈謎: five riddles, four right wins ----------
  async function riddleGame(a){
    const T = TALK[a.id], m = a.m, qs = shuffle(RIDDLES).slice(0, m.rounds), res = [];
    G.music.preload(); gameEl.hidden = false;
    const draw = (q, i) => { gameEl.innerHTML = `<div class="rdl"><div class="rdlTop"><span>第 ${i + 1} / ${qs.length} 題</span><span class="rdlDots">${qs.map((_, k) => `<i class="${res[k] === true ? 'ok' : res[k] === false ? 'no' : k === i ? 'now' : ''}"></i>`).join('')}</span></div>
      <div class="rdlLantern" aria-hidden="true">🏮</div><p class="rdlQ">${q.q}</p><p class="rdlC">（${q.c}）</p></div>`; };
    if (await say(pick(T.start)) === -2) return 'quit';
    for (let i=0;i<qs.length;i++){
      const q = qs[i], opts = shuffle([q.a, ...q.o]); draw(q, i);
      const c = await say('答案是哪一個呢？', opts, true, [q.q + '（' + q.c + '）', '答案是哪一個呢？']); if (c === -2) return 'quit';   // (grandpa reads the riddle and its hint out)
      const ok = opts[c] === q.a; res[i] = ok; draw(q, i); G.sfx(ok ? 'happy' : 'sad');
      const head = ok ? pick(T.right) : fill(pick(T.wrong), q.a), line = head + (q.w ? ' ' + q.w : '');
      if (await say(line, [i < qs.length - 1 ? '下一題' : '看結果'], false, q.w ? [head, q.w] : [head]) === -2) return 'quit';
    }
    const n = res.filter(Boolean).length, won = n >= m.need;
    gameEl.innerHTML = `<div class="rdl"><div class="rdlTop"><span>結果</span><span class="rdlDots">${res.map(v => `<i class="${v ? 'ok' : 'no'}"></i>`).join('')}</span></div>
      <div class="rdlLantern big" aria-hidden="true">${won ? m.badge.icon : '🍵'}</div><p class="rdlQ">${won ? '過關！' : '再接再厲'}</p></div>`;
    G.music.jingle(won ? 'win' : 'lose');
    if (!won){ const c = await say(fill(pick(T.lose), qs.length, n), ['再挑戰一次', {label:'先休息一下', ghost:true}]); gameEl.hidden = true; if (c === 0) return riddleGame(a); return c === -2 ? 'quit' : 'done'; }
    if (await say(fill(pick(T.win), qs.length, n)) === -2) return 'quit';
    return gifts(a);
  }
  async function gifts(a){
    const T = TALK[a.id], got = reward(a);
    gameEl.innerHTML = `<div class="rdl"><p class="rdlQ">得到的獎勵</p><ul class="rdlGifts">${got.map(g => `<li>${g}</li>`).join('')}</ul></div>`;
    const c = await say(T.gift[got.length ? 0 : 1], [T.thanks]);
    gameEl.hidden = true; return c === -2 ? 'quit' : 'done';
  }

  // ---------- the music hall: guess the song (five, four right), then tap along in time (80 points) ----------
  const dots = (n, res, i) => `<span class="rdlDots">${Array.from({length:n}, (_, k) => `<i class="${res[k] === true ? 'ok' : res[k] === false ? 'no' : k === i ? 'now' : ''}"></i>`).join('')}</span>`;
  async function musicGame(a){
    const T = TALK[a.id], m = a.m, pool = TUNES.filter(t => t.ok !== false), qs = shuffle(pool).slice(0, m.rounds), res = [];
    G.music.preload(); gameEl.hidden = false;
    gameEl.innerHTML = `<div class="rdl"><div class="rdlLantern" aria-hidden="true">🎼</div><p class="rdlC">樂器調音中……</p></div>`;
    await G.tune.load(LEADS[0]); LEADS.slice(1).forEach(l => G.tune.load(l));
    if (M.talking !== a.id) return 'quit';
    if (await say(pick(T.start)) === -2) return 'quit';
    for (let i=0;i<qs.length;i++){
      const t = qs[i], P = parseTune(t), spb = 60/t.bpm, upTo = Math.min(P.beats, Math.ceil(11/spb)), lead = LEADS[i % LEADS.length];
      const opts = shuffle([t, ...shuffle(pool.filter(x => x !== t)).slice(0, 3)]);
      const draw = (playing, done) => { gameEl.innerHTML = `<div class="rdl"><div class="rdlTop"><span>猜歌 第 ${i + 1} / ${qs.length} 首</span>${dots(qs.length, res, i)}</div>
        <div class="rdlLantern${playing ? ' beat' : ''}" aria-hidden="true">${done ? (res[i] ? '🎉' : '🎵') : '🎵'}</div><p class="rdlC">${done ? `「${t.name}」（${t.kind}）` : '仔細聽……是哪一首歌？'}</p></div>`; };
      let c;
      for (;;){
        await G.tune.load(lead); if (M.talking !== a.id) return 'quit';
        draw(true); G.tune.play(P, {bpm:t.bpm, upTo, lead});
        c = await say(T.ask, [...opts.map(o => o.name), {label:'🔁 再聽一次', ghost:true}], true);
        if (c !== 4) break;
      }
      G.tune.stop(); if (c === -2) return 'quit';
      const ok = opts[c] === t; res[i] = ok; draw(false, true); G.sfx(ok ? 'happy' : 'sad');
      if (await say(ok ? pick(T.right) : fill(pick(T.wrong), t.name), [i < qs.length - 1 ? '下一首' : '看結果']) === -2) return 'quit';
    }
    const n = res.filter(Boolean).length;
    if (n < m.need){
      gameEl.innerHTML = `<div class="rdl"><div class="rdlTop"><span>結果</span>${dots(qs.length, res, -1)}</div><div class="rdlLantern big" aria-hidden="true">🐚</div><p class="rdlQ">再接再厲</p></div>`;
      G.music.jingle('lose');
      const c = await say(fill(pick(T.lose), qs.length, n), ['再挑戰一次', {label:'先休息一下', ghost:true}]); gameEl.hidden = true;
      if (c === 0) return musicGame(a); return c === -2 ? 'quit' : 'done';
    }
    return beatStage(a);
  }
  async function beatStage(a){
    const T = TALK[a.id], m = a.m; gameEl.hidden = false;
    gameEl.innerHTML = `<div class="rdl"><div class="rdlLantern" aria-hidden="true">🥁</div><p class="rdlQ">第二關：打節奏</p></div>`;
    if (await say(pick(T.beat), ['開始！']) === -2) return 'quit';
    const score = await rhythm(a); if (score < 0) return 'quit';
    const won = score >= m.pass;
    gameEl.innerHTML = `<div class="rdl"><div class="rdlLantern big" aria-hidden="true">${won ? m.badge.icon : '🐚'}</div><p class="rdlQ">${score} 分　${won ? '過關！' : '再接再厲'}</p></div>`;
    G.music.jingle(won ? 'win' : 'lose');
    if (!won){ const c = await say(fill(pick(T.beatLose), score), ['再打一次節奏', {label:'先休息一下', ghost:true}]); gameEl.hidden = true;
      if (c === 0) return beatStage(a); return c === -2 ? 'quit' : 'done'; }
    if (await say(fill(pick(T.beatWin), score)) === -2) return 'quit';
    return gifts(a);
  }
  // 節奏: the song's notes fall in three lanes (low, middle, high notes); tap the lane's pad as a note reaches the line.
  // On time (within 0.09 s) is a full point, close (0.2 s) is 0.7; the score is out of 100. Keys: A S D, J K L or ← ↓ →.
  let rhy = null;
  function rhythm(a){
    return new Promise(async done => {
      const id = pick(RHYTHM), t = TUNES.find(x => x.id === id), P = parseTune(t), lead = 'marimba';
      const ps = [...new Set(P.notes.map(n => n.m))].sort((x, y) => x - y), laneOf = mm => Math.min(2, Math.floor(ps.indexOf(mm)/ps.length*3));
      gameEl.innerHTML = `<div class="rhy"><div class="rhyTop"><span>🎶 ${t.name}</span><b class="rhyPct">0 分</b></div><canvas class="rhyC"></canvas><p class="rhyFx" aria-live="polite"></p>
        <div class="rhyPads"><button class="rp0" aria-label="低音">◀</button><button class="rp1" aria-label="中音">●</button><button class="rp2" aria-label="高音">▶</button></div></div>`;
      textEl.textContent = '跟著音樂，音符碰到線的時候點按鈕！'; textEl.classList.remove('more'); actsEl.innerHTML = ''; textEl.parentElement.onclick = null; G.voice && G.voice.stop();
      const cv = gameEl.querySelector('.rhyC'), cx = cv.getContext('2d'), fx = gameEl.querySelector('.rhyFx'), pct = gameEl.querySelector('.rhyPct');
      const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 300, H = 200; cv.width = W*dpr; cv.height = H*dpr; cx.scale(dpr, dpr);
      let over = false, raf = 0;
      const KEYS = {a:0, s:1, d:2, j:0, k:1, l:2, ArrowLeft:0, ArrowDown:1, ArrowRight:2};
      let key = null;
      const finish = v => { if (over) return; over = true; cancelAnimationFrame(raf); if (key) removeEventListener('keydown', key); rhy = null; G.tune.stop(); done(v); };
      rhy = {stop:() => finish(-1)}; closeReq = () => finish(-1);
      await G.tune.load(lead); if (over || M.talking !== a.id){ finish(-1); return; }
      const h = G.tune.play(P, {bpm:t.bpm, lead, lead_in:2.0}); if (!h){ finish(-1); return; }
      const notes = P.notes.map(n => ({t:h.t0 + n.b*h.spb, l:laneOf(n.m), hit:0, miss:false})), LEAD = 1.6, hitY = H - 26, COL = ['#3a7bd5', '#2fa36b', '#d5456a'];
      let pts = 0, judged = 0, flashT = 0;
      const show = (txt, col) => { fx.textContent = txt; fx.style.color = col; flashT = performance.now(); };
      const upd = () => { pct.textContent = `${Math.round(pts/notes.length*100)} 分`; };
      const tap = l => { if (over) return; const now = G.tune.now(); let best = null, bd = 9;
        for (const n of notes) if (!n.hit && !n.miss && n.l === l){ const d = Math.abs(n.t - now); if (d < bd){ bd = d; best = n; } }
        const pad = gameEl.querySelector('.rp' + l); if (pad){ pad.classList.add('on'); setTimeout(() => pad.classList.remove('on'), 110); }
        if (!best || bd > 0.2) return;
        best.hit = bd <= 0.09 ? 1 : 0.7; pts += best.hit; judged++; upd(); show(best.hit === 1 ? '完美！' : '不錯！', best.hit === 1 ? '#e2a400' : '#2fa36b'); };
      gameEl.querySelectorAll('.rhyPads button').forEach((b, l) => b.addEventListener('pointerdown', e => { e.preventDefault(); tap(l); }));
      key = e => { if (e.key in KEYS && !e.repeat){ e.preventDefault(); tap(KEYS[e.key]); } }; addEventListener('keydown', key);
      const draw = () => {
        if (over) return;
        const now = G.tune.now(); cx.clearRect(0, 0, W, H);
        for (let l=0;l<3;l++){ cx.fillStyle = l % 2 ? 'rgba(80,140,200,.10)' : 'rgba(80,140,200,.18)'; cx.fillRect(l*W/3, 0, W/3, H); }
        cx.fillStyle = 'rgba(40,70,110,.75)'; cx.fillRect(0, hitY - 2, W, 4);
        for (const n of notes){
          if (!n.hit && !n.miss && now - n.t > 0.2){ n.miss = true; judged++; show('漏掉了', '#888'); }
          if (n.hit) continue; const y = hitY - (n.t - now)/LEAD*hitY; if (y < -20 || y > H + 20) continue;
          cx.globalAlpha = n.miss ? 0.25 : 1; cx.fillStyle = COL[n.l]; cx.beginPath(); cx.arc((n.l + 0.5)*W/3, y, 13, 0, Math.PI*2); cx.fill();
          cx.fillStyle = '#fff'; cx.font = 'bold 15px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('♪', (n.l + 0.5)*W/3, y + 1); cx.globalAlpha = 1;
        }
        if (performance.now() - flashT > 600) fx.textContent = '';
        if (now > h.end + 0.3 || (judged >= notes.length && now > notes[notes.length - 1].t + 0.5)){ finish(Math.round(pts/notes.length*100)); return; }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    });
  }
  // 聽歌: pick any song from the hall's list and she plays all of it (also how the songs get checked by ear)
  async function jukebox(a){
    await G.tune.load(LEADS[0]); if (M.talking !== a.id) return 'quit';
    for (;;){
      gameEl.hidden = false; gameEl.innerHTML = `<div class="rdl"><div class="rdlLantern" aria-hidden="true">🎧</div><p class="rdlC">想聽哪一首？</p></div>`;
      const list = TUNES, c = await say('想聽哪一首？姊姊彈給你聽！', [...list.map(t => t.name + (t.ok === false ? '（試聽中）' : '')), {label:'不聽了', ghost:true}], true);
      if (c === -2){ G.tune.stop(); return 'quit'; } if (c === list.length){ G.tune.stop(); gameEl.hidden = true; return 'done'; }
      const t = list[c]; await G.tune.load(LEADS[c % LEADS.length]); if (M.talking !== a.id) return 'quit';
      gameEl.innerHTML = `<div class="rdl"><div class="rdlLantern beat" aria-hidden="true">🎵</div><p class="rdlQ">${t.name}</p><p class="rdlC">${t.kind}</p></div>`;
      G.tune.play(parseTune(t), {bpm:t.bpm, lead:LEADS[c % LEADS.length], pad:true});
      const d = await say(`這首是「${t.name}」～`, ['換一首', {label:'不聽了', ghost:true}]);
      G.tune.stop(); if (d === -2) return 'quit'; if (d === 1){ gameEl.hidden = true; return 'done'; }
    }
  }
  const GAMES = {riddle:riddleGame, music:musicGame};

  // what a win gives: coins and the badge once in each life, coins once a day after that; the first win ever also unlocks the
  // master's building and teaches the life skill (both stay through later lives)
  function reward(a){
    const S = G.S(), r = rec(a.id), m = a.m, out = [], today = new Date().toDateString();
    if (r.gen !== S.gen){ r.gen = S.gen; G.addCoins(m.coins); out.push(`🪙 ${m.coins} 代幣`); out.push(`${m.badge.icon} ${m.badge.name}（這一世）`); }
    else if (r.day !== today){ G.addCoins(m.daily); out.push(`🪙 ${m.daily} 代幣（今天的小獎勵）`); }
    if (!r.ever){ r.ever = true;
      if (m.building){ G.unlockBuild(m.building); out.push(`🏗️ 特殊建築：${G.buildName(m.building)}（到「商店 → 建築」免費蓋）`); }
      if (m.skill){ G.learn(m.skill); out.push(`✨ 生活技能：${G.skillName(m.skill)}`); } }
    r.day = today; r.wins = (r.wins || 0) + 1; G.save(); G.track && G.track('master:' + a.id);
    return out;
  }

  M.badgesHTML = () => Object.entries(MASTERS).map(([id, m]) => { const ok = M.badge(id), met = !!rec(id).met;
    return `<div class="tile${ok ? '' : ' dim'}"><span class="ti">${ok ? m.badge.icon : '❔'}</span><span class="tn">${m.badge.name}</span><span class="tn" style="color:var(--soft);font-size:11px">${m.areaName}・${met ? m.name : '還沒見過的館主'}：${m.gameName}</span><span class="tb">${ok ? '✓' : ''}</span></div>`; }).join('');
  return M;
}
