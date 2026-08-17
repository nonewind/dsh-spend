# dsh-spend

> Token usage & cost monitor for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — floating widget with multi-dimensional stats, time-series charts, auto-detected billing plans (Code/Token) and estimated spend.
>
> [简体中文](README.md) | English

A **floating usage widget** pinned to the bottom-right corner of the dsh Web UI: token volume, multi-dimensional statistics, auto-detected billing plans and estimated monthly spend.

## Interactions

- **Floating pill** (bottom-right): always shows estimated cost and total tokens;
- **Hover**: summary preview (cost, tokens, input / output / cache-read, call count, **today's subtotal**);
- **Click**: expands the dashboard into four tabs; a **workspace filter** dropdown on top scopes every dimension to one project (drill down into subdirectories):

  - **Overview** (a dashboard in the KPI + trend style of mainstream usage panels): the **billing bar** (estimated monthly spend + composition, **projected month-end usage spend**, token estimate, total tokens, calls, sessions, **avg cost / call**, **cache hit rate**, optional **monthly budget** — pill turns amber at 80%, red at 100% — and **active days / day streak**), **Plans** (auto-detected Code/Token plans with tiers, quota used & remaining), the 72-hour time series, an **activity heatmap** (52 weeks, GitHub-style, cell depth = daily token volume, hover for tokens / cost / calls), **top providers / top models by cost** (6 rows each) and the 31-day trend;
  - **Today**: today's calls, tokens and cost summary plus an **hour-by-hour** token / cost chart for the current day;
  - **Performance**: per-model **time-to-first-token (TTFT) avg / P50 / P90, generation speed (tokens/s) and average latency**, plus hourly TTFT / speed curves;
  - **Call details**: calls, tokens and cost per **session × model**, plus **by-working-directory stats** (sessions / models / calls / cost per project), **by-session stats**, **recent calls** (cost anomalies far above the mean are flagged with a red dot) and the **rate table** — all also openable in a **separate window** that auto-refreshes with the main one and offers **CSV / JSON / call-log CSV export**.

Data auto-refreshes every `refreshSeconds` (default 30s; the interval is driven by the server config, no frontend change needed) and can be refreshed manually from the panel.

## Screenshots

![Dashboard overview](docs/screenshots/dashboard.png)

![Call-details window](docs/screenshots/details-window.png)

## Provider auto-detection (zero configuration)

A built-in **provider knowledge base** (`lib/knowledge.js`, verified against official docs on 2026-08-14) covering **17 providers / 131 model rate cards**:

**Subscription (Code) plans — auto-detected with fees and quotas:**

| Provider | Default tier | Tiers | Quota |
|---|---|---|---|
| OpenCode Go (`opencode-go`) | $10/mo | — | $30/week (~79,050 req/wk for V4 Flash) |
| OpenAI Codex (`openai-codex`) | Plus $20/mo | Plus / Pro 5x $100 / Pro 20x $200 / Business | ~100 req/wk (reference) |
| GitHub Copilot (`github-copilot`) | Pro $10/mo | Free / Pro / Pro+ $39 / Max $100 / Business / Enterprise | AI Credits $15/mo (Pro) |
| Claude Code (`claude-sub`) | Pro $20/mo | Pro / Max 5x $100 / Max 20x $200 | not published (5h windows, 1x/5x/20x) |
| Google AI / Gemini CLI (`google-ai-sub`) | AI Pro $19.99/mo | AI Pro / Ultra 5x $99.99 / Ultra 20x $199.99 | 1,500 req/day (Pro) |

**Pay-as-you-go (Token) plans — auto-priced with official rates:**

| Provider | Models in knowledge base |
|---|---|
| OpenAI (`openai`) | gpt-5.6 sol/terra/luna, gpt-5.5, gpt-5.4 family, gpt-5 family, gpt-5.2, o3/o4-mini/o1 |
| Anthropic (`anthropic`) | claude-opus-5, sonnet-5, haiku-4-5, fable-5, opus/sonnet-4.x |
| Google (`google`) | gemini-3.7/3.6/3.5 flash, 3.1-pro, 2.5 pro/flash/lite |
| xAI (`xai`) | grok-4.6, 4.5, 4.3, build-0.1 |
| Mistral (`mistral`) | large-3, medium-3.5, small-4, ministral-3 |
| Moonshot (`moonshot`) | kimi-k3, k2.7-code |
| Zhipu (`zhipu`) | glm-5.2, 5.1, 5 |
| Alibaba (`qwen`) | qwen3.8-max, 3.7-max/plus/flash |
| MiniMax (`minimax`) | m3, m2.7 |
| OpenRouter (`openrouter`) | 50 live-catalog models |
| OpenCode Zen (`opencode-zen`) | PAYG gateway rates (Claude/GPT/Gemini/Grok/DeepSeek) |
| DeepSeek (`deepseek`) | v4-flash, v4-pro |

Provider ids are normalized through an alias table (`glm`→zhipu, `kimi`→moonshot, `dashscope`→qwen, `gemini`→google, `grok`→xai, `claude`→anthropic, `copilot`→github-copilot, …).

- Providers that appear in your session logs are **matched against the knowledge base automatically** (badged "auto" in the UI); an explicit `plans` config always overrides auto-detection, and explicit `pricing` rows override knowledge-base rates.
- **Cost model**: Code plans count their **subscription fee**, Token plans their **estimated usage**, into the "estimated monthly spend"; the raw "token estimate" stays visible for comparison.
- Plans without a published quota (e.g. Claude Code) show the tier table instead of a progress bar; quotas are measured over the official period (day/week/month).

## How it works

- The host plugin (`lib/index.js`) registers a Typert Remote service `usageStats` (discovered by the gateway's SRC reflection — no generated descriptor files).
- The browser half (`lib/client.js`) bypasses typert namespaces and calls the host gateway directly with `ctx.connection.rpc.call("/api", "usageStats/query", ...)` — the same carrier generated namespaces use, so no inject declaration for a self-created namespace is needed.
- The floating widget renders through its own React root on `document.body` (`position: fixed; right: 20px; bottom: 20px`) and is removed on plugin unload.
- Session logs under `$DSH_HOME/sessions` are replayed frame by frame (zstd) using the same semantics as the harness token-meter: `assistant/chunk` usage is an early sample, the `assistant/message` usage is the final sample for the same (turn, step) and **replaces** it, so nothing is double-counted; in-memory live-session events are merged on top.
- Cost = Σ(bucket tokens × rate / 1e6); rates resolve **per provider**: exact (provider, model) row → generic model row → default fallback.
- Dimensions: totals / by provider / by model / by hour (zero-filled continuous series for the charts) / by day / by session / recent calls / performance (per-step TTFT, tokens/s and latency, aggregated per model and per hour) / session × model details.
- Performance semantics: TTFT = request (`request/header`) → first content chunk; generation window = first → last content chunk; tokens/s = output tokens ÷ generation window. Tool-loop follow-up steps have no separate request log, so their TTFT is **estimated** from `step/start` (samples carry an `ttftEstimated` flag).
- Snapshots are cached behind a signature of file sizes + mtimes + live event counts; unchanged data returns from cache.

## Installation

The package ships a `dsh.bundle` manifest, so `dsh plugin add` mounts it as a profile layer automatically — **no manual profile editing needed**:

```bash
# 1. Install into the web profile (forwards to pnpm; accepts npm packages, github:owner/repo, or local paths)
dsh plugin --profile web add dsh-spend

# 2. Verify the row is mounted
dsh --profile web --dump-config | grep usage-stats

# 3. Restart dsh web (plugin code is not hot-reloaded)
dsh web
```

To install from source: `dsh plugin --profile web add github:nonewind/dsh-spend` (or a local path with `-w`).

**Overriding defaults**: the plugin's built-in provider knowledge base auto-detects pricing and billing plans (see above), so no config is usually required. To override, add an `insert` row with the same id (`usage-stats`) to `~/.dsh/profiles/web/cordis.patch.yml` — the user layer applies after bundle layers and the same-id row wins (see the `config` below).

## Configuration

The `config` of the `usage-stats` row in `cordis.patch.yml`:

```yaml
config:
  currency: USD            # CNY (¥) or USD ($)
  pricing:                 # per-model rates (per million tokens)
    - model: deepseek-v4-flash
      inputPerMillion: 0.14
      outputPerMillion: 0.28
      cacheReadPerMillion: 0.0028
      cacheWritePerMillion: 0
  defaultPricing:          # fallback rates for unknown models
    inputPerMillion: 0.14
    outputPerMillion: 0.28
    cacheReadPerMillion: 0.0028
    cacheWritePerMillion: 0
  maxSessions: 20          # max rows in the by-session table
  maxRecentCalls: 50       # max recent calls
  seriesHours: 72          # time-series window in hours (zero-filled)
  refreshSeconds: 30       # auto-refresh interval in seconds (>= 5)
  monthlyBudget: 50        # optional monthly spend budget (same currency): used/remaining + alerts
  plans:                   # billing plans: Token Plan / Code Plan with usage & remaining
    - provider: opencode-go
      type: token          # pay-as-you-go: used cost (estimate); balance optional
      # balance: 100
    - provider: openai-codex
      type: code           # subscription quota: measured over the last periodDays
      quotaRequests: 100   # periodic request quota (or quotaTokens for token quota)
      periodDays: 7
```

> Pricing rows accept an optional `provider` field for exact provider matching (e.g. `provider: openai-codex`); rows without one apply to any provider serving that model; unmatched models fall back to `defaultPricing`.
> Token Plan "remaining" = configured prepaid balance − accumulated estimated cost; Code Plan "remaining" = quota − actual consumption in the period.
> Providers without a `plans` entry show no plan card (their cost is still shown in the by-provider table).

### Rate sources (verified from official pages, 2026-08-14)

Cost = Σ(bucket tokens × rate / 1e6):

| Model | Input (miss) | Input (cache hit) | Cache write | Output |
|---|---|---|---|---|
| deepseek-v4-flash | $0.14 | $0.0028 | 0* | $0.28 |
| deepseek-v4-pro | $0.435 | $0.003625 | 0* | $0.87 |
| gpt-5.6-sol | $5.00 | $0.50 | $6.25 | $30.00 |
| gpt-5.6-terra | $2.00 | $0.20 | $2.50 | $12.00 |
| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 |

- DeepSeek: [official pricing](https://api-docs.deepseek.com/quick_start/pricing/) (fetched 2026-08-14). \*DeepSeek's disk cache is automatic and has **no separate cache-write line item**, hence `cacheWritePerMillion: 0`.
- OpenAI: [official pricing](https://platform.openai.com/docs/pricing) (after the 2026-07-30 cuts); cache writes bill at 1.25× uncached input. Luna is down 80% ($1→$0.20 input / $6→$1.20 output).
- ⚡ **DeepSeek peak/off-peak pricing is built in** (effective 2026-08-17 00:00 +08:00; peak 09:00–12:00 / 14:00–18:00 local time, off-peak at half price): v4-flash peak $0.014 (hit) / $0.44 (miss) / $1.32 (output), off-peak halved; v4-pro peak $0.044 / $1.32 / $3.96, off-peak halved. A pricing row can carry a `schedule` (`effectiveAt` + `peakHours` + `peak`/`offPeak` rates) — **each call is priced by its own timestamp**: legacy rates before 8/17, peak/off-peak after; historical calls are never re-priced (rate table rows show a "peak/off-peak" badge).
- ⚠️ **OpenCode Go is subscription-based** (not token-billed): usage consumes the $10/month dollar quota (5h $12 / week $30 / month $60) instead of the token rates above — the "token estimate" is only a relative reference; real spend is the "estimated monthly spend" and the plan cards.
- If your provider bills through a proxy (not the official endpoint), override the model rates to match the proxy's actual billing.

> Cost figures are **estimates** for reference only, not a bill.

## Repository layout

```
dsh-spend/
├── package.json        # dual-face declaration: dsh.client (web platform + inject edges)
├── lib/
│   ├── index.js        # host plugin: UsageStatsService (Typert Remote)
│   ├── knowledge.js    # provider knowledge base: plan auto-detection (Code/Token)
│   ├── stats.js        # pure replay / aggregation / pricing logic (unit-testable)
│   └── client.js       # browser bundle (hand-written __ModuleLoader__ format)
└── node_modules/       # local dependency symlinks to the dsh installation (not committed)
```

## Notes & limitations

- Statistics follow the harness token-meter projection semantics: **only calls carrying provider usage are counted**; reasoning is reported as an output subdivision when the log provides `reasoningTokens`.
- Billing is an estimate, not an invoice; cache reads are priced at the cache-hit rate.
- Sessions whose logs fail to decode are counted in `decodeErrors` and shown in the footer.
