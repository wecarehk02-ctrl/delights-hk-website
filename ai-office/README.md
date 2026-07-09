# AI 辦公室 — 本機版骨架

呢個係「AI辦公室」dashboard嘅可執行骨架：讀取agent persona檔案、俾你揀persona指派task、
call Amazon Bedrock（Claude）處理，喺一個簡單嘅kanban board度睇結果。

呢份code係喺一個冇網絡連線嘅環境寫㗎，未跑過 `npm install` 同未接駁過真正嘅AWS Bedrock，
交俾Claude Code嗰陣，佢應該：
1. 喺你部有網絡嘅機器上跑 `npm install`
2. 跟住下面步驟接返真嘅persona檔案同AWS credentials
3. 順手做個smoke test（起個task，check下dashboard board）

## 資料夾結構

```
ai-office/
├── server.js           # Express主程式 + API routes
├── lib/
│   ├── personas.js      # 讀取 personas/ 資料夾嘅.md檔案
│   ├── claudeClient.js  # 連Bedrock call Claude（冇AWS credentials時自動用mock模式）
│   └── store.js         # 簡單JSON檔案儲存task（data/tasks.json）
├── personas/             # ⚠ 而家入面得兩個placeholder，要用下面步驟換做真檔案
├── public/               # 前端：index.html + style.css + app.js（純vanilla JS，冇用framework）
├── data/                 # task記錄會自動存喺呢度（tasks.json，已加入.gitignore）
├── package.json
├── .env.example
└── .gitignore
```

## 開始之前

### 1. 安裝dependencies

```bash
npm install
```

### 2. 攞返真正嘅persona檔案

而家 `personas/` 入面得兩個示範用嘅placeholder（`frontend-developer.md`、`copywriter.md`）。
用以下指令clone真正嘅agency-agents repo，攞晒入面所有persona：

```bash
git clone https://github.com/msitarzewski/agency-agents.git tmp-agents
rm personas/frontend-developer.md personas/copywriter.md   # 刪走placeholder
cp tmp-agents/*.md personas/
rm -rf tmp-agents
```

（如果實際repo嘅persona檔案分咗喺sub-folder入面，改返個cp路徑就得，server.js會自動讀
`personas/` 下面所有 `.md` 檔案，唔限層數嘅話記得改埋 `lib/personas.js` 用recursive掃描。）

### 3. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`：
- 冇填AWS credentials之前，程式會自動行**mock模式**（Claude回覆係假資料，但成個UI流程試到）
- 想接返真Bedrock：填 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`，
  同埋去AWS Console → Bedrock → Model access 申請批准你喺 `BEDROCK_MODEL_ID` 揀嘅型號
- 部署去有IAM role嘅Lightsail/EC2時，可以留空access key，程式會自動用返instance role

### 4. 起個server

```bash
npm start
```

開 `http://localhost:3000` 就見到dashboard。

## 用法

1. 喺表單度揀一個persona，落task描述，撳「指派task」
2. 張card會即刻出現喺「執行中」欄
3. 幾秒後（真實call Bedrock可能要幾秒到十幾秒，睇task複雜度）狀態會自動更新做「完成」或者「失敗」
4. 撳張card可以睇返完整回覆內容，同埋Token用量（幫你監控成本）

## 已知限制 / 之後可以加嘅嘢

- 資料儲存用最簡單嘅JSON檔案，5人用量夠用，但唔支援concurrent write鎖定；如果之後用量大咗，
  可以轉用SQLite（`better-sqlite3`）
- 而家冇多用戶登入系統，跟返之前個部署guideline，登入保護喺Caddy嗰層（basic auth）做，
  唔喺app層面
- 冇對話記憶：每個task係獨立一個request，冇跨task嘅context。如果想要agent記得之前傾過乜，
  要自己加conversation history落 `runTask()` 個messages array
- 前端用polling（每3秒攞一次task list），5人用量絕對夠用；如果之後人多咗，可以改做WebSocket
  減少無謂request

## 部署去AWS Lightsail

跟返之前份 `ai-office-setup-guide.md`（AWS一條龍版）嘅 **Part C**，將呢個project
clone去Lightsail instance度，`npm install` → `npm start`（用pm2長開）→ 用Caddy加domain同HTTPS。
