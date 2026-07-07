# E. 派工 Prompt 模板（本 harness 版）

建立：2026-07-07。配合 `01-model-dispatch.md` 使用：該檔決定「派不派、派給誰」；本檔決定「prompt 怎麼寫」。
呼叫方式：Agent 工具，填 `subagent_type` + `model` + `prompt`（模板即 prompt 內容）+ 需要結果時 `run_in_background: false`。
**沒有 effort 參數**——不要在 prompt 裡寫 "effort: high"，沒有作用（原因見 dispatch 0.1）。

## 通用前言（貼進每個委派 prompt 開頭）

```text
你在共享 workspace 工作。不要回退或覆蓋不是你做的改動。範圍守在下面指定的邊界內。
長產物寫入檔案，只回報路徑 + 摘要。
不要索取、複製或外傳密鑰、憑證、私人資料；任務似乎需要這些時，停下報告阻塞點，不要猜。

回報格式（嚴格遵守，不要多寫）：
Result: pass | fail | partial
Findings:（每條一句 + 證據）
File refs:（path:line — 為何重要）
Risks:
Next action:（一條）
Artifacts:（有落檔才寫路徑）
不要貼整份檔案或長 log，用 file:line 引用。
```

---

## 模板 1：搜尋（subagent_type: Explore，model: haiku 或 sonnet）

```text
任務類型：codebase 搜尋（唯讀）
目標：找出 {具體事物}，因為主對話需要 {決定/下一步}。
範圍：
- 包含：{路徑/模組/檔案 pattern}
- 排除：{路徑或主題}
要答的問題：
1. {…}
2. {…}
驗收條件：
- 每個結論附 file:line
- 找不到就明說「不存在」，不要推測
- 不要提重構建議，除非直接回答問題需要
搜索廣度：{medium | very thorough}
```

實例（本 repo）：
```text
目標：找出發票階梯折扣的計算位置與被呼叫點，主對話要驗證月結是按行還是按月匯總套折扣。
範圍：包含 inventory/js/；排除 vendor/。
問題：1) tierPrice 定義在哪、簽名是什麼？2) 哪些模組呼叫它？3) 月結生成發票時折扣套在哪一層？
```

## 模板 2：實作（subagent_type: general-purpose，model: sonnet；高風險域驗收升 opus）

```text
任務類型：實作
目標：實作 {功能/修復}，因為 {動機}。
所有權：
- 只可改：{檔案清單}
- 不可碰：{檔案清單}
需求：
- {…}
驗收條件：
- {可觀察的行為}
- {要通過的檢查，附確切命令}
- {edge case}
驗證方法：
- 跑 {命令}（本 repo 常用：node --check、Playwright e2e 配方見 CLAUDE.md）
- 跑不了→寫明確切原因 + 做最強的可用靜態檢查
風格：跟隨鄰近代碼（本 repo：ES5 IIFE 模組、繁中 UI 字串、Tailwind class）。
```

實例：
```text
目標：訂單表單加數量驗證，因為負數會污染庫存。
所有權：只可改 inventory/js/modules/orders.js；不可碰 invoices/labels。
驗收：qty<=0 不能儲存並有中文錯誤提示；原有正常流程照過；node --check 過。
```

## 模板 3：重構（subagent_type: general-purpose，model: sonnet，行為保持證據必交）

```text
任務類型：重構（行為不變）
目標：把 {模組} 重構為 {結構}，因為 {維護原因}。
行為紅線（一項都不能變）：
- {…公開 API / 數據格式 / UI 行為}
範圍：
- 允許改：{檔案}
- 禁止順手做：{誘人但超範圍的事，逐項列}
驗收條件：
- 行為不變的證據：{測試/e2e/對比輸出}
- diff 只落在指定範圍
- 改名的函數，所有呼叫點已同步
```

實例：
```text
目標：把 labels.js 的標籤 CSS 抽成獨立檔，因為 print 與 preview 現在重複兩份。
紅線：標籤打印輸出的視覺結果不變；QR deep link 不變。
禁止順手做：改標籤版面設計、動 qrcode.js。
```

## 模板 4：研究（subagent_type: general-purpose，model: sonnet；需 WebSearch 時先 ToolSearch 載入）

```text
任務類型：研究
目標：研究 {主題}，供決定 {決策}。
來源規則：
- 優先一手/當前來源；API 與平台行為看官方文檔
- 事實與推論分開標；不穩定的事實不得靠記憶
要答的問題：
1. {…}
驗收條件：
- 每個問題有答案或標明「查不到」
- 附來源連結或工具輸出
- 只在證據充分時給單一建議
回報加一節：Options（每個選項一行 tradeoff）。
```

## 模板 5：審查（subagent_type: general-purpose，model: opus；enum 有 fable 且任務關鍵時用 fable）

```text
任務類型：對抗審查（fresh context）
目標：審查 {產物/檔案}，在交付前找出具體缺陷。
你的立場：不要改進作品、不要讚美。只找問題。
重點：
- 規則互相打架
- 錯的路徑 / 工具名 / 模型名（用實際 filesystem 與當前工具清單驗證，不要信檔案自述）
- 弱模型會誤讀的模糊語句
- 缺驗收條件的指示
- 無證據支撐的斷言
驗收條件：
- 每個 finding 附 file:line 或確切引文
- 按嚴重度排序
- 無 finding 時，講明檢查了什麼、什麼沒檢查
```

實例：
```text
目標：審查 CLAUDE.md 與 .claude/institution/*.md。
特別驗證：1) 所有內部路徑真的存在；2) 提到的工具/模型名與你 session 的實際清單一致；
3) 任何兩條規則在同一情境下會不會給出相反指示。
```

---

## 填 model 的守則
1. 先讀 `01-model-dispatch.md` 第 0 節與第 3 節（canonical，本檔不維護第二份清單）。
2. 用最便宜能過驗收的。
3. 當前 enum 沒有你想要的名字 → 用現有最接近層級，並按維護協議更新 dispatch 檔。
