// Provider presets for the AI Chat settings. All of them speak the OpenAI-compatible /chat/completions API.
// Model lists were checked against each provider's own docs in November 2026. Catalogs change often, so the
// settings card also has a "Refresh live models" button that asks the provider for its current list.

export const AI_PROVIDERS = {
  groq: {
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    note: "Free plan with rate limits. Preview models can be removed at short notice.",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
      { id: "qwen/qwen3.8-27b", label: "Qwen3.8 27B (preview)" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    note: "Models ending in :free cost nothing and need no credit card, but are rate limited and rotate often. The Free Models Router always picks a working free model.",
    defaultModel: "openrouter/free",
    models: [
      { id: "openrouter/free", label: "Free Models Router (auto-picks a working free model)" },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "NVIDIA Nemotron 3 Ultra" },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "NVIDIA Nemotron 3.5 Lightning" },
      { id: "nvidia/nemotron-3.5-super-vl:free", label: "NVIDIA Nemotron 3.5 Super VL" },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "NVIDIA Nemotron 3 Nano Omni" },
      { id: "baidu/ernie-5.5-flash-preview:free", label: "Baidu ERNIE 5.5 Flash Preview" },
      { id: "thinkingmachines/inkling-2-small:free", label: "Thinking Machines Inkling 2 Small" },
      { id: "dots-studio/dots-3-note-preview:free", label: "Dots Studio Dots3-Note Preview" },
      { id: "inclusionai/ling-3.2-flash:free", label: "inclusionAI Ling 3.2 Flash" },
      { id: "liquid/lfm-3-1.7b:free", label: "LiquidAI LFM3 1.7B" },
      { id: "particle-ai/particle-1:free", label: "Particle-1 (coding)" },
      { id: "cohere/north-mini-code:free", label: "Cohere North Mini Code (coding)" },
      { id: "recursive/flint-v1.0:free", label: "Recursive Flint (coding)" },
    ],
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    note: "Paid. gpt-4o-mini is scheduled to shut down on January 14, 2027; gpt-5-mini on December 11, 2026.",
    defaultModel: "gpt-5.6-luna",
    models: [
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (lightweight)" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (mid-tier)" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (flagship)" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (shuts down Jan 14, 2027)" },
    ],
  },
  gemini: {
    label: "Google Gemini (OpenAI compatible)",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Free tier with rate limits on Flash models. gemini-2.0-flash was shut down on June 1, 2026 and no longer works.",
    defaultModel: "gemini-3.5-flash",
    models: [
      { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
    ],
  },
  custom: {
    label: "Custom Endpoint",
    endpoint: "",
    keyUrl: null,
    note: "Any OpenAI-compatible server. Enter the base URL (for example https://host/v1) and the model name.",
    defaultModel: "",
    models: [],
  },
};

export const PROVIDER_ORDER = ["groq", "openrouter", "openai", "gemini", "custom"];

// Ids that are not chat models, per provider.
const SKIP = {
  groq: /whisper|orpheus|guard|tts|safeguard/i,
  openrouter: /decider|span-01|rerank|embed|guard|moderation/i,
  openai: /audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct|codex|deep-research|sora/i,
  gemini: /embedding|tts|image|live|audio|veo|imagen|robotics|computer-use|lyria/i,
};

/**
 * Asks the provider for its current model list (GET {endpoint}/models) and keeps only chat models.
 * OpenRouter's list is public; the others need a valid API key. Runs in the browser, so a provider that
 * does not allow cross-origin requests will fail; the caller then keeps the built-in list.
 */
export async function fetchLiveModels(providerId, endpoint, apiKey) {
  const base = String(endpoint || "").trim().replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) throw new Error("The endpoint URL is missing or invalid.");
  const isOpenRouter = providerId === "openrouter";
  if (!isOpenRouter && !apiKey) throw new Error("Enter your API key first: this provider only lists models for a valid key.");

  const res = await fetch(`${base}/models`, { headers: isOpenRouter || !apiKey ? {} : { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`The provider answered HTTP ${res.status}.`);
  const json = await res.json();
  const raw = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];

  let list = raw
    .map((m) => ({ id: String(m.id || m.name || "").replace(/^models\//, ""), name: m.display_name || m.name, raw: m }))
    .filter((m) => m.id);

  const skip = SKIP[providerId];
  if (skip) list = list.filter((m) => !skip.test(m.id));
  if (providerId === "openai") list = list.filter((m) => /^(gpt|o\d|chatgpt)/i.test(m.id));
  if (providerId === "gemini") list = list.filter((m) => /^gemini/i.test(m.id));
  if (isOpenRouter) {
    list = list.filter(({ id, raw: m }) => {
      const p = m.pricing || {};
      const free = id.endsWith(":free") || (Number(p.prompt) === 0 && Number(p.completion) === 0);
      const arch = m.architecture || {};
      const textIn = !arch.input_modalities || arch.input_modalities.includes("text");
      const textOut = !arch.output_modalities || arch.output_modalities.includes("text");
      return free && textIn && textOut && id !== "openrouter/free";
    });
  }

  list.sort((a, b) => a.id.localeCompare(b.id));
  const out = list.map((m) => ({ id: m.id, label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id }));
  if (isOpenRouter) out.unshift({ id: "openrouter/free", label: "Free Models Router (auto-picks a working free model)" });
  if (!out.length) throw new Error("The provider returned no chat models.");
  return out;
}
