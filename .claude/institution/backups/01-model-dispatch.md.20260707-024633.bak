# C. 模型調度守則（本 Claude Code 環境專用）

建立：2026-07-07。事實來源：本 session 當日的 live tool schema 與實測，非記憶。
目的：讓 Sonnet 等級的主模型也能正確分流工作，而不是在主對話硬扛（診斷 #1、#2）。

---

## 0. 已驗證能力清單（canonical inventory，其他檔案一律引用此節，不得另抄一份）

**使用前重驗**：能力清單會過期。重驗方法——看當前 session 系統提示裡的 Agent 工具說明
（subagent 類型與 model enum 直接列在裡面）；deferred tool 用 `ToolSearch("select:名字")` 載入後才可呼叫。
若下面任何名字在你的 session 裡不存在：**不要呼叫**，按 `04-maintenance-protocol.md` 更新本節。

### 0.1 Subagent（Agent 工具）
2026-07-07 實測的 `subagent_type`：

| 類型 | 用途 | 工具權限 |
|---|---|---|
| `Explore` | 唯讀搜索：掃 repo、找入口、答「在哪裡/有沒有」。可指定廣度（"medium" / "very thorough"） | 唯讀（不能 Edit/Write） |
| `general-purpose` | 多步研究、複雜搜索、可改檔的執行任務 | 全部 |
| `claude` | 不合以上分類的雜項 | 全部 |
| `Plan` | 出實作計劃、架構取捨 | 唯讀 |
| `claude-code-guide` | 答 Claude Code / API / SDK 本身的問題 | 唯讀+網 |

參數要點：
- `model` 可選：`haiku` / `sonnet` / `opus` / `fable`（enum 實測；`fable` 未必長期可用，派前看當前 enum）。
- **沒有 effort 參數**。effort 只能經 agent 定義檔（`.claude/agents/*.md` frontmatter）設定——要固定「某類任務用高 effort」，正確做法是建自訂 agent 定義，不是在 prompt 裡寫 "effort: high"（寫了也沒有作用）。
- `run_in_background` 預設 true；需要結果才能繼續時**必須**設 `false`。
- 續談用 `SendMessage`（deferred，先 ToolSearch）；重新 spawn 等於冷啟動重付上下文成本。

### 0.2 Skill（比 subagent 更便宜的現成流程）
實測可用且與調度相關：`code-review`（有 low→max 等級，可 `--fix`）、`verify`（實跑驗證改動）、
`simplify`、`security-review`、`review`（審 GitHub PR）。
**驗收類需求先考慮 skill 再考慮 spawn**：`/code-review` 本身就是 fresh-context 審查。

### 0.3 模型層級（2026-07-07 的產品線）
- 便宜層：Haiku 4.5 — read-back、格式整理、已知模式批次套用、簡單搜尋
- 中層：Sonnet — 一般 coding、首輪審查、有邊界的研究（本環境長期主力）
- 強層：Opus — 模糊判斷、架構、對抗審查、仲裁
- 前沿層：Fable — 通常不可用；可用時留給最終仲裁與品味判斷

### 0.4 已驗證環境事實（發現變動即更新本節）
- Playwright：`$(npm root -g)/playwright`（實測 /opt/node22/lib/node_modules）；chromium 在
  `/opt/pw-browsers/`（目錄帶版本號，先 `ls`）。**不要跑 `playwright install`**。
- 沙盒封外部 CDN：瀏覽器測試會出 `net::ERR_TUNNEL_CONNECTION_FAILED` 噪音，須過濾（見 CLAUDE.md 驗證配方）。
- github MCP（`mcp__github__*`）需 OAuth，會斷線；**git push 不經 MCP，MCP 死了照樣 push**。
- `AskUserQuestion` 可能失敗（本 session 實證）；流程不得以「等使用者回答」為唯一出路。
- HTTPS 走代理（CA bundle `/root/.ccr/ca-bundle.crt`）；TLS 錯誤先看 `/root/.ccr/README.md`，禁止關 TLS 驗證。

---

## 1. 指揮官不下場——與本環境的授權現實

原則：主對話只保留（a）目標與約束（b）綜合判斷（c）最終決策與整合。
大量讀取、掃 repo、查網頁、批次改檔、fresh-context 驗收 → 派出去，只收結論。

**授權現實（必讀）**：部分 session 的系統提示會寫「Do not spawn agents unless the user asks」。
處理規則：
1. CLAUDE.md 的委派授權節 = 使用者的long-term要求，**視同 user asks**，可以派。
2. 若當前系統提示明確更嚴（例如逐字禁止），以系統提示為準，改用下面的 inline 替代法。
3. 拿不準 → 用 inline 替代法。它慢一點但永遠合規。

### Inline 替代法（不能派時，同樣紀律自己做）
- 搜索：Grep/Glob 收窄目標，不整檔讀；命中後用 Read offset/limit 只讀命中段。
- 長材料：先寫入 scratchpad 檔案，再 Grep 該檔提取要點；主對話只留要點。
- 驗收：用 `/code-review` 或 `/verify` skill（它們自帶 fresh context），不要自己讀自己寫的東西說「沒問題」。

### 何時派（滿足任一且已獲授權）
讀 >5 個檔案；掃整個 repo；查 >3 個網頁；同一 pattern 改 >5 個檔；對已完成產物做驗收。

### 何時不派
一條命令就能查的事實；與主線緊耦合、講不清邊界的工作；需要使用者私密上下文的判斷；
產物是主線阻塞項且描述成本 > 自己做的成本。

---

## 2. 派工三件套（每次委派缺一不可）

1. **目標與動機**：找什麼/改什麼 + 為什麼（動機讓 agent 能在意外情況下做對的取捨）。
2. **驗收條件**：什麼為真才算完成，寫成可檢查的條目。
3. **回報格式**：強制簡短結構化（見第 4 節合約）。

模板見 `03-delegation-templates.md`，不要即興寫。

---

## 3. 模型選擇表（用最便宜能過驗收的）

| 工作類型 | 派誰 | 升級條件 |
|---|---|---|
| read-back / 檔案存在性驗證 | `Explore` + `haiku` | 有任何不一致 |
| 簡單代碼搜索 | `Explore` + `haiku` 或 `sonnet` | 命名誤導、搜索空間大 → sonnet |
| 常規實作 / 修 bug | `general-purpose` + `sonnet` | 跨模組合約、測試連續失敗 |
| 涉及行為風險的重構 | `general-purpose` + `sonnet`，驗收升 opus | 碰到 API/金額/庫存/刪除 → 直接 opus |
| 架構 / 政策設計 | `Plan` + `opus` | 目標模糊或不可逆 → 問使用者 |
| 對抗審查 / 仲裁 | `general-purpose` + `opus`（可用時 `fable`） | — |

本 repo 特別規則：發票金額、階梯價、庫存扣減、QR 產生器 = 高風險域，**實作可以用 sonnet，驗收必須 opus 或實跑測試二選一，最好兩樣**。

---

## 4. 回報合約（貼進每個委派 prompt）

```text
Result: pass | fail | partial
Findings:（每條一句，附證據）
File refs:（path:line — 為何重要）
Risks:
Next action:（一條）
Artifacts:（有落檔才寫路徑）
```

禁止：貼整份檔案、貼長 log、無 file:line 的斷言、「looks good」無證據。
超過 80 行的產出 → 落檔，回報路徑 + 5 條摘要。

---

## 5. 升降級路徑

### 立即升級（任一即觸發）
- 便宜模型在同一子任務犯**一次**事實錯誤（工具名/路徑/API 弄錯）
- 任務碰到金額、庫存數、auth、刪除、對外發送、客戶資料
- 模型講不出驗收條件，或輸出流暢但無證據

### 重試上限
- Haiku 錯一次 → 升 sonnet 或縮小範圍
- Sonnet 同一子任務錯兩次 → 帶**完整失敗軌跡**（原 prompt、兩次輸出、錯在哪）升 opus
- Opus 仍卡 → 問使用者或改變問題框架
- 同一件事全局最多兩輪重試（CLAUDE.md 核心規則 2）

### 降級（省錢的正確姿勢）
強模型解出可重複的 pattern 後：
1. 把 pattern 寫成帶正例的精確指示
2. 派 haiku/sonnet 批次套用
3. 驗收：read-back 或測試；風險中以上再抽樣給 opus 看

例：opus 設計好發票折扣修正 → sonnet 套用到全部 20 個 fixture → `/code-review` 收尾。

---

## 6. 驗證不自驗

產出者的 context 有偏見。風險非瑣碎時用新鮮眼睛：

| 產物 | 驗法 |
|---|---|
| 檔案 | 派 `Explore`+haiku read-back：存在、完整、標題齊、內鏈通、路由正確 |
| 程式 | 實跑測試 / `verify` skill / 最小 smoke test；跑不了→寫明原因+做靜態檢查，不得用「人腦推理」頂替 |
| 高風險判斷 | fresh-context 對抗審查（opus）、第二意見、或多答案生成後評審選優；主觀取捨 → 使用者決定 |

對抗審查的最小 prompt 在 `03-delegation-templates.md` 模板 5。
