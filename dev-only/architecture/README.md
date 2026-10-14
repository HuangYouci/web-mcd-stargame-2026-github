# 架構與決策

最後更新：2026-10-14（對應：初始版本）

## 模組邊界

| 位置 | 職責 |
| :--- | :--- |
| `assets/config.js` | repo、LIFF ID、地圖網址、localStorage key |
| `assets/qr.js` | 自寫 QR 編碼器（位元組模式、等級 M、版本 1–20），瀏覽器與 Node 共用 |
| `assets/submission.js` | 投稿驗證、合併、Issue 網址；**網站與 Action 共用同一份規則** |
| `assets/filters.js` / `store.js` / `places.js` | 純函式：篩選排序、兌換紀錄讀寫與匯出入、點位資料解碼 |
| `assets/views.js` | 純展示元件，只吃參數與 callback |
| `assets/qr-reader.js` | 讀 QR：原生 BarcodeDetector 優先，沒有才載入 `assets/vendor/jsQR.js` |
| `assets/app.js` | 唯一持有狀態與 I/O 的地方（fetch、localStorage、相機） |
| `scripts/accept-submission.mjs` | Action 讀 Issue 事件 → 驗證 → 寫 `data/codes.json` |
| `scripts/import-places.mjs` | 下載星級地圖 KML → `data/places.json` |

## 資料

- `data/codes.json`：一筆 = 一個 QR Code。`id` 是 LIFF 網址的 `q` 參數（12 位小寫 hex），`code` 是現場的五位數代號（可空，畫面標「待補代號」，日後由投稿或快掃補上），兩者都不可重複。假設一個點位的代號固定不變（負責人推測，尚未證實）。
- **代號與點位沒有連結**：QR 網址只有 q 參數，看不出是哪個點位，所以 QR Code 不顯示點位、點位表格也沒有「本站收錄」欄。
- 兌換紀錄存在 localStorage，key 有代號用代號、沒代號用 q（`redeemKey`）；補上代號後載入時由 `migrateRedeemed` 把 q 的紀錄搬到代號下。匯出匯入就是這些 key 的字串；匯入未收錄的也會保留，日後收錄時自動顯示為已兌換。
- `data/places.json`：星級地圖的 KML 只有地址沒有座標，所以只做表格不做地圖。點位 ID 由「類型｜原始名稱｜地址」做 FNV-1a 雜湊，重新匯入不變（目前未使用，保留給日後對應）；名稱裡的「（共 N 點）」解析成點數。縣市由地址推得，處理了「巿」異體字、地址省略縣名、只剩郵遞區號三種情況。陣列精簡格式，切到點位分頁才載入。
- `data/summary.json`：點位數與總點數（頁首「網站收錄 n / N」的 N），讓首頁不必載入整份點位。

## 效能

- 首頁卡片的 QR 用 IntersectionObserver 進入畫面附近才產生，同一網址快取 path；path 合併同列連續模組。
- 卡片用 `content-visibility: auto`；標記兌換只替換那一張卡片。點位表格一次 50 列。
- 模組用 `modulepreload`、`codes.json` 用 preload，避免載入瀑布。系統字型，無網頁字型。
- 側欄在 idle 時才讀取。

## 決策

- **第三方套件只有 jsQR**（Apache-2.0，1.4.0，負責人同意引入；直接放進 repo，雜湊與 npm registry 比對過）。QR 編碼自寫，能否被掃描以 `dev-only/qr-verify/` 用 macOS CoreImage 實際解碼驗證（版本 1/2/4/6/10/15/20 全數通過），單元測試只檢查結構。
- **讀 QR**：Chrome / Android 用原生 `BarcodeDetector`；iOS Safari 沒有，第一次按相機或照片時才載入 jsQR（約 57 KB gzip），首頁不下載。
- **投稿走 GitHub Issue Form**：GitHub Pages 是純靜態，沒有可寫入的後端。Issue 免費、有紀錄；缺點是一般人多半沒有 GitHub 帳號。保留為免費通道，日後可另加其他管道。
- **兩段式審核，防資料污染**：開 Issue／修改時 Action 只檢查格式並留言（標「待審核」、「格式錯誤」或「需確認」），不寫資料；**只有 repo 擁有者**加上「收錄」標籤才寫入 `data/codes.json` 並重新部署。
- **部署走 GitHub Actions**：Action 用 `GITHUB_TOKEN` 推的 commit 不會觸發其他 workflow，所以收錄後由 `accept-submission.yml` 的 apply 階段以 `gh workflow run pages.yml` 明確觸發部署。
- **同時收錄多則（競態）**：
  - 資料：每個收錄工作都在推送前重抓最新 main、重跑合併；push 被拒就隨機退避重試，最多 10 次。最終每則都是一個獨立 commit，不會互相覆蓋（2026-10-14 一次核准 6 則實測無衝突）。不用 concurrency group 排隊，因為它只保留一個 pending，其餘會被取消而漏收。
  - 部署：`pages.yml` 的 concurrency 為 `cancel-in-progress`，新的部署會取消舊的。每次觸發部署都在自己的 push 之後，`--ref main` 取的是當下 main 最新 commit，所以最後一次部署必然包含所有已推送的資料；被取消的舊部署只是畫面上的灰色紀錄。
