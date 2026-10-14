# QR 編碼器實際解碼驗證

最後更新：2026-10-14（對應：assets/qr.js 初始版本）

修改 `assets/qr.js` 後跑一次，確認系統解碼器讀得出來。需要 macOS（CoreImage）。

```bash
node dev-only/qr-verify/render-png.mjs dev-only/workspace/qr-verify
```

```bash
swift dev-only/qr-verify/decode.swift dev-only/workspace/qr-verify/manifest.json
```

最後一行應為 `failed 0`，跑完刪除 `dev-only/workspace/qr-verify`。
