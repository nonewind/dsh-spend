/**
 * Live provider usage/balance adapter registry.
 *
 * Two registries, keyed by the provider id dsh-spend uses elsewhere
 * (normalized through `lib/knowledge.js`):
 *
 *   PROVIDER_USAGE  — subscription/billed-plan quota: one window row per
 *                     period (`5h` / `week` / `month`) with the vendor's
 *                     actual percent used + reset time, plus provider-
 *                     specific `extra` shares.
 *   PROVIDER_BALANCE — token-plan wallets: account balance with the
 *                     currency and (where the vendor reports them) the
 *                     granted / topped-up split.
 *
 * Every adapter is a `fetch(io, endpoint)` async function that resolves
 * to its normalized payload or throws; the caller converts failures into
 * the `{ error }` display payload, so a broken vendor endpoint never
 * crashes the widget. `endpoint` is the matching `usageEndpoints` config
 * row (may be null) and can override the built-in URL / timeout / API-key
 * name.
 *
 * Endpoints / auth (verified 2026-08-25):
 *   opencode-go  — GET https://opencode.ai/zen/go/v1/usage, Bearer API key
 *                  (documented at opencode.ai/docs/go).
 *   openai-codex — GET https://chatgpt.com/backend-api/wham/usage, ChatGPT
 *                  OAuth access token (undocumented, reverse-engineered).
 *   claude-sub   — GET https://api.anthropic.com/api/oauth/usage, Claude
 *                  OAuth access token + `anthropic-beta` header
 *                  (undocumented, reverse-engineered).
 *   github-copilot — GET https://api.github.com/copilot_internal/user,
 *                  GitHub token + editor headers (undocumented).
 *   zhipu        — GET https://bigmodel.cn/api/monitor/usage/quota/limit,
 *                  raw API key in `Authorization` (official; z.ai via URL
 *                  override).
 *   minimax      — GET https://www.minimaxi.com/v1/token_plan/remains,
 *                  Bearer API key (official; minimax.io via URL override).
 *   clinepass    — GET https://api.cline.bot/api/v1/users/me/plan/usage-limits,
 *                  Bearer API key (official).
 *   deepseek     — GET https://api.deepseek.com/v1/user/balance, Bearer
 *                  API key (official; balance: total / granted / top-up).
 *   moonshot     — GET https://api.moonshot.cn/v1/users/me/balance, Bearer
 *                  API key (official; balance: available / voucher / cash).
 *   google-ai-sub — NO public usage endpoint exists (only static per-day
 *                  limits in official docs) — not implemented.
 */

import { deepseekBalanceFetch } from "./balance-deepseek.js";
import { moonshotBalanceFetch } from "./balance-moonshot.js";
import { clinepassUsageFetch } from "./quota-clinepass.js";
import { minimaxUsageFetch } from "./quota-minimax.js";
import { zhipuUsageFetch } from "./quota-zhipu.js";
import { codexFetch } from "./oauth-codex.js";
import { claudeFetch } from "./oauth-claude.js";
import { copilotFetch } from "./oauth-copilot.js";
import { opencodeGoFetch } from "./opencode.js";

/** Built-in live quota (usage) adapters, keyed by provider id. */
export const PROVIDER_USAGE = {
  "opencode-go": { label: "OpenCode Go", fetch: opencodeGoFetch },
  "openai-codex": { label: "OpenAI Codex", fetch: codexFetch },
  "claude-sub": { label: "Claude Code", fetch: claudeFetch },
  "github-copilot": { label: "GitHub Copilot", fetch: copilotFetch },
  zhipu: { label: "ZhipuAI Coding Plan", fetch: zhipuUsageFetch },
  minimax: { label: "MiniMax Token Plan", fetch: minimaxUsageFetch },
  clinepass: { label: "ClinePass", fetch: clinepassUsageFetch },
};

/** Built-in live balance adapters (token plans), keyed by provider id. */
export const PROVIDER_BALANCE = {
  deepseek: { label: "DeepSeek", fetch: deepseekBalanceFetch },
  moonshot: { label: "Moonshot", fetch: moonshotBalanceFetch },
};