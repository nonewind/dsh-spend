/**
 * Provider knowledge base: official plan structure, quotas and reference
 * token rates for known providers, used to auto-discover billing plans and
 * pricing (verified from official docs, 2026-08-14):
 *
 *   OpenCode Go  — subscription ($5 first month, then $10/month); usage is
 *                  dollar-capped: $12 / 5h, $30 / week, $60 / month. Official
 *                  estimate for DeepSeek V4 Flash: ~79,050 requests / week.
 *                  https://opencode.ai/docs/go/
 *   OpenAI Codex — ChatGPT subscription add-on; ChatGPT Plus ($20/month)
 *                  grants Codex quotas in 5-hour windows + weekly reviews
 *                  (approx. 30–150 local messages / 5h, 10–25 reviews / week).
 *                  https://apidog.com/blog/codex-usage-limits/
 *   DeepSeek API — pay-as-you-go token billing (no subscription).
 *                  https://api-docs.deepseek.com/quick_start/pricing/
 */

/**
 * One knowledge row per provider id:
 * - `plan`      — billing plan shape (code = subscription+quota, token = usage).
 * - `rates`     — optional official token rates (per million USD) that feed
 *                 auto-generated pricing rows for providers whose models
 *                 appear in the logs; explicit user pricing always wins.
 */
export const PROVIDER_KNOWLEDGE = {
  "opencode-go": {
    label: "OpenCode Go",
    plan: {
      type: "code",
      subscription: { amount: 10, currency: "USD", period: "month" },
      quota: { requestsPerWeek: 79050, dollarsPerWeek: 30 },
    },
  },
  "openai-codex": {
    label: "OpenAI Codex",
    plan: {
      type: "code",
      subscription: { amount: 20, currency: "USD", period: "month" },
      quota: { requestsPerWeek: 100 },
    },
  },
  deepseek: {
    label: "DeepSeek API",
    plan: { type: "token" },
    rates: [
      { model: "deepseek-v4-flash", inputPerMillion: 0.14, outputPerMillion: 0.28, cacheReadPerMillion: 0.0028, cacheWritePerMillion: 0 },
      { model: "deepseek-v4-pro", inputPerMillion: 0.435, outputPerMillion: 0.87, cacheReadPerMillion: 0.003625, cacheWritePerMillion: 0 },
    ],
  },
  openai: {
    label: "OpenAI API",
    plan: { type: "token" },
    rates: [
      // GPT-5.6 family (verified 2026-08-14 from platform.openai.com/docs/pricing;
      // cache read = 10% of input, cache write = 1.25x input)
      { model: "gpt-5.6-sol", inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
      { model: "gpt-5.6-terra", inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2, cacheWritePerMillion: 2.5 },
      { model: "gpt-5.6-luna", inputPerMillion: 0.2, outputPerMillion: 1.2, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0.25 },
      { model: "gpt-5.5", inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "gpt-5.5-pro", inputPerMillion: 30, outputPerMillion: 180, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "gpt-5.4", inputPerMillion: 2.5, outputPerMillion: 15, cacheReadPerMillion: 0.25, cacheWritePerMillion: 0 },
      { model: "gpt-5.4-mini", inputPerMillion: 0.75, outputPerMillion: 4.5, cacheReadPerMillion: 0.075, cacheWritePerMillion: 0 },
      { model: "gpt-5.4-nano", inputPerMillion: 0.2, outputPerMillion: 1.25, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0 },
      { model: "gpt-5.4-pro", inputPerMillion: 30, outputPerMillion: 180, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "gpt-5", inputPerMillion: 1.25, outputPerMillion: 10, cacheReadPerMillion: 0.125, cacheWritePerMillion: 0 },
      { model: "gpt-5-mini", inputPerMillion: 0.25, outputPerMillion: 2, cacheReadPerMillion: 0.025, cacheWritePerMillion: 0 },
      { model: "gpt-5-nano", inputPerMillion: 0.05, outputPerMillion: 0.4, cacheReadPerMillion: 0.005, cacheWritePerMillion: 0 },
      { model: "gpt-5-pro", inputPerMillion: 15, outputPerMillion: 120, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "gpt-5.2", inputPerMillion: 1.75, outputPerMillion: 14, cacheReadPerMillion: 0.175, cacheWritePerMillion: 0 },
      { model: "gpt-5.2-pro", inputPerMillion: 21, outputPerMillion: 168, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      // Reasoning family
      { model: "o3", inputPerMillion: 2, outputPerMillion: 8, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "o3-pro", inputPerMillion: 20, outputPerMillion: 80, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "o4-mini", inputPerMillion: 1.1, outputPerMillion: 4.4, cacheReadPerMillion: 0.275, cacheWritePerMillion: 0 },
      { model: "o1", inputPerMillion: 15, outputPerMillion: 60, cacheReadPerMillion: 7.5, cacheWritePerMillion: 0 },
      { model: "o1-pro", inputPerMillion: 150, outputPerMillion: 600, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
    ],
  },
  anthropic: {
    label: "Anthropic API",
    plan: { type: "token" },
    rates: [
      // Verified 2026-08-14 from official rate cards via cross-checked sources;
      // cache write uses the 5-minute TTL tier (1.25x input); Sonnet 5 is a
      // promo price valid until 2026-08-31 (base $3/$15 after).
      { model: "claude-opus-5", inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
      { model: "claude-sonnet-5", inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.2, cacheWritePerMillion: 2.5 },
      { model: "claude-haiku-4-5", inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.1, cacheWritePerMillion: 1.25 },
      { model: "claude-fable-5", inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 1, cacheWritePerMillion: 12.5 },
      { model: "claude-mythos-5", inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 1, cacheWritePerMillion: 12.5 },
      { model: "claude-opus-4-8", inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
      { model: "claude-opus-4-7", inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
      { model: "claude-opus-4-6", inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
      { model: "claude-opus-4-5", inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
      { model: "claude-sonnet-4-6", inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
      { model: "claude-sonnet-4-5", inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
    ],
  },
};

/**
 * Build an auto-discovered plan row for one provider from the knowledge base.
 * `periodDays` defaults to 7 (the weekly quota window the docs publish).
 */
export function autoPlanFor(provider) {
  const entry = PROVIDER_KNOWLEDGE[normalizeProvider(provider)];
  if (entry === undefined) return undefined;
  const plan = entry.plan;
  if (plan.type === "token") {
    return {
      provider,
      type: "token",
      auto: true,
      label: entry.label,
      subscription: null,
    };
  }
  return {
    provider,
    type: "code",
    auto: true,
    label: entry.label,
    subscription: plan.subscription ?? null,
    quotaRequests: plan.quota?.requestsPerWeek ?? null,
    quotaTokens: null,
    dollarsPerWeek: plan.quota?.dollarsPerWeek ?? null,
    periodDays: 7,
  };
}

/** Whether the knowledge base knows a provider's plan. */
export function knowsProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_KNOWLEDGE, provider);
}

/**
 * Common provider-id aliases → canonical knowledge-base id. Deployment
 * configs name providers in many ways ("glm" vs "zhipu", "kimi" vs
 * "moonshot", "grok" vs "xai", "gemini" vs "google", "dashscope" vs
 * "qwen"); normalize before matching so auto-detection just works.
 */
export const PROVIDER_ALIASES = {
  glm: "zhipu",
  bigmodel: "zhipu",
  zhipuai: "zhipu",
  kimi: "moonshot",
  "moonshot-ai": "moonshot",
  dashscope: "qwen",
  aliyun: "qwen",
  tongyi: "qwen",
  gemini: "google",
  "google-ai": "google",
  "google-gemini": "google",
  grok: "xai",
  "x-ai": "xai",
  claude: "anthropic",
  "anthropic-api": "anthropic",
  copilot: "github-copilot",
  github: "github-copilot",
  "claude-code": "claude-sub",
  "gemini-cli": "google-ai-sub",
  "google-ai-pro": "google-ai-sub",
};

/** Normalize one provider id through the alias table. */
export function normalizeProvider(provider) {
  if (provider === undefined || provider === null) return provider;
  const alias = PROVIDER_ALIASES[provider];
  return alias ?? provider;
}

/**
 * Auto-generated pricing rows from the knowledge base for one provider's
 * official token rates. Returns [] when the provider has no rate table.
 */
export function autoRatesFor(provider) {
  const entry = PROVIDER_KNOWLEDGE[normalizeProvider(provider)];
  if (entry === undefined || entry.rates === undefined) return [];
  return entry.rates.map((rate) => ({ ...rate, provider, auto: true }));
}
