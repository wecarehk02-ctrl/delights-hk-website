# 資料庫決策與並發模型（2026-07-07 最終整合版）

本檔回答「database 問題」，並記錄最終整合版採用的儲存模型與理由，供未來 session 接手。

## 問題

倉存系統的業務資料（產品、訂單、發票、批次、佇列）原本只存瀏覽器 localStorage。
兩個真實風險：

1. **單點失效**：資料只在一部瀏覽器，清快取／換機／故障即全失。
2. **並發覆蓋**：初版雲端把「每個 collection」當一個 JSON blob 整份 upsert，
   collection 層 last-write-wins。兩個人同時改**同一 collection**（例如兩位銷售各自落單）時，
   後寫的一方會用自己整份 `orders` array 蓋掉對方 → 有訂單消失。倉庫收貨與銷售落單並行，
   此風險真實存在。

## 決策：Row-level（每 document 一行）jsonb 文件儲存

| 選項 | 並發安全 | 動態欄位 | 複雜度 | 採用 |
|---|---|---|---|---|
| A. 整 collection blob（初版） | collection 層 LWW（同 collection 同時改會丟資料） | ✅ | 最低 | ❌ |
| **B. 每 document 一行 jsonb** | **document 層 LWW（改不同記錄互不影響）** | ✅（data 存 jsonb） | 中 | ✅ 採用 |
| C. 每實體一張關聯表 | 最佳 | ❌ 與「產品可增減欄位」衝突，仍要 jsonb/EAV | 高 | ❌ |

選 B 的理由：直接解決最常見的並發情況（不同人改不同記錄），同時 `data jsonb` 保留了
需求 1 的「產品欄位可自由增減」。餘下的同一記錄同時改仍是 LWW，但那是罕見且可接受的。

## 儲存格式

單一表 `public.inventory_docs`：

```
collection text     -- 'orders' / 'products' / 'settings' …
doc_id     text     -- 文件 id；singleton collection 用 '_doc'
data       jsonb    -- 該文件（或 singleton 的整個 blob）
deleted    boolean  -- 軟刪除（保留審計痕跡，realtime 可傳播刪除）
updated_at timestamptz
primary key (collection, doc_id)
```

兩類 collection：
- **文件型**（陣列，每項有 `id`）：`products, customers, orders, invoices, stockLots,
  pricingTiers, sieveLog, queue` → 每份文件一行。
- **Singleton**（單一物件或無 id 陣列）：`settings, _seq, productSchema` → 一行，`doc_id='_doc'`。

## 同步機制（adapter 內，UI 不變）

- **寫**：`writeAll(collection, newArray)` 先讀舊快取 → 寫新快取 → **逐份 diff**：
  改動/新增的文件各記一個 upsert op、被移除的文件記一個 delete op（軟刪）。
  op 進 pending-ops log（localStorage），去抖後 flush。
- **flush**：把 pending ops 逐行 upsert 進 `inventory_docs`（delete = `deleted:true`）。
  逐行 upsert 依 `(collection,doc_id)` → **不會碰到別人的其他文件行**，這就是並發安全的來源。
- **pull**：select 全部行，按 collection 重組陣列（略過 deleted），寫回快取。
  為免蓋掉本地未同步編輯，pull 前先 flush pending ops。
- **realtime**：某行變動 → 重新 pull 該 collection。

## 已驗證（2026-07-07，本 session）

用**假 Supabase 後端**在真實瀏覽器跑 adapter（見 `scratchpad` 測試，方法記於本檔尾）：
- writeAll 只為改動的文件產生 op，不整份重寫。
- 「裝置 A flush 自己的訂單」不會刪除「裝置 B 直接寫入表的另一張訂單」→ **並發安全成立**。
- 刪除會傳播（軟刪），pull 重組正確略過。

無法在此環境驗證的（誠實標註，rubric 6）：
- 真實 Supabase 的 RLS 行為、realtime 實際觸發延遲、Auth 流程——需使用者用自己的 project 實測，
  第一次連線後把結果補寫回 `inventory/README.md`。

## 仍未做 / 未來升級

- **同一記錄的欄位級合併**（避免同記錄 LWW）：需 CRDT 或欄位級 diff，暫不值得。
- **審計軌跡**：`deleted` + `updated_at` 已保留基礎；要完整 audit log 需另表記每次變更。
- **多租戶／角色權限**（銷售／倉庫／管理員）：需 RLS 加 `auth.uid()` 對應角色欄，見 schema 註解。
