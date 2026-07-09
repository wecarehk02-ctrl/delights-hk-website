import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-sonnet-4-6";

// 冇設定AWS credentials嗰陣，用mock模式，等你可以喺冇AWS account嘅情況下都test到成個dashboard流程
const MOCK_MODE = !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE;

let client = null;
function getClient() {
  if (!client) {
    client = new BedrockRuntimeClient({ region: REGION });
  }
  return client;
}

/**
 * 用persona嘅內容做system prompt，call Claude處理task。
 * 返回 { text, usage: { inputTokens, outputTokens } }
 */
export async function runTask(systemPrompt, userInput) {
  if (MOCK_MODE) {
    // Mock回覆，方便未設定AWS Bedrock之前都可以test成個UI流程
    await new Promise((r) => setTimeout(r, 800));
    return {
      text:
        "[MOCK MODE - 未設定AWS credentials，呢個係假回覆]\n\n" +
        "你揀嘅persona已收到task：\n" +
        `「${userInput}」\n\n` +
        "喺 .env 入面填好 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION，" +
        "再確認Bedrock console已經批咗你揀嗰個model嘅access，就會攞到真正嘅Claude回覆。",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      system: systemPrompt,
      messages: [{ role: "user", content: userInput }],
      max_tokens: 1024,
    }),
  });

  const response = await getClient().send(command);
  const payload = JSON.parse(new TextDecoder().decode(response.body));

  const text = (payload.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const usage = {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
  };

  return { text, usage };
}

export function isMockMode() {
  return MOCK_MODE;
}
