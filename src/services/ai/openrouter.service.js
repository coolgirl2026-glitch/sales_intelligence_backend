import { FRONTEND_URL } from "../../config/env.js";

export async function callOpenRouter({ apiKey, model, maxTokens, messages, responseFormat = null, temperature = null }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": FRONTEND_URL || "http://localhost:5173",
      "X-Title": "Sales Copilot",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(temperature !== null ? { temperature } : {}),
    }),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || text || "OpenRouter API request failed";
    const isCreditIssue = response.status === 402 || message.toLowerCase().includes("credits");

    throw Object.assign(new Error(
      isCreditIssue
        ? "OpenRouter credits are too low for this request. Add credits or lower the model token limits."
        : message
    ), {
      status: response.status,
      details: text,
      model,
    });
  }

  return data;
}
