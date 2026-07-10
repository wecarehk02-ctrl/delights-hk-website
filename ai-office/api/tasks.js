import { supabase, TABLE, rowToTask } from "../lib/supabase.js";
import personas from "../lib/personas.data.js";
import { runTask } from "../lib/openrouter.js";

// Claude 回覆可能要幾十秒，俾多啲時間 function 行
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // ---- 攞晒所有 task（前端每 3 秒 poll 一次） ----
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ tasks: (data || []).map(rowToTask) });
  }

  // ---- 起新 task + 即時處理 ----
  if (req.method === "POST") {
    const { personaId, description } = req.body || {};
    if (!personaId || !description || !description.trim()) {
      return res.status(400).json({ error: "personaId 同 description 都係必填" });
    }
    const persona = personas.find((p) => p.id === personaId);
    if (!persona) {
      return res.status(400).json({ error: `搵唔到persona: ${personaId}` });
    }

    // 1) 先寫低一張「執行中」嘅 task
    const { data: inserted, error: insErr } = await supabase
      .from(TABLE)
      .insert({
        persona_id: personaId,
        persona_title: persona.title,
        description: description.trim(),
        status: "executing",
      })
      .select()
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    // 2) 同步 call Claude，完成後 update 返張 task
    try {
      const { text, usage } = await runTask(persona.content, description.trim());
      const { data: done } = await supabase
        .from(TABLE)
        .update({
          status: "completed",
          result: text,
          usage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id)
        .select()
        .single();
      return res.status(201).json({ task: rowToTask(done || inserted) });
    } catch (err) {
      const { data: failed } = await supabase
        .from(TABLE)
        .update({
          status: "failed",
          error: String(err?.message || err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id)
        .select()
        .single();
      return res.status(201).json({ task: rowToTask(failed || inserted) });
    }
  }

  res.status(405).json({ error: "method not allowed" });
}
