import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

// Same OpenAI-compatible gateway and key the leap-genai-api services use.
const gateway = createOpenAICompatible({
  name: "leap-llm-gateway",
  baseURL: process.env.LLM_GATEWAY ?? "https://openrouter.ai/api/v1",
  apiKey: process.env.LLM_API_KEY,
  includeUsage: true,
});

export default defineAgent({
  model: gateway(process.env.BL_AUDIT_MODEL ?? "google/gemini-2.5-flash"),
  // Gateway models are not in eve's AI Gateway catalog, so the window must be set by hand.
  modelContextWindowTokens: 128_000,
  // Phase 1 is read-only: no shell, file or web tools, only the tools in agent/tools/.
  defaultTools: false,
  limits: {
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= 500_000 ||
      window.outputTokens >= 50_000,
  },
});
