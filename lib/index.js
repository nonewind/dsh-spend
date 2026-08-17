/**
 * dsh-spend host plugin.
 *
 * A Typert Remote service (`usageStats`) that replays the durable session
 * logs under the dsh home, aggregates provider-reported token usage across
 * every dimension the web UI asks for (totals, by model, by day, by session,
 * recent calls) and prices it with the configured per-model rates to produce
 * an estimated billing amount. The web GUI reaches it through the standard
 * `/api` Remote gateway (SRC discovery — no generated typert manifest).
 */
import { Service } from "@deepseek-ai/cordis";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { autoPlanFor, autoRatesFor, knowsProvider } from "./knowledge.js";
import { buildStats, computeSignature, localDay, pricingRows, scanSessions } from "./stats.js";

// ── decorator support (stage-3 decorators, transpiled — Node has none) ─────
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) {
      if (kind === "field") initializers.unshift(_);
      else descriptor[key] = _;
    }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
};
var __runInitializers = function(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
};

/** Pricing field schemas shared by the per-model rows and the default row. */
const priceFields = () => ({
  inputPerMillion: z.number().min(0).default(0),
  outputPerMillion: z.number().min(0).default(0),
  cacheReadPerMillion: z.number().min(0).default(0),
  cacheWritePerMillion: z.number().min(0).default(0),
});

/**
 * Aggregation service for the usage-stats dashboard.
 *
 * Registered as `ctx.usageStats`; the Remote gateway discovers the
 * `usageStats/query` endpoint through the typertRemote binding + Remote
 * markers (SRC discovery), so no generated descriptor files are needed.
 */
let UsageStatsService = (() => {
  let _classSuper = TypertRemoteService;
  let _instanceExtraInitializers = [];
  let _query_decorators;
  return class UsageStatsService extends _classSuper {
    static {
      const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
      _query_decorators = [Remote("query")];
      __esDecorate(this, null, _query_decorators, {
        kind: "method",
        name: "query",
        static: false,
        private: false,
        access: { has: (obj) => "query" in obj, get: (obj) => obj.query },
        metadata: _metadata
      }, null, _instanceExtraInitializers);
      if (_metadata) Object.defineProperty(this, Symbol.metadata, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: _metadata
      });
    }
    /** Required services: the live-session registry (durable logs are scanned directly). */
    static inject = ["sessions"];
    /**
     * Deployment configuration: currency, per-model rates, display limits.
     * Built-in defaults mirror the official vendor pricing (verified
     * 2026-08-14; DeepSeek pre-2026-08-17 rates) — see the profile patch for
     * the full per-model table and the change note.
     */
    static Config = z.object({
      currency: z.string().default("USD"),
      pricing: z.array(z.object({
        model: z.string().required(),
        // Optional provider scoping: a row with `provider` prices only that
        // provider's model; a row without one prices the model everywhere.
        provider: z.string(),
        ...priceFields(),
      })).default([
        { model: "gpt-5.6-sol", inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
        { model: "gpt-5.6-terra", inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2, cacheWritePerMillion: 2.5 },
        { model: "gpt-5.6-luna", inputPerMillion: 0.2, outputPerMillion: 1.2, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0.25 },
      ]),
      defaultPricing: z.object(priceFields()).default({
        inputPerMillion: 0.14,
        outputPerMillion: 0.28,
        cacheReadPerMillion: 0.0028,
        cacheWritePerMillion: 0,
      }),
      maxSessions: z.number().step(1).min(1).default(20),
      maxRecentCalls: z.number().step(1).min(1).default(50),
      seriesHours: z.number().step(1).min(1).default(168),
      refreshSeconds: z.number().step(1).min(5).default(30),
      // Optional monthly spend budget (in the configured currency): the UI
      // shows used/remaining and turns the pill amber/red when exceeded.
      monthlyBudget: z.number().min(0),
      // Per-provider billing plans for the usage/remaining display:
      //   type 'token' — prepaid balance consumed by estimated cost;
      //   type 'code'  — per-period quota (requests and/or tokens).
      plans: z.array(z.object({
        provider: z.string().required(),
        type: z.union([z.const("token"), z.const("code")]),
        balance: z.number().min(0),
        quotaRequests: z.number().step(1).min(1),
        quotaTokens: z.number().step(1).min(1),
        periodDays: z.number().step(1).min(1),
      })).default([]),
    });

    sessionsRoot;
    pricing;
    defaultPricing;
    currency;
    maxSessions;
    maxRecentCalls;
    seriesHours;
    refreshSeconds;
    monthlyBudget;
    plans;
    /** `signature|cwd → snapshot` cache; invalidated by any session log change. */
    cache = new Map();
    /** In-flight recompute per cache key, shared by concurrent queries. */
    inflight = new Map();

    /**
     * @param ctx - host context.
     * @param config - validated plugin configuration.
     */
    constructor(ctx, config = {}) {
      super(ctx, "usageStats");
      // Run the @Remote decorator initializers (they mark this prototype for
      // the gateway's SRC discovery).
      __runInitializers(this, _instanceExtraInitializers);
      this.sessionsRoot = dshHomePath("sessions");
      this.pricing = config.pricing ?? [];
      this.defaultPricing = config.defaultPricing ?? {};
      this.currency = config.currency ?? "USD";
      this.maxSessions = config.maxSessions ?? 20;
      this.maxRecentCalls = config.maxRecentCalls ?? 50;
      this.seriesHours = config.seriesHours ?? 168;
      this.refreshSeconds = config.refreshSeconds ?? 30;
      this.monthlyBudget = typeof config.monthlyBudget === "number" && Number.isFinite(config.monthlyBudget) ? config.monthlyBudget : null;
      this.plans = config.plans ?? [];
      // Drop the cached snapshot when the plugin is reconfigured/reloaded.
      ctx.effect(() => () => {
        this.cache = new Map();
        this.inflight = new Map();
      }, "dsh-spend: reset cache on unload");
    }

    /**
     * One statistics snapshot over every durable session log.
     *
     * The live session registry is merged on top of the durable prefix; a
     * later sample for the same (turn, step) replaces the earlier one, so the
     * merge is idempotent and nothing is double-counted.
     *
     * @param request - unused today; reserved for future filters (kept so the
     *   gateway's SRC descriptor matches the browser contract). No default
     *   value: the gateway derives parameters from the method signature.
     * @returns the aggregate snapshot (pure JSON).
     */
    async query(request) {
      const cwd = typeof request?.cwd === "string" && request.cwd.length > 0 ? request.cwd : null;
      const live = this.ctx.sessions.list().map((session) => ({
        id: session.id,
        events: session.events,
        header: session.header,
      }));
      const signature = await computeSignature(this.sessionsRoot, live);
      const key = `${signature}\u0000${cwd ?? ""}`;
      const cached = this.cache.get(key);
      if (cached !== undefined) return cached;
      let pending = this.inflight.get(key);
      if (pending === undefined) {
        pending = this.compute(signature, live, cwd).finally(() => {
          this.inflight.delete(key);
        });
        this.inflight.set(key, pending);
      }
      return pending;
    }

    /** Replay + aggregate + price, then store the snapshot under its key. */
    async compute(signature, live, cwd) {
      const scanned = await scanSessions(this.sessionsRoot, live);
      const allCwds = [...new Set(
        scanned.calls
          .map((call) => call.cwd)
          .filter((value) => typeof value === "string" && value.length > 0),
      )].sort();
      const calls = cwd === null
        ? scanned.calls
        : scanned.calls.filter((call) => call.cwd === cwd || (typeof call.cwd === "string" && call.cwd.startsWith(`${cwd}/`)));
      const { sessions, totalSessions, decodeErrors } = scanned;

      // ── auto-discovery of billing plans ──────────────────────────────────
      // Providers that actually appear in the logs get a plan from the
      // knowledge base when the deployment did not declare one explicitly;
      // the UI marks these rows as auto-discovered.
      const discovered = new Set();
      for (const call of calls) {
        if (typeof call.provider === "string" && call.provider.length > 0) discovered.add(call.provider);
      }
      const explicit = new Set(this.plans.map((plan) => plan.provider));
      const autoDiscovered = [];
      const mergedPlans = [...this.plans];
      for (const provider of discovered) {
        if (explicit.has(provider)) continue;
        const plan = autoPlanFor(provider);
        if (plan === undefined) continue;
        mergedPlans.push(plan);
        autoDiscovered.push({
          provider,
          label: plan.label,
          type: plan.type,
          subscription: plan.subscription,
        });
      }

      // ── auto-discovery of pricing ────────────────────────────────────────
      // Providers with an official rate table in the knowledge base get
      // pricing rows automatically; an explicit user row for the same
      // (provider, model) — or a generic model row — always wins.
      const explicitPricing = new Set(this.pricing.map((row) => `${row.provider ?? "*"}:${row.model}`));
      const autoPricing = [];
      for (const provider of discovered) {
        for (const rate of autoRatesFor(provider)) {
          if (explicitPricing.has(`${rate.provider}:${rate.model}`) || explicitPricing.has(`*:${rate.model}`)) continue;
          autoPricing.push(rate);
        }
      }
      const pricing = [...this.pricing, ...autoPricing];

      const stats = buildStats(calls, pricing, this.defaultPricing, {
        maxSessions: this.maxSessions,
        maxRecentCalls: this.maxRecentCalls,
        seriesHours: this.seriesHours,
        plans: mergedPlans,
      });

      // ── billing view: subscription providers count their monthly fee,
      // token providers their estimated cost (single-currency only) ─────────
      const billingParts = [];
      for (const row of stats.byProvider) {
        const plan = mergedPlans.find((candidate) => candidate.provider === row.provider);
        if (plan?.type === "code" && plan.subscription?.amount !== undefined && plan.subscription.amount !== null) {
          billingParts.push({
            provider: row.provider,
            kind: "subscription",
            amount: plan.subscription.amount,
            currency: plan.subscription.currency ?? "USD",
            period: plan.subscription.period ?? "month",
          });
        } else {
          // Usage-based: estimated cost of the newest 30-day window (the
          // monthly counterpart of subscription fees), not the all-time total.
          billingParts.push({
            provider: row.provider,
            kind: "token",
            amount: stats.recentCostByProvider?.[row.provider] ?? row.cost,
            currency: this.currency,
            period: "30d",
          });
        }
      }
      const billingTotal = billingParts.every((part) => part.currency === this.currency)
        ? billingParts.reduce((sum, part) => sum + part.amount, 0)
        : null;

      // ── projected month-end spend (month-to-date cost extrapolated) ───────
      const monthStart = new Date();
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
      const monthToDate = (stats.byDay ?? [])
        .filter((row) => row.day.startsWith(monthKey))
        .reduce((sum, row) => sum + row.cost, 0);
      const daysElapsed = monthStart.getDate();
      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const projected = daysElapsed > 0 && daysInMonth > 0 ? (monthToDate / daysElapsed) * daysInMonth : null;

      // ── budget + usage overview ──────────────────────────────────────────
      let budget = null;
      if (billingTotal !== null && this.monthlyBudget !== null && this.monthlyBudget > 0) {
        budget = {
          monthly: this.monthlyBudget,
          used: billingTotal,
          remaining: Math.max(0, this.monthlyBudget - billingTotal),
          pct: Math.min(100, (billingTotal / this.monthlyBudget) * 100),
        };
      }
      const daySet = new Set((stats.byDay ?? []).map((row) => row.day));
      const todayKey = localDay(Date.now());
      let streakDays = 0;
      if (todayKey !== undefined) {
        const cursor = new Date();
        for (;;) {
          const key = localDay(cursor.getTime());
          if (key === undefined || !daySet.has(key)) break;
          streakDays += 1;
          cursor.setDate(cursor.getDate() - 1);
        }
      }
      const overview = {
        activeDays: daySet.size,
        streakDays,
        // "Most used" = most calls (the by* rows are cost-sorted).
        topModel: [...stats.byModel].sort((a, b) => b.calls - a.calls)[0]?.model ?? null,
        topProvider: [...stats.byProvider].sort((a, b) => b.calls - a.calls)[0]?.provider ?? null,
      };

      const snapshot = {
        generatedAt: Date.now(),
        currency: this.currency,
        refreshSeconds: this.refreshSeconds,
        sessionsScanned: sessions.length,
        totalSessions,
        decodeErrors,
        // Current filter scope + the full working-directory list (the UI
        // keeps its selector stable while scoped).
        scope: { cwd },
        allCwds,
        pricing: pricingRows(pricing, this.defaultPricing),
        autoDiscovered,
        billing: {
          parts: billingParts,
          total: billingTotal,
          // Projected month-end spend (usage-based cost only, no
          // subscriptions): month-to-date ÷ elapsed days × days in month.
          projected: projected === null || !Number.isFinite(projected) ? null : projected,
        },
        budget,
        overview,
        ...stats,
      };
      this.cache.set(`${signature}\u0000${cwd ?? ""}`, snapshot);
      return snapshot;
    }
  };
})();

export { UsageStatsService, UsageStatsService as default };
