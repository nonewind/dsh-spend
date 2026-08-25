/**
 * ZhipuAI (智谱) Coding Plan quota adapter.
 *
 * Official endpoint: `GET https://bigmodel.cn/api/monitor/usage/quota/limit`
 * (the raw API key in the `Authorization` header — Zhipu keys are sent
 * WITHOUT a `Bearer` prefix) — returns the Coding Plan's per-window caps:
 * `TOKENS_LIMIT` rows with `unit` 3 (every 5 hours) / 6 (weekly) carry a
 * `percentage` used and `nextResetTime`; `TIME_LIMIT` rows carry MCP
 * monthly counts. The international site (api.z.ai) is reachable by
 * overriding the URL through `usageEndpoints`. Same pattern as the GCMP
 * VS Code extension.
 */

import { clampPct, isoFromUnixMs, numOr, notLoggedIn, request, resolveBearerKey } from "./common.js";

/** Default credential seam / env name. */
export const ZHIPU_KEY_ENV = "ZHIPU_API_KEY";

/** Default quota endpoint (official, documented). */
export const ZHIPU_QUOTA_URL = "https://bigmodel.cn/api/monitor/usage/quota/limit";

/** `TOKENS_LIMIT.unit` → limit-window key (3 = every 5 hours, 6 = weekly). */
const ZHIPU_UNIT_WINDOW = { 3: "5h", 6: "week" };

/**
 * Normalize the Zhipu `/api/monitor/usage/quota/limit` payload into the
 * widget usage contract `{ windows, extra, meta }`. Pure function.
 */
export function normalizeZhipuUsage(raw) {
  const windows = {};
  const extra = [];
  const limits = raw?.data?.limits;
  if (!Array.isArray(limits)) return { windows, extra, meta: {} };
  for (const row of limits) {
    if (row === null || typeof row !== "object") continue;
    if (row.type === "TOKENS_LIMIT" && Number.isFinite(Number(row.percentage))) {
      const key = ZHIPU_UNIT_WINDOW[Number(row.unit)];
      if (key === undefined) continue;
      windows[key] = {
        status: "ok",
        percent: clampPct(row.percentage),
        ...(isoFromUnixMs(row.nextResetTime) !== undefined ? { resetsAt: isoFromUnixMs(row.nextResetTime) } : {}),
      };
    } else if (row.type === "TIME_LIMIT") {
      // MCP monthly web-search entitlement: counts, not a percent.
      const entry = { id: "mcp_month", label: "MCP monthly" };
      if (numOr(row.remaining) !== null) entry.remaining = numOr(row.remaining);
      if (numOr(row.usage) !== null) entry.entitlement = numOr(row.usage);
      extra.push(entry);
    }
  }
  return { windows, extra, meta: {} };
}

/** Fetch the Zhipu Coding Plan quota through the adapter I/O context. */
export async function zhipuUsageFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? ZHIPU_KEY_ENV;
  const key = await resolveBearerKey(io, envName);
  const res = await request(endpoint?.url ?? ZHIPU_QUOTA_URL, {
    // Zhipu authenticates with the RAW key in Authorization (no Bearer).
    headers: { Authorization: key, "Content-Type": "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json?.success !== true || res.json?.code !== 200) throw new Error(res.json?.msg || `HTTP ${res.status}`);
  const usage = normalizeZhipuUsage(res.json);
  if (Object.keys(usage.windows).length === 0 && usage.extra.length === 0) {
    throw new Error("no quota limits");
  }
  return usage;
}