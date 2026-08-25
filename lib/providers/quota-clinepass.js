/**
 * ClinePass plan quota adapter.
 *
 * Official endpoint: `GET https://api.cline.bot/api/v1/users/me/plan/usage-limits`
 * (Bearer API key) — returns per-window percent used plus reset times
 * (five_hour / weekly / monthly). Same pattern as the GCMP VS Code
 * extension (which shows remaining %, reset time and total utilization).
 */

import { clampPct, notLoggedIn, request, resolveBearerKey } from "./common.js";

/** Default credential seam / env name. */
export const CLINEPASS_KEY_ENV = "CLINEPASS_API_KEY";

/** Default quota endpoint (official, documented). */
export const CLINEPASS_QUOTA_URL = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";

/** ClinePass limit type → widget window key. */
const CLINEPASS_WINDOW = { five_hour: "5h", weekly: "week", monthly: "month" };

/**
 * Normalize the ClinePass `/plan/usage-limits` payload into the widget
 * usage contract. `resetsAt` is accepted only when it parses as an ISO
 * date. Pure function.
 */
export function normalizeClinepassUsage(raw) {
  const windows = {};
  const limits = raw?.data?.limits;
  if (!Array.isArray(limits)) return { windows, extra: [], meta: {} };
  for (const row of limits) {
    if (row === null || typeof row !== "object") continue;
    const key = CLINEPASS_WINDOW[row.type];
    if (key === undefined || !Number.isFinite(Number(row.percentUsed))) continue;
    const resetsAt = typeof row.resetsAt === "string" && Number.isFinite(Date.parse(row.resetsAt))
      ? row.resetsAt
      : undefined;
    windows[key] = {
      status: "ok",
      percent: clampPct(row.percentUsed),
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    };
  }
  return { windows, extra: [], meta: {} };
}

/** Fetch the ClinePass plan quota through the adapter I/O context. */
export async function clinepassUsageFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? CLINEPASS_KEY_ENV;
  const key = await resolveBearerKey(io, envName);
  const res = await request(endpoint?.url ?? CLINEPASS_QUOTA_URL, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json?.success !== true) throw new Error(res.json?.error?.message ?? `HTTP ${res.status}`);
  const usage = normalizeClinepassUsage(res.json);
  if (Object.keys(usage.windows).length === 0) throw new Error("no usage limits");
  return usage;
}