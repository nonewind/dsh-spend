# dsh-spend

> Token usage & cost monitor for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — floating widget with multi-dimensional stats, time-series charts, auto-detected billing plans (Code/Token) and estimated spend.
>
> [简体中文](README.md) | English

A **floating usage widget** pinned to the bottom-right corner of the dsh Web UI: token volume, multi-dimensional statistics, auto-detected billing plans and estimated monthly spend.

## Interactions

- **Floating pill** (bottom-right): always shows estimated cost and total tokens;
- **Hover**: summary preview (cost, tokens, input / output / cache-read, call count);
- **Click**: expands the full dashboard:

  - **Summary cards**: **estimated monthly spend** (subscription fees + usage-based estimates; hover to see the composition) plus the raw token estimate and per-bucket tokens / calls / sessions;
  - **Plans**: **auto-detected** billing plan per provider (badged "auto") — **Code Plan** (subscription: fee + periodic quota used/remaining, e.g. OpenCode Go $10/mo, OpenAI Codex $20/mo) and **Token Plan** (pay-as-you-go: used cost, optional prepaid balance and remaining); progress bar turns amber at ≥80%;
  - **Time series**: hourly token / cost curves (hand-rolled SVG, zero dependencies; token mode draws input / output / cache-read lines, cost mode an area chart; hover shows the hour's details; 72-hour window by default, configurable);
  - **By provider**: calls, tokens and cost share per AI provider (auto-aggregated; pricing resolves per provider);
  - **By model**: calls, per-bucket tokens and cost share per model;
  - **By day**: daily calls and cost (last 31 days);
  - **By session**: top sessions by cost (working dir, calls, tokens, share);
  - **Recent calls**: last 50 calls with time, model, session, turn/step, token details and per-call cost;
  - **Rate table**: the currently effective per-model rates.

Data auto-refreshes every `refreshSeconds` (default 30s; the interval is driven by the server config, no frontend change needed) and can be refreshed manually from the panel.

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
- Dimensions: totals / by provider / by model / by hour (zero-filled continuous series for the charts) / by day / by session / recent calls.
- Snapshots are cached behind a signature of file sizes + mtimes + live event counts; unchanged data returns from cache.

## Installation

**Option 1: install from npm (recommended)**

```bash
# 1. Install into the web profile (forwards to pnpm)
dsh plugin --profile web add dsh-spend

# 2. Add to ~/.dsh/profiles/web/cordis.patch.yml:
- insert:
    - id: usage-stats
      name: 'dsh-spend'
      config:
        currency: USD
        # pricing / plans can stay empty: the built-in provider knowledge
        # base auto-detects plans (see above)
        # pricing: [...]
        # plans: [...]

# 3. Restart dsh web (plugin code is not hot-reloaded)
dsh web
```

**Option 2: install from the GitHub source**

```bash
git clone https://github.com/nonewind/dsh-spend.git
dsh plugin --profile web add -w ./dsh-spend
# then add the same insert block above to cordis.patch.yml and restart dsh web
```

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
- ⚠️ **DeepSeek switches to peak/off-peak billing on 2026-08-17** (peak 01:00–04:00 / 06:00–10:00 UTC; off-peak at half price): v4-flash peak $0.014 (hit) / $0.44 (miss) / $1.32 (output); v4-pro peak $0.044 / $1.32 / $3.96. **Update the table after that date** (the plugin currently prices with a single rate, no time-of-day pricing).
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
