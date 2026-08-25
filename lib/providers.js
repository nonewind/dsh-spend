/**
 * Live provider usage/balance adapters for subscription providers — facade.
 *
 * The implementations live in `lib/providers/*` (one adapter per vendor,
 * sharing `lib/providers/common.js`); this module keeps the historical
 * import surface (`PROVIDER_USAGE`, the OAuth normalizers) stable.
 *
 * Contract:
 *   usage   → `{ windows: { "5h"?, "week"?, "month"? }, extra?, meta? }`
 *             (`windows` rows: `{ status, percent 0–100, resetsAt?, limit? }`;
 *             `extra`: provider-specific quota shares with a stable `id`).
 *   balance → `{ currency, total, granted?, toppedUp? }` (token plans).
 *
 * Vendors whose endpoint is only known through reverse engineering are
 * documented in the adapter modules; a fetch that yields no usable data
 * converts to an `{ error }` payload by the caller, never a crash.
 */
export { PROVIDER_USAGE, PROVIDER_BALANCE } from "./providers/index.js";
export { normalizeCodexUsage, CODEX_CLIENT_ID } from "./providers/oauth-codex.js";
export { normalizeClaudeUsage, CLAUDE_CLIENT_ID, CLAUDE_SCOPE } from "./providers/oauth-claude.js";
export { normalizeCopilotUsage, ghHostsOauthToken } from "./providers/oauth-copilot.js";