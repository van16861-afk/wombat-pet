# 袋熊電子雞

照顧一隻 3D 袋熊，從蛋孵化、長大、進化。用 Google 登入後，電腦和手機共用同一份進度。

- 遊戲網址：https://van16861-afk.github.io/wombat-pet/
- 技術：Three.js（3D）、Firebase Authentication（Google 登入）、Cloud Firestore（雲端存檔）、GitHub Pages（主機）

## 檔案

| 路徑 | 內容 |
|---|---|
| `index.html` | 畫面骨架 |
| `css/style.css` | 樣式 |
| `js/game.js` | 遊戲本體（場景、袋熊、模擬、介面） |
| `js/cloud.js` | Google 登入與雲端存檔同步 |
| `js/firebase-config.js` | Firebase 專案設定 |
| `firestore.rules` | Firestore 安全規則（要貼到 Firebase 後台） |
| `serve.ps1` | 本機測試用的小伺服器 |

## 本機測試

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

然後打開 http://localhost:8123/
