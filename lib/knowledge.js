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
      periodDays: 7,
      tiers: [
        // Official ChatGPT tiers (learn.chatgpt.com/docs/pricing, 2026-08-14).
        // Quota ranges are per model per 5h window (e.g. Sol 10–100); the
        // 5-hour window is currently temporarily suspended, weekly limits
        // apply — exact weekly numbers are not published, so quotaRequests
        // uses the mid-range reference for display.
        { name: "Plus", default: true, subscription: { amount: 20, currency: "USD", period: "month" }, quota: { requestsPerWeek: 100 } },
        { name: "Pro 5x", subscription: { amount: 100, currency: "USD", period: "month" }, quota: { requestsPerWeek: 500 } },
        { name: "Pro 20x", subscription: { amount: 200, currency: "USD", period: "month" }, quota: { requestsPerWeek: 2000 } },
        { name: "Business", subscription: { amount: 20, currency: "USD", period: "month" }, quota: { requestsPerWeek: 100 } },
      ],
    },
  },
  "github-copilot": {
    label: "GitHub Copilot",
    plan: {
      type: "code",
      periodDays: 30,
      tiers: [
        // Since 2026-06-01 Copilot bills AI Credits ($0.01/credit) per month
        // (github.com/features/copilot/plans); the quota is a dollar value,
        // not request counts.
        { name: "Free", subscription: { amount: 0, currency: "USD", period: "month" }, quota: null },
        { name: "Pro", default: true, subscription: { amount: 10, currency: "USD", period: "month" }, quota: { dollarsPerMonth: 15 } },
        { name: "Pro+", subscription: { amount: 39, currency: "USD", period: "month" }, quota: { dollarsPerMonth: 70 } },
        { name: "Max", subscription: { amount: 100, currency: "USD", period: "month" }, quota: { dollarsPerMonth: 200 } },
        { name: "Business", subscription: { amount: 19, currency: "USD", period: "month" }, quota: { dollarsPerMonth: 19 } },
        { name: "Enterprise", subscription: { amount: 39, currency: "USD", period: "month" }, quota: { dollarsPerMonth: 39 } },
      ],
    },
  },
  "claude-sub": {
    label: "Claude Code (subscription)",
    plan: {
      type: "code",
      periodDays: 7,
      tiers: [
        // claude.com/pricing (2026-08-13); Anthropic no longer publishes exact
        // per-window request counts — only relative multipliers (1x/5x/20x).
        { name: "Pro", default: true, subscription: { amount: 20, currency: "USD", period: "month" }, quota: null },
        { name: "Max 5x", subscription: { amount: 100, currency: "USD", period: "month" }, quota: null },
        { name: "Max 20x", subscription: { amount: 200, currency: "USD", period: "month" }, quota: null },
      ],
    },
  },
  "google-ai-sub": {
    label: "Google AI (Gemini CLI)",
    plan: {
      type: "code",
      periodDays: 1,
      tiers: [
        // Gemini CLI quotas are per user per DAY (geminicli.com/docs/resources/quota-and-pricing).
        { name: "AI Pro", default: true, subscription: { amount: 19.99, currency: "USD", period: "month" }, quota: { requestsPerDay: 1500 } },
        { name: "AI Ultra 5x", subscription: { amount: 99.99, currency: "USD", period: "month" }, quota: { requestsPerDay: 2000 } },
        { name: "AI Ultra 20x", subscription: { amount: 199.99, currency: "USD", period: "month" }, quota: { requestsPerDay: 2000 } },
      ],
    },
  },
  deepseek: {
    label: "DeepSeek API",
    plan: { type: "token" },
    rates: [
      // Peak/off-peak pricing effective 2026-08-17 00:00 +08:00 (official:
      // https://api-docs.deepseek.com/quick_start/pricing/). `schedule` makes
      // costOf() price each call by its own timestamp: calls before
      // effectiveAt use the base (legacy) rate, later calls use peak during
      // peakHours (local time) and off-peak otherwise.
      {
        model: "deepseek-v4-flash",
        inputPerMillion: 0.14,
        outputPerMillion: 0.28,
        cacheReadPerMillion: 0.0028,
        cacheWritePerMillion: 0,
        schedule: {
          effectiveAt: "2026-08-17T00:00:00+08:00",
          peakHours: [[9, 12], [14, 18]],
          peak: { inputPerMillion: 0.44, outputPerMillion: 1.32, cacheReadPerMillion: 0.014, cacheWritePerMillion: 0 },
          offPeak: { inputPerMillion: 0.22, outputPerMillion: 0.66, cacheReadPerMillion: 0.007, cacheWritePerMillion: 0 },
        },
      },
      {
        model: "deepseek-v4-pro",
        inputPerMillion: 0.435,
        outputPerMillion: 0.87,
        cacheReadPerMillion: 0.003625,
        cacheWritePerMillion: 0,
        schedule: {
          effectiveAt: "2026-08-17T00:00:00+08:00",
          peakHours: [[9, 12], [14, 18]],
          peak: { inputPerMillion: 1.32, outputPerMillion: 3.96, cacheReadPerMillion: 0.044, cacheWritePerMillion: 0 },
          offPeak: { inputPerMillion: 0.66, outputPerMillion: 1.98, cacheReadPerMillion: 0.022, cacheWritePerMillion: 0 },
        },
      },
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
      // Cyber (agent/security) family - platform.openai.com/docs/pricing
      { model: "gpt-5.6-cyber", inputPerMillion: 12.5, outputPerMillion: 75, cacheReadPerMillion: 1.25, cacheWritePerMillion: 15.625 },
      { model: "gpt-5.5-cyber", inputPerMillion: 12.5, outputPerMillion: 75, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
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
  moonshot: {
    label: "Moonshot Kimi",
    plan: { type: "token" },
    rates: [
      // Official CNY rates converted at ~7.1 CNY/USD; no separate cache-write line item.
      { model: "kimi-k3", inputPerMillion: 2.82, outputPerMillion: 14.08, cacheReadPerMillion: 0.28, cacheWritePerMillion: 0 },
      { model: "kimi-k2.7-code", inputPerMillion: 0.92, outputPerMillion: 3.8, cacheReadPerMillion: 0.18, cacheWritePerMillion: 0 },
      { model: "kimi-k2.7-code-highspeed", inputPerMillion: 1.83, outputPerMillion: 7.61, cacheReadPerMillion: 0.37, cacheWritePerMillion: 0 },
      { model: "kimi-k2.6", inputPerMillion: 0.92, outputPerMillion: 3.8, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0 },
    ],
  },
  zhipu: {
    label: "Zhipu GLM (z.ai)",
    plan: { type: "token" },
    rates: [
      // International (z.ai) USD rates; cache write is currently free (0).
      { model: "glm-5.2", inputPerMillion: 1.4, outputPerMillion: 4.4, cacheReadPerMillion: 0.26, cacheWritePerMillion: 0 },
      { model: "glm-5.1", inputPerMillion: 1.4, outputPerMillion: 4.4, cacheReadPerMillion: 0.26, cacheWritePerMillion: 0 },
      { model: "glm-5", inputPerMillion: 1.0, outputPerMillion: 3.2, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "glm-5-turbo", inputPerMillion: 1.2, outputPerMillion: 4.0, cacheReadPerMillion: 0.24, cacheWritePerMillion: 0 },
      { model: "glm-4.7", inputPerMillion: 0.6, outputPerMillion: 2.2, cacheReadPerMillion: 0.11, cacheWritePerMillion: 0 },
      { model: "glm-4.5", inputPerMillion: 0.6, outputPerMillion: 2.2, cacheReadPerMillion: 0.11, cacheWritePerMillion: 0 },
    ],
  },
  qwen: {
    label: "Alibaba Qwen",
    plan: { type: "token" },
    rates: [
      // International (DashScope) USD rates for the current 3.7/3.8 generation.
      { model: "qwen3.8-max", inputPerMillion: 2, outputPerMillion: 6, cacheReadPerMillion: 0.21, cacheWritePerMillion: 0 },
      { model: "qwen3.8-2.4t-a95b", inputPerMillion: 2, outputPerMillion: 6, cacheReadPerMillion: 0.21, cacheWritePerMillion: 0 },
      { model: "qwen3.7-max", inputPerMillion: 0.35, outputPerMillion: 1.06, cacheReadPerMillion: 0.035, cacheWritePerMillion: 0 },
      { model: "qwen3.7-plus", inputPerMillion: 0.06, outputPerMillion: 0.23, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "qwen3.7-flash", inputPerMillion: 0.03, outputPerMillion: 0.13, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
    ],
  },
  minimax: {
    label: "MiniMax",
    plan: { type: "token" },
    rates: [
      // M3 Standard at the 50%-off promo; M2.7 regular.
      { model: "minimax-m3", inputPerMillion: 0.3, outputPerMillion: 1.2, cacheReadPerMillion: 0.06, cacheWritePerMillion: 0 },
      { model: "minimax-m2.7", inputPerMillion: 0.3, outputPerMillion: 1.2, cacheReadPerMillion: 0.06, cacheWritePerMillion: 0.375 },
      { model: "minimax-m2.7-highspeed", inputPerMillion: 0.6, outputPerMillion: 2.4, cacheReadPerMillion: 0.06, cacheWritePerMillion: 0.375 },
    ],
  },
  google: {
    label: "Google Gemini",
    plan: { type: "token" },
    rates: [
      // ai.google.dev/gemini-api/docs/pricing (2026-08-13); 3.7/3.6 Flash are
      // promo prices until 2026-12-31; no per-token cache-write fee.
      { model: "gemini-3.7-flash", inputPerMillion: 0.75, outputPerMillion: 3.75, cacheReadPerMillion: 0.075, cacheWritePerMillion: 0 },
      { model: "gemini-3.6-flash", inputPerMillion: 0.75, outputPerMillion: 3.75, cacheReadPerMillion: 0.075, cacheWritePerMillion: 0 },
      { model: "gemini-3.5-flash", inputPerMillion: 1.5, outputPerMillion: 9, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0 },
      { model: "gemini-3.5-flash-lite", inputPerMillion: 0.3, outputPerMillion: 2.5, cacheReadPerMillion: 0.03, cacheWritePerMillion: 0 },
      { model: "gemini-3.1-flash-lite", inputPerMillion: 0.25, outputPerMillion: 1.5, cacheReadPerMillion: 0.025, cacheWritePerMillion: 0 },
      { model: "gemini-3.1-pro-preview", inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "gemini-3-flash-preview", inputPerMillion: 0.5, outputPerMillion: 3, cacheReadPerMillion: 0.05, cacheWritePerMillion: 0 },
      { model: "gemini-2.5-pro", inputPerMillion: 1.25, outputPerMillion: 10, cacheReadPerMillion: 0.125, cacheWritePerMillion: 0 },
      { model: "gemini-2.5-flash", inputPerMillion: 0.3, outputPerMillion: 2.5, cacheReadPerMillion: 0.03, cacheWritePerMillion: 0 },
      { model: "gemini-2.5-flash-lite", inputPerMillion: 0.1, outputPerMillion: 0.4, cacheReadPerMillion: 0.01, cacheWritePerMillion: 0 },
      { model: "gemini-omni-flash-preview", inputPerMillion: 1.5, outputPerMillion: 9, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
    ],
  },
  xai: {
    label: "xAI Grok",
    plan: { type: "token" },
    rates: [
      // docs.x.ai/developers/pricing (Wayback 2026-08-01) + cross-checked; no cache-write fee.
      { model: "grok-4.6", inputPerMillion: 2, outputPerMillion: 6, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "grok-4.5", inputPerMillion: 2, outputPerMillion: 6, cacheReadPerMillion: 0.3, cacheWritePerMillion: 0 },
      { model: "grok-4.3", inputPerMillion: 1.25, outputPerMillion: 2.5, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "grok-4.20-0309-reasoning", inputPerMillion: 1.25, outputPerMillion: 2.5, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "grok-4.20-0309-non-reasoning", inputPerMillion: 1.25, outputPerMillion: 2.5, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "grok-4.20-0309-multi-agent", inputPerMillion: 1.25, outputPerMillion: 2.5, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "grok-build-0.1", inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
    ],
  },
  mistral: {
    label: "Mistral",
    plan: { type: "token" },
    rates: [
      // mistral.ai/pricing (Wayback 2026-08-11); cache read = official 10% discount, no cache-write fee.
      { model: "mistral-large-latest", inputPerMillion: 0.5, outputPerMillion: 1.5, cacheReadPerMillion: 0.05, cacheWritePerMillion: 0 },
      { model: "mistral-medium-latest", inputPerMillion: 1.5, outputPerMillion: 7.5, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0 },
      { model: "mistral-small-latest", inputPerMillion: 0.15, outputPerMillion: 0.6, cacheReadPerMillion: 0.015, cacheWritePerMillion: 0 },
      { model: "ministral-3-14b", inputPerMillion: 0.2, outputPerMillion: 0.2, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0 },
      { model: "ministral-3-8b", inputPerMillion: 0.15, outputPerMillion: 0.15, cacheReadPerMillion: 0.015, cacheWritePerMillion: 0 },
      { model: "ministral-3-3b", inputPerMillion: 0.1, outputPerMillion: 0.1, cacheReadPerMillion: 0.01, cacheWritePerMillion: 0 },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    plan: { type: "token" },
    rates: [
      // Live model catalog from openrouter.ai/api/v1/models (2026-08-14);
      // OpenRouter's own listed rates (may differ from first-party pricing).
      { model: "anthropic/claude-haiku-4.5", inputPerMillion: 1.0, outputPerMillion: 5.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "anthropic/claude-opus-5", inputPerMillion: 5.0, outputPerMillion: 25.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "anthropic/claude-opus-5-fast", inputPerMillion: 10.0, outputPerMillion: 50.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "anthropic/claude-sonnet-5", inputPerMillion: 2.0, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "deepseek/deepseek-v4-flash", inputPerMillion: 0.14, outputPerMillion: 0.28, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "deepseek/deepseek-v4-flash-0731", inputPerMillion: 0.14, outputPerMillion: 0.28, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "deepseek/deepseek-v4-pro", inputPerMillion: 1.168, outputPerMillion: 2.336, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "deepseek/deepseek-v4-pro-0813", inputPerMillion: 0.435, outputPerMillion: 0.87, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "google/gemini-2.5-pro", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "google/gemini-2.5-pro-preview", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "google/gemini-2.5-pro-preview-05-06", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "google/gemini-3.1-pro-preview", inputPerMillion: 2.0, outputPerMillion: 12.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "google/gemini-3.1-pro-preview-customtools", inputPerMillion: 2.0, outputPerMillion: 12.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "minimax/minimax-m3", inputPerMillion: 0.3, outputPerMillion: 1.2, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "moonshotai/kimi-k3", inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5-image", inputPerMillion: 10.0, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5-image-mini", inputPerMillion: 2.5, outputPerMillion: 2.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5-mini", inputPerMillion: 0.25, outputPerMillion: 2.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5-nano", inputPerMillion: 0.05, outputPerMillion: 0.4, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5-pro", inputPerMillion: 15.0, outputPerMillion: 120.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.1", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.1-codex", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.1-codex-max", inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.1-codex-mini", inputPerMillion: 0.25, outputPerMillion: 2.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.2", inputPerMillion: 1.75, outputPerMillion: 14.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.2-chat", inputPerMillion: 1.75, outputPerMillion: 14.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.2-codex", inputPerMillion: 1.75, outputPerMillion: 14.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.2-pro", inputPerMillion: 21.0, outputPerMillion: 168.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.3-codex", inputPerMillion: 1.75, outputPerMillion: 14.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.4", inputPerMillion: 2.5, outputPerMillion: 15.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.4-image-2", inputPerMillion: 8.0, outputPerMillion: 15.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.4-mini", inputPerMillion: 0.75, outputPerMillion: 4.5, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.4-nano", inputPerMillion: 0.2, outputPerMillion: 1.25, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.4-pro", inputPerMillion: 30.0, outputPerMillion: 180.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.5", inputPerMillion: 5.0, outputPerMillion: 30.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.5-pro", inputPerMillion: 30.0, outputPerMillion: 180.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.6-luna", inputPerMillion: 0.1, outputPerMillion: 0.6, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.6-luna-pro", inputPerMillion: 0.1, outputPerMillion: 0.6, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.6-sol", inputPerMillion: 5.0, outputPerMillion: 30.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.6-sol-pro", inputPerMillion: 5.0, outputPerMillion: 30.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.6-terra", inputPerMillion: 1.0, outputPerMillion: 6.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "openai/gpt-5.6-terra-pro", inputPerMillion: 1.0, outputPerMillion: 6.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "qwen/qwen3.7-max", inputPerMillion: 1.475, outputPerMillion: 4.425, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "qwen/qwen3.8-max", inputPerMillion: 2.0, outputPerMillion: 6.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "x-ai/grok-4.5", inputPerMillion: 2.0, outputPerMillion: 6.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "x-ai/grok-4.6", inputPerMillion: 2.0, outputPerMillion: 6.0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "z-ai/glm-5.1", inputPerMillion: 1.4, outputPerMillion: 4.4, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "z-ai/glm-5.2", inputPerMillion: 0.63, outputPerMillion: 1.98, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      { model: "~deepseek/deepseek-v4-flash-latest", inputPerMillion: 0.08, outputPerMillion: 0.252, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
    ],
  },
  "opencode-zen": {
    label: "OpenCode Zen",
    plan: { type: "token" },
    rates: [
      // Pay-as-you-go gateway on the OpenCode account (opencode.ai/docs/zen,
      // 2026-08-14); prepaid credits, no subscription. Zen's own rates.
      { model: "claude-fable-5", inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 1, cacheWritePerMillion: 0 },
      { model: "claude-opus-5", inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "claude-sonnet-5", inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "claude-haiku-4-5", inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.1, cacheWritePerMillion: 0 },
      { model: "gpt-5.6-sol", inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "gpt-5.6-terra", inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "gpt-5.6-luna", inputPerMillion: 0.2, outputPerMillion: 1.2, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0 },
      { model: "gpt-5.5", inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "gpt-5.4", inputPerMillion: 2.5, outputPerMillion: 15, cacheReadPerMillion: 0.25, cacheWritePerMillion: 0 },
      { model: "gemini-3.7-flash", inputPerMillion: 1.5, outputPerMillion: 7.5, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0 },
      { model: "gemini-3.6-flash", inputPerMillion: 1.5, outputPerMillion: 7.5, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0 },
      { model: "gemini-3.1-pro", inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0 },
      { model: "grok-4.6", inputPerMillion: 2, outputPerMillion: 6, cacheReadPerMillion: 0.5, cacheWritePerMillion: 0 },
      { model: "deepseek-v4-pro", inputPerMillion: 1.74, outputPerMillion: 3.48, cacheReadPerMillion: 0.145, cacheWritePerMillion: 0 },
      { model: "deepseek-v4-flash", inputPerMillion: 0.14, outputPerMillion: 0.28, cacheReadPerMillion: 0.028, cacheWritePerMillion: 0 },
    ],
  },
};


/**
 * Build an auto-discovered plan row for one provider from the knowledge base.
 * `periodDays` defaults to 7 (the weekly quota window the docs publish).
 * For tiered subscriptions the DEFAULT tier (or the first one) feeds the
 * subscription/quota fields; the full tier table is carried in `tiers`.
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
      tiers: null,
    };
  }
  const tiers = plan.tiers ?? [];
  const chosen = tiers.length > 0 ? (tiers.find((tier) => tier.default === true) ?? tiers[0]) : null;
  const subscription = chosen?.subscription ?? plan.subscription ?? null;
  const quota = chosen?.quota ?? plan.quota ?? {};
  return {
    provider,
    type: "code",
    auto: true,
    label: entry.label,
    subscription,
    quotaRequests: quota.requestsPerDay ?? quota.requestsPerWeek ?? null,
    quotaTokens: null,
    dollarsPerWeek: quota.dollarsPerWeek ?? null,
    dollarsPerMonth: quota.dollarsPerMonth ?? null,
    periodDays: plan.periodDays ?? 7,
    // Full tier table when the subscription has multiple plan levels
    // (e.g. Copilot Free/Pro/Pro+/Max, Codex Plus/Pro 5x/20x).
    tiers: tiers.map((tier) => ({
      name: tier.name,
      default: tier.default === true,
      subscription: tier.subscription ?? null,
      quotaRequests: tier.quota?.requestsPerDay ?? tier.quota?.requestsPerWeek ?? null,
      periodDays: tier.periodDays ?? plan.periodDays ?? 7,
    })),
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
  "deepseek-official": "deepseek",
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
