/**
 * Provider knowledge base: official plan structure and quotas for known
 * providers, used to auto-discover billing plans (verified from official
 * docs, 2026-08-14):
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

/** One knowledge row per provider id. */
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
  },
};

/**
 * Build an auto-discovered plan row for one provider from the knowledge base.
 * `periodDays` defaults to 7 (the weekly quota window the docs publish).
 */
export function autoPlanFor(provider) {
  const entry = PROVIDER_KNOWLEDGE[provider];
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
