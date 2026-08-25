/**
 * MiniMax Token Plan quota adapter.
 *
 * Official endpoint: `GET https://www.minimaxi.com/v1/token_plan/remains`
 * (Bearer API key) — returns per-model remaining percents for the 5-hour
 * and weekly windows (`general` covers the plan as a whole). The
 * international site (minimax.io) is reachable by overriding the URL
 * through `usageEndpoints`. Same pattern as the GCMP VS Code extension.
 */

import { clampPct, isoFromUnixMs, notLoggedIn, request, resolveBearerKey } from "./common.js";

/** Default credential seam / env name. */
export const MINIMAX_KEY_ENV = "MINIMAX_API_KEY";

/** Default quota endpoint (official, documented). */
export const MINIMAX_QUOTA_URL = "https://www.minimaxi.com/v1/token_plan/remains";

/**
 * Normalize the MiniMax `/v1/token_plan/remains` payload into the widget
 * usage contract. The API reports remaining percents; the widget contract
 * uses percent USED per window. Pure function.
 */
export function normalizeMinimaxUsage(raw) {
  const windows = {};
  const models = raw?.model_remains;
  if (!Array.isArray(models)) return { windows, extra: [], meta: {} };
  const general = models.find((model) => model !== null && typeof model === "object" && model.model_name === "general");
  if (general === undefined) return { windows, extra: [], meta: {} };
  const fivePct = Number(general.current_interval_remaining_percent);
  if (Number.isFinite(fivePct)) {
    windows["5h"] = {
      status: "ok",
      percent: clampPct(100 - fivePct),
      ...(isoFromUnixMs(general.interval_end_time) !== undefined ? { resetsAt: isoFromUnixMs(general.interval_end_time) } : {}),
    };
  }
  const weekPct = Number(general.current_weekly_remaining_percent);
  if (Number.isFinite(weekPct)) {
    windows["week"] = {
      status: "ok",
      percent: clampPct(100 - weekPct),
      ...(isoFromUnixMs(general.weekly_end_time) !== undefined ? { resetsAt: isoFromUnixMs(general.weekly_end_time) } : {}),
    };
  }
  return { windows, extra: [], meta: {} };
}

/** Fetch the MiniMax Token Plan quota through the adapter I/O context. */
export async function minimaxUsageFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? MINIMAX_KEY_ENV;
  const key = await resolveBearerKey(io, envName);
  const res = await request(endpoint?.url ?? MINIMAX_QUOTA_URL, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const statusCode = res.json?.base_resp?.status_code;
  if (statusCode !== 0) throw new Error(res.json?.base_resp?.status_msg || `HTTP ${res.status}`);
  const usage = normalizeMinimaxUsage(res.json);
  if (Object.keys(usage.windows).length === 0) throw new Error("no model remains");
  return usage;
}