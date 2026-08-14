# dsh-spend

> Token usage & cost monitor for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — floating widget with multi-dimensional stats, time-series charts, auto-detected billing plans (Code/Token) and estimated spend.
>
> dsh 用量与计费仪表盘：token 调用量、按模型 / 供应商 / 时间统计、预计费用，自动识别订阅制（Code）与按量（Token）计费计划。

简体中文 | [English](README.en.md)

在 dsh Web UI 右下角显示一个**悬浮用量窗口**，查看 **token 调用量、多维度统计与预计计费金额**。

交互方式：

- **悬浮胶囊**（右下角）：始终显示预计费用与总 Token；
- **hover**：浮现摘要预览（费用、Token、输入 / 输出 / 缓存读、调用次数）；
- **点击**：展开完整详情面板，展示：

  - **总览卡片**：**预计花费（月）**（订阅费 + 按量估算的真实口径，悬停可见构成）+ 按 token 估算费用 + 各桶 Token / 调用 / 会话；
  - **计划用量**：**自动识别**每个提供商的计费计划（带"自动识别"徽章）——**Code Plan**（订阅制：显示订阅费与周期额度使用量/剩余量，如 OpenCode Go $10/月、OpenAI Codex $20/月）与 **Token Plan**（按 token 计费：已用费用、可选充值余额与剩余），进度条 ≥80% 变黄提示；
  - **时间曲线**：按小时的 Token / 费用曲线（SVG 手绘，无第三方依赖；Token 模式画输入 / 输出 / 缓存读三条线，费用模式为面积图，悬停显示该小时明细；默认窗口 72 小时，可配置）；
  - **按提供商统计**：每个 AI 提供商的调用、token 与费用占比（自动汇总，计价按提供商精确匹配）；
  - **按模型统计**：每个模型的调用次数、各桶 token 数与费用占比；
  - **按日期统计**：每日调用与费用（最近 31 天）；
  - **按会话统计**：费用最高的会话（工作目录、调用次数、Token、占比）；
  - **最近调用**：最近 50 次调用的时间、模型、会话、轮次/步骤、token 明细与单次费用；
  - **计费单价表**：当前生效的费率（便于核对估算口径）。

数据按 `refreshSeconds`（默认 30 秒）定时自动刷新（间隔由服务端配置下发，页面无需改动），面板内也可手动刷新。

## 供应商自动识别（无需配置）

插件内置**供应商知识库**（`lib/knowledge.js`，2026-08-14 官方文档核实）：

| 供应商 | 自动识别的计划 | 官方依据 |
|---|---|---|
| OpenCode Go（`opencode-go`） | **Code 计划**：订阅 $5 首月 / 之后 **$10/月**；美元额度 5h $12 / **周 $30** / 月 $60；DeepSeek V4 Flash 约 **79,050 请求/周** | [opencode.ai/docs/go](https://opencode.ai/docs/go/) |
| OpenAI Codex（`openai-codex`） | **Code 计划**：ChatGPT Plus **$20/月** 订阅额度（5 小时窗口 + 周配额，约 100 请求/周） | [Codex usage limits](https://apidog.com/blog/codex-usage-limits/) |
| DeepSeek API（`deepseek`） | **Token 计费**：官方价目（输入 $0.14 / 命中 $0.0028 / 输出 $0.28 每百万） | [api-docs.deepseek.com](https://api-docs.deepseek.com/quick_start/pricing/) |

- 日志中出现的提供商**自动匹配**知识库生成计划（UI 标记"自动识别"）；显式 `plans` 配置始终覆盖自动识别。
- **费用口径**：Code 计划按**订阅费**、Token 计划按**估算用量**计入「预计花费（月）」；"按 token 估算"仍单独展示，用于对比。

## 工作原理

- 服务端插件（`lib/index.js`）注册为 Typert Remote 服务 `usageStats`（通过网关的 SRC 发现机制，无需生成描述符文件）。
- 浏览器端（`lib/client.js`）不走 typert 命名空间，直接以 `ctx.connection.rpc.call("/api", "usageStats/query", ...)` 调用宿主网关（与生成的 Remote 命名空间同一载体），因此无需在 inject 中声明由插件自身创建的命名空间。
- 悬浮窗口通过插件自己的 React root 挂在 `document.body` 上（`position: fixed; right: 20px; bottom: 20px`），卸载时自动移除。
- 直接回放 `$DSH_HOME/sessions` 下所有会话的持久化日志（zstd 分帧逐帧解码），按 token-meter 的语义聚合：`assistant/chunk` 的 usage 为早期样本，`assistant/message` 的 usage 为同一 (turn, step) 的最终样本并**替换**早期样本，因此不会重复计数；当前内存中的活动会话事件也会合并进来。
- 费用 = Σ(各桶 token × 对应单价 / 1e6)，单价解析**按提供商自动匹配**：先找 (provider, model) 精确行，再找通用 model 行，最后回退默认单价——因此每个 AI 提供商（如 opencode-go 与 openai-codex）都按其官方价目各自计费，互不干扰。
- 统计维度：总账 / 按提供商 / 按模型 / 按小时（0 填充的连续时间序列，用于曲线图）/ 按天 / 按会话 / 最近调用。
- 快照按「会话文件大小 + mtime + 活动会话事件数」做签名缓存，数据未变时直接返回缓存。

## 安装

**方式一：npm 直装（推荐）**

```bash
# 1. 从 npm 安装到 web profile（pnpm 转发）
dsh plugin --profile web add dsh-spend

# 2. 在 ~/.dsh/profiles/web/cordis.patch.yml 中加入：
- insert:
    - id: usage-stats
      name: 'dsh-spend'
      config:
        currency: USD
        # 价格表与 plans 可留空：默认按内置供应商知识库自动识别（见下方）
        # pricing: [...]
        # plans: [...]

# 3. 重启 dsh web（改动需要重启加载，HMR 对插件不生效）
dsh web
```

**方式二：GitHub 源码安装**

```bash
git clone https://github.com/nonewind/dsh-spend.git
dsh plugin --profile web add -w ./dsh-spend
# 然后同样在 cordis.patch.yml 加入上述 insert 行并重启 dsh web
```

## 配置

`cordis.patch.yml` 中 `usage-stats` 行的 `config`（当前已写入官方价，见下方「价格来源」）：

```yaml
config:
  currency: USD            # CNY（¥）或 USD（$）
  pricing:                 # 按模型精确匹配的单价（每百万 token）
    - model: deepseek-v4-flash
      inputPerMillion: 0.14
      outputPerMillion: 0.28
      cacheReadPerMillion: 0.0028
      cacheWritePerMillion: 0
  defaultPricing:          # 未知模型的回退单价
    inputPerMillion: 0.14
    outputPerMillion: 0.28
    cacheReadPerMillion: 0.0028
    cacheWritePerMillion: 0
  maxSessions: 20          # 按会话统计最多展示行数
  maxRecentCalls: 50       # 最近调用最多展示行数
  seriesHours: 72          # 时间曲线窗口（小时，服务端按此出 0 填充连续序列）
  refreshSeconds: 30       # 悬浮窗自动刷新间隔（秒，>= 5）
  plans:                   # 计费计划：判断 Token Plan / Code Plan 并展示使用量与剩余量
    - provider: opencode-go
      type: token          # token 计费：已用费用（估算）；balance 为充值余额（可选）
      # balance: 100
    - provider: openai-codex
      type: code           # 订阅额度制：使用量取近 periodDays 天的实际消耗
      quotaRequests: 100   # 周期请求额度（也可用 quotaTokens 按 token 额度）
      periodDays: 7
```

> 计价行可加可选 `provider` 字段做提供商精确匹配（如 `provider: openai-codex`），
> 不带 provider 的行对任意提供商的同名模型生效；未匹配到任何行时回退 `defaultPricing`。
> Token Plan 的「剩余」= 配置的充值余额 − 累计已用费用；Code Plan 的「剩余」= 额度 − 周期内实际消耗。
> 未配置 `plans` 的提供商不显示计划卡片（默认按 token 计费口径展示费用）。

### 价格来源（2026-08-14 官网查证）

单价均来自厂商官方定价页，已写入本地配置；`费用 = Σ(各桶 token × 对应单价 / 1e6)`：

| 模型 | 输入(未命中) | 输入(缓存命中) | 缓存写 | 输出 |
|---|---|---|---|---|
| deepseek-v4-flash | $0.14 | $0.0028 | 0* | $0.28 |
| deepseek-v4-pro | $0.435 | $0.003625 | 0* | $0.87 |
| gpt-5.6-sol | $5.00 | $0.50 | $6.25 | $30.00 |
| gpt-5.6-terra | $2.00 | $0.20 | $2.50 | $12.00 |
| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 |

- DeepSeek：[官方定价页](https://api-docs.deepseek.com/quick_start/pricing/)（2026-08-14 抓取）。\*DeepSeek 的上下文硬盘缓存自动生效、**无单独缓存写入计费项**，故 `cacheWritePerMillion: 0`。
- OpenAI：[官方定价页](https://platform.openai.com/docs/pricing)（2026-07-30 降价后），缓存写 = 未命中输入 × 1.25。Luna 已降 80%（$1→$0.20 输入 / $6→$1.20 输出）。
- ⚠️ **DeepSeek 将于 2026-08-17 起改为峰谷定价**（高峰 01:00–04:00 / 06:00–10:00 UTC，空闲为高峰一半）：v4-flash 高峰 $0.014(命中)/$0.44(未命中)/$1.32(输出)，空闲减半；v4-pro 高峰 $0.044/$1.32/$3.96。**届时请更新本表**（插件目前按单一价格计算，不支持按时段计价）。
- ⚠️ **OpenCode Go 是订阅制**（非按 token 计费）：其用量不按上表 token 单价扣费，而是消耗 $10/月订阅的美元额度（5h $12 / 周 $30 / 月 $60）——「按 token 估算」仅作相对占比参考，真实花费看「预计花费（月）」与计划卡片。
- 若你的 provider 经代理中转计费（非官方直连），请按代理实际账单覆盖对应模型的单价。

> 费用为按官方单价的**估算值**，仅作参考，非账单；页面底部亦有免责说明。

## 目录结构

```
dsh-spend/
├── package.json        # 双端声明：dsh.client（web 平台 + 注入边）
├── lib/
│   ├── index.js        # 服务端插件：UsageStatsService（Typert Remote）
│   ├── knowledge.js    # 供应商知识库：计划自动识别（Code/Token）
│   ├── stats.js        # 纯回放/聚合/计费逻辑（可独立测试）
│   └── client.js       # 浏览器 bundle（手写 __ModuleLoader__ 格式）
└── node_modules/       # 指向 dsh 安装的依赖符号链接（本地开发，不入库）
```

## 说明与边界

- 统计口径与 harness 的 token-meter 投影一致：**仅统计带 provider usage 的调用**；
  reasoning 计入 output 桶的细分（如日志提供 `reasoningTokens`）。
- 计费为估算值，不是账单；缓存读按命中单价计费。
- 日志解码失败的会话会计入 `decodeErrors` 并在页脚提示。
