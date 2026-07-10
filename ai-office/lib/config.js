// 集中讀取環境變數。Vercel 上喺 dashboard 設定；本機用 .env。
// 呢個檔案唔會有真 key（全部由 process.env 讀），可以安心 commit。

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
export const APP_PASSWORD = process.env.APP_PASSWORD || "";
