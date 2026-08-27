/**
 * MiniMax Token Plan adapter tests: payload normalization and the
 * MINIMAX_API_KEY → MINIMAX_CN_API_KEY credential fallback (regression
 * coverage for MiniMax CodePlan usage not showing up).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { minimaxUsageFetch, MINIMAX_CN_KEY_ENV, normalizeMinimaxUsage } from "../lib/providers/quota-minimax.js";

/** Fake vendor payload: "general" row with 5h + weekly remaining percents. */
const payload = {
  base_resp: { status_code: 0, status_msg: "success" },
  model_remains: [
    { model_name: "general", current_interval_remaining_percent: "75", interval_end_time: 1787616166345, current_weekly_remaining_percent: "60", weekly_end_time: 1787626166345 },
  ],
};

const ioOf = (env) => ({ env, resolveRef: async (name) => env[name] });

test("normalizeMinimaxUsage converts remaining percents to used windows", () => {
  const { windows, extra, meta } = normalizeMinimaxUsage(payload);
  assert.equal(windows["5h"].percent, 25, "100 - 75 remaining");
  assert.equal(windows["5h"].status, "ok");
  assert.ok(windows["5h"].resetsAt === new Date(1787616166345).toISOString());
  assert.equal(windows["week"].percent, 40, "100 - 60 remaining");
  assert.deepEqual(extra, []);
  assert.deepEqual(meta, {});
});

test("normalizeMinimaxUsage tolerates unusable payloads", () => {
  assert.deepEqual(normalizeMinimaxUsage({}), { windows: {}, extra: [], meta: {} });
  assert.deepEqual(normalizeMinimaxUsage(null), { windows: {}, extra: [], meta: {} });
  assert.deepEqual(normalizeMinimaxUsage({ model_remains: [{ model_name: "other" }] }), { windows: {}, extra: [], meta: {} });
});

test("minimaxUsageFetch uses MINIMAX_API_KEY when configured", async () => {
  const seen = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push({ url, auth: options.headers.Authorization });
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  };
  try {
    const usage = await minimaxUsageFetch(ioOf({ MINIMAX_API_KEY: "key-a" }), null);
    assert.equal(seen[0].auth, "Bearer key-a");
    assert.equal(usage.windows["5h"].percent, 25);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("minimaxUsageFetch falls back to MINIMAX_CN_API_KEY", async () => {
  const seen = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push({ auth: options.headers.Authorization });
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  };
  try {
    const usage = await minimaxUsageFetch(ioOf({ [MINIMAX_CN_KEY_ENV]: "cn-key" }), null);
    assert.equal(seen[0].auth, "Bearer cn-key");
    assert.equal(usage.windows["week"].percent, 40);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("minimaxUsageFetch throws when neither key is configured", async () => {
  await assert.rejects(
    () => minimaxUsageFetch(ioOf({}), null),
    /API key not configured/,
  );
});

test("minimaxUsageFetch: explicit apiKeyEnv override never falls back to the CN name", async () => {
  // Override missing → its own error, even when the CN key exists.
  await assert.rejects(
    () => minimaxUsageFetch(ioOf({ [MINIMAX_CN_KEY_ENV]: "cn-key" }), { apiKeyEnv: "CUSTOM_MINIMAX_KEY" }),
    /CUSTOM_MINIMAX_KEY/,
  );
  // Override configured → used verbatim.
  const seen = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push({ auth: options.headers.Authorization });
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  };
  try {
    await minimaxUsageFetch(ioOf({ CUSTOM_MINIMAX_KEY: "custom" }), { apiKeyEnv: "CUSTOM_MINIMAX_KEY" });
    assert.equal(seen[0].auth, "Bearer custom");
  } finally {
    globalThis.fetch = originalFetch;
  }
});