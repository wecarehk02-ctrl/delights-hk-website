# AI 辦公室 — Vercel + Supabase + OpenRouter 版

一個俾幾位同事共用嘅 AI dashboard：揀一個 agent persona、落 task，經 **OpenRouter** call **Claude**
處理，喺一個 kanban board 睇結果。冇 server / SSH / AWS 要理，全部行喺 Vercel。

## 架構

```
瀏覽器 (index.html + app.js)
   │  fetch /api/*
   ▼
Vercel serverless functions (api/)
   ├── api/personas.js   讀 persona 清單
   └── api/tasks.js      GET 攞晒 task / POST 起新 task + call Claude
        │
        ├── lib/openrouter.js   經 OpenRouter call Claude
        └── lib/supabase.js     task 存喺 Supabase 表 ai_office_tasks

middleware.js   全站 basic auth（單一共用密碼）
```

- 前端純 vanilla JS，每 3 秒 poll 一次 board。
- Task 存喺 Supabase（唔再係本機 JSON 檔），所以 serverless 都 keep 到記錄。
- Persona 由 `personas/*.md` 喺 build 時產生 `lib/personas.data.js`。

## 環境變數（喺 Vercel dashboard → Settings → Environment Variables 設定）

| 變數 | 用途 |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter 嘅 key（`sk-or-...`）。**留空 = mock 模式**（假回覆，方便試 UI）。 |
| `OPENROUTER_MODEL` | 用邊個 model，例如 `anthropic/claude-sonnet-4.5`（去 https://openrouter.ai/models 揀 anthropic/ 開頭嘅 slug）。 |
| `SUPABASE_URL` | Supabase project URL。 |
| `SUPABASE_KEY` | Supabase publishable key（`sb_publishable_...`）。 |
| `APP_PASSWORD` | 全公司共用登入密碼。**留空 = 唔擋**（首次測試方便）；填咗就要輸入密碼先入到。 |

改完環境變數要 **Redeploy** 先生效。

## 加/改 persona

改 `personas/*.md`（第一個 `# 標題` 做名，第一段做 description，全文做 system prompt），
然後 `npm run build`（或者下次 Vercel 部署會自動重新產生）。

## 本機開發

```bash
npm install
cp .env.example .env    # 填返你嘅值
npm run build           # 產生 lib/personas.data.js
npx vercel dev          # 本機行 Vercel functions
```

## 部署

連 GitHub repo 去 Vercel（Root Directory 揀 `ai-office`），設好上面啲環境變數，push 就自動部署。
或者用 Vercel CLI：`npx vercel --prod`。
