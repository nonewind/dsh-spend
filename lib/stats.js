/**
 * Pure replay/aggregation logic for dsh-spend.
 *
 * The durable session log is a sequence of zstd frames; every frame holds one
 * or more newline-delimited JSON events. A `session` record opens the file
 * (id/cwd/createdAt), then the event stream follows. We replay the stream
 * exactly like the harness's token-meter fold: usage chunks provide early
 * samples, an `assistant/message` provides the final sample for the same
 * (turn, step) and replaces the earlier one, so a step is never
 * double-counted.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { normalizeProvider } from "./knowledge.js";

/** zstd frame magic (little-endian 0xFD2FB528). */
export const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Yield the UTF-8 text of every zstd frame in a session log buffer.
 * Frame boundaries are located in the RAW buffer, so decompressed content
 * that happens to contain the magic sequence cannot confuse the split.
 */
export function* frameTexts(buffer) {
  let search = 0;
  for (;;) {
    const at = buffer.indexOf(ZSTD_MAGIC, search);
    if (at === -1) break;
    const next = buffer.indexOf(ZSTD_MAGIC, at + 4);
    const end = next === -1 ? buffer.length : next;
    try {
      yield zstdDecompressSync(buffer.subarray(at, end)).toString("utf8");
    } catch (error) {
      throw new Error(`zstd frame at offset ${at} failed to decode: ${String(error?.message ?? error)}`, { cause: error });
    }
    search = end;
  }
}

/** Parse one JSONL line; malformed lines yield null (never throw). */
export function parseEvent(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * The provider-reported usage attached to one event, if any.
 * Usage chunks and finalized assistant messages share the bucket shape.
 */
export function usageOf(event) {
  if (event?.type === "assistant/chunk" && event.data?.chunk?.type === "usage") {
    return event.data.chunk.usage;
  }
  if (event?.type === "assistant/message" && event.data?.usage !== undefined) {
    return event.data.usage;
  }
  return undefined;
}

/** Normalize one usage bucket (unknown fields default to zero). */
export function usageBuckets(usage) {
  return {
    inputTokens: Number(usage?.inputTokens) || 0,
    outputTokens: Number(usage?.outputTokens) || 0,
    cacheReadTokens: Number(usage?.cacheReadTokens) || 0,
    cacheWriteTokens: Number(usage?.cacheWriteTokens) || 0,
    reasoningTokens: Number(usage?.reasoningTokens) || 0,
  };
}

/**
 * Fold one session's events into per-(turn, step) call samples.
 *
 * @param events - durable events (each with `.type`, `.seq`, `.time`, `.data`).
 * @param meta - `{ id, cwd, createdAt }` describing the session.
 * @returns call samples, latest sample per (turn, step) — chunk samples are
 *   replaced by the step's final `assistant/message` usage.
 */
export function foldSession(events, meta) {
  const samples = new Map();
  /** Per-step timing state, keyed `${turn}:${step}`. */
  const steps = new Map();
  let header;
  /** Request header timestamp not yet consumed by a `step/start`. */
  let pendingRequestTime;

  for (const event of events ?? []) {
    switch (event.type) {
      case "request/header": {
        const config = event.data?.header?.config;
        header = {
          provider: typeof config?.provider === "string" ? config.provider : undefined,
          model: typeof config?.model === "string" ? config.model : undefined,
        };
        if (typeof event.time === "number") {
          pendingRequestTime = event.time;
          // `step/start` can precede the header by a few ms — back-fill the
          // newest step that is still missing a request timestamp.
          for (const state of [...steps.values()].reverse()) {
            if (state.requestTime === undefined && state.startTime !== undefined
              && event.time - state.startTime < 60000) {
              state.requestTime = event.time;
              state.ttftEstimated = false;
              pendingRequestTime = undefined;
            }
            break;
          }
        }
        break;
      }
      case "request/context": {
        // Fallback when a provider reports context without a preceding header.
        if (header === undefined) {
          header = {
            provider: typeof event.data?.provider === "string" ? event.data.provider : undefined,
            model: typeof event.data?.model === "string" ? event.data.model : undefined,
          };
        }
        break;
      }
      case "step/start": {
        const turn = event.data?.turn;
        const step = event.data?.step;
        if (typeof turn === "number" && typeof step === "number") {
          // A header timestamp anchors THIS step only while unconsumed; a
          // header already consumed by an earlier step must not anchor later
          // tool-loop steps — their requests are not logged, so `step/start`
          // is the best available proxy and the TTFT is marked as estimated.
          const requestTime = pendingRequestTime;
          steps.set(`${turn}:${step}`, {
            startTime: typeof event.time === "number" ? event.time : undefined,
            requestTime,
            ttftEstimated: requestTime === undefined,
            firstContentTime: undefined,
            lastContentTime: undefined,
          });
          pendingRequestTime = undefined;
        }
        break;
      }
      case "assistant/chunk":
      case "text-chunks":
      case "reasoning-chunks":
      case "tool-call-chunks": {
        // Content chunk (skip usage-only chunks): track the first/last token
        // timestamps for latency metrics.
        if (event.type === "assistant/chunk" && event.data?.chunk?.type === "usage") break;
        const turn = event.data?.turn;
        const step = event.data?.step;
        const state = typeof turn === "number" && typeof step === "number" ? steps.get(`${turn}:${step}`) : undefined;
        if (state !== undefined && typeof event.time === "number") {
          if (state.firstContentTime === undefined) state.firstContentTime = event.time;
          state.lastContentTime = event.time;
        }
        break;
      }
      case "step/end": {
        // Keep state until the assistant/message sample consumed it; a step
        // ending without a message just drops the state.
        break;
      }
      default: {
        const usage = usageOf(event);
        if (usage === undefined) break;
        const turn = event.data?.turn;
        const step = event.data?.step;
        if (typeof turn !== "number" || typeof step !== "number") break;
        const buckets = usageBuckets(usage);
        const key = `${turn}:${step}`;
        const state = steps.get(key);
        const perf = state === undefined ? null : performanceOf(state, buckets.outputTokens, event.time);
        samples.set(key, {
          sessionId: meta.id,
          cwd: meta.cwd,
          createdAt: meta.createdAt,
          time: typeof event.time === "number" ? event.time : undefined,
          provider: header?.provider,
          model: header?.model,
          turn,
          step,
          ...buckets,
          ...perf === null ? {} : { perf },
        });
        if (event.type === "assistant/message") steps.delete(key);
        break;
      }
    }
  }
  return [...samples.values()];
}

/**
 * Latency metrics for one step: TTFT (request → first content token),
 * generation window (first → last content token) and tokens/second.
 * Values outside sane bounds degrade to null instead of poisoning averages.
 */
function performanceOf(state, outputTokens, endTime) {
  const start = state.requestTime ?? state.startTime;
  const first = state.firstContentTime;
  const last = state.lastContentTime;
  const end = typeof endTime === "number" ? endTime : last;
  if (start === undefined || first === undefined || first < start) return null;
  const ttftMs = first - start;
  const genMs = last !== undefined && last > first ? last - first : undefined;
  const latencyMs = end !== undefined && end >= start ? end - start : undefined;
  const sane = (value) => typeof value === "number" && value >= 0 && value <= 900000; // 15 min cap
  if (!sane(ttftMs)) return null;
  const tps = genMs !== undefined && genMs > 0 && outputTokens > 0
    ? outputTokens / (genMs / 1000)
    : undefined;
  return {
    ttftMs,
    ...state.ttftEstimated === true ? { ttftEstimated: true } : {},
    ...genMs === undefined ? {} : { genMs },
    ...latencyMs === undefined ? {} : { latencyMs },
    ...tps === undefined || !Number.isFinite(tps) || tps <= 0 ? {} : { tps },
  };
}

/** Locate the meta record that opens a session log (`{"type":"session",...}`). */
export function metaOf(lines) {
  for (const line of lines) {
    const record = parseEvent(line);
    if (record !== null && record.type === "session" && typeof record.id === "string") {
      return {
        id: record.id,
        cwd: typeof record.cwd === "string" ? record.cwd : undefined,
        createdAt: typeof record.createdAt === "number" ? record.createdAt : undefined,
      };
    }
  }
  return undefined;
}

/**
 * Walk the sessions root (`<root>/<workspace>/<session-id>/session.jsonl.zstd`)
 * and fold every durable log into call samples.
 *
 * @param root - the dsh sessions directory.
 * @param liveSessions - optional live sessions (`{ id, events, header }`);
 *   their in-memory events are folded on top of the durable prefix, and a
 *   later sample for the same (turn, step) replaces the earlier one, which
 *   makes the merge idempotent.
 * @returns `{ calls, sessions, totalSessions, decodeErrors }`.
 */
export async function scanSessions(root, liveSessions = []) {
  const calls = [];
  const sessions = [];
  const liveById = new Map();
  for (const live of liveSessions ?? []) {
    if (live?.id !== undefined) liveById.set(live.id, live);
  }
  let totalSessions = 0;
  let decodeErrors = 0;
  const byId = new Map();

  const remember = (meta, samples) => {
    const existing = byId.get(meta.id);
    const merged = existing === undefined ? new Map() : existing;
    for (const sample of samples) merged.set(`${sample.turn}:${sample.step}`, sample);
    byId.set(meta.id, merged);
    sessions.push(meta);
  };

  let workspaces;
  try {
    workspaces = await readdir(root);
  } catch {
    workspaces = [];
  }
  for (const workspace of workspaces) {
    const workspaceDir = join(root, workspace);
    let entries;
    try {
      entries = await readdir(workspaceDir);
    } catch {
      continue; // not a directory (or unreadable) — skip
    }
    for (const entry of entries) {
      const sessionDir = join(workspaceDir, entry);
      const file = join(sessionDir, "session.jsonl.zstd");
      let handle;
      try {
        handle = await stat(file);
        if (!handle.isFile()) continue;
      } catch {
        continue;
      }
      totalSessions += 1;
      let lines = [];
      try {
        const buffer = await readFile(file);
        for (const text of frameTexts(buffer)) {
          for (const line of text.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.length > 0) lines.push(trimmed);
          }
        }
      } catch {
        decodeErrors += 1;
        continue;
      }
      const meta = metaOf(lines) ?? {
        id: entry,
        cwd: workspace,
        createdAt: handle.mtimeMs,
      };
      const events = [];
      for (const line of lines) {
        const event = parseEvent(line);
        if (event !== null && event.type !== "session") events.push(event);
      }
      remember(meta, foldSession(events, meta));
    }
  }

  // Live sessions: fold in-memory events on top of the durable prefix.
  for (const [id, live] of liveById) {
    const meta = {
      id,
      cwd: typeof live.header?.cwd === "string" ? live.header.cwd : undefined,
      createdAt: typeof live.header?.createdAt === "number" ? live.header.createdAt : undefined,
    };
    remember(meta, foldSession(live.events ?? [], meta));
  }

  const merged = [];
  for (const samples of byId.values()) merged.push(...samples.values());
  return { calls: merged, sessions, totalSessions, decodeErrors };
}

/**
 * Resolve the pricing row for one call.
 *
 * Provider-aware, most-specific first: an exact (provider, model) row wins,
 * then a generic model row (no provider), then the default row. This lets a
 * deployment price every provider's models from their own official rate
 * cards without collisions.
 *
 * A row may carry a `schedule` (date-gated peak/off-peak pricing, e.g.
 * DeepSeek from 2026-08-17): `atTime` picks the effective tier — base rates
 * before `effectiveAt`, peak rates during `peakHours` (server-local hours),
 * off-peak otherwise. Without `atTime` the base row is returned unchanged.
 */
export function resolvePrice(model, provider, pricing, defaultPricing, atTime) {
  let row;
  if (provider !== undefined && provider !== null) {
    const exact = pricing.find((candidate) => candidate.model === model && candidate.provider === provider);
    if (exact !== undefined) row = exact;
  }
  if (row === undefined) {
    row = pricing.find((candidate) => candidate.model === model && (candidate.provider === undefined || candidate.provider === null));
  }
  row ??= defaultPricing;
  return applySchedule(row, atTime);
}

/** Apply a row's peak/off-peak `schedule` at one point in time. */
function applySchedule(row, atTime) {
  const schedule = row?.schedule;
  if (schedule === undefined || typeof atTime !== "number") return row;
  const effectiveAtMs = schedule.effectiveAtMs ?? (typeof schedule.effectiveAt === "string" ? Date.parse(schedule.effectiveAt) : undefined);
  if (!Number.isFinite(effectiveAtMs) || atTime < effectiveAtMs) return row;
  const hour = new Date(atTime).getHours();
  const peak = (schedule.peakHours ?? []).some(([from, to]) => hour >= from && hour < to);
  const tier = peak ? schedule.peak : schedule.offPeak;
  if (tier === undefined) return row;
  return {
    inputPerMillion: tier.inputPerMillion ?? row.inputPerMillion,
    outputPerMillion: tier.outputPerMillion ?? row.outputPerMillion,
    cacheReadPerMillion: tier.cacheReadPerMillion ?? row.cacheReadPerMillion,
    cacheWritePerMillion: tier.cacheWritePerMillion ?? row.cacheWritePerMillion,
  };
}

/** Estimated cost in the configured currency for one call (rates are per million tokens). */
export function costOf(sample, pricing, defaultPricing) {
  const price = resolvePrice(sample.model, sample.provider, pricing, defaultPricing, sample.time);
  const perMillion = 1e6;
  return {
    cost: (sample.inputTokens * price.inputPerMillion
      + sample.cacheReadTokens * price.cacheReadPerMillion
      + sample.cacheWriteTokens * price.cacheWritePerMillion
      + sample.outputTokens * price.outputPerMillion) / perMillion,
    costInput: sample.inputTokens * price.inputPerMillion / perMillion,
    costCacheRead: sample.cacheReadTokens * price.cacheReadPerMillion / perMillion,
    costCacheWrite: sample.cacheWriteTokens * price.cacheWritePerMillion / perMillion,
    costOutput: sample.outputTokens * price.outputPerMillion / perMillion,
  };
}

/** Accumulator for one aggregate bucket (model/day/session). */
function emptyBucket() {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cost: 0,
    costInput: 0,
    costCacheRead: 0,
    costCacheWrite: 0,
    costOutput: 0,
  };
}

function addBucket(target, sample, cost) {
  target.calls += 1;
  target.inputTokens += sample.inputTokens;
  target.outputTokens += sample.outputTokens;
  target.cacheReadTokens += sample.cacheReadTokens;
  target.cacheWriteTokens += sample.cacheWriteTokens;
  target.reasoningTokens += sample.reasoningTokens;
  target.cost += cost.cost;
  target.costInput += cost.costInput;
  target.costCacheRead += cost.costCacheRead;
  target.costCacheWrite += cost.costCacheWrite;
  target.costOutput += cost.costOutput;
}

/** Local calendar day (YYYY-MM-DD) for one epoch millisecond. */
export function localDay(time) {
  if (typeof time !== "number") return undefined;
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local clock hour key (YYYY-MM-DD HH:00) for one epoch millisecond. */
export function localHour(time) {
  if (typeof time !== "number") return undefined;
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00`;
}

/** Advance one `YYYY-MM-DD HH:00` key by one hour (local time). */
export function nextHourKey(key) {
  const [datePart, hourPart] = key.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const hour = Number(hourPart.slice(0, 2));
  const date = new Date(year, month - 1, day, hour + 1, 0, 0, 0);
  return localHour(date.getTime());
}

/**
 * Quota windows for subscription usage limits. Each plan's `quota` may
 * declare per-window limits (requests / dollars / tokens); the used amount
 * is accumulated over every window independently, so the UI can show
 * 5-hour, daily, weekly and monthly limits side by side.
 */
export const LIMIT_WINDOWS = [
  { key: "5h", ms: 5 * 3600e3 },
  { key: "day", ms: 24 * 3600e3 },
  { key: "week", ms: 7 * 86400e3 },
  { key: "month", ms: 30 * 86400e3 },
];

/** Quota-cap field names per limit window and unit. */
const LIMIT_CAP_KEYS = {
  "5h": { requests: "requestsPer5h", cost: "dollarsPer5h", tokens: "tokensPer5h" },
  day: { requests: "requestsPerDay", cost: "dollarsPerDay", tokens: "tokensPerDay" },
  week: { requests: "requestsPerWeek", cost: "dollarsPerWeek", tokens: "tokensPerWeek" },
  month: { requests: "requestsPerMonth", cost: "dollarsPerMonth", tokens: "tokensPerMonth" },
};

/**
 * Expand one plan's `quota` row into per-window limit rows for the UI.
 * Each limit carries the window key, unit, cap and the used amount from
 * that window's accumulator. A `window5hMultiplier` (relative 5h cap, e.g.
 * the Claude Code Max tiers, whose request counts are not published)
 * becomes a limit row with `limit: null` — the UI renders the multiplier
 * instead of a progress bar.
 * @param quota - the plan's quota object (may be null/undefined).
 * @param getUsed - `(windowKey) => { usedRequests, usedTokens, usedCost }`.
 * @returns limit rows; may be empty when the quota declares no caps.
 */
export function limitsFor(quota, getUsed) {
  const limits = [];
  if (quota === null || quota === undefined || typeof quota !== "object") return limits;
  const push = (window, unit, limit) => {
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0) return;
    const usedValue = (unit === "requests" ? getUsed(window).usedRequests : unit === "tokens" ? getUsed(window).usedTokens : getUsed(window).usedCost) || 0;
    limits.push({
      window,
      unit,
      limit,
      used: usedValue,
      remaining: Math.max(0, limit - usedValue),
      pct: limit > 0 ? Math.min(100, (usedValue / limit) * 100) : 0,
    });
  };
  for (const window of LIMIT_WINDOWS) {
    for (const unit of ["requests", "cost", "tokens"]) {
      push(window.key, unit, quota[LIMIT_CAP_KEYS[window.key][unit]]);
    }
  }
  if (typeof quota.window5hMultiplier === "number" && Number.isFinite(quota.window5hMultiplier) && quota.window5hMultiplier > 0) {
    limits.push({
      window: "5h",
      unit: "requests",
      limit: null,
      multiplier: quota.window5hMultiplier,
      used: getUsed("5h").usedRequests || 0,
      remaining: null,
      pct: null,
    });
  }
  return limits;
}

/**
 * Normalize a subscription provider's official usage payload into the UI
 * contract. Providers like OpenCode Go expose a live quota endpoint
 * (`GET /zen/go/v1/usage`) that reports the subscriber's ACTUAL usage per
 * window — percent used (0–100) and when the window resets — so the plan
 * card can show the vendor's own numbers instead of locally estimated
 * caps.
 *
 * The raw payload is `{ usage: { rolling, weekly, monthly } }` with each
 * entry `{ status, percent, resetsAt }`; window keys map to the local
 * limit windows (rolling → 5h). Unknown/absent windows are dropped.
 *
 * @param raw - the provider payload (`raw.usage` accepted for leniency).
 * @param provider - provider id, carried through for display.
 * @returns `{ provider, source: "provider", fetchedAt, windows, error: null }`;
 *   `windows` is keyed by limit-window (`5h`/`week`/`month`) with
 *   `{ status, percent, resetsAt?, limit? }` rows.
 */
export function normalizeProviderUsage(raw, provider) {
  const usage = raw?.usage ?? raw ?? {};
  const alias = { rolling: "5h", weekly: "week", monthly: "month" };
  const windows = {};
  for (const [rawKey, windowKey] of Object.entries(alias)) {
    const entry = usage[rawKey];
    if (entry === undefined || entry === null || typeof entry !== "object") continue;
    const percent = Number(entry.percent);
    const row = {
      status: typeof entry.status === "string" && entry.status.length > 0 ? entry.status : "unknown",
      percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null,
    };
    if (typeof entry.resetsAt === "string" && entry.resetsAt.length > 0) row.resetsAt = entry.resetsAt;
    const limit = Number(entry.limit);
    if (Number.isFinite(limit) && limit >= 0) row.limit = limit;
    windows[windowKey] = row;
  }
  return {
    provider,
    source: "provider",
    fetchedAt: Date.now(),
    windows,
    error: null,
  };
}

/**
 * Build the aggregate statistics snapshot served to the web UI.
 *
 * @param calls - call samples from {@link scanSessions}.
 * @param pricing - configured per-model pricing rows.
 * @param defaultPricing - fallback pricing for unknown models.
 * @param options - `{ maxSessions, maxRecentCalls, seriesHours, now }` limits.
 */
export function buildStats(calls, pricing, defaultPricing, options = {}) {
  const maxSessions = options.maxSessions ?? 20;
  const maxRecentCalls = options.maxRecentCalls ?? 50;
  const seriesHours = options.seriesHours ?? 72;
  const now = options.now ?? Date.now();
  const billingDays = options.billingDays ?? 30;
  const billingFrom = now - billingDays * 86400e3;
  const totals = emptyBucket();
  const byModel = new Map();
  const byProvider = new Map();
  const byDay = new Map();
  const byHour = new Map();
  const bySession = new Map();
  const bySessionModel = new Map();
  /** Aggregation per working directory (project-level view). */
  const byCwd = new Map();
  /** Perf samples per model — raw arrays for percentile math. */
  const byModelPerf = new Map();
  /** Perf samples per hour — running sums for the time-series chart. */
  const byHourPerf = new Map();
  const recent = [];
  /** Estimated cost of the newest `billingDays` window, per provider —
   * the usage-based counterpart of monthly subscription fees. */
  const recentCostByProvider = new Map();

  // Plan accounting: token plans consume a (config-provided) prepaid balance
  // across ALL time; code plans consume per-window quotas (5h / day / week /
  // month as declared by the plan's `quota` row), each window accumulated
  // independently over its own leading time span. Plans are keyed by their
  // CANONICAL provider id so samples reported under an alias (e.g.
  // `deepseek-official`) still accumulate into the right plan (#10).
  const plans = options.plans ?? [];
  const planState = new Map();
  for (const plan of plans) {
    const windows = Object.fromEntries(LIMIT_WINDOWS.map((window) => [window.key, { usedTokens: 0, usedRequests: 0, usedCost: 0 }]));
    planState.set(normalizeProvider(plan.provider), { plan, windows });
  }

  for (const sample of calls) {
    const cost = costOf(sample, pricing, defaultPricing);
    addBucket(totals, sample, cost);
    const model = sample.model ?? "(unknown)";
    let modelBucket = byModel.get(model);
    if (modelBucket === undefined) {
      modelBucket = { ...emptyBucket(), model, provider: sample.provider ?? null };
      byModel.set(model, modelBucket);
    }
    addBucket(modelBucket, sample, cost);
    const provider = sample.provider ?? "(unknown)";
    let providerBucket = byProvider.get(provider);
    if (providerBucket === undefined) {
      providerBucket = { ...emptyBucket(), provider };
      byProvider.set(provider, providerBucket);
    }
    addBucket(providerBucket, sample, cost);
    if (typeof sample.time === "number" && sample.time >= billingFrom) {
      recentCostByProvider.set(provider, (recentCostByProvider.get(provider) ?? 0) + cost.cost);
    }
    const plan = planState.get(normalizeProvider(provider));
    if (plan !== undefined && typeof sample.time === "number") {
      for (const window of LIMIT_WINDOWS) {
        if (sample.time < now - window.ms) continue;
        const bucket = plan.windows[window.key];
        bucket.usedTokens += sample.inputTokens + sample.outputTokens + sample.cacheReadTokens + sample.cacheWriteTokens;
        bucket.usedRequests += 1;
        bucket.usedCost += cost.cost;
      }
    }
    const day = localDay(sample.time) ?? "unknown";
    let dayBucket = byDay.get(day);
    if (dayBucket === undefined) {
      dayBucket = { ...emptyBucket(), day };
      byDay.set(day, dayBucket);
    }
    addBucket(dayBucket, sample, cost);
    const hour = localHour(sample.time);
    if (hour !== undefined) {
      let hourBucket = byHour.get(hour);
      if (hourBucket === undefined) {
        hourBucket = { ...emptyBucket(), hour };
        byHour.set(hour, hourBucket);
      }
      addBucket(hourBucket, sample, cost);
    }
    const sessionId = sample.sessionId ?? "(none)";
    let sessionBucket = bySession.get(sessionId);
    if (sessionBucket === undefined) {
      sessionBucket = {
        ...emptyBucket(),
        sessionId,
        cwd: sample.cwd ?? null,
        createdAt: sample.createdAt ?? null,
      };
      bySession.set(sessionId, sessionBucket);
    }
    addBucket(sessionBucket, sample, cost);
    const sessionModelKey = `${sessionId}\u0000${model}`;
    let sessionModelBucket = bySessionModel.get(sessionModelKey);
    if (sessionModelBucket === undefined) {
      sessionModelBucket = {
        ...emptyBucket(),
        sessionId,
        cwd: sample.cwd ?? null,
        model: sample.model ?? null,
        provider: sample.provider ?? null,
      };
      bySessionModel.set(sessionModelKey, sessionModelBucket);
    }
    addBucket(sessionModelBucket, sample, cost);
    const cwdKey = sample.cwd ?? "(none)";
    let cwdBucket = byCwd.get(cwdKey);
    if (cwdBucket === undefined) {
      cwdBucket = { ...emptyBucket(), cwd: cwdKey, sessions: new Set(), models: new Set() };
      byCwd.set(cwdKey, cwdBucket);
    }
    cwdBucket.sessions.add(sessionId);
    cwdBucket.models.add(model);
    addBucket(cwdBucket, sample, cost);
    const perf = sample.perf;
    if (perf !== undefined && perf !== null) {
      let perfBucket = byModelPerf.get(model);
      if (perfBucket === undefined) {
        perfBucket = { model, provider: sample.provider ?? null, ttft: [], tps: [], latency: [] };
        byModelPerf.set(model, perfBucket);
      }
      if (typeof perf.ttftMs === "number") perfBucket.ttft.push(perf.ttftMs);
      if (typeof perf.tps === "number") perfBucket.tps.push(perf.tps);
      if (typeof perf.latencyMs === "number") perfBucket.latency.push(perf.latencyMs);
      if (hour !== undefined) {
        let hourPerf = byHourPerf.get(hour);
        if (hourPerf === undefined) {
          hourPerf = { ttftSum: 0, ttftN: 0, tpsSum: 0, tpsN: 0 };
          byHourPerf.set(hour, hourPerf);
        }
        if (typeof perf.ttftMs === "number") {
          hourPerf.ttftSum += perf.ttftMs;
          hourPerf.ttftN += 1;
        }
        if (typeof perf.tps === "number") {
          hourPerf.tpsSum += perf.tps;
          hourPerf.tpsN += 1;
        }
      }
    }
    recent.push({
      time: sample.time ?? null,
      model: sample.model ?? null,
      provider: sample.provider ?? null,
      sessionId,
      cwd: sample.cwd ?? null,
      turn: sample.turn,
      step: sample.step,
      inputTokens: sample.inputTokens,
      outputTokens: sample.outputTokens,
      cacheReadTokens: sample.cacheReadTokens,
      cacheWriteTokens: sample.cacheWriteTokens,
      cost: cost.cost,
    });
  }

  const modelRows = [...byModel.values()]
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
    .map(({ model, provider, ...rest }) => ({ model, provider, ...rest }));
  const providerRows = [...byProvider.values()]
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
    .map(({ provider, ...rest }) => ({ provider, ...rest }));
  const dayRows = [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(({ day, ...rest }) => ({ day, ...rest }));
  const sessionRows = [...bySession.values()]
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
    .slice(0, maxSessions)
    .map(({ sessionId, cwd, createdAt, ...rest }) => ({ sessionId, cwd, createdAt, ...rest }));
  const cwdRows = [...byCwd.values()]
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
    .map(({ cwd, sessions, models, ...rest }) => ({
      cwd,
      sessionCount: sessions.size,
      modelCount: models.size,
      ...rest,
    }));
  recent.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const recentRows = recent.slice(0, maxRecentCalls);

  // Hourly time series: keep the newest `seriesHours` hours, zero-filled so the
  // chart is continuous across idle gaps.
  const seriesStartKey = localHour(new Date(now - (seriesHours - 1) * 3600e3).getTime());
  const hourRows = [];
  for (let key = seriesStartKey; key !== undefined && hourRows.length < seriesHours; key = nextHourKey(key)) {
    const bucket = byHour.get(key) ?? { ...emptyBucket(), hour: key };
    hourRows.push(bucket);
  }
  const hourRowsOut = hourRows.map(({ hour, ...rest }) => ({ hour, ...rest }));

  // Performance stats: per-model latency/TTFT/tokens-per-second summaries
  // (percentiles from sorted raw samples), plus a matching hourly series.
  const percentileOf = (sorted, p) => {
    if (sorted.length === 0) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  };
  const perfModelRows = [...byModelPerf.values()]
    .map(({ model, provider, ttft, tps, latency }) => {
      ttft.sort((a, b) => a - b);
      const tpsSum = tps.reduce((sum, value) => sum + value, 0);
      const latencySum = latency.reduce((sum, value) => sum + value, 0);
      const ttftSum = ttft.reduce((sum, value) => sum + value, 0);
      return {
        model,
        provider,
        samples: ttft.length,
        ttftAvgMs: ttft.length > 0 ? ttftSum / ttft.length : null,
        ttftP50Ms: percentileOf(ttft, 0.5),
        ttftP90Ms: percentileOf(ttft, 0.9),
        tpsAvg: tps.length > 0 ? tpsSum / tps.length : null,
        latencyAvgMs: latency.length > 0 ? latencySum / latency.length : null,
      };
    })
    .sort((a, b) => (b.samples ?? 0) - (a.samples ?? 0));
  const perfHourRows = hourRows.map(({ hour }) => {
    const perf = byHourPerf.get(hour);
    if (perf === undefined || (perf.ttftN === 0 && perf.tpsN === 0)) {
      return { hour, samples: 0, ttftAvgMs: null, tpsAvg: null };
    }
    return {
      hour,
      samples: perf.ttftN,
      ttftAvgMs: perf.ttftN > 0 ? perf.ttftSum / perf.ttftN : null,
      tpsAvg: perf.tpsN > 0 ? perf.tpsSum / perf.tpsN : null,
    };
  });
  const sessionModelRows = [...bySessionModel.values()]
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
    .map(({ sessionId, cwd, model, provider, ...rest }) => ({ sessionId, cwd, model, provider, ...rest }));

  // Plan usage rows: one per configured/auto-discovered plan, with
  // used/remaining figures. Code plans may carry subscription info, an
  // auto-discovery flag and a tier table; token plans consume a prepaid
  // balance. Plans without a measurable quota keep usedPct null (the UI
  // then shows subscription/tier info instead of a progress bar).
  const planRows = plans.map((plan) => {
    const state = planState.get(normalizeProvider(plan.provider));
    const bucketOf = (key) => state?.windows?.[key] ?? { usedTokens: 0, usedRequests: 0, usedCost: 0 };
    const meta = {
      provider: plan.provider,
      label: plan.label ?? null,
      auto: plan.auto === true,
      subscription: plan.subscription ?? null,
      tiers: plan.tiers ?? null,
      dollarsPerMonth: plan.dollarsPerMonth ?? null,
      // Plan-level note (e.g. "5h window temporarily suspended") plus the raw
      // quota row — the UI renders the expanded `limits` rows below.
      quotaNote: plan.quotaNote ?? plan.quota?.note ?? null,
      quota: plan.quota ?? null,
    };
    if (plan.type === "code") {
      const quota = plan.quota ?? null;
      const hasQuota = quota !== null && quota !== undefined && typeof quota === "object" && Object.keys(quota).length > 0;
      const hasLegacyQuota = !hasQuota && (
        (plan.quotaRequests !== null && plan.quotaRequests !== undefined)
        || (plan.quotaTokens !== null && plan.quotaTokens !== undefined)
      );
      // Legacy single-window configuration (explicit plans with only
      // quotaRequests/quotaTokens + periodDays): keep the old semantics.
      if (hasLegacyQuota) {
        const periodDays = plan.periodDays ?? 7;
        const windowKey = periodDays <= 1 ? "day" : periodDays <= 7 ? "week" : periodDays <= 31 ? "month" : "week";
        const used = bucketOf(windowKey);
        const quotaRequests = plan.quotaRequests ?? null;
        const quotaTokens = plan.quotaTokens ?? null;
        const usedPct = quotaRequests !== null && quotaRequests > 0
          ? Math.min(100, (used.usedRequests / quotaRequests) * 100)
          : quotaTokens !== null && quotaTokens > 0
            ? Math.min(100, (used.usedTokens / quotaTokens) * 100)
            : null;
        return {
          ...meta,
          type: "code",
          periodDays,
          usedRequests: used.usedRequests,
          quotaRequests,
          usedTokens: used.usedTokens,
          quotaTokens,
          usedCost: used.usedCost,
          remainingRequests: quotaRequests === null ? null : Math.max(0, quotaRequests - used.usedRequests),
          remainingTokens: quotaTokens === null ? null : Math.max(0, quotaTokens - used.usedTokens),
          usedPct,
          limits: null,
        };
      }
      // Multi-window limits (5h / day / week / month) — the UI's main source.
      const limits = limitsFor(quota ?? {}, (key) => bucketOf(key));
      const week = bucketOf("week");
      // Legacy field compatibility: the weekly window backs the old
      // usedRequests/quotaRequests surface while `limits` drives the UI.
      const quotaRequests = quota?.requestsPerDay ?? quota?.requestsPerWeek ?? plan.quotaRequests ?? null;
      const quotaTokens = quota?.tokensPerDay ?? quota?.tokensPerWeek ?? plan.quotaTokens ?? null;
      const usedPct = quotaRequests !== null && quotaRequests > 0
        ? Math.min(100, (week.usedRequests / quotaRequests) * 100)
        : quotaTokens !== null && quotaTokens > 0
          ? Math.min(100, (week.usedTokens / quotaTokens) * 100)
          : null;
      return {
        ...meta,
        type: "code",
        periodDays: plan.periodDays ?? 7,
        usedRequests: week.usedRequests,
        quotaRequests,
        usedTokens: week.usedTokens,
        quotaTokens,
        usedCost: week.usedCost,
        remainingRequests: quotaRequests === null ? null : Math.max(0, quotaRequests - week.usedRequests),
        remainingTokens: quotaTokens === null ? null : Math.max(0, quotaTokens - week.usedTokens),
        usedPct,
        limits,
      };
    }
    // token plan: prepaid balance consumed by the provider's total estimated
    // cost — matched by canonical id so alias-reported usage (e.g. logs
    // saying `deepseek-official` for a `deepseek` plan) counts (#10).
    const planProvider = normalizeProvider(plan.provider);
    const usedCost = [...byProvider.values()]
      .filter((row) => normalizeProvider(row.provider) === planProvider)
      .reduce((sum, row) => sum + row.cost, 0);
    const hasBalance = typeof plan.balance === "number" && Number.isFinite(plan.balance);
    return {
      ...meta,
      type: "token",
      usedCost,
      balance: hasBalance ? plan.balance : null,
      remaining: hasBalance ? Math.max(0, plan.balance - usedCost) : null,
      usedPct: hasBalance && plan.balance > 0 ? Math.min(100, (usedCost / plan.balance) * 100) : null,
    };
  });

  return {
    callCount: totals.calls,
    totals: {
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      reasoningTokens: totals.reasoningTokens,
      cost: totals.cost,
      costInput: totals.costInput,
      costCacheRead: totals.costCacheRead,
      costCacheWrite: totals.costCacheWrite,
      costOutput: totals.costOutput,
      // Cache hit ratio of the total input stream: cache reads vs (reads +
      // uncached input). Null when no input tokens were reported at all.
      cacheHitRate: totals.inputTokens + totals.cacheReadTokens > 0
        ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)
        : null,
    },
    plans: planRows,
    byProvider: providerRows,
    byModel: modelRows,
    byDay: dayRows,
    byHour: hourRowsOut,
    bySession: sessionRows,
    bySessionModel: sessionModelRows,
    byCwd: cwdRows,
    perfByModel: perfModelRows,
    perfByHour: perfHourRows,
    recent: recentRows,
    recentCostByProvider: Object.fromEntries(recentCostByProvider),
  };
}

/**
 * Cheap fingerprint of everything that feeds the aggregation: durable file
 * sizes/mtimes plus live session event counts. Equal signatures mean the
 * cached snapshot is still valid.
 */
export async function computeSignature(root, liveSessions = []) {
  const parts = [];
  let workspaces;
  try {
    workspaces = await readdir(root);
  } catch {
    workspaces = [];
  }
  for (const workspace of workspaces) {
    const workspaceDir = join(root, workspace);
    let entries;
    try {
      entries = await readdir(workspaceDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = join(workspaceDir, entry, "session.jsonl.zstd");
      try {
        const handle = await stat(file);
        if (handle.isFile()) parts.push(`${workspace}/${entry}:${handle.size}:${handle.mtimeMs}`);
      } catch {
        // missing/unreadable — the scan will report the same count
      }
    }
  }
  for (const live of liveSessions ?? []) {
    if (live?.id !== undefined) parts.push(`live:${live.id}:${(live.events ?? []).length}`);
  }
  return parts.sort().join("\n");
}

/** Enumerate pricing rows for the UI (active overrides + the default row). */
export function pricingRows(pricing, defaultPricing) {
  return [
    ...pricing.map((row) => ({ ...row, appliesTo: "model" })),
    { model: "(default)", ...defaultPricing, appliesTo: "default" },
  ];
}
