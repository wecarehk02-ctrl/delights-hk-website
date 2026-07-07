# F. 維護協議：如何安全更新這套制度

建立：2026-07-07。目的：防止制度檔越改越長、越改越互相矛盾、或被一次錯誤 session 破壞。

## 1. 覆蓋範圍（durable instruction files）
- `CLAUDE.md`（repo 根）
- `.claude/institution/*.md`（全部）
- 未來任何啟動時載入的政策 / agent 定義檔（`.claude/agents/*.md` 等）

## 2. 改前備份（CLAUDE.md 核心規則 3 的細則）
1. `mkdir -p .claude/institution/backups`
2. `cp {檔} .claude/institution/backups/{檔名}.$(date +%Y%m%d-%H%M%S).bak`
3. `ls` 確認備份存在，然後才動原檔
4. 有意義的修改，在最終總結裡報備份路徑
5. 新建檔案免備份；**刪除**任何制度檔前先問使用者（見第 4 節）

## 3. 未來 session 可自行修改的事（有具體證據即可，不用問）
- 修正錯的路徑 / 工具名 / 模型名（證據：當前 tool schema、`ls`、命令輸出）
- 補一條從真實失敗學到的教訓（按第 5 節格式）
- 在真實踩坑後補一個驗證步驟
- 把過長內容從 CLAUDE.md 移入對應 institution 檔（保持路由）
- 為既有規則補一個真實案例
- 更新 `01-model-dispatch.md` 第 0 節的環境事實（能力清單變動）

證據標準：命令輸出、tool discovery、read-back、失敗的測試/log、使用者糾正、審查 finding。
「我覺得這樣更好」不是證據。

## 4. 動之前必須先問使用者的事
- 刪除任何制度檔，或移除一條主要規則而無替代
- 改變自主程度的基本姿態（例如把「不可逆動作先停」放寬）
- 削弱隱私 / 對外動作 / 憑證相關的護欄
- 在使用者未排序的主觀價值之間做選擇（成本 vs 速度、嚴格 vs 寬鬆）
- 任何影響對外服務、計費、公開發佈的規則

好問題：「未來 session 選模型時要成本優先還是速度優先？這會改變預設調度。」
壞問題：「我可以改進規則嗎？」

## 5. 教訓寫回格式

```text
### Lesson YYYY-MM-DD — 短標題
Trigger:（發生了什麼）
Failure mode:（錯了什麼 / 差點錯什麼）
Rule update:（未來的具體動作，寫成「若 X 則 Y，用 Z 驗證」）
Evidence:（命令、file:line、工具輸出或使用者糾正）
```

寫去哪：
| 教訓類型 | 檔案 |
|---|---|
| 模型/工具調度錯誤、環境事實變動 | `01-model-dispatch.md` |
| 完成判定、重試、問人相關 | `02-judgment-rubrics.md` |
| 委派 prompt 缺陷 | `03-delegation-templates.md` |
| 制度維護本身的問題 | 本檔 |
| 廣泛策略性警告 | `05-letter-to-future-sessions.md` |
| 路由問題 | `CLAUDE.md`（保持短，長內容路由出去） |
| 倉存 app 專案事實 | `inventory/README.md` 或 `inventory/COMPARISON.md`（**專案事實不入制度檔**） |

## 6. 精簡規則（防膨脹）
單一制度檔超過 ~450 行，或一次維護要加超過 ~80 行：
1. 不要繼續 append
2. 把重複教訓歸納成一條規則
3. 舊案例移入 `.claude/institution/archive/`（目錄不存在就建）
4. 每條重要規則至少保留一正一反例

**不可精簡掉**：實測過的工具/模型名、安全規則、驗證要求、已知 harness 極限。

禁止加入：無動作的口號、泛泛「小心一點」、重複案例、聊天記錄、raw log、屬於專案文檔的細節。
模糊建議一律轉成：`若 {trigger}，做 {action}，用 {check} 驗證。`

## 7. 改後檢查
- read-back 改過的檔
- 確認 CLAUDE.md 路由表仍指向存在的檔案
- 改動涉及委派或完成定義 → 可行時跑一次 fresh-context 審查（模板 5）

## 8. Change Log（有意義的更新追加一行）

格式：`- YYYY-MM-DD: {檔} — {改動} — 證據: {來源}`

- 2026-07-07: 全套初建 — 由 Fable 5 session 建立；吸收 2026-07-06 Codex session 制度包
  （`fable5institutionpack.zip`）的結構與部分規則，**全部工具/模型名重新錨定到本 Claude Code
  harness 實測清單**（該包的 `multi_agent_v1.*`/`gpt-5.*` 在本環境不存在）。
  證據: 本 session tool schema + zip 內容比對。
