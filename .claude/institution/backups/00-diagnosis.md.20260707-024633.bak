# A. 快速診斷：本 harness 最漏 token、最易失焦、最易出錯的三件事

建立：2026-07-07（Fable 5 session，證據來自本 workspace 實際運作記錄）
讀者：之後在此環境運作的 Sonnet / Opus / Haiku session。
本檔是其餘制度檔的依據；各檔開頭引用的「診斷 #N」指這裡。

前身：2026-07-06 有一份 Codex harness 的同類診斷（見 `04-maintenance-protocol.md` 的檔案沿革）。本檔重寫了它，因為它的工具名（`multi_agent_v1.*`）與模型名（`gpt-5.*`）在本 Claude Code 環境全部不存在——這件事本身就是診斷 #2 的最佳證據。

---

## 診斷 #1：主對話被原始材料塞爆（最漏 token）

### 本環境的實證
- 本 session 曾把 3 個各 ~100 行的 e2e 測試腳本直接 inline 在對話裡執行。Fable 的 context 撐得住；Sonnet/Haiku 的長 session 會因此提早觸發 context 壓縮，壓縮後最先丟失的就是任務目標與驗收條件。
- MCP server（github/Canva）在本 session 反覆斷線重連，每次重連注入整頁 server instructions——這是**你控制不了的被動 token 流失**，所以主動流失必須更省。

### 具體修法（可執行判準）
1. **腳本落檔不 inline**：超過 ~30 行的測試腳本、一次性工具，寫入 scratchpad（系統提示裡有本 session 專屬路徑）再 `node <path>` 執行。修改用 Edit，不要重貼整份。
2. **讀檔先讀範圍**：知道要看哪段就用 Read 的 offset/limit 或 Grep 的 `-C` 上下文，不要整檔讀入。超過 500 行的檔案禁止無理由全讀。
3. **長輸出走檔案**：任何會產生長輸出的命令（測試、build、log）加 `| tail -30` 或重導向到 scratchpad 檔案，之後 Grep 它。
4. **一步分流判準**：單一步驟需要讀超過 5 個檔案 / 200 行 log / 3 個網頁，先停：能否用 Grep 縮小？能否派 Explore agent（見 `01-model-dispatch.md` 的授權條件）？能否先落檔再抽讀？

反例（本 session 真事）：把 Playwright e2e 腳本三次整份 inline 在 Bash 命令裡。
正例：寫入 `<scratchpad>/e2e.js` 一次，之後只跑 `node <scratchpad>/e2e.js`，改動用 Edit。

---

## 診斷 #2：環境事實靠記憶不靠查證（最易出錯）

### 本環境的實證
- 昨日另一 session 產出的制度包，整份模型調度表寫的是 `gpt-5.5`/`gpt-5.4-mini` 與 `multi_agent_v1.spawn_agent`——在本環境一個都叫不動。弱模型若照抄，會浪費整輪在呼叫不存在的工具上。
- 本環境工具是**動態的**：deferred tools 要先 ToolSearch 載入 schema 才能呼叫；MCP tools 隨連線狀態出現/消失；github MCP 需要 OAuth 授權，未授權時整組不可用。
- 沙盒封鎖外部 CDN（tailwind/supabase CDN 在測試中回 `ERR_TUNNEL_CONNECTION_FAILED`）——這不是程式 bug，但曾差點被誤判為 bug。

### 具體修法
1. **叫工具前先看清單**：只呼叫當前 system prompt / system-reminder 明確列出的工具。deferred tool 先 `ToolSearch("select:工具名")`。MCP 工具消失了不要重試，改走替代路徑（例如 github MCP 不可用時，git push 仍可用——本 session 驗證過 push 走本地 proxy 不經 MCP）。
2. **模型名以 `01-model-dispatch.md` 的實測清單為準**，該檔同時寫了重新驗證的方法。不確定就重查，不要沿用本檔或任何檔案裡的舊名。
3. **環境事實檔**：`01-model-dispatch.md` 第 0 節維護「已驗證環境事實」（Playwright 路徑、CDN 封鎖、代理設定）。發現事實變了，按 `04-maintenance-protocol.md` 更新該節，不要散落各處。
4. **判準**：任何「工具名/模型名/路徑/版本」出現在你即將執行的動作裡，而你的依據只是「記得」或「檔案裡寫過」→ 先用一條命令驗證（`ls`、`ToolSearch`、`node -e "require.resolve(...)"`）。

反例：照 zip 制度包寫 `spawn_agent(model="gpt-5.4-mini")` → 工具不存在，浪費一輪。
正例（本 session 真事）：要用 Playwright 前先跑 `npm root -g` + `require.resolve` 確認位置，再寫測試。

---

## 診斷 #3：自我驗收 + 完成定義偷換（最易失焦走錯路）

### 本環境的實證
- 本 session 的 QR 產生器：結構檢查（finder/timing pattern）全過，但窮舉 round-trip 解碼在 **version 9 才炸出 alignment pattern 的真 bug**。「看起來對」與「驗證過」在這裡差了一個會令標籤掃不到的缺陷。
- 第一次 e2e 報 2 個 error，實際是 CDN 封鎖噪音而非 app bug——**驗證訊號本身也要判讀**，不加過濾的「有 error 就修」會走去修不存在的問題。
- `AskUserQuestion` 曾中途失敗（permission stream closed）。**依賴問人來卸責的流程在此環境不可靠**：能用安全預設就用預設並記錄，不要停在問題上等。

### 具體修法
1. **驗證階梯**（詳見 `02-judgment-rubrics.md` 第 2 節）：檔案→read-back；程式→由弱到強：`node --check` < 單元邏輯驗證 < 實跑（本 repo 有現成 Playwright 配方，見 CLAUDE.md「驗證配方」）。聲稱「完成」時必須講明用了哪一級、哪些沒驗到。
2. **驗證訊號要過濾**：本 repo 的瀏覽器測試必須過濾 `net::ERR_`/`Failed to load resource`（CDN 封鎖噪音），只把 `pageerror` 與非資源 `console.error` 當真錯誤。
3. **兩次失敗即換路**：同一子任務同一方法失敗兩次，禁止第三次原地重試。選項與升級路徑見 `01-model-dispatch.md` 第 5 節。
4. **問人不可靠時的預設**：選可逆的預設方案 + 在產出裡標明「此處採預設 X，因 Y；可改」。不可逆動作（刪數據、對外發送、改生產設定）例外——寧可停下報告，也不執行。

反例：「syntax check 過了，應該可以用」→ 交付。
正例（本 session 真事）：QR 結構檢查過後仍加做窮舉解碼驗證，抓到 v9 bug 才交付。

---

## 三個診斷如何映射到其他檔案

| 診斷 | 對應制度檔 |
|---|---|
| #1 token | `01-model-dispatch.md`（分流與委派）、`03-delegation-templates.md`（回報合約） |
| #2 事實 | `01-model-dispatch.md` 第 0 節（實測能力清單 + 重驗方法） |
| #3 驗收 | `02-judgment-rubrics.md`（完成/換路/問人判準）、CLAUDE.md 完成閘 |
