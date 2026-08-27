/**
 * Knowledge-base tests: provider-id alias normalization and canonical
 * plan discovery (regression coverage for #10 — duplicate plan cards when
 * session logs report an alias such as `deepseek-official`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverPlans, normalizeProvider, PROVIDER_ALIASES } from "../lib/knowledge.js";

test("normalizeProvider maps every declared alias to its canonical id", () => {
  for (const [alias, canonical] of Object.entries(PROVIDER_ALIASES)) {
    assert.equal(normalizeProvider(alias), canonical, `${alias} → ${canonical}`);
  }
  assert.equal(normalizeProvider("deepseek"), "deepseek");
  assert.equal(normalizeProvider("opencode-go"), "opencode-go");
  assert.equal(normalizeProvider(undefined), undefined);
  assert.equal(normalizeProvider(null), null);
  assert.equal(normalizeProvider(""), "");
});

test("discoverPlans: alias pair yields exactly one canonical plan", () => {
  const { autoPlans, autoDiscovered } = discoverPlans(["deepseek-official", "deepseek"]);
  assert.equal(autoPlans.length, 1);
  assert.equal(autoPlans[0].provider, "deepseek");
  assert.equal(autoPlans[0].type, "token");
  assert.equal(autoDiscovered.length, 1);
  assert.equal(autoDiscovered[0].provider, "deepseek");
});

test("discoverPlans: explicit plan suppresses the auto one (canonical spelling)", () => {
  const { autoPlans } = discoverPlans(["deepseek-official"], [{ provider: "deepseek", type: "token" }]);
  assert.equal(autoPlans.length, 0);
});

test("discoverPlans: explicit plan suppresses the auto one (alias spelling in config)", () => {
  const { autoPlans } = discoverPlans(["deepseek"], [{ provider: "deepseek-official", type: "token" }]);
  assert.equal(autoPlans.length, 0);
});

test("discoverPlans: unknown providers are skipped", () => {
  const { autoPlans, autoDiscovered } = discoverPlans(["no-such-provider", ""]);
  assert.equal(autoPlans.length, 0);
  assert.equal(autoDiscovered.length, 0);
});

test("discoverPlans: subscription plans carry canonical id + discovery record", () => {
  const { autoPlans, autoDiscovered } = discoverPlans(["copilot"]);
  assert.equal(autoPlans.length, 1);
  assert.equal(autoPlans[0].provider, "github-copilot");
  assert.equal(autoPlans[0].type, "code");
  assert.equal(autoPlans[0].subscription.amount, 10);
  assert.equal(autoDiscovered[0].provider, "github-copilot");
});