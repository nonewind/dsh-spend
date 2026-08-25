/**
 * Live usage adapters for subscription providers.
 *
 * Each adapter knows how to reach one subscription vendor's official quota
 * endpoint with the credentials a logged-in CLI already left on this
 * machine, and normalizes the payload into the widget contract:
 *
 *   { windows: { "5h"?, "week"?, "month"? }, extra?, meta? }
 *
 * where every window row is `{ status, percent (0–100), resetsAt?, limit? }`
 * and `extra` holds provider-specific quota shares with a stable `id`
 * (the client translates known ids). Vendors whose endpoint is only known
 * through reverse engineering are documented as such; a fetch that yields
 * no usable data converts to an `{ error }` payload by the caller, never a
 * crash.
 *
 * Endpoints / auth (verified 2026-08-25):
 *   opencode-go  — GET https://opencode.ai/zen/go/v1/usage, Bearer API key
 *                  (documented at opencode.ai/docs/go; live percent + reset).
 *   openai-codex — GET https://chatgpt.com/backend-api/wham/usage, ChatGPT
 *                  OAuth access token (undocumented, reverse-engineered).
 *   claude-sub   — GET https://api.anthropic.com/api/oauth/usage, Claude
 *                  OAuth access token + `anthropic-beta` header
 *                  (undocumented, reverse-engineered).
 *   github-copilot — GET https://api.github.com/copilot_internal/user,
 *                  GitHub token + editor headers (undocumented).
 *   google-ai-sub — NO public usage endpoint exists (only static per-day
 *                  limits in official docs) — not implemented.
 */
import { normalizeProviderUsage } from "./stats.js";

/** OpenAI OAuth client id used by the Codex CLI (public in Codex CLI). */
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
/** Claude Code OAuth client id (public in Claude Code). */
export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
/** OAuth scopes Claude Code requests on login. */
export const CLAUDE_SCOPE = "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

const clampPct = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

/** ISO string from a unix-seconds timestamp (or undefined when invalid). */
function isoFromUnixSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

/** Normalize the Codex wham payload into the widget contract. */
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

/** Normalize the Claude OAuth usage payload into the widget contract. */
export function normalizeClaudeUsage(raw) {
  const windows = {};
  const five = raw?.five_hour;
  if (five !== undefined && five !== null && Number.isFinite(Number(five.utilization))) {
    windows["5h"] = {
      status: "ok",
      percent: clampPct(five.utilization),
      ...(typeof five.resets_at === "string" && five.resets_at.length > 0 ? { resetsAt: five.resets_at } : {}),
    };
  }
  const seven = raw?.seven_day;
  if (seven !== undefined && seven !== null && Number.isFinite(Number(seven.utilization))) {
    windows["week"] = {
      status: "ok",
      percent: clampPct(seven.utilization),
      ...(typeof seven.resets_at === "string" && seven.resets_at.length > 0 ? { resetsAt: seven.resets_at } : {}),
    };
  }
  const extra = [];
  for (const [rawKey, id] of [["seven_day_opus", "opus"], ["seven_day_omelette", "design"]]) {
    const row = raw?.[rawKey];
    if (row !== undefined && row !== null && Number.isFinite(Number(row.utilization))) {
      extra.push({
        id,
        label: id,
        percent: clampPct(row.utilization),
        ...(typeof row.resets_at === "string" && row.resets_at.length > 0 ? { resetsAt: row.resets_at } : {}),
      });
    }
  }
  const meta = {};
  const extraUsage = raw?.extra_usage;
  if (extraUsage !== undefined && extraUsage !== null && typeof extraUsage === "object") {
    const summary = {};
    if (extraUsage.is_enabled !== undefined) summary.enabled = extraUsage.is_enabled === true;
    if (Number.isFinite(Number(extraUsage.used_credits))) summary.usedCredits = Number(extraUsage.used_credits);
    if (Number.isFinite(Number(extraUsage.monthly_limit))) summary.monthlyLimit = Number(extraUsage.monthly_limit);
    if (typeof extraUsage.currency === "string" && extraUsage.currency.length > 0) summary.currency = extraUsage.currency;
    if (Object.keys(summary).length > 0) meta.extraUsage = summary;
  }
  return { windows, extra, meta };
}

/** Snapshot key → stable id used by the client's label dictionary. */
const COPILOT_LABELS = {
  premium_interactions: "premium",
  chat: "chat",
  completions: "completions",
  code_completions: "completions",
  code_review: "code_review",
};

/** Normalize the GitHub Copilot internal-usage payload into the widget contract. */
export function normalizeCopilotUsage(raw) {
  const meta = {};
  if (typeof raw?.copilot_plan === "string" && raw.copilot_plan.length > 0) meta.plan = raw.copilot_plan;
  const resetAt = typeof raw?.quota_reset_date === "string" && raw.quota_reset_date.length > 0
    ? (raw.quota_reset_date.includes("T") ? raw.quota_reset_date : `${raw.quota_reset_date}T00:00:00Z`)
    : typeof raw?.limited_user_reset_date === "string" && raw.limited_user_reset_date.length > 0
      ? `${raw.limited_user_reset_date}T00:00:00Z`
      : undefined;
  const extra = [];
  const snapshots = raw?.quota_snapshots;
  const pushRow = (key, row) => {
    if (row === undefined || row === null || typeof row !== "object") return;
    const id = typeof row.quota_id === "string" && row.quota_id.length > 0 ? row.quota_id : COPILOT_LABELS[key] ?? key;
    const out = { id, label: COPILOT_LABELS[key] ?? key };
    const percentRemaining = Number(row.percent_remaining);
    if (Number.isFinite(percentRemaining)) out.percent = clampPct(100 - percentRemaining);
    const remaining = Number(row.remaining);
    if (Number.isFinite(remaining) && remaining >= 0) out.remaining = remaining;
    const entitlement = Number(row.entitlement);
    if (Number.isFinite(entitlement) && entitlement >= 0) out.entitlement = entitlement;
    if (resetAt !== undefined) out.resetsAt = resetAt;
    if (out.percent !== undefined || out.remaining !== undefined) extra.push(out);
  };
  if (snapshots !== undefined && snapshots !== null && typeof snapshots === "object" && !Array.isArray(snapshots)) {
    for (const [key, row] of Object.entries(snapshots)) pushRow(key, row);
  } else {
    // Free tier: monthly_quotas are the entitlement, limited_user_quotas the
    // current remaining counts — used percent is derived from the two.
    const entitlement = raw?.monthly_quotas ?? {};
    const remaining = raw?.limited_user_quotas ?? {};
    for (const key of Object.keys({ ...entitlement, ...remaining })) {
      const ent = Number(entitlement[key]);
      const rem = Number(remaining[key]);
      const row = { id: COPILOT_LABELS[key] ?? key, label: COPILOT_LABELS[key] ?? key };
      if (Number.isFinite(ent) && ent >= 0) row.entitlement = ent;
      if (Number.isFinite(rem) && rem >= 0) row.remaining = rem;
      if (Number.isFinite(ent) && ent > 0 && Number.isFinite(rem) && rem >= 0) row.percent = clampPct(100 - (rem / ent) * 100);
      if (resetAt !== undefined) row.resetsAt = resetAt;
      if (row.percent !== undefined || row.remaining !== undefined) extra.push(row);
    }
  }
  return { windows: {}, extra, meta };
}

/** Fetch helper: JSON request with an abort timeout, no throws on HTTP errors. */
async function request(io, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  let response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers ?? {},
      ...(options.body !== undefined ? { body: options.body } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    throw Object.assign(new Error(`request failed: ${String(error?.message ?? error)}`), { code: "NETWORK" });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let json;
  try {
    json = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, ok: response.ok, text, json };
}

/** Reusable "not logged in" marker so callers can surface a friendly hint. */
function notLoggedIn(message) {
  const error = new Error(message);
  error.code = "NOT_LOGGED_IN";
  return error;
}

// ── opencode-go ────────────────────────────────────────────────────────────

async function opencodeGoFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? "OPENCODE_GO_API_KEY";
  const key = await io.resolveRef(envName);
  if (typeof key !== "string" || key.length === 0) throw notLoggedIn(`API key not configured (${envName})`);
  const res = await request(io, endpoint?.url ?? "https://opencode.ai/zen/go/v1/usage", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json?.type === "error") throw new Error(res.json.error?.message ?? "usage API error");
  return normalizeProviderUsage(res.json, "opencode-go");
}

// ── openai-codex ───────────────────────────────────────────────────────────

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
  const res = await request(io, "https://chatgpt.com/backend-api/wham/usage", { headers });
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
  const res = await request(io, "https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
  if (res.json === undefined || typeof res.json !== "object") throw new Error("token refresh: invalid response");
  return res.json;
}

async function codexFetch(io, endpoint) {
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

// ── claude-sub ─────────────────────────────────────────────────────────────

/** Locate Claude Code's stored OAuth credentials (read-only). */
async function claudeAuth(io) {
  const candidates = [
    typeof io.env.CLAUDE_CONFIG_DIR === "string" && io.env.CLAUDE_CONFIG_DIR.length > 0 ? `${io.env.CLAUDE_CONFIG_DIR}/.credentials.json` : undefined,
    `${io.home}/.claude/.credentials.json`,
  ].filter(Boolean);
  for (const path of candidates) {
    const text = await io.readText(path);
    if (text === undefined || text.length === 0) continue;
    try {
      const payload = JSON.parse(text);
      const oauth = payload?.claudeAiOauth ?? payload?.oauthAccount ?? null;
      const accessToken = oauth?.accessToken ?? oauth?.oauthToken ?? undefined;
      const refreshToken = oauth?.refreshToken ?? oauth?.refresh_token ?? undefined;
      if (typeof accessToken === "string" && accessToken.length > 0
        || typeof refreshToken === "string" && refreshToken.length > 0) {
        return { accessToken, refreshToken };
      }
    } catch {
      // malformed credential file — try the next location
    }
  }
  throw notLoggedIn("not logged in: no Claude credentials (~/.claude/.credentials.json); run `claude` once");
}

/** GET the Claude OAuth usage payload; throws `AUTH` for 401/403. */
async function claudeUsage(io, accessToken) {
  if (typeof accessToken !== "string" || accessToken.length === 0) throw Object.assign(new Error("missing access token"), { code: "AUTH" });
  const res = await request(io, "https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`auth rejected (HTTP ${res.status})`), { code: "AUTH" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json === undefined || typeof res.json !== "object") throw new Error("invalid response");
  return res.json;
}

/** Refresh the Claude Code OAuth access token from the stored refresh token. */
async function claudeRefresh(io, refreshToken) {
  const res = await request(io, "https://platform.claude.com/v1/oauth/token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLAUDE_CLIENT_ID,
      scope: CLAUDE_SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
  if (res.json === undefined || typeof res.json !== "object") throw new Error("token refresh: invalid response");
  return res.json;
}

async function claudeFetch(io, endpoint) {
  const auth = await claudeAuth(io);
  let json;
  try {
    json = await claudeUsage(io, auth.accessToken);
  } catch (error) {
    if (error?.code !== "AUTH" || typeof auth.refreshToken !== "string") throw error;
    const refreshed = await claudeRefresh(io, auth.refreshToken);
    json = await claudeUsage(io, refreshed.access_token);
  }
  return normalizeClaudeUsage(json);
}

// ── github-copilot ─────────────────────────────────────────────────────────

/** Locate a GitHub token: env, gh CLI hosts file, then copilot CLI hosts file. */
async function copilotToken(io) {
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN"]) {
    const value = io.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const ghHosts = await io.readText(`${io.home}/.config/gh/hosts.yml`);
  if (ghHosts !== undefined) {
    const token = ghHostsOauthToken(ghHosts);
    if (token !== undefined) return token;
  }
  const copilotHosts = await io.readText(`${io.home}/.config/github-copilot/hosts.json`);
  if (copilotHosts !== undefined) {
    try {
      const payload = JSON.parse(copilotHosts);
      const host = payload?.["github.com"] ?? payload?.github ?? null;
      if (typeof host?.oauth_token === "string" && host.oauth_token.length > 0) return host.oauth_token;
    } catch {
      // malformed — fall through
    }
  }
  throw notLoggedIn("not logged in: no GitHub token (env GH_TOKEN or `gh auth login`)");
}

/** Extract `oauth_token` under the `github.com:` section of a gh hosts.yml. */
export function ghHostsOauthToken(text) {
  const lines = text.split(/\r?\n/);
  let inGithub = false;
  for (const line of lines) {
    if (/^github\.com:\s*$/.test(line.trim()) || line.trim() === "github.com:") {
      inGithub = true;
      continue;
    }
    if (inGithub) {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent === 0 && line.trim().length > 0) break; // next top-level key
      const match = line.match(/^\s*oauth_token:\s*["']?([^\s"']+)/);
      if (match !== null) return match[1];
    }
  }
  return undefined;
}

async function copilotFetch(io, endpoint) {
  const token = await copilotToken(io);
  const res = await request(io, "https://api.github.com/copilot_internal/user", {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "X-Github-Api-Version": "2025-04-01",
    },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`token invalid (HTTP ${res.status}); run \`gh auth login\` to re-auth`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json === undefined || typeof res.json !== "object") throw new Error("invalid response");
  return normalizeCopilotUsage(res.json);
}

// ── registry ───────────────────────────────────────────────────────────────

/**
 * Built-in live-usage adapters, keyed by provider id. Every adapter's
 * `fetch(io, endpoint)` returns the normalized widget payload or throws;
 * the caller converts failures into the `{ error }` display payload.
 * `google-ai-sub` has no public usage endpoint and is intentionally absent.
 */
export const PROVIDER_USAGE = {
  "opencode-go": { label: "OpenCode Go", fetch: opencodeGoFetch },
  "openai-codex": { label: "OpenAI Codex", fetch: codexFetch },
  "claude-sub": { label: "Claude Code", fetch: claudeFetch },
  "github-copilot": { label: "GitHub Copilot", fetch: copilotFetch },
};