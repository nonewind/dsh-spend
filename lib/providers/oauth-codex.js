/**
 * OpenAI Codex subscription quota adapter.
 *
 * Reads the Codex CLI's stored OAuth credentials (`~/.codex/auth.json`,
 * `CODEX_HOME`/`~/.config/codex` first; read-only) and queries
 * `GET https://chatgpt.com/backend-api/wham/usage` (undocumented,
 * reverse-engineered — matches the approach of the GCMP VS Code
 * extension). A 401 triggers one OAuth refresh through
 * `auth.openai.com/oauth/token` before failing.
 */

import { clampPct, isoFromUnixSeconds, notLoggedIn, request } from "./common.js";

/** OpenAI OAuth client id used by the Codex CLI (public in Codex CLI). */
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/**
 * Normalize the Codex wham payload into the widget contract
 * `{ windows, extra, meta }`. Pure function — also exported for tests.
 */
export function normalizeCodexUsage(raw) {
  const windows = {};
  const rateLimit = raw?.rate_limit ?? {};
  const primary = rateLimit.primary_window;
  if (primary !== undefined && primary !== null && Number.isFinite(Number(primary.used_percent))) {
    windows["5h"] = {
      status: "ok",
      percent: clampPct(primary.used_percent),
      ...(isoFromUnixSeconds(primary.reset_at) !== undefined ? { resetsAt: isoFromUnixSeconds(primary.reset_at) } : {}),
    };
  }
  const secondary = rateLimit.secondary_window;
  if (secondary !== undefined && secondary !== null && Number.isFinite(Number(secondary.used_percent))) {
    windows["week"] = {
      status: "ok",
      percent: clampPct(secondary.used_percent),
      ...(isoFromUnixSeconds(secondary.reset_at) !== undefined ? { resetsAt: isoFromUnixSeconds(secondary.reset_at) } : {}),
    };
  }
  const extra = [];
  const review = raw?.code_review_rate_limit?.primary_window;
  if (review !== undefined && review !== null && Number.isFinite(Number(review.used_percent))) {
    extra.push({
      id: "code_review",
      label: "code_review",
      percent: clampPct(review.used_percent),
      ...(isoFromUnixSeconds(review.reset_at) !== undefined ? { resetsAt: isoFromUnixSeconds(review.reset_at) } : {}),
    });
  }
  const meta = {};
  if (typeof raw?.plan_type === "string" && raw.plan_type.length > 0) meta.plan = raw.plan_type;
  const credits = raw?.credits;
  if (credits !== undefined && credits !== null && typeof credits === "object") {
    if (credits.has_credits === true) meta.credits = Number(credits.balance) || 0;
    if (credits.unlimited === true) meta.creditsUnlimited = true;
  }
  return { windows, extra, meta };
}

/** Locate the Codex CLI's stored OAuth credentials (read-only). */
async function codexAuth(io) {
  const candidates = [
    typeof io.env.CODEX_HOME === "string" && io.env.CODEX_HOME.length > 0 ? `${io.env.CODEX_HOME}/auth.json` : undefined,
    `${io.home}/.config/codex/auth.json`,
    `${io.home}/.codex/auth.json`,
  ].filter(Boolean);
  for (const path of candidates) {
    const text = await io.readText(path);
    if (text === undefined || text.length === 0) continue;
    try {
      const payload = JSON.parse(text);
      const tokens = payload?.tokens ?? {};
      if (typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0) {
        return {
          accessToken: typeof tokens.access_token === "string" ? tokens.access_token : undefined,
          refreshToken: tokens.refresh_token,
          accountId: typeof tokens.account_id === "string" ? tokens.account_id : undefined,
        };
      }
    } catch {
      // malformed credential file — try the next location
    }
  }
  throw notLoggedIn("not logged in: no Codex credentials (~/.codex/auth.json); run `codex login` first");
}

/** GET the Codex rate-limit payload; throws `AUTH` for 401/403. */
async function codexWham(io, accessToken, accountId) {
  if (typeof accessToken !== "string" || accessToken.length === 0) throw Object.assign(new Error("missing access token"), { code: "AUTH" });
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  if (typeof accountId === "string" && accountId.length > 0) headers["ChatGPT-Account-Id"] = accountId;
  const res = await request("https://chatgpt.com/backend-api/wham/usage", { headers });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`auth rejected (HTTP ${res.status})`), { code: "AUTH" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json === undefined || typeof res.json !== "object") throw new Error("invalid response");
  return res.json;
}

/** Refresh the Codex OAuth access token from the stored refresh token. */
async function codexRefresh(io, refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CODEX_CLIENT_ID,
    refresh_token: refreshToken,
  });
  const res = await request("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
  if (res.json === undefined || typeof res.json !== "object") throw new Error("token refresh: invalid response");
  return res.json;
}

/** Fetch the Codex quota through the adapter I/O context. */
export async function codexFetch(io, endpoint) {
  const auth = await codexAuth(io);
  let json;
  try {
    json = await codexWham(io, auth.accessToken, auth.accountId);
  } catch (error) {
    if (error?.code !== "AUTH" || typeof auth.refreshToken !== "string") throw error;
    const refreshed = await codexRefresh(io, auth.refreshToken);
    json = await codexWham(io, refreshed.access_token, auth.accountId);
  }
  return normalizeCodexUsage(json);
}