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
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { autoPlanFor, autoRatesFor, knowsProvider } from "./knowledge.js";
import { buildStats, computeSignature, localDay, normalizeProviderUsage, pricingRows, scanSessions } from "./stats.js";

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
      //   type 'code'  — per-window quotas (requests and/or tokens).
      // Code plans may declare a `quota` row with per-window caps:
      //   requestsPer5h / requestsPerDay / requestsPerWeek / requestsPerMonth,
      //   dollarsPer5h / dollarsPerDay / dollarsPerWeek / dollarsPerMonth,
      //   tokensPer5h / tokensPerDay / tokensPerWeek / tokensPerMonth,
      //   window5hMultiplier (relative 5h cap when counts are unpublished),
      //   note (free-text shown below the limits).
      // The legacy single-window fields (quotaRequests/quotaTokens +
      // periodDays) keep working for plain deployments.
      plans: z.array(z.object({
        provider: z.string().required(),
        type: z.union([z.const("token"), z.const("code")]),
        balance: z.number().min(0),
        quotaRequests: z.number().step(1).min(1),
        quotaTokens: z.number().step(1).min(1),
        periodDays: z.number().step(1).min(1),
        quota: z.object({
          requestsPer5h: z.number().min(0),
          requestsPerDay: z.number().min(0),
          requestsPerWeek: z.number().min(0),
          requestsPerMonth: z.number().min(0),
          dollarsPer5h: z.number().min(0),
          dollarsPerDay: z.number().min(0),
          dollarsPerWeek: z.number().min(0),
          dollarsPerMonth: z.number().min(0),
          tokensPer5h: z.number().min(0),
          tokensPerDay: z.number().min(0),
          tokensPerWeek: z.number().min(0),
          tokensPerMonth: z.number().min(0),
          window5hMultiplier: z.number().min(0),
          note: z.string(),
        }).default({}),
      })).default([]),
      // Live usage endpoints of subscription providers. When a code plan's
      // provider has an endpoint here, the plan card shows the vendor's OWN
      // reported usage — percent per window + reset time — fetched from it,
      // instead of the locally estimated quota rows. The API key is resolved
      // from the credentials seam under `apiKeyEnv` (derived default:
      // `<PROVIDER>_API_KEY`, e.g. OPENCODE_GO_API_KEY), then the process
      // environment. The endpoint is undocumented API; failures surface as a
      // friendly note on the card and the local estimate remains as fallback.
      usageEndpoints: z.array(z.object({
        provider: z.string().required(),
        url: z.string().required(),
        apiKeyEnv: z.string(),
        timeoutMs: z.number().step(1).min(1000),
      })).default([
        { provider: "opencode-go", url: "https://opencode.ai/zen/go/v1/usage", timeoutMs: 15000 },
      ]),
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
    usageEndpoints;
    /** Live provider usage cache: `provider → { at, data }` (TTL = refresh interval). */
    usageCache = new Map();
    usageTtlMs;
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
      this.usageEndpoints = config.usageEndpoints ?? [];
      this.usageTtlMs = Math.max(15000, (config.refreshSeconds ?? 30) * 1000);
      // Drop the cached snapshot when the plugin is reconfigured/reloaded.
      ctx.effect(() => () => {
        this.cache = new Map();
        this.inflight = new Map();
        this.usageCache = new Map();
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
      let snapshot;
      if (cached !== undefined) {
        snapshot = cached;
      } else {
        let pending = this.inflight.get(key);
        if (pending === undefined) {
          pending = this.compute(signature, live, cwd).finally(() => {
            this.inflight.delete(key);
          });
          this.inflight.set(key, pending);
        }
        snapshot = await pending;
      }
      // Live provider-reported usage rides on top of the cached snapshot: the
      // percent changes with every model request without touching any session
      // file, so it is fetched here (TTL'd by the refresh interval) and
      // attached to the code-plan rows. Providers without a configured
      // endpoint keep their snapshot rows untouched.
      const plans = await Promise.all((snapshot.plans ?? []).map(async (plan) => {
        if (plan?.type !== "code") return plan;
        const usage = await this.fetchProviderUsage(plan.provider);
        return usage === undefined ? plan : { ...plan, providerUsage: usage };
      }));
      const changed = plans.some((plan, index) => plan !== snapshot.plans[index]);
      return changed ? { ...snapshot, plans } : snapshot;
    }

    /**
     * Fetch one subscription provider's official usage payload (e.g. OpenCode
     * Go's `GET /zen/go/v1/usage`). The response is normalized to per-window
     * percent + reset rows; a missing key, non-200 response or fetch failure
     * resolves to an error payload instead of throwing, so the dashboard
     * never breaks on the vendor endpoint. Results are cached for the
     * configured refresh interval.
     * @param provider - provider id; must have a `usageEndpoints` row.
     * @returns the normalized usage payload, or undefined when the provider
     *   has no configured endpoint.
     */
    async fetchProviderUsage(provider) {
      const endpoint = this.usageEndpoints.find((entry) => entry.provider === provider);
      if (endpoint === undefined) return undefined;
      const cached = this.usageCache.get(provider);
      if (cached !== undefined && Date.now() - cached.at < this.usageTtlMs) return cached.data;
      const key = await this.resolveUsageKey(provider, endpoint);
      if (typeof key !== "string" || key.length === 0) {
        return this.cacheUsage(provider, {
          provider,
          source: "provider",
          fetchedAt: Date.now(),
          windows: {},
          error: `API key not configured (${this.usageEnvName(provider, endpoint)})`,
        });
      }
      let data;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs ?? 15000);
        let response;
        try {
          response = await fetch(endpoint.url, {
            headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = normalizeProviderUsage(await response.json(), provider);
      } catch (error) {
        data = {
          provider,
          source: "provider",
          fetchedAt: Date.now(),
          windows: {},
          error: String(error?.message ?? error),
        };
      }
      return this.cacheUsage(provider, data);
    }

    cacheUsage(provider, data) {
      this.usageCache.set(provider, { at: Date.now(), data });
      return data;
    }

    /** Environment name behind a provider's usage API key (config or derived). */
    usageEnvName(provider, endpoint) {
      return endpoint.apiKeyEnv ?? `${provider.replaceAll("-", "_").toUpperCase()}_API_KEY`;
    }

    /**
     * Resolve a provider's usage API key: the credentials seam
     * (`ctx.credentials.resolve`) first — the managed `$DSH_HOME/
     * .credentials.yaml` document — then the process environment.
     */
    async resolveUsageKey(provider, endpoint) {
      const envName = this.usageEnvName(provider, endpoint);
      const credentials = this.ctx.credentials;
      if (credentials !== undefined && typeof credentials.resolve === "function") {
        const hit = await credentials.resolve(credentialRef(envName)).catch(() => undefined);
        if (typeof hit?.value === "string" && hit.value.length > 0) return hit.value;
      }
      const fromEnv = process.env[envName];
      return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : undefined;
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
