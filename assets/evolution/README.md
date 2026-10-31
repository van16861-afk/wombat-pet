# 進化演出素材（可替換）

放進來以後，把路徑寫進 `manifest.json`，遊戲就會改用真的素材；沒寫的會用程式合成的替代音效、程式畫的紋章。

## 配樂（已放好）
- `assets/music/evolution/evolution_A_build.mp3`：成長期、成熟期（作者用 Suno 製作後剪輯的 15 秒版本）
- `assets/music/evolution/evolution_B_epic.mp3`：完全體、究極體

## 音效槽（尚缺，現在是合成的替代音）
| 槽位 | 時間點 | 建議內容 |
|---|---|---|
| `awaken` | 0 秒 | 能量甦醒的閃亮聲 |
| `portal` | 2.0 秒 | 被吸進異次元的漩渦、呼嘯聲 |
| `spin` | 3.5 秒 | 開始旋轉的能量嗡鳴 |
| `charge` | 7.0 秒 | 蓄能、越來越高的上升音 |
| `impact` | 爆光（A 約 9.56 秒、B 約 10.05 秒） | 爆光衝擊、低頻轟鳴 |
| `reveal` | 爆光後約 1 秒 | 新型態登場的閃耀聲 |
| `logo` | A 約 12.9 秒、B 約 12.7 秒 | LOGO 出場的金屬、光芒音 |

例：`{"sfx": {"impact": "assets/sounds/evolution/impact.mp3"}, "logos": {}}`

## 型態 LOGO（尚缺，現在是程式畫的各階段紋章）
`assets/evolution/{型態代號}/logo.png`（建議 1024×1024、透明背景的 PNG），例：
`{"sfx": {}, "logos": {"u_gold": "assets/evolution/u_gold/logo.png"}}`
