# 帝樂倉存系統 · Delights HK Inventory System

一個以表單為主、完全喺瀏覽器運行嘅倉存 / 下單 / 發票系統，配合帝樂香港網站品牌。
資料現時儲存於瀏覽器（localStorage），並以 **adapter 模式** 設計，日後可直接換成雲端後端。

開啟：`/inventory/`（部署後），或本機直接開 `inventory/index.html`。

## 功能對照（按需求）

| # | 需求 | 實現 |
|---|------|------|
| 1 | 可擴張產品目錄，欄位可增減 | **產品目錄** → 「管理欄位」新增／刪除／排序資料欄位（核心欄位鎖定） |
| 2 | 下單系統：下單日期、送貨地址、每日 item、價錢 | **下單系統** → 選客戶自動帶出地址、逐項揀產品／數量／單價（自動套階梯價） |
| 3 | 缺貨自動補貨 email／API | **庫存管理** 低於安全庫存時：一鍵生成補貨 **Email 草稿**（mailto）或 **POST Webhook**（設定內填 URL） |
| 4 | 由銷售生成發票、月結、階梯價（跳bar）、可編輯 | **發票/月結** → 由未開票訂單生成、可選單次／月結、階梯價自動套用、逐項可改價、可加折扣／運費調整、可列印 |
| 5 | Epson 針機列印送貨單 | **送貨單** → 黑白、等寬字體、連續紙友善版面；於列印對話框揀針機 |
| 6 | 新入庫 QR 標籤（受保護資料 + 可見送貨地址） | **標籤打印** → 每批次專屬 QR；送貨地址等可見，入/出庫時間、重量、每盒件數、保存期、存放位置受**密碼保護**（預設遮蔽 ••••••） |
| 7 | 到期前警告 | **庫存管理** 依入庫時間 + 保存期自動計到期日，接近／過期會警告（日數可於設定調整） |
| 8 | 篩具回篩計數器 | **篩具計數** → 記錄每日到貨篩（入）同回篩（還），後台計住各供應商未回篩數量 |

## 架構

```
inventory/
  index.html            外殼（側邊分頁導覽，載入所有程式）
  js/
    vendor/qrcode.js     自家離線 QR 產生器（無外部依賴；載入時自我驗證 RS 表）
    store.js             資料層（adapter 模式；LocalAdapter → 日後換 CloudAdapter）
    ui.js                共用 UI（表單、表格、彈窗、階梯價、密碼閘）
    biz.js               業務邏輯（庫存、到期、補貨、篩具、扣貨 FIFO）
    modules/             各功能分頁
      dashboard products customers orders inventory
      delivery labels invoices sieve settings
    app.js               分頁路由 + QR 深連結（#lot=…）
```

## 雲端同步（Supabase）

已內建 Supabase 接口，**離線優先 + 背景同步**：UI 照舊即時讀本地快取（斷網都用得），
寫入背景推去 Supabase，其他裝置經 realtime 即時更新。

### 一次性設定
1. 建立 Supabase project（免費方案已足夠）。
2. Supabase → **SQL Editor**，貼上並執行 repo 內嘅 [`supabase/schema.sql`](../supabase/schema.sql)
   （建表 `inventory_store`、RLS、realtime）。
3. Supabase → **Authentication → Users** 新增員工帳號（email + 密碼）；
   並喺 **Providers → Email** 關閉 "Allow new users to sign up"，只准你加嘅人登入。
4. 倉存系統 → **設定 → ☁ 雲端同步**，填 **Project URL** 同 **anon public key**
   （Supabase → Project Settings → API 搵到），按「啟用並連接」。
5. 重新載入 → 出現登入畫面 → 用步驟 3 嘅帳號登入。搞掂。

### 登入 / 安全
- 預設 **Email/密碼登入**：RLS 只准已登入用戶讀寫，受保護標籤資料喺伺服器端真正受控。
- 設定內有「改用 anon 免登入」選項（對應 schema 方案 B），**只建議喺唔含敏感資料時用**，
  因為 anon key 會喺前端出現，等同資料公開。

### 運作細節
- 儲存模型：每個 collection 一行 `jsonb` blob（對應本地快取），支援動態欄位、last-write-wins。
- 斷網時改動會排隊（dirty queue），回線 / 登入後自動補推。
- 想改成逐列（row-level）並發，可將 `inventory_store` 拆成每 document 一行；adapter 已隔離，改動集中。

### 純本地 / 其他後端
唔想用雲端就唔好啟用，系統維持純本地。`store.js` 所有讀寫都經 `Store.adapter`，
要接其他後端（Firebase 等）只需仿照 `js/adapters/supabase-adapter.js` 實作同樣介面即可。

## 資料備份

資料存於此瀏覽器。**設定 → 資料備份** 可匯出／匯入 JSON。換機或清快取前記得先匯出。

## QR 標籤

每個入庫批次會產生專屬 QR，內容係指向系統嘅連結（`…/index.html#lot=<批次QR碼>`）。
掃描後開啟該批次資料頁；受保護欄位需輸入密碼先睇到。敏感資料**唔會**直接寫入 QR，
避免任何掃描器直接讀取。

## 保安說明

純瀏覽器版本嘅資料本質上可被裝置持有人讀取，標籤密碼屬**操作性遮蔽**（deterrent），
並非加密保護。需要真正權限控制時，請接雲端後端並將密碼驗證移至伺服器端。
