# 快速掃描（管理者用）

最後更新：2026-10-14（對應：quick-scan-dev 初始版本）

網址：`/quick-scan-dev/`（`noindex`，網站上沒有連結）。

## 流程

1. 手機開 `/quick-scan-dev/`，按「開始掃描」。相機持續掃，符合星級格式的 QR 自動加入清單；新的會震動、畫面下緣變綠，已收錄的變灰。
2. 在清單填五位數代號（清單存在該瀏覽器的 localStorage，重新整理不會消失）。
3. 按「複製新的」，得到一行一筆的「代號 網址」，未填代號的寫 `-----`。
4. 把文字交給 Claude，或自己執行：

```bash
pbpaste | node scripts/add-codes.mjs
```

腳本會列出新增、已存在、代號衝突、無法解析（多半是沒填代號）各幾筆，只寫 `data/codes.json`，確認後 commit、push 即上線。

## 設計

- 直接寫入不經 Issue 審核，因為來源是管理者本人。
- 辨識共用 `assets/qr-reader.js`（原生優先，iOS 用 jsQR），每 120 ms 掃一次。
- 匯出格式由 `assets/scan-list.js` 定義，頁面與腳本共用，測試在 `tests/scan-list.test.mjs`。
