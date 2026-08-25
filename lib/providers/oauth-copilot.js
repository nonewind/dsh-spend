/**
 * GitHub Copilot subscription quota adapter.
 *
 * Uses a GitHub token — env `GH_TOKEN`/`GITHUB_TOKEN`, then `gh` hosts.yml,
 * then the Copilot CLI hosts.json, then `gh auth token` (covers keyring-
 * backed `gh auth login`, e.g. macOS) — against
 * `GET https://api.github.com/copilot_internal/user` (undocumented,
 * reverse-engineered) for the paid-tier quota snapshots or the free-tier
 * monthly/limited quotas.
 */

import { execFile } from "node:child_process";
import { clampPct, notLoggedIn, request } from "./common.js";

/** Snapshot key → stable id used by the client's label dictionary. */
const COPILOT_LABELS = {
  premium_interactions: "premium",
  chat: "chat",
  completions: "completions",
  code_completions: "completions",
  code_review: "code_review",
};

/**
 * Normalize the GitHub Copilot internal-usage payload into the widget
 * contract. Pure function — also exported for tests.
 */
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
  // Keyring-backed `gh auth login` (macOS/Windows): hosts.yml has no token,
  // so ask gh itself. Read-only, no args, never echoed into errors.
  const fromGh = await new Promise((resolve) => {
    execFile("gh", ["auth", "token"], { timeout: 8000 }, (error, stdout) => {
      resolve(!error && typeof stdout === "string" && stdout.trim().length > 0 ? stdout.trim() : undefined);
    });
  });
  if (typeof fromGh === "string") return fromGh;
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

/** Fetch the Copilot quota through the adapter I/O context. */
export async function copilotFetch(io, endpoint) {
  const token = await copilotToken(io);
  const res = await request("https://api.github.com/copilot_internal/user", {
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