# 兩個倉存實作比對報告（2026-07-07）

比對對象：
- **A = repo 版**：`/inventory/`（本 repo，模組化，已通過瀏覽器 e2e 驗證）
- **B = zip 版**：`delightsinventory.zip`（單檔 `app.js` 實作，來自另一個 session，附 `HANDOFF.md`）

結論先講：**以 A 為主線繼續發展，不要合併 B 的程式碼**。B 有三個功能構想值得日後移植到 A（見下表「值得移植」）。

## 逐項比對

| 面向 | A（repo /inventory/） | B（zip 單檔版） | 判定 |
|---|---|---|---|
| 架構 | 模組化（store/ui/biz + 9 個模組），adapter 隔離數據層 | 單檔 app.js（~75 個 function） | A 勝：可維護、可逐塊替換 |
| QR 產生器 | 自家離線實作，v1–v10、4 個 EC level，經窮舉 round-trip 解碼驗證 | 僅 QR version 1-L，**上限 17 bytes**（app.js:977 自己 throw error） | A 勝：B 的 QR 一旦內容超 17 bytes 即崩 |
| QR 內容 | 指向系統的 deep link（`#lot=…`），掃描後密碼閘 | `DLT:{batchId}` 純文字 | 相若；A 可直接開啟批次頁 |
| 雲端 | Supabase 離線優先同步 + Auth + RLS（已實作） | 只有 webhook placeholder | A 勝 |
| 受保護資料 | 標籤欄位密碼閘 + Supabase RLS 伺服器端控制 | 本地混淆（obfuscation），HANDOFF 自認非production-grade | A 勝 |
| 驗證狀態 | node --check + Playwright e2e 全過 | 無測試記錄 | A 勝 |
| 補貨機制 | 即時 modal：Email 草稿 + webhook POST | **佇列（queue）**：失敗任務留隊，可重試、可人手處理 | **B 構想較好**（見下） |
| 送貨單 | HTML 表格版面（針機友善黑白） | **純文字 80/96/132 欄**（app.js:774），更貼近針機原生輸出 | **B 構想較好** |
| 訂單操作 | 新增/編輯/刪除 | 另有**複製舊單**（duplicate back into form） | **B 構想較好**（日常落單快很多） |
| 發票 email | 無 | 發票可入 email 佇列經 webhook 發送 | B 構想可併入佇列移植 |

## 值得移植到 A 的三個構想（按價值序）

1. **失敗任務佇列**：補貨 email/webhook 失敗時不應只 toast 一下就算；應寫入 `queue` collection（`{type, payload, status, createdAt}`），設「待處理任務」清單供重試。B 的 payload 格式（HANDOFF.md「API / Webhook Contracts」一節）可直接沿用。
2. **複製舊單**：訂單列表加「複製」按鈕，把整張單帶回表單改日期即可重下。餐飲客戶每日下重複單，這是高頻操作。
3. **純文字送貨單模式**：送貨單加「純文字 80/96/132 欄」輸出選項，dot-matrix 連續紙對純文字的相容性最好。

## 不要移植的部分

- B 的 QR 實作（17-byte 上限，A 已有完整版）
- B 的密碼混淆（A 已有 RLS 真保護）
- B 的單檔架構

## 佐證

- B 的 QR 上限：`zip1/app.js:977` `if (bytes.length > 17) throw new Error("Version 1-L QR can hold 17 bytes.")`
- B 的欄寬選項：`zip1/app.js:774` `const width = Number($("#dotMatrixWidth").value || 80)`
- B 的自我評估：`zip1/HANDOFF.md` 「Important Limitations」一節
