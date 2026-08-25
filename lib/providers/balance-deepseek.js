/**
 * DeepSeek account balance adapter.
 *
 * Official endpoint: `GET https://api.deepseek.com/v1/user/balance`
 * (Bearer API key, documented in the DeepSeek platform docs) — returns the
 * platform wallet: total / granted (赠金) / topped-up (充值) per currency.
 * Ported from the display pattern of the GCMP VS Code extension.
 */

import { numOr, notLoggedIn, request, resolveBearerKey } from "./common.js";

/** Default credential seam / env name. */
export const DEEPSEEK_KEY_ENV = "DEEPSEEK_API_KEY";

/** Default balance endpoint (official, documented). */
export const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/v1/user/balance";

/**
 * Normalize the DeepSeek `/user/balance` payload into the widget balance
 * contract `{ currency, total, granted, toppedUp }` (first wallet entry;
 * DeepSeek accounts may split CNY/USD — the primary wallet is first).
 * Pure function, usable from tests.
 */
export function normalizeDeepseekBalance(raw) {
  const infos = raw?.balance_infos;
  const info = Array.isArray(infos) && infos.length > 0 ? infos[0] : undefined;
  if (info === undefined || typeof info !== "object") return null;
  return {
    currency: typeof info.currency === "string" && info.currency.length > 0 ? info.currency : "USD",
    total: numOr(info.total_balance),
    granted: numOr(info.granted_balance),
    toppedUp: numOr(info.topped_up_balance),
  };
}

/** Fetch the DeepSeek wallet balance through the adapter I/O context. */
export async function deepseekBalanceFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? DEEPSEEK_KEY_ENV;
  const key = await resolveBearerKey(io, envName);
  const res = await request(endpoint?.url ?? DEEPSEEK_BALANCE_URL, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const balance = normalizeDeepseekBalance(res.json);
  if (balance === null) throw new Error("balance_infos missing");
  return balance;
}