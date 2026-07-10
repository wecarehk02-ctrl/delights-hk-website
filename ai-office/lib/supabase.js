import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// 伺服器端用嘅 Supabase client。key 只喺 serverless function 內用，唔會出到瀏覽器。
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

export const TABLE = "ai_office_tasks";

// DB row -> 前端用嘅 task 物件（camelCase）
export function rowToTask(r) {
  return {
    id: r.id,
    personaId: r.persona_id,
    personaTitle: r.persona_title,
    description: r.description,
    status: r.status,
    result: r.result,
    usage: r.usage,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
