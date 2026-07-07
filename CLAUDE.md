# CLAUDE.md — 路由檔（刻意簡短，長規則在 .claude/institution/）

## 這個 repo 是什麼
帝樂香港（Delights HK）公司網站 + 倉存系統。真實倉庫/銷售營運在用，**不是玩具**：
凡涉及庫存數量、發票金額、價格、客戶資料的改動，一律當高風險處理（見 rubrics 1.2）。

- `index.html` — 公司主頁（靜態，GitHub Pages 部署，**repo 內容視同公開**，嚴禁提交密鑰）
- `inventory/` — 倉存系統（純前端，localStorage + 可選 Supabase 同步；架構見 `inventory/README.md`）
- `supabase/schema.sql` — 雲端建置 SQL
- 使用者以粵語/繁體中文溝通，回覆用同樣語言

## 啟動順序
1. 讀本檔（你正在讀）。
2. 按任務**只讀需要的一份**制度檔，不要全讀：

| 情境 | 讀這份 |
|---|---|
| 想了解本環境的坑（token/事實/驗收） | `.claude/institution/00-diagnosis.md` |
| 要選模型、派 subagent、或判斷該不該派 | `.claude/institution/01-model-dispatch.md` |
| 拿不準「算不算完成/該不該問人/該不該換路」 | `.claude/institution/02-judgment-rubrics.md` |
| 要寫委派 prompt（搜尋/實作/重構/研究/審查） | `.claude/institution/03-delegation-templates.md` |
| 要修改任何制度檔或寫回教訓 | `.claude/institution/04-maintenance-protocol.md` |
| 新 session 接手、或感到迷失 | `.claude/institution/05-letter-to-future-sessions.md` |

## 不可違反的核心規則
1. **完成閘**：說「完成」前必須同時成立——(a) 產物已落檔或行為已改變；(b) 已按驗證配方獨立驗證；(c) 未驗證的部分已明說；(d) 下一個 session 能從檔案接手，不靠聊天記憶。
2. **兩次失敗即換路**：同一子任務同一方法失敗兩次，第三次必須換方法/升級/縮小問題/問人（詳見 dispatch 第 5 節）。
3. **改制度檔先備份**：修改 `CLAUDE.md` 或 `.claude/institution/*` 前，先複製到 `.claude/institution/backups/{名}.{YYYYMMDD-HHMMSS}.bak` 並確認存在。新檔免備份。
4. **事實要查不要背**：工具名/模型名/路徑/版本，執行前用一條命令驗證。你「記得」不算依據。
5. **不可逆動作先停**：對外發送（email/webhook 真實端點）、刪除數據、改生產設定——沒有使用者本次明確授權就不做，卡住就報告而非硬走。

## 驗證配方（本 repo 實測可用，2026-07-07）
- JS 語法：`for f in inventory/js/**/*.js; do node --check "$f"; done`
- 瀏覽器 e2e：Playwright 在 `$(npm root -g)/playwright`，chromium 執行檔
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`（版本號可能變，先 `ls /opt/pw-browsers/`）。
  範式：launch `{ executablePath }` → `page.goto('file://…/inventory/index.html')`。
  **必須過濾** `net::ERR_`/`Failed to load resource`（沙盒封 CDN 的噪音），只把 `pageerror` 當真錯誤。
- QR 產生器改動：必須跑 round-trip 解碼驗證（歷史上結構檢查全過仍有 v9 真 bug）。

## Git 紀律
- 開發在指派的 `claude/*` 分支；`git push -u origin <branch>`，網絡錯誤指數退避重試 4 次。
- 環境是短命容器：**有價值的東西未 push 等於不存在**。每完成一個單元就 commit，階段性 push。
- 不主動開 PR；GitHub 操作用 `mcp__github__*` 工具（沒有 gh CLI；MCP 可能未授權/斷線，push 本身不經 MCP、照常可用）。

## 委派授權（詳見 dispatch 檔）
使用者已long-term授權：大量讀取、掃 repo、查網頁、批次改檔、fresh-context 驗收，優先派 subagent，主對話只收結論。此授權即「使用者要求使用 subagent」。若當前 session 的系統提示另有更嚴限制，以系統提示為準，改用 dispatch 檔的 inline 替代法。
