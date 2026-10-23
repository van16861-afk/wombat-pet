# 袋熊電子雞 — 製作規則

這些是遊戲作者訂下的規則，之後每一次修改都要遵守。

## 動物
1. **動作必須自然**：動物的移動要拆成正確的關節動作（腿、膝蓋、腳掌、翅膀、尾巴、頭頸分開動），走路、跑步、游泳、飛行都要有對應的肢體動作，**不能整隻平移**。
2. **外觀如實呈現**：該有鬍鬚就要有鬍鬚；身上是長毛、短毛、羽毛還是甲殼，都必須照真實動物製作（毛用毛的畫法、鳥用羽毛、昆蟲用有光澤的甲殼）。
3. **新動物都要有叫聲**：真實動物會叫的，就要有叫聲（優先用可以免費使用的真實錄音，找不到才用合成音效），並且同一時間不要太多動物一起叫。
4. 動物要有覓食和進食的行為（吃草、啄食、捕獵等）。

## 音樂
5. **音樂由多個樂器組合伴奏而成**：每首曲子都要有主旋律加上伴奏樂器（和弦、低音、鼓等），不能只有單一樂器。

## 技術備註
- 動物模型：`blender/animals_build.py`（無頭模式執行 Blender），輸出 `assets/models/animals.glb`（Draco 壓縮）。可動的部位是獨立物件，命名為 `<動物>_<部位>`，原點在關節。
- 毛（`*_fur`）、羽毛（`*_feather`）、光滑皮膚／甲殼（其他有頂點色的網格，alpha = 光澤）。
- 動物叫聲錄音放在 `assets/sounds/`，來源與授權寫在 `assets/sounds/CREDITS.md`。
- 沒有骨架的靜態模型（袋鼠……）用 `blender/rig_build.py` 自動轉正、減面，依 `blender/rig_specs.py` 的骨頭位置裝骨架、算權重、做動作；先用 `PREP=1` 輸出到 `assets/source/rigprep/`，再用 `tools/view.html?...&side=x` 的格線量骨頭位置。
- 寫實動物（老虎、鹿、狼、駝鹿、馬、鱷魚）：Sketchfab 的骨架動畫模型，原始檔在 `assets/source/sketchfab/`（不上傳），用 `blender/real_build.py` 減面、縮貼圖、整理動作後輸出 `assets/models/real/<名字>.glb`；作者與授權寫在 `assets/models/CREDITS.md`。遊戲裡由 `fauna.js` 依行為播放牠們自己的動作（走、跑、吃草、躺下、嚎叫），步伐速度跟著移動速度。`tools/view.html?f=檔案&a=動作&t=秒` 可以單獨檢查模型。
- 外部素材（CC0）原始檔放在 `assets/source/`（不上傳）：Quaternius Stylized Nature MegaKit（`blender/nature_build.py` → `assets/models/nature.glb`：樹、松、灌木、草叢、花、蕨類、蘑菇）、Quaternius Ultimate Animated Animals、GOBKIT 昆蟲／鳥類包。
