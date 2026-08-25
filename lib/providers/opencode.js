/**
 * OpenCode Go subscription quota adapter.
 *
 * Official endpoint: `GET https://opencode.ai/zen/go/v1/usage` (documented
 * at opencode.ai/docs/go) with a Bearer API key — the response reports the
 * rolling (5h), weekly and monthly windows with percent used + reset time;
 * normalized through `stats.normalizeProviderUsage`.
 */

import { normalizeProviderUsage } from "../stats.js";
import { notLoggedIn, request, resolveBearerKey } from "./common.js";

/** Default credential seam / env name. */
export const OPENCODE_GO_KEY_ENV = "OPENCODE_GO_API_KEY";

/** Default quota endpoint (official, documented). */
export const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

/** Fetch the OpenCode Go quota through the adapter I/O context. */
export async function opencodeGoFetch(io, endpoint) {
  const envName = endpoint?.apiKeyEnv ?? OPENCODE_GO_KEY_ENV;
  const key = await resolveBearerKey(io, envName);
  const res = await request(endpoint?.url ?? OPENCODE_GO_USAGE_URL, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    timeoutMs: endpoint?.timeoutMs ?? 15000,
  });
  if (res.status === 401 || res.status === 403) throw notLoggedIn(`API key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.json?.type === "error") throw new Error(res.json.error?.message ?? "usage API error");
  return normalizeProviderUsage(res.json, "opencode-go");
}