/**
 * Moonshot (月之暗面/Kimi) account balance adapter.
 *
 * Official endpoint: `GET https://api.moonshot.cn/v1/users/me/balance`
 * (Bearer API key) — returns `available_balance` with a cash / voucher
 * split, denominated in CNY. Same pattern as the GCMP VS Code extension.
 */

import { numOr, notLoggedIn, request, resolveBearerKey } from "./common.js";

/** Default credential seam / env name. */
export const MOONSHOT_KEY_ENV = "MOONSHOT_API_KEY";

/** Default balance endpoint (official, documented). */
export const MOONSHOT_BALANCE_URL = "https://api.moonshot.cn/v1/users/me/balance";

/**
 * Normalize the Moonshot `/users/me/balance` payload into the widget
 * balance contract. Pure function, usable from tests.
 */
export function normalizeMoonshotBalance(raw) {
  const data = raw?.data;
  if (data === undefined || typeof data !== "object") return null;
  return {
    currency: "CNY",
    total: numOr(data.available_balance),
    granted: numOr(data.voucher_balance),
    toppedUp: numOr(data.cash_balance),
  };
}

/** Fetch the Moonshot wallet balance through the adapter I/O context. */
export async function moonshotBalanceFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? MOONSHOT_KEY_ENV;
  const key = await resolveBearerKey(io, envName);
  const res = await request(endpoint?.url ?? MOONSHOT_BALANCE_URL, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json?.status !== true || res.json?.code !== 0) throw new Error(res.json?.scode ?? `HTTP ${res.status}`);
  const balance = normalizeMoonshotBalance(res.json);
  if (balance === null) throw new Error("balance data missing");
  return balance;
}