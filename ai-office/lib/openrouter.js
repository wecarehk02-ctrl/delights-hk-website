import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "./config.js";

// 冇設定 OPENROUTER_API_KEY 嗰陣行 mock 模式，等你未有 key 都試到成個 UI 流程。
export function isMockMode() {
  return !OPENROUTER_API_KEY;
}

/**
 * 用 persona 內容做 system prompt，經 OpenRouter call Claude 處理 task。
 * 返回 { text, usage: { inputTokens, outputTokens } }
 */
export async function runTask(systemPrompt, userInput) {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      text:
        "[MOCK MODE - 未設定 OPENROUTER_API_KEY，呢個係假回覆]\n\n" +
        "你揀嘅 persona 已收到 task：\n" +
        `「${userInput}」\n\n` +
        "喺 Vercel 設定好 OPENROUTER_API_KEY，就會攞到真正嘅 Claude 回覆。",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      // OpenRouter 建議帶呢兩個 header（用嚟顯示喺你 OpenRouter dashboard）
      "HTTP-Referer": "https://delights.hk",
      "X-Title": "AI Office",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput },
      ],
      max_tokens: 1024,
      // 若之後轉用 reasoning 模型，呢個會限制 reasoning token；
      // 對非 reasoning 模型（如 deepseek-chat）無害、會被忽略。
      reasoning: { effort: "low" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const usage = {
    inputTokens: data?.usage?.prompt_tokens ?? 0,
    outputTokens: data?.usage?.completion_tokens ?? 0,
  };
  return { text, usage };
}
