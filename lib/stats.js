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
  let header;
  for (const event of events ?? []) {
    switch (event.type) {
      case "request/header": {
        const config = event.data?.header?.config;
        header = {
          provider: typeof config?.provider === "string" ? config.provider : undefined,
          model: typeof config?.model === "string" ? config.model : undefined,
        };
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
      default: {
        const usage = usageOf(event);
        if (usage === undefined) break;
        const turn = event.data?.turn;
        const step = event.data?.step;
        if (typeof turn !== "number" || typeof step !== "number") break;
        const buckets = usageBuckets(usage);
        samples.set(`${turn}:${step}`, {
          sessionId: meta.id,
          cwd: meta.cwd,
          createdAt: meta.createdAt,
          time: typeof event.time === "number" ? event.time : undefined,
          provider: header?.provider,
          model: header?.model,
          turn,
          step,
          ...buckets,
        });
        break;
      }
    }
  }
  return [...samples.values()];
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
 */
export function resolvePrice(model, provider, pricing, defaultPricing) {
  if (provider !== undefined && provider !== null) {
    const exact = pricing.find((candidate) => candidate.model === model && candidate.provider === provider);
    if (exact !== undefined) return exact;
  }
  const generic = pricing.find((candidate) => candidate.model === model && (candidate.provider === undefined || candidate.provider === null));
  return generic ?? defaultPricing;
}

/** Estimated cost in the configured currency for one call (rates are per million tokens). */
export function costOf(sample, pricing, defaultPricing) {
  const price = resolvePrice(sample.model, sample.provider, pricing, defaultPricing);
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
  const recent = [];
  /** Estimated cost of the newest `billingDays` window, per provider —
   * the usage-based counterpart of monthly subscription fees. */
  const recentCostByProvider = new Map();

  // Plan accounting: token plans consume a (config-provided) prepaid balance
  // across ALL time; code plans consume a per-period quota (e.g. requests per
  // week), measured over the newest `periodDays` window.
  const plans = options.plans ?? [];
  const planState = new Map();
  for (const plan of plans) {
    planState.set(plan.provider, {
      plan,
      periodFrom: now - (plan.periodDays ?? 7) * 86400e3,
      usedTokens: 0,
      usedRequests: 0,
      usedCost: 0,
    });
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
    const plan = planState.get(provider);
    if (plan !== undefined && typeof sample.time === "number" && sample.time >= plan.periodFrom) {
      plan.usedTokens += sample.inputTokens + sample.outputTokens + sample.cacheReadTokens + sample.cacheWriteTokens;
      plan.usedRequests += 1;
      plan.usedCost += cost.cost;
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

  // Plan usage rows: one per configured/auto-discovered plan, with
  // used/remaining figures. Code plans may carry subscription info, an
  // auto-discovery flag and a tier table; token plans consume a prepaid
  // balance. Plans without a measurable quota keep usedPct null (the UI
  // then shows subscription/tier info instead of a progress bar).
  const planRows = plans.map((plan) => {
    const state = planState.get(plan.provider) ?? { usedTokens: 0, usedRequests: 0, usedCost: 0 };
    const meta = {
      provider: plan.provider,
      label: plan.label ?? null,
      auto: plan.auto === true,
      subscription: plan.subscription ?? null,
      tiers: plan.tiers ?? null,
      dollarsPerMonth: plan.dollarsPerMonth ?? null,
    };
    if (plan.type === "code") {
      const quotaRequests = plan.quotaRequests ?? null;
      const quotaTokens = plan.quotaTokens ?? null;
      const usedPct = quotaRequests !== null
        ? Math.min(100, (state.usedRequests / quotaRequests) * 100)
        : quotaTokens !== null
          ? Math.min(100, (state.usedTokens / quotaTokens) * 100)
          : null;
      return {
        ...meta,
        type: "code",
        periodDays: plan.periodDays ?? 7,
        usedRequests: state.usedRequests,
        quotaRequests,
        usedTokens: state.usedTokens,
        quotaTokens,
        usedCost: state.usedCost,
        remainingRequests: quotaRequests === null ? null : Math.max(0, quotaRequests - state.usedRequests),
        remainingTokens: quotaTokens === null ? null : Math.max(0, quotaTokens - state.usedTokens),
        usedPct,
      };
    }
    // token plan: prepaid balance consumed by the provider's total estimated cost
    const usedCost = byProvider.get(plan.provider)?.cost ?? 0;
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
    },
    plans: planRows,
    byProvider: providerRows,
    byModel: modelRows,
    byDay: dayRows,
    byHour: hourRowsOut,
    bySession: sessionRows,
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
