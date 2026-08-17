/**
 * dsh-spend browser bundle.
 *
 * A floating usage widget pinned to the bottom-right corner of the web UI:
 * a compact pill shows the estimated cost and token volume; hovering reveals
 * a summary preview; clicking expands the full dashboard (totals, by model,
 * by day, by session, recent calls, active rates).
 *
 * Data flows through the standard `/api` Remote gateway: the host service is
 * discovered by SRC reflection (no generated typert descriptors), and the
 * browser calls it directly with `ctx.connection.rpc.call(...)` — the same
 * carrier the generated namespaces use. The widget renders through its own
 * React root on `document.body` (a floating overlay, not a conversation tab).
 *
 * Built by hand in the client module format (lazy CJS factory registered
 * through window.__ModuleLoader__) — no bundler step is needed.
 */
window.__ModuleLoader__.load({
	id: "dsh-spend",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom_client = require("react-dom/client");

		//#region locale
		/** Dictionary namespace owned by this plugin. */
		const NS = "usageStats";
		/** Simplified Chinese dictionary (key-set source of truth). */
		const zh = {
			"widget.hint": "Token 用量与预计费用",
			"widget.open": "展开详情",
			"widget.close": "收起",
			"widget.hoverHint": "点击展开详情",
			"state.loading": "统计中…",
			"state.error": "加载失败",
			"state.empty": "暂无 token 用量数据（尚无带 usage 的调用）",
			"state.retry": "重试",
			"refresh": "刷新",
			"lastUpdated": "更新于",
			"summary.cost": "预计费用",
			"summary.tokens": "总 Token",
			"summary.input": "输入",
			"summary.output": "输出",
			"summary.cacheRead": "缓存读",
			"summary.cacheWrite": "缓存写",
			"summary.calls": "调用次数",
			"summary.sessions": "会话数",
			"section.series": "时间曲线",
			"section.plans": "计划用量",
			"plan.token": "Token 计费",
			"plan.code": "Code 计划",
			"plan.usedCost": "已用费用",
			"plan.used": "已用",
			"plan.remaining": "剩余",
			"plan.balance": "余额",
			"plan.requests": "请求",
			"plan.tokens": "Token",
			"plan.period": "近 {days} 天",
			"plan.noBalance": "未配置余额",
			"plan.auto": "自动识别",
			"plan.subscription": "订阅",
			"plan.perMonth": "/月",
			"plan.tokenEstimate": "按 token 估算",
			"billing.monthly": "约 {amount}/月",
			"billing.total": "预计花费（月）",
			"billing.tokenOnly": "按量估算",
			"billing.parts": "构成",
			"billing.projected": "当月预计（按量外推）",
			"plan.quota": "额度",
			"plan.tiers": "档位",
			"section.byProvider": "按提供商统计",
			"section.byModel": "按模型统计",
			"section.byDay": "按日期统计",
			"section.bySession": "按会话统计",
			"section.byCwd": "按工作目录统计",
			"section.recent": "最近调用",
			"section.pricing": "计费单价（每百万 token）",
			"tab.overview": "总览",
			"tab.today": "今日",
			"tab.perf": "性能",
			"tab.details": "调用明细",
			"filter.all": "全部工作区",
			"filter.scope": "按工作区筛选统计范围",
			"recent.anomaly": "费用异常（远超均值）",
			"heatmap.title": "活跃热力图（近 52 周）",
			"heatmap.empty": "暂无热力图数据",
			"heatmap.less": "少",
			"heatmap.more": "多",
			"heatmap.mon": "一",
			"heatmap.wed": "三",
			"heatmap.fri": "五",
			"heatmap.month": "{m}月",
			"budget.title": "月预算",
			"budget.used": "已用",
			"budget.remaining": "剩余",
			"budget.exceeded": "已超出预算",
			"budget.over": "预算已用 {pct}%",
			"summary.activeDays": "活跃天数",
			"summary.streak": "连续使用",
			"summary.today": "今日",
			"summary.avgCost": "平均 / 次",
			"summary.cacheHit": "缓存命中率",
			"col.sessions": "会话数",
			"col.models": "模型数",
			"pricing.peakOffpeak": "峰谷计价",
			"details.exportCsv": "导出 CSV",
			"details.exportJson": "导出 JSON",
			"details.exportCalls": "导出调用明细 CSV",
			"today.title": "今日 Token 与费用",
			"today.calls": "今日调用",
			"today.tokens": "今日 Token",
			"today.cost": "今日费用",
			"today.empty": "今日暂无调用数据",
			"perf.title": "模型速度与延迟",
			"perf.modeTtft": "首字延时",
			"perf.modeTps": "生成速度",
			"perf.samples": "样本",
			"perf.ttftAvg": "首字延时 均值",
			"perf.ttftP50": "首字延时 P50",
			"perf.ttftP90": "首字延时 P90",
			"perf.tps": "生成速度",
			"perf.latencyAvg": "总延迟 均值",
			"perf.empty": "暂无性能数据（日志中缺少时间戳）",
			"perf.note": "首字延时 = 请求到首个内容 token；工具调用后的续写步骤无独立请求日志，其首字延时按步骤起点估算。",
			"perf.est": "估",
			"details.open": "在新窗口打开明细",
			"details.hint": "每个会话 × 模型的调用次数、token 与费用明细",
			"details.title": "调用明细 · 会话 × 模型",
			"details.updated": "更新于",
			"details.auto": "随主窗口自动刷新",
			"curve.tokens": "Token",
			"curve.cost": "费用",
			"curve.legendInput": "输入",
			"curve.legendOutput": "输出",
			"curve.legendCacheRead": "缓存读",
			"curve.empty": "暂无曲线数据（时间范围内无调用）",
			"col.model": "模型",
			"col.provider": "服务商",
			"col.calls": "调用",
			"col.input": "输入",
			"col.output": "输出",
			"col.cacheRead": "缓存读",
			"col.cacheWrite": "缓存写",
			"col.tokens": "Token",
			"col.cost": "费用",
			"col.share": "占比",
			"col.day": "日期",
			"col.hour": "时间",
			"col.session": "会话",
			"col.cwd": "工作目录",
			"col.created": "创建时间",
			"col.time": "时间",
			"col.turn": "轮/步",
			"col.price": "单价",
			"col.default": "默认单价",
			"footnote.disclaimer": "费用为按配置单价的估算值，仅作参考，非账单。",
			"footnote.scanned": "已扫描 {sessions} 个会话，{calls} 次调用",
			"footnote.errors": "（{errors} 个日志解码失败）",
		};
		/** English dictionary. */
		const en = {
			"widget.hint": "Token usage & estimated cost",
			"widget.open": "Expand",
			"widget.close": "Collapse",
			"widget.hoverHint": "Click to expand",
			"state.loading": "Computing…",
			"state.error": "Failed to load",
			"state.empty": "No token usage data yet (no calls with usage)",
			"state.retry": "Retry",
			"refresh": "Refresh",
			"lastUpdated": "Updated",
			"summary.cost": "Est. cost",
			"summary.tokens": "Total tokens",
			"summary.input": "Input",
			"summary.output": "Output",
			"summary.cacheRead": "Cache read",
			"summary.cacheWrite": "Cache write",
			"summary.calls": "Calls",
			"summary.sessions": "Sessions",
			"section.series": "Time series",
			"section.plans": "Plans",
			"plan.token": "Token plan",
			"plan.code": "Code plan",
			"plan.usedCost": "Used cost",
			"plan.used": "Used",
			"plan.remaining": "Remaining",
			"plan.balance": "Balance",
			"plan.requests": "requests",
			"plan.tokens": "Tokens",
			"plan.period": "last {days} days",
			"plan.noBalance": "no balance configured",
			"plan.quota": "quota",
			"plan.tiers": "Tiers",
			"plan.auto": "auto",
			"plan.subscription": "Subscription",
			"plan.perMonth": "/mo",
			"plan.tokenEstimate": "token estimate",
			"billing.monthly": "≈ {amount}/mo",
			"billing.total": "Est. monthly spend",
			"billing.tokenOnly": "usage-based estimate",
			"billing.parts": "Composition",
			"billing.projected": "Projected month-end (usage)",
			"section.byProvider": "By provider",
			"section.byModel": "By model",
			"section.byDay": "By day",
			"section.bySession": "By session",
			"section.byCwd": "By working directory",
			"section.recent": "Recent calls",
			"section.pricing": "Rates (per million tokens)",
			"tab.overview": "Overview",
			"tab.today": "Today",
			"tab.perf": "Performance",
			"tab.details": "Call details",
			"filter.all": "All workspaces",
			"filter.scope": "Filter stats to one working directory",
			"recent.anomaly": "Cost anomaly (far above average)",
			"heatmap.title": "Activity heatmap (52 weeks)",
			"heatmap.empty": "No heatmap data yet",
			"heatmap.less": "Less",
			"heatmap.more": "More",
			"heatmap.mon": "Mon",
			"heatmap.wed": "Wed",
			"heatmap.fri": "Fri",
			"heatmap.month": "{m}",
			"budget.title": "Monthly budget",
			"budget.used": "used",
			"budget.remaining": "remaining",
			"budget.exceeded": "over budget",
			"budget.over": "{pct}% of budget used",
			"summary.activeDays": "Active days",
			"summary.streak": "Day streak",
			"summary.today": "Today",
			"summary.avgCost": "Avg / call",
			"summary.cacheHit": "Cache hit rate",
			"col.sessions": "Sessions",
			"col.models": "Models",
			"pricing.peakOffpeak": "peak/off-peak",
			"details.exportCsv": "Export CSV",
			"details.exportJson": "Export JSON",
			"details.exportCalls": "Export call log CSV",
			"today.title": "Today's tokens & cost",
			"today.calls": "Calls today",
			"today.tokens": "Tokens today",
			"today.cost": "Cost today",
			"today.empty": "No calls today yet",
			"perf.title": "Model speed & latency",
			"perf.modeTtft": "TTFT",
			"perf.modeTps": "tokens/s",
			"perf.samples": "Samples",
			"perf.ttftAvg": "TTFT avg",
			"perf.ttftP50": "TTFT P50",
			"perf.ttftP90": "TTFT P90",
			"perf.tps": "tokens/s",
			"perf.latencyAvg": "Latency avg",
			"perf.empty": "No performance data (timestamps missing from logs)",
			"perf.note": "TTFT = request → first content token. Tool-loop follow-up steps have no separate request log, so their TTFT is estimated from the step start.",
			"perf.est": "est.",
			"details.open": "Open details in a new window",
			"details.hint": "Calls, tokens and cost per session × model",
			"details.title": "Call details · session × model",
			"details.updated": "Updated",
			"details.auto": "Auto-refreshes with the main window",
			"curve.tokens": "Tokens",
			"curve.cost": "Cost",
			"curve.legendInput": "Input",
			"curve.legendOutput": "Output",
			"curve.legendCacheRead": "Cache read",
			"curve.empty": "No series data (no calls in the window)",
			"col.model": "Model",
			"col.provider": "Provider",
			"col.calls": "Calls",
			"col.input": "Input",
			"col.output": "Output",
			"col.cacheRead": "Cache read",
			"col.cacheWrite": "Cache write",
			"col.tokens": "Tokens",
			"col.cost": "Cost",
			"col.share": "Share",
			"col.day": "Day",
			"col.hour": "Time",
			"col.session": "Session",
			"col.cwd": "Working dir",
			"col.created": "Created",
			"col.time": "Time",
			"col.turn": "Turn/step",
			"col.price": "Rate",
			"col.default": "Default rate",
			"footnote.disclaimer": "Cost is estimated from the configured rates and is not a bill.",
			"footnote.scanned": "{sessions} sessions, {calls} calls scanned",
			"footnote.errors": " ({errors} logs failed to decode)",
		};
		//#endregion

		//#region formatting
		function formatTokens(value) {
			const n = Number(value) || 0;
			if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
			if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
			if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
			return String(n);
		}
		function formatTokensFull(value) {
			return Number(value || 0).toLocaleString("en-US");
		}
		/** Latency in a compact human form: 312ms / 2.4s / 1.2m. */
		function formatMs(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			if (value >= 60000) return `${(value / 60000).toFixed(1)}m`;
			if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
			return `${Math.round(value)}ms`;
		}
		function formatTps(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return `${value.toFixed(1)} tok/s`;
		}
		/** Local calendar day key (YYYY-MM-DD) for one date. */
		function localDayKey(date) {
			const pad = (n) => String(n).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
		}
		function currencySymbol(currency) {
			return currency === "CNY" ? "¥" : "$";
		}
		function formatCost(value, currency) {
			const n = Number(value) || 0;
			const symbol = currencySymbol(currency);
			if (n === 0) return `${symbol}0`;
			if (n >= 100) return `${symbol}${n.toFixed(0)}`;
			if (n >= 1) return `${symbol}${n.toFixed(2)}`;
			return `${symbol}${n.toFixed(4)}`;
		}
		function formatTime(value) {
			if (typeof value !== "number") return "—";
			const date = new Date(value);
			const pad = (n) => String(n).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
		}
		function shortId(id) {
			if (typeof id !== "string") return "—";
			const match = id.match(/session-([0-9a-f]{8})/);
			return match !== null ? match[1] : id.length > 12 ? `${id.slice(0, 12)}…` : id;
		}
		function shortCwd(cwd) {
			if (typeof cwd !== "string" || cwd.length === 0) return "—";
			return cwd.split("/").filter(Boolean).slice(-2).join("/");
		}
		//#endregion

		//#region styles
		const CSS = `
.dsu-widget{position:fixed;right:20px;bottom:20px;z-index:10000;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#24292f);font-family:inherit}
.dsu-widget *{box-sizing:border-box}
.dsu-pill{display:flex;align-items:center;gap:8px;background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:999px;padding:6px 14px;font-size:12px;line-height:18px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.12);transition:box-shadow .15s ease;max-width:280px;white-space:nowrap}
.dsu-pill:hover{box-shadow:0 6px 22px rgba(0,0,0,.18)}
.dsu-pillDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-error-primary,#cf222e);flex:none}
.dsu-pillCost{font-weight:600;font-variant-numeric:tabular-nums}
.dsu-pillTokens{color:var(--dsw-alias-label-secondary,#57606a);font-variant-numeric:tabular-nums}
.dsu-pillHint{color:var(--dsw-alias-label-tertiary,#8c959f)}
.dsu-pop{background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:14px 16px;min-width:300px;max-width:380px;animation:dsuPopIn .12s ease}
@keyframes dsuPopIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.dsu-popTitle{font-size:13px;font-weight:600;line-height:20px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsu-toolbar{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary,#8c959f);font-size:11px;font-weight:400}
.dsu-popGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 16px}
.dsu-popItem{display:flex;flex-direction:column;gap:1px;min-width:0}
.dsu-popLabel{color:var(--dsw-alias-label-secondary,#57606a);font-size:11px;line-height:16px}
.dsu-popValue{font-size:15px;font-weight:600;line-height:22px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-popValue.isCost{color:var(--dsw-alias-state-error-primary,#cf222e)}
.dsu-popHint{color:var(--dsw-alias-label-tertiary,#8c959f);font-size:11px;line-height:16px;margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsu-panel{display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);width:min(480px,calc(100vw - 40px));max-height:min(72vh,720px);overflow:hidden;animation:dsuPopIn .15s ease}
.dsu-panelHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18))}
.dsu-panelTitle{font-size:14px;font-weight:600;line-height:20px;display:flex;align-items:center;gap:8px}
.dsu-panelBody{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 16px;display:flex;flex-direction:column;gap:16px}
.dsu-close{width:26px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#57606a);border-radius:8px;cursor:pointer;font-size:15px;line-height:1;display:grid;place-items:center}
.dsu-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
.dsu-root{display:flex;flex-direction:column;gap:16px;min-width:0;font-size:13px;line-height:20px}
.dsu-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.dsu-card{background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;padding:10px 12px;min-width:0}
.dsu-cardLabel{color:var(--dsw-alias-label-secondary,#57606a);font-size:11px;line-height:16px}
.dsu-cardValue{font-size:18px;font-weight:600;line-height:26px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-cardValue.isCost{color:var(--dsw-alias-state-error-primary,#cf222e)}
.dsu-section{display:flex;flex-direction:column;gap:6px}
.dsu-sectionTitle{font-size:13px;font-weight:600;line-height:20px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsu-button{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));color:var(--dsw-alias-label-primary,#24292f);border-radius:8px;padding:2px 10px;font-size:11px;line-height:18px;cursor:pointer}
.dsu-button:hover{filter:brightness(.96)}
.dsu-button:disabled{opacity:.55;cursor:default}
.dsu-tableWrap{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;overflow:auto;max-height:300px;background:var(--dsw-alias-bg-base,#ffffff)}
.dsu-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px;min-width:460px}
.dsu-table th{position:sticky;top:0;background:var(--dsw-alias-bg-base,#ffffff);color:var(--dsw-alias-label-secondary,#57606a);font-weight:500;text-align:left;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));white-space:nowrap;z-index:1}
.dsu-table td{padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.1));white-space:nowrap}
.dsu-table tr:last-child td{border-bottom:none}
.dsu-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.06))}
.dsu-num{text-align:right;font-variant-numeric:tabular-nums}
.dsu-mono{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px}
.dsu-barTrack{display:inline-block;width:56px;height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));vertical-align:middle;margin-right:6px;overflow:hidden}
.dsu-barTrack .dsu-bar{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-state-error-primary,#cf222e);min-width:2px}
.dsu-foot{color:var(--dsw-alias-label-tertiary,#8c959f);font-size:11px;line-height:16px;display:flex;flex-direction:column;gap:2px}
.dsu-empty{color:var(--dsw-alias-label-tertiary,#8c959f);padding:20px 0;text-align:center;font-size:13px}
.dsu-error{color:var(--dsw-alias-state-error-primary,#cf222e);padding:16px 0;text-align:center;font-size:13px;display:flex;flex-direction:column;gap:8px;align-items:center}
.dsu-pillTag{display:inline-block;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));border-radius:999px;padding:0 7px;font-size:11px;line-height:18px}
.dsu-chart{position:relative;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;padding:10px 12px 6px;background:var(--dsw-alias-bg-base,#ffffff)}
.dsu-chartHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.dsu-chartLegend{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--dsw-alias-label-secondary,#57606a);flex-wrap:wrap}
.dsu-legendDot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle}
.dsu-chartSeg{display:flex;gap:4px}
.dsu-chartSeg button{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));color:var(--dsw-alias-label-secondary,#57606a);border-radius:6px;padding:1px 8px;font-size:11px;line-height:18px;cursor:pointer}
.dsu-chartSeg button.active{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,#24292f);font-weight:600}
.dsu-chart svg{display:block;width:100%;height:auto}
.dsu-chartTooltip{position:absolute;top:36px;pointer-events:none;background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.16);padding:8px 10px;font-size:11px;line-height:17px;white-space:nowrap;transform:translateX(-50%);z-index:2}
.dsu-chartTooltip b{color:var(--dsw-alias-label-primary,#24292f);font-weight:600}
.dsu-ttRow{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary,#57606a)}
.dsu-ttDot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}
.dsu-chartX{position:relative;height:16px;margin-top:2px;color:var(--dsw-alias-label-tertiary,#8c959f);font-size:10px;line-height:16px;font-variant-numeric:tabular-nums}
.dsu-chartTick{position:absolute;top:0;white-space:nowrap}
.dsu-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));padding-bottom:6px;flex:none}
.dsu-filters{display:flex;align-items:center;gap:8px;flex:none}
.dsu-select{background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:8px;color:var(--dsw-alias-label-primary,#24292f);font-size:12px;line-height:20px;padding:2px 8px;max-width:220px}
.dsu-tab{background:transparent;border:none;color:var(--dsw-alias-label-secondary,#57606a);font-size:13px;line-height:20px;padding:4px 12px;border-radius:8px;cursor:pointer}
.dsu-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
.dsu-tab.active{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary,#24292f);font-weight:600}
.dsu-note{color:var(--dsw-alias-label-tertiary,#8c959f);font-size:11px;line-height:16px}
.dsu-anomaly{color:var(--dsw-alias-state-error-primary,#cf222e);margin-right:4px;font-size:9px;vertical-align:middle}
.dsu-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}
.dsu-plan{background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.dsu-planHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsu-planProvider{font-size:12px;font-weight:600;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-planType{font-size:10px;line-height:16px;border-radius:999px;padding:0 8px;white-space:nowrap;flex:none}
.dsu-planType.isToken{background:rgba(79,142,247,.14);color:#2f6fe0}
.dsu-planType.isCode{background:rgba(47,164,78,.14);color:#1a7f37}
.dsu-planType.isAuto{background:rgba(128,128,128,.12);color:var(--dsw-alias-label-secondary,#57606a)}
.dsu-planBadges{display:flex;align-items:center;gap:4px;flex:none}
.dsu-planRow{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#57606a)}
.dsu-planRow b{color:var(--dsw-alias-label-primary,#24292f);font-weight:600;font-variant-numeric:tabular-nums}
.dsu-planBar{height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));overflow:hidden}
.dsu-planBar > span{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-state-error-primary,#cf222e)}
.dsu-planBar > span.isLow{background:var(--dsw-alias-state-warning-primary,#bf8700)}
.dsu-planNote{font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary,#8c959f)}
`;

		function injectStyles() {
			const tagId = "dsh-spend";
			if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return () => { };
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-spend";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => tag.remove();
		}
		//#endregion

		//#region data
		/**
		 * Build the query function for this plugin's fiber: a direct unary RPC to
		 * the host `usageStats/query` endpoint — the same carrier the generated
		 * Remote namespaces use; the host side is discovered by SRC reflection.
		 * @param ctx - client root context (provides `connection`).
		 * @returns a promise resolving to the aggregate snapshot.
		 */
		function buildQuery(ctx) {
			/** @param getCwd - () => string | null — current workspace filter. */
			return (getCwd) => async () => {
				const cwd = typeof getCwd === "function" ? getCwd() : null;
				// The gateway's SRC descriptor exposes the single `request`
				// parameter by its wire name; empty args still work (the
				// parameter accepts undefined), and `{ request: { cwd } }`
				// scopes the snapshot to one working directory.
				const result = await ctx.connection.rpc.call("/api", "usageStats/query", {
					args: { request: { ...(cwd ? { cwd } : {}) } },
				});
				if (result !== null && typeof result === "object" && result.ok === true) return result.value;
				const error = result?.error;
				throw new Error(typeof error?.message === "string" ? error.message : "usageStats/query failed");
			};
		}
		//#endregion

		//#region dashboard pieces
		/** One summary card. */
		function Card({ label, value, cost = false, title }) {
			return react_jsx_runtime.jsx("div", {
				className: "dsu-card",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsu-cardLabel", children: label }),
					react_jsx_runtime.jsx("div", { className: cost ? "dsu-cardValue isCost" : "dsu-cardValue", title, children: value }),
				],
			});
		}

		/** Cost-share bar cell. */
		function ShareCell({ value, max, currency }) {
			const share = max > 0 ? (value / max) * 100 : 0;
			return react_jsx_runtime.jsx("div", {
				children: [
					react_jsx_runtime.jsx("span", { className: "dsu-barTrack", children: react_jsx_runtime.jsx("span", { className: "dsu-bar", style: { width: `${Math.max(2, share)}%` } }) }),
					react_jsx_runtime.jsx("span", { children: formatCost(value, currency) }),
				],
			});
		}

		/** Summary cards row. `billing` carries the real-spend view: subscription
		 * fees for code plans plus estimated cost for token plans. `budget` is
		 * the optional monthly budget (used/remaining); `overview` carries
		 * activity streaks. */
		function SummaryCards({ t, totals, callCount, sessionsScanned, currency, billing, budget, overview }) {
			const total = totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
			const monthly = billing?.total;
			const hasBilling = typeof monthly === "number" && Number.isFinite(monthly);
			const composition = (billing?.parts ?? [])
				.map((part) => part.kind === "subscription" ? `${part.provider} ${formatCost(part.amount, part.currency)}${t("plan.perMonth")}` : `${part.provider} ${formatCost(part.amount, currency)}`)
				.join(" + ");
			const hasBudget = budget !== null && budget !== undefined && typeof budget.pct === "number";
			const activeDays = overview?.activeDays ?? 0;
			const streakDays = overview?.streakDays ?? 0;
			return react_jsx_runtime.jsx("div", {
				className: "dsu-cards",
				children: [
					react_jsx_runtime.jsx(Card, {
						label: hasBilling ? t("billing.total") : t("summary.cost"),
						cost: true,
						value: hasBilling ? `${formatCost(monthly, currency)}${t("plan.perMonth")}` : formatCost(totals.cost, currency),
						title: hasBilling ? `${t("billing.parts")}：${composition}` : `${t("billing.tokenOnly")}：${formatCost(totals.cost, currency)}`,
					}),
					react_jsx_runtime.jsx(Card, {
						label: t("summary.cost"),
						value: formatCost(totals.cost, currency),
						title: t("plan.tokenEstimate"),
					}),
					react_jsx_runtime.jsx(Card, { label: t("summary.tokens"), value: formatTokens(total), title: formatTokensFull(total) }),
					react_jsx_runtime.jsx(Card, { label: t("summary.calls"), value: formatTokensFull(callCount) }),
					react_jsx_runtime.jsx(Card, { label: t("summary.sessions"), value: formatTokensFull(sessionsScanned) }),
					hasBudget
						? react_jsx_runtime.jsx(Card, {
							label: t("budget.title"),
							cost: true,
							value: `${formatCost(budget.monthly, currency)} · ${Math.round(budget.pct)}%`,
							title: `${t("budget.used")} ${formatCost(budget.used, currency)} · ${t("budget.remaining")} ${formatCost(budget.remaining, currency)}${budget.pct >= 100 ? ` · ${t("budget.exceeded")}` : ""}`,
						})
						: null,
					activeDays > 0
						? react_jsx_runtime.jsx(Card, { label: t("summary.activeDays"), value: formatTokensFull(activeDays), title: `${t("summary.streak")}：${formatTokensFull(streakDays)} 天` })
						: null,
					callCount > 0
						? react_jsx_runtime.jsx(Card, { label: t("summary.avgCost"), value: formatCost(totals.cost / callCount, currency) })
						: null,
					typeof totals.cacheHitRate === "number"
						? react_jsx_runtime.jsx(Card, {
							label: t("summary.cacheHit"),
							value: `${(totals.cacheHitRate * 100).toFixed(1)}%`,
							title: `${formatTokensFull(totals.cacheReadTokens)} / ${formatTokensFull(totals.inputTokens + totals.cacheReadTokens)}`,
						})
						: null,
					typeof billing?.projected === "number" && Number.isFinite(billing.projected)
						? react_jsx_runtime.jsx(Card, { label: t("billing.projected"), cost: true, value: `${formatCost(billing.projected, currency)}${t("plan.perMonth")}` })
						: null,
				],
			});
		}

		/** Table section wrapper. */
		function Section({ title, children }) {
			return react_jsx_runtime.jsx("div", {
				className: "dsu-section",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsu-sectionTitle", children: react_jsx_runtime.jsx("span", { children: title }) }),
					react_jsx_runtime.jsx("div", { className: "dsu-tableWrap", children: children }),
				],
			});
		}

		/** Breakdown table for one dimension. */
		function BreakdownTable({ headers, rows, renderRow, rowKey }) {
			return react_jsx_runtime.jsx("table", {
				className: "dsu-table",
				children: [
					react_jsx_runtime.jsx("thead", {
						children: react_jsx_runtime.jsx("tr", { children: headers.map((header, index) => react_jsx_runtime.jsx("th", { className: header.numeric === true ? "dsu-num" : undefined, children: header.label }, index)) }),
					}),
					react_jsx_runtime.jsx("tbody", { children: rows.map((row, index) => react_jsx_runtime.jsx("tr", { children: renderRow(row) }, rowKey !== undefined ? rowKey(row, index) : index)) }),
				],
			});
		}

		/**
		 * Time-curve chart: hourly token/cost series rendered as hand-rolled SVG
		 * (no chart library — the browser module table has no third-party deps).
		 * Token mode draws input/output/cache-read lines; cost mode draws a
		 * filled area. Hover shows the values of the nearest hour.
		 */
		const CHART_W = 640;
		const CHART_H = 180;
		const CHART_PAD = { top: 12, right: 10, bottom: 6, left: 44 };
		const CURVE_COLORS = {
			inputTokens: "#4f8ef7",
			outputTokens: "#2da44e",
			cacheReadTokens: "#bf8700",
			cost: "#cf222e",
		};
		/**
		 * X-axis tick label for one "YYYY-MM-DD HH:00" hour key.
		 * `showDate` forces "MM-DD HH:00" — used on the first tick and
		 * whenever the day changes, so repeated hours across days (e.g. the
		 * 10:00 of 08-14 / 08-15 / 08-16) no longer look like a broken axis.
		 */
		function hourLabel(hour, showDate = false) {
			// Skip the leading full match and the year group:
			// [full, year, month, day, hour]
			const [, , month, day, hh] = hour.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):00$/) ?? [];
			if (hh === undefined) return hour;
			if (hh === "00") return `${month}-${day}`;
			return showDate ? `${month}-${day} ${hh}:00` : `${hh}:00`;
		}
		/**
		 * Pick every-`tickEvery`-th hour as a tick, showing the date on the
		 * first tick of each new day so cross-day hours are distinguishable.
		 */
		function buildTicks(hours, maxTicks = 5) {
			const tickEvery = Math.max(1, Math.ceil(hours.length / maxTicks));
			const ticks = [];
			let lastDate = null;
			hours.forEach((hour, index) => {
				if (index % tickEvery !== 0 && index !== hours.length - 1) return;
				const date = hour.hour.slice(0, 10);
				const showDate = date !== lastDate;
				lastDate = date;
				ticks.push({ index, label: hourLabel(hour.hour, showDate) });
			});
			return ticks;
		}
		function TimeCurveChart({ hours, currency, t }) {
			const [mode, setMode] = react.useState("cost");
			const [range, setRange] = react.useState(24);
			const [hover, setHover] = react.useState(null);
			const svgRef = react.useRef(null);
			if (hours === undefined || hours.length < 2) {
				return react_jsx_runtime.jsx("div", { className: "dsu-chart", children: react_jsx_runtime.jsx("div", { className: "dsu-empty", children: t("curve.empty") }) });
			}
			// Range selector: default 24h, up to 7d (the host serves a 168h
			// series); shorter data (e.g. today's view) shows in full.
			const visible = hours.length <= range ? hours : hours.slice(-range);
			const series = mode === "cost"
				? [{ key: "cost", label: t("curve.cost"), color: CURVE_COLORS.cost }]
				: [
					{ key: "inputTokens", label: t("curve.legendInput"), color: CURVE_COLORS.inputTokens },
					{ key: "outputTokens", label: t("curve.legendOutput"), color: CURVE_COLORS.outputTokens },
					{ key: "cacheReadTokens", label: t("curve.legendCacheRead"), color: CURVE_COLORS.cacheReadTokens },
				];
			const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
			const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
			const maxValue = Math.max(1, ...series.flatMap((s) => visible.map((h) => Number(h[s.key]) || 0)));
			const xAt = (index) => CHART_PAD.left + (visible.length <= 1 ? plotW / 2 : (index / (visible.length - 1)) * plotW);
			const yAt = (value) => CHART_PAD.top + plotH - (Number(value) / maxValue) * plotH;
			const linePath = (s) => visible
				.map((h, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(h[s.key] ?? 0).toFixed(1)}`)
				.join(" ");
			const areaPath = (s) => `${linePath(s)} L${xAt(visible.length - 1).toFixed(1)},${(CHART_PAD.top + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(CHART_PAD.top + plotH).toFixed(1)} Z`;
			const gridLines = [0.25, 0.5, 0.75, 1].map((fraction) => ({
				y: CHART_PAD.top + plotH - fraction * plotH,
				// Y-axis ticks follow the mode: currency in cost mode,
				// token shorthand in tokens mode.
				label: mode === "cost" ? formatCost(maxValue * fraction, currency) : formatTokens(maxValue * fraction),
			}));
			const ticks = buildTicks(visible);

			const onMove = (event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width === 0) return;
				const x = ((event.clientX - rect.left) / rect.width) * CHART_W;
				const index = Math.round(((x - CHART_PAD.left) / plotW) * (visible.length - 1));
				setHover(Math.max(0, Math.min(visible.length - 1, index)));
			};
			const hovered = hover === null ? null : visible[hover];
			const hoverX = hover === null ? 0 : xAt(hover);

			return react_jsx_runtime.jsx("div", {
				className: "dsu-chart",
				children: [
					react_jsx_runtime.jsx("div", {
						className: "dsu-chartHead",
						children: [
							react_jsx_runtime.jsx("div", {
								className: "dsu-chartLegend",
								children: series.map((s) => react_jsx_runtime.jsx("span", { children: [react_jsx_runtime.jsx("span", { className: "dsu-legendDot", style: { background: s.color } }), s.label] }, s.key)),
							}),
							(hours.length > 24
								? react_jsx_runtime.jsx("div", {
									className: "dsu-chartSeg",
									children: [
										react_jsx_runtime.jsx("button", { type: "button", className: range === 24 ? "active" : undefined, onClick: () => setRange(24), children: "24h" }),
										react_jsx_runtime.jsx("button", { type: "button", className: range === 72 ? "active" : undefined, onClick: () => setRange(72), children: "72h" }),
										react_jsx_runtime.jsx("button", { type: "button", className: range === 168 ? "active" : undefined, onClick: () => setRange(168), children: "7d" }),
									],
								})
								: null),
							react_jsx_runtime.jsx("div", {
								className: "dsu-chartSeg",
								children: [
									react_jsx_runtime.jsx("button", { type: "button", className: mode === "tokens" ? "active" : undefined, onClick: () => setMode("tokens"), children: t("curve.tokens") }),
									react_jsx_runtime.jsx("button", { type: "button", className: mode === "cost" ? "active" : undefined, onClick: () => setMode("cost"), children: t("curve.cost") }),
								],
							}),
						],
					}),
					hovered !== null
						? react_jsx_runtime.jsx("div", {
							className: "dsu-chartTooltip",
							style: { left: `${Math.min(88, Math.max(12, (hoverX / CHART_W) * 100))}%` },
							children: [
								react_jsx_runtime.jsx("div", { children: react_jsx_runtime.jsx("b", { children: hovered.hour }) }),
								react_jsx_runtime.jsx("div", { className: "dsu-ttRow", children: [react_jsx_runtime.jsx("span", { className: "dsu-ttDot", style: { background: CURVE_COLORS.cost } }), `${t("curve.cost")}: ${formatCost(hovered.cost ?? 0, currency)}`] }),
								mode === "tokens"
									? [
										react_jsx_runtime.jsx("div", { className: "dsu-ttRow", children: [react_jsx_runtime.jsx("span", { className: "dsu-ttDot", style: { background: CURVE_COLORS.inputTokens } }), `${t("curve.legendInput")}: ${formatTokensFull(hovered.inputTokens ?? 0)}`] }),
										react_jsx_runtime.jsx("div", { className: "dsu-ttRow", children: [react_jsx_runtime.jsx("span", { className: "dsu-ttDot", style: { background: CURVE_COLORS.outputTokens } }), `${t("curve.legendOutput")}: ${formatTokensFull(hovered.outputTokens ?? 0)}`] }),
										react_jsx_runtime.jsx("div", { className: "dsu-ttRow", children: [react_jsx_runtime.jsx("span", { className: "dsu-ttDot", style: { background: CURVE_COLORS.cacheReadTokens } }), `${t("curve.legendCacheRead")}: ${formatTokensFull(hovered.cacheReadTokens ?? 0)}`] }),
									]
									: null,
								react_jsx_runtime.jsx("div", { className: "dsu-ttRow", children: `${t("summary.calls")}: ${hovered.calls ?? 0}` }),
							],
						})
						: null,
					react_jsx_runtime.jsx("svg", {
						ref: svgRef,
						viewBox: `0 0 ${CHART_W} ${CHART_H}`,
						preserveAspectRatio: "none",
						onMouseMove: onMove,
						onMouseLeave: () => setHover(null),
						children: [
							gridLines.map((line) => react_jsx_runtime.jsx("g", {
								children: [
									react_jsx_runtime.jsx("line", { x1: CHART_PAD.left, x2: CHART_W - CHART_PAD.right, y1: line.y, y2: line.y, stroke: "var(--dsw-alias-border-l2,rgba(128,128,128,.14))", strokeWidth: 1 }),
									react_jsx_runtime.jsx("text", { x: CHART_PAD.left - 5, y: line.y + 3, textAnchor: "end", fontSize: 9, fill: "var(--dsw-alias-label-tertiary,#8c959f)", children: line.label }),
								],
							}, `grid-${line.label}`)),
							mode === "cost"
								? react_jsx_runtime.jsx("path", { d: areaPath(series[0]), fill: CURVE_COLORS.cost, opacity: 0.12 })
								: null,
							series.map((s) => react_jsx_runtime.jsx("path", { d: linePath(s), fill: "none", stroke: s.color, strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" }, s.key)),
							hover !== null
								? [
									react_jsx_runtime.jsx("line", { x1: hoverX, x2: hoverX, y1: CHART_PAD.top, y2: CHART_PAD.top + plotH, stroke: "var(--dsw-alias-label-tertiary,#8c959f)", strokeWidth: 1, strokeDasharray: "3 3" }),
									series.map((s) => react_jsx_runtime.jsx("circle", { cx: hoverX, cy: yAt(visible[hover][s.key] ?? 0), r: 3, fill: s.color, stroke: "var(--dsw-alias-bg-base,#ffffff)", strokeWidth: 1.5 }, `dot-${s.key}`)),
								]
								: null,
						],
					}),
					react_jsx_runtime.jsx("div", {
						className: "dsu-chartX",
						children: ticks.map((tick) => {
							const pct = (xAt(tick.index) / CHART_W) * 100;
							const transform = tick.index === 0 ? "none" : tick.index === visible.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
							return react_jsx_runtime.jsx("span", { className: "dsu-chartTick", style: { left: `${pct}%`, transform }, children: tick.label }, tick.index);
						}),
					}),
				],
			});
		}

		/**
		 * Performance time-series: average TTFT or tokens/s per hour, drawn as
		 * segments (null buckets break the line instead of dipping to zero).
		 */
		function PerfChart({ hours, t }) {
			const [mode, setMode] = react.useState("ttft");
			const [hover, setHover] = react.useState(null);
			const rows = hours ?? [];
			const key = mode === "ttft" ? "ttftAvgMs" : "tpsAvg";
			const valueOf = (row) => row[key];
			const active = rows.filter((row) => typeof valueOf(row) === "number" && (row.samples ?? 0) > 0);
			if (active.length < 2) {
				return react_jsx_runtime.jsx("div", { className: "dsu-chart", children: react_jsx_runtime.jsx("div", { className: "dsu-empty", children: t("perf.empty") }) });
			}
			const maxValue = Math.max(1, ...active.map(valueOf));
			const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
			const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
			const xAt = (index) => CHART_PAD.left + (rows.length <= 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
			const yAt = (value) => CHART_PAD.top + plotH - (Number(value) / maxValue) * plotH;
			const color = mode === "ttft" ? "#8250df" : "#2da44e";
			// Split into contiguous non-null segments.
			const segments = [];
			let current = [];
			for (const row of rows) {
				if (typeof valueOf(row) === "number") current.push(row);
				else if (current.length > 0) {
					segments.push(current);
					current = [];
				}
			}
			if (current.length > 0) segments.push(current);
			const pathOf = (segment) => segment
				.map((row, i) => `${i === 0 ? "M" : "L"}${xAt(rows.indexOf(row)).toFixed(1)},${yAt(valueOf(row)).toFixed(1)}`)
				.join(" ");
			const gridLines = [0.25, 0.5, 0.75, 1].map((fraction) => ({
				y: CHART_PAD.top + plotH - fraction * plotH,
				label: mode === "ttft" ? formatMs(maxValue * fraction) : `${(maxValue * fraction).toFixed(0)}`,
			}));
			const ticks = buildTicks(rows);
			const onMove = (event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width === 0) return;
				const x = ((event.clientX - rect.left) / rect.width) * CHART_W;
				const index = Math.round(((x - CHART_PAD.left) / plotW) * (rows.length - 1));
				setHover(Math.max(0, Math.min(rows.length - 1, index)));
			};
			const hovered = hover === null ? null : rows[hover];
			const hoverValue = hovered === null ? null : valueOf(hovered);
			const hoverX = hover === null ? 0 : xAt(hover);
			const tooltipText = hovered === null || hoverValue === null
				? ""
				: `${hovered.hour} · ${mode === "ttft" ? formatMs(hoverValue) : formatTps(hoverValue)} · ${t("perf.samples")} ${hovered.samples}`;

			return react_jsx_runtime.jsx("div", {
				className: "dsu-chart",
				children: [
					react_jsx_runtime.jsx("div", {
						className: "dsu-chartHead",
						children: [
							react_jsx_runtime.jsx("div", { className: "dsu-chartLegend", children: [react_jsx_runtime.jsx("span", { children: [react_jsx_runtime.jsx("span", { className: "dsu-legendDot", style: { background: color } }), t("perf.title")] }, "perf")] }),
							react_jsx_runtime.jsx("div", {
								className: "dsu-chartSeg",
								children: [
									react_jsx_runtime.jsx("button", { type: "button", className: mode === "ttft" ? "active" : undefined, onClick: () => setMode("ttft"), children: t("perf.modeTtft") }),
									react_jsx_runtime.jsx("button", { type: "button", className: mode === "tps" ? "active" : undefined, onClick: () => setMode("tps"), children: t("perf.modeTps") }),
								],
							}),
						],
					}),
					react_jsx_runtime.jsx("div", {
						style: { position: "relative" },
						children: [
							tooltipText !== ""
								? react_jsx_runtime.jsx("div", { className: "dsu-chartTooltip", style: { left: `${(hoverX / CHART_W) * 100}%` }, children: tooltipText })
								: null,
							react_jsx_runtime.jsx("svg", {
								ref: null,
								viewBox: `0 0 ${CHART_W} ${CHART_H}`,
								onMouseMove: onMove,
								onMouseLeave: () => setHover(null),
								children: [
									gridLines.map((line) => react_jsx_runtime.jsx("g", {
										children: [
											react_jsx_runtime.jsx("line", { x1: CHART_PAD.left, x2: CHART_W - CHART_PAD.right, y1: line.y, y2: line.y, stroke: "var(--dsw-alias-border-l2,rgba(128,128,128,.14))", strokeWidth: 1 }),
											react_jsx_runtime.jsx("text", { x: CHART_PAD.left - 5, y: line.y + 3, textAnchor: "end", fontSize: 9, fill: "var(--dsw-alias-label-tertiary,#8c959f)", children: line.label }),
										],
									}, `grid-${line.label}`)),
									segments.map((segment, index) => react_jsx_runtime.jsx("path", { d: pathOf(segment), fill: "none", stroke: color, strokeWidth: 1.8, strokeLinejoin: "round", strokeLinecap: "round" }, `seg-${index}`)),
									hovered !== null && hoverValue !== null
										? react_jsx_runtime.jsx("circle", { cx: hoverX, cy: yAt(hoverValue), r: 3.5, fill: color, stroke: "var(--dsw-alias-bg-base,#ffffff)", strokeWidth: 1.5 })
										: null,
								],
							}),
						],
					}),
					react_jsx_runtime.jsx("div", {
						className: "dsu-chartX",
						children: ticks.map((tick) => {
							const pct = (xAt(tick.index) / CHART_W) * 100;
							const transform = tick.index === 0 ? "none" : tick.index === rows.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
							return react_jsx_runtime.jsx("span", { className: "dsu-chartTick", style: { left: `${pct}%`, transform }, children: tick.label }, tick.index);
						}),
					}),
				],
			});
		}

		/** Per-model latency/TTFT/tps summary table. */
		function PerfSection({ t, data }) {
			const rows = data.perfByModel ?? [];
			if (rows.length === 0) {
				return react_jsx_runtime.jsx("div", { className: "dsu-section", children: react_jsx_runtime.jsx("div", { className: "dsu-empty", children: t("perf.empty") }) });
			}
			return react_jsx_runtime.jsx("div", {
				className: "dsu-root",
				children: [
					react_jsx_runtime.jsx(Section, {
						title: t("perf.title"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.model") },
								{ label: t("perf.samples"), numeric: true },
								{ label: t("perf.ttftAvg"), numeric: true },
								{ label: t("perf.ttftP50"), numeric: true },
								{ label: t("perf.ttftP90"), numeric: true },
								{ label: t("perf.tps"), numeric: true },
								{ label: t("perf.latencyAvg"), numeric: true },
							],
							rows,
							rowKey: (row) => `${row.model}-${row.provider ?? "?"}`,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", {
									children: [row.model, row.provider !== null && row.provider !== undefined ? react_jsx_runtime.jsx("span", { className: "dsu-pillTag", children: row.provider }) : null],
								}),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.samples) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: `${Math.round(row.ttftAvgMs)} ms`, children: formatMs(row.ttftAvgMs) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: `${Math.round(row.ttftP50Ms)} ms`, children: formatMs(row.ttftP50Ms) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: `${Math.round(row.ttftP90Ms)} ms`, children: formatMs(row.ttftP90Ms) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: `${row.tpsAvg.toFixed(2)} tokens/s`, children: formatTps(row.tpsAvg) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: `${Math.round(row.latencyAvgMs)} ms`, children: formatMs(row.latencyAvgMs) }),
							],
						}),
					}),
					react_jsx_runtime.jsx("div", { className: "dsu-section", children: [react_jsx_runtime.jsx("div", { className: "dsu-note", children: t("perf.note") }), react_jsx_runtime.jsx(PerfChart, { hours: data.perfByHour ?? [], t })] }),
				],
			});
		}

		/** Today's slice: summary cards + the hourly chart filtered to the local day. */
		function TodaySection({ t, data, currency }) {
			const todayKey = localDayKey(new Date());
			const todayRow = (data.byDay ?? []).find((row) => row.day === todayKey);
			const todayHours = (data.byHour ?? []).filter((row) => row.hour.startsWith(todayKey));
			if (todayRow === undefined) {
				return react_jsx_runtime.jsx("div", { className: "dsu-section", children: [react_jsx_runtime.jsx("div", { className: "dsu-sectionTitle", children: react_jsx_runtime.jsx("span", { children: t("today.title") }) }), react_jsx_runtime.jsx("div", { className: "dsu-empty", children: t("today.empty") })] });
			}
			const tokens = todayRow.inputTokens + todayRow.outputTokens + todayRow.cacheReadTokens + todayRow.cacheWriteTokens;
			return react_jsx_runtime.jsx("div", {
				className: "dsu-root",
				children: [
					react_jsx_runtime.jsx("div", {
						className: "dsu-cards",
						children: [
							react_jsx_runtime.jsx(Card, { label: t("today.calls"), value: formatTokensFull(todayRow.calls) }),
							react_jsx_runtime.jsx(Card, { label: t("today.tokens"), value: formatTokens(tokens), title: formatTokensFull(tokens) }),
							react_jsx_runtime.jsx(Card, { label: t("today.cost"), cost: true, value: formatCost(todayRow.cost, currency) }),
						],
					}),
					react_jsx_runtime.jsx("div", {
						className: "dsu-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "dsu-sectionTitle", children: react_jsx_runtime.jsx("span", { children: t("today.title") }) }),
							react_jsx_runtime.jsx(TimeCurveChart, { hours: todayHours, currency, t }),
						],
					}),
				],
			});
		}

		/**
		 * GitHub-style activity heatmap: one cell per day over the last 52
		 * weeks, colored by token volume (log buckets), month labels on top.
		 * Built from the all-time byDay rows the host already serves.
		 */
		const HEAT_CELL = 10;
		const HEAT_GAP = 2;
		const HEAT_TOP = 14;
		/** Room for the weekday labels on the left of the grid. */
		const HEAT_LEFT = 22;
		const HEAT_COLORS = ["rgba(79,142,247,.08)", "rgba(79,142,247,.25)", "rgba(79,142,247,.5)", "rgba(79,142,247,.8)", "#2f6fe0"];
		function Heatmap({ days, t, currency }) {
			const [hover, setHover] = react.useState(null);
			const byKey = new Map((days ?? []).map((row) => [row.day, row]));
			const today = new Date();
			const start = new Date(today);
			start.setDate(start.getDate() - (52 * 7 - 1));
			start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // align to Monday
			const cells = [];
			for (let i = 0; i < 52 * 7; i++) {
				const date = new Date(start);
				date.setDate(start.getDate() + i);
				const key = localDayKey(date);
				const row = byKey.get(key);
				cells.push({
					key,
					tokens: row === undefined ? 0 : row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens,
					cost: row?.cost ?? 0,
					calls: row?.calls ?? 0,
				});
			}
			const hasData = cells.some((cell) => cell.tokens > 0);
			if (!hasData) {
				return react_jsx_runtime.jsx("div", { className: "dsu-chart", children: react_jsx_runtime.jsx("div", { className: "dsu-empty", children: t("heatmap.empty") }) });
			}
			const maxTokens = Math.max(1, ...cells.map((cell) => cell.tokens));
			const levelOf = (tokens) => {
				if (tokens <= 0) return 0;
				if (tokens >= maxTokens / 2) return 4;
				if (tokens >= maxTokens / 8) return 3;
				if (tokens >= maxTokens / 32) return 2;
				return 1;
			};
			const step = HEAT_CELL + HEAT_GAP;
			const width = HEAT_LEFT + 52 * step;
			const height = HEAT_TOP + 7 * step;
			const monthTicks = [];
			let lastMonth = -1;
			let lastYear = -1;
			cells.forEach((cell, index) => {
				if (index % 7 !== 0) return;
				const year = Number(cell.key.slice(0, 4));
				const month = Number(cell.key.slice(5, 7));
				if (month !== lastMonth || year !== lastYear) {
					// A 52-week window can span two calendar years; when the
					// year changes the tick shows "YYYY-MM" so month labels
					// (e.g. a repeated "12月") stay unambiguous.
					const yearChanged = year !== lastYear && lastYear !== -1;
					lastMonth = month;
					lastYear = year;
					monthTicks.push({
						x: HEAT_LEFT + (index / 7) * step + 3,
						label: yearChanged ? `${year}-${String(month).padStart(2, "0")}` : t("heatmap.month", { m: String(month) }),
					});
				}
			});
			const weekdayLabels = [
				{ row: 0, label: t("heatmap.mon") },
				{ row: 2, label: t("heatmap.wed") },
				{ row: 4, label: t("heatmap.fri") },
			];
			const hovered = hover === null ? null : cells[hover];
			const tooltip = hovered === null || hovered.tokens <= 0
				? ""
				: `${hovered.key} · ${formatTokens(hovered.tokens)} tokens · ${formatCost(hovered.cost, currency)} · ${formatTokensFull(hovered.calls)} calls`;
			const onMove = (event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width === 0) return;
				const x = ((event.clientX - rect.left) / rect.width) * width;
				const y = ((event.clientY - rect.top) / rect.height) * height;
				const col = Math.floor((x - HEAT_LEFT) / step);
				const row = Math.floor((y - HEAT_TOP) / step);
				if (col >= 0 && col < 52 && row >= 0 && row < 7) setHover(row + col * 7);
			};
			return react_jsx_runtime.jsx("div", {
				className: "dsu-chart",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsu-chartHead", children: react_jsx_runtime.jsx("div", { className: "dsu-chartLegend", children: t("heatmap.title") }) }),
					react_jsx_runtime.jsx("div", {
						style: { position: "relative" },
						children: [
							tooltip !== ""
								? react_jsx_runtime.jsx("div", { className: "dsu-chartTooltip", style: { left: "50%", top: "40px" }, children: tooltip })
								: null,
							react_jsx_runtime.jsx("svg", {
								viewBox: `0 0 ${width} ${height}`,
								style: { display: "block", width: "100%", height: "auto" },
								onMouseMove: onMove,
								onMouseLeave: () => setHover(null),
								children: [
									monthTicks.map((tick) => react_jsx_runtime.jsx("text", { x: tick.x, y: 10, fontSize: 8, fill: "var(--dsw-alias-label-tertiary,#8c959f)", children: tick.label }, `m-${tick.label}`)),
									weekdayLabels.map((label) => react_jsx_runtime.jsx("text", { x: HEAT_LEFT - 6, y: HEAT_TOP + label.row * step + step / 2 + 3, textAnchor: "end", fontSize: 8, fill: "var(--dsw-alias-label-tertiary,#8c959f)", children: label.label }, `w-${label.row}`)),
									cells.map((cell, index) => {
										const col = Math.floor(index / 7);
										const row = index % 7;
										return react_jsx_runtime.jsx("rect", { x: HEAT_LEFT + col * step, y: HEAT_TOP + row * step, width: HEAT_CELL, height: HEAT_CELL, rx: 2, fill: HEAT_COLORS[levelOf(cell.tokens)] }, cell.key);
									}),
								],
							}),
						],
					}),
					react_jsx_runtime.jsx("div", {
						className: "dsu-chartLegend",
						style: { marginTop: 4, alignItems: "center" },
						children: [
							react_jsx_runtime.jsx("span", { children: t("heatmap.less") }),
							HEAT_COLORS.map((color) => react_jsx_runtime.jsx("span", { style: { width: 9, height: 9, borderRadius: 2, background: color, display: "inline-block" } }, color)),
							react_jsx_runtime.jsx("span", { children: t("heatmap.more") }),
						],
					}),
				],
			});
		}

		/** Escape helper for the standalone details window markup. */
		function escapeHtml(value) {
			return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
		}

		/**
		 * (Re)write the standalone call-details window: a session × model table
		 * rendered with plain DOM (no React inside a second browsing context),
		 * plus CSV / JSON export buttons fed from embedded textarea payloads.
		 */
		function renderDetailsWindow(win, data, currency, t, lastUpdated) {
			const rows = data.bySessionModel ?? [];
			const body = rows.map((row) => {
				const tokens = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
				return `<tr><td class="mono" title="${escapeHtml(row.sessionId)}">${escapeHtml(shortId(row.sessionId))}</td><td title="${escapeHtml(row.cwd)}">${escapeHtml(shortCwd(row.cwd))}</td><td>${escapeHtml(row.model)}</td><td>${escapeHtml(row.provider ?? "—")}</td><td class="num">${formatTokensFull(row.calls)}</td><td class="num">${formatTokens(row.inputTokens)}</td><td class="num">${formatTokens(row.outputTokens)}</td><td class="num">${formatTokens(row.cacheReadTokens)}</td><td class="num">${formatTokens(tokens)}</td><td class="num cost">${escapeHtml(formatCost(row.cost, currency))}</td></tr>`;
			}).join("");
			const csv = [
				"session,cwd,model,provider,calls,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,totalTokens,cost",
				...rows.map((row) => {
					const tokens = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
					return [row.sessionId, `"${String(row.cwd ?? "").replace(/"/g, "\"\"")}"`, row.model, row.provider ?? "", row.calls, row.inputTokens, row.outputTokens, row.cacheReadTokens, row.cacheWriteTokens, tokens, (Number(row.cost) || 0).toFixed(6)].join(",");
				}),
			].join("\n");
			const recent = data.recent ?? [];
			const recentCsv = [
				"time,model,provider,session,cwd,turn,step,inputTokens,outputTokens,cacheReadTokens,cost",
				...recent.map((row) => [
					formatTime(row.time),
					`"${String(row.model ?? "").replace(/"/g, "\"\"")}"`,
					row.provider ?? "",
					row.sessionId,
					`"${String(row.cwd ?? "").replace(/"/g, "\"\"")}"`,
					row.turn,
					row.step,
					row.inputTokens,
					row.outputTokens,
					row.cacheReadTokens,
					(Number(row.cost) || 0).toFixed(6),
				].join(",")),
			].join("\n");
			const title = t("details.title");
			const updated = lastUpdated === null ? "—" : formatTime(lastUpdated);
			const json = JSON.stringify({ currency, exportedAt: updated, rows }, null, 2);
			win.document.open();
			win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:13px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#24292f;background:#f6f8fa;margin:0;padding:24px}
h1{font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:8px}
h1 i{width:8px;height:8px;border-radius:50%;background:#cf222e;display:inline-block}
.meta{color:#8c959f;font-size:12px;margin-bottom:12px}
.btn{display:inline-block;background:#f6f8fa;border:1px solid rgba(128,128,128,.3);border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer;margin-bottom:12px}
.btn:hover{background:#eaeef2}
.wrap{background:#ffffff;border:1px solid rgba(128,128,128,.22);border-radius:12px;overflow:auto}
table{width:100%;border-collapse:collapse;min-width:960px}
th{position:sticky;top:0;background:#fff;color:#57606a;font-weight:500;text-align:left;padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.18);white-space:nowrap}
td{padding:7px 12px;border-bottom:1px solid rgba(128,128,128,.1);white-space:nowrap}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(128,128,128,.06)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.cost{color:#cf222e;font-weight:600}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
</style></head><body><h1><i></i>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(t("footnote.disclaimer"))} · ${escapeHtml(t("details.updated"))} ${escapeHtml(updated)} · ${escapeHtml(t("details.auto"))}</div><textarea id="dsu-csv" style="display:none">${escapeHtml(csv)}</textarea><textarea id="dsu-json" style="display:none">${escapeHtml(json)}</textarea><textarea id="dsu-rcsv" style="display:none">${escapeHtml(recentCsv)}</textarea><button type="button" class="btn" onclick="(function(){var t=document.getElementById('dsu-csv').value;var b=new Blob([t],{type:'text/csv;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='dsh-spend-details.csv';document.body.appendChild(a);a.click();a.remove();})()">${escapeHtml(t("details.exportCsv"))}</button><button type="button" class="btn" onclick="(function(){var t=document.getElementById('dsu-json').value;var b=new Blob([t],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='dsh-spend-details.json';document.body.appendChild(a);a.click();a.remove();})()">${escapeHtml(t("details.exportJson"))}</button><button type="button" class="btn" onclick="(function(){var t=document.getElementById('dsu-rcsv').value;var b=new Blob([t],{type:'text/csv;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='dsh-spend-recent.csv';document.body.appendChild(a);a.click();a.remove();})()">${escapeHtml(t("details.exportCalls"))}</button><div class="wrap"><table><thead><tr><th>${escapeHtml(t("col.session"))}</th><th>${escapeHtml(t("col.cwd"))}</th><th>${escapeHtml(t("col.model"))}</th><th>${escapeHtml(t("col.provider"))}</th><th class="num">${escapeHtml(t("col.calls"))}</th><th class="num">${escapeHtml(t("col.input"))}</th><th class="num">${escapeHtml(t("col.output"))}</th><th class="num">${escapeHtml(t("col.cacheRead"))}</th><th class="num">${escapeHtml(t("col.tokens"))}</th><th class="num">${escapeHtml(t("col.cost"))}</th></tr></thead><tbody>${body}</tbody></table></div></body></html>`);
			win.document.close();
		}

		/** Plan usage cards: token plans (used cost / balance) and code plans (period quota usage / remaining). */
		function PlansSection({ t, plans, currency }) {
			if (plans === undefined || plans.length === 0) return null;
			return react_jsx_runtime.jsx("div", {
				className: "dsu-section",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsu-sectionTitle", children: react_jsx_runtime.jsx("span", { children: t("section.plans") }) }),
					react_jsx_runtime.jsx("div", {
						className: "dsu-plans",
						children: plans.map((plan) => {
							const displayName = plan.label ?? plan.provider;
							const autoBadge = plan.auto === true
								? react_jsx_runtime.jsx("span", { className: "dsu-planType isAuto", title: t("plan.auto"), children: t("plan.auto") })
								: null;
							if (plan.type === "code") {
								const requestRow = plan.quotaRequests !== null && plan.quotaRequests !== undefined;
								const tokenRow = plan.quotaTokens !== null && plan.quotaTokens !== undefined;
								const pct = plan.usedPct ?? 0;
								const subscription = plan.subscription !== null && plan.subscription !== undefined
									? `${formatCost(plan.subscription.amount, plan.subscription.currency ?? currency)}${t("plan.perMonth")}`
									: null;
								const hasQuota = requestRow || tokenRow;
								const tiers = plan.tiers ?? null;
								const defaultTier = tiers?.find((tier) => tier.default === true) ?? tiers?.[0] ?? null;
								const otherTiers = tiers?.filter((tier) => tier !== defaultTier) ?? [];
								return react_jsx_runtime.jsx("div", {
									className: "dsu-plan",
									children: [
										react_jsx_runtime.jsx("div", {
											className: "dsu-planHead",
											children: [
												react_jsx_runtime.jsx("span", { className: "dsu-planProvider", title: plan.provider, children: displayName }),
												react_jsx_runtime.jsx("div", { className: "dsu-planBadges", children: [autoBadge, react_jsx_runtime.jsx("span", { className: "dsu-planType isCode", children: t("plan.code") })] }),
											],
										}),
										subscription !== null
											? react_jsx_runtime.jsx("div", {
												className: "dsu-planRow",
												children: [
													react_jsx_runtime.jsx("span", { children: t("plan.subscription") }),
													react_jsx_runtime.jsx("b", { children: subscription }),
												],
											})
											: null,
										plan.dollarsPerMonth !== null && plan.dollarsPerMonth !== undefined
											? react_jsx_runtime.jsx("div", {
												className: "dsu-planRow",
												children: [
													react_jsx_runtime.jsx("span", { children: t("plan.quota") }),
													react_jsx_runtime.jsx("b", { children: `${t("plan.used")} ${formatCost(plan.dollarsPerMonth, currency)}${t("plan.perMonth")}` }),
												],
											})
											: null,
										tiers !== null && tiers.length > 0
											? react_jsx_runtime.jsx("div", {
												className: "dsu-planNote",
												children: [
													`${t("plan.tiers")}：`,
													react_jsx_runtime.jsx("span", { className: "dsu-planType isCode", children: defaultTier?.name ?? "" }),
													otherTiers.map((tier) => react_jsx_runtime.jsx("span", { className: "dsu-pillTag", children: tier.name }, tier.name)),
												],
											})
											: null,
										requestRow
											? react_jsx_runtime.jsx("div", {
												className: "dsu-planRow",
												children: [
													react_jsx_runtime.jsx("span", { children: `${t("plan.used")}（${t("plan.period", { days: String(plan.periodDays) })}）` }),
													react_jsx_runtime.jsx("b", { children: `${formatTokensFull(plan.usedRequests)} / ${formatTokensFull(plan.quotaRequests)} ${t("plan.requests")}` }),
												],
											})
											: null,
										tokenRow
											? react_jsx_runtime.jsx("div", {
												className: "dsu-planRow",
												children: [
													react_jsx_runtime.jsx("span", { children: t("plan.tokens") }),
													react_jsx_runtime.jsx("b", { children: `${formatTokens(plan.usedTokens)} / ${formatTokens(plan.quotaTokens)}` }),
												],
											})
											: null,
										hasQuota
											? react_jsx_runtime.jsx("div", { className: "dsu-planBar", children: react_jsx_runtime.jsx("span", { className: pct >= 80 ? "isLow" : undefined, style: { width: `${Math.max(1, pct)}%` } }) })
											: null,
										hasQuota
											? react_jsx_runtime.jsx("div", {
												className: "dsu-planRow",
												children: [
													react_jsx_runtime.jsx("span", { children: `${t("plan.used")} ${Math.round(pct)}%` }),
													plan.remainingRequests !== null
														? react_jsx_runtime.jsx("b", { children: `${t("plan.remaining")}：${formatTokensFull(plan.remainingRequests)} ${t("plan.requests")}` })
														: plan.remainingTokens !== null
															? react_jsx_runtime.jsx("b", { children: `${t("plan.remaining")}：${formatTokens(plan.remainingTokens)}` })
															: null,
												],
											})
											: null,
										react_jsx_runtime.jsx("div", { className: "dsu-planNote", children: `${t("plan.tokenEstimate")}：${formatCost(plan.usedCost ?? 0, currency)}` }),
									],
								}, `plan-code-${plan.provider}`);
							}
							const pct = plan.usedPct ?? 0;
							return react_jsx_runtime.jsx("div", {
								className: "dsu-plan",
								children: [
									react_jsx_runtime.jsx("div", {
										className: "dsu-planHead",
										children: [
											react_jsx_runtime.jsx("span", { className: "dsu-planProvider", title: plan.provider, children: displayName }),
											react_jsx_runtime.jsx("div", { className: "dsu-planBadges", children: [autoBadge, react_jsx_runtime.jsx("span", { className: "dsu-planType isToken", children: t("plan.token") })] }),
										],
									}),
									react_jsx_runtime.jsx("div", {
										className: "dsu-planRow",
										children: [
											react_jsx_runtime.jsx("span", { children: t("plan.usedCost") }),
											react_jsx_runtime.jsx("b", { children: formatCost(plan.usedCost ?? 0, currency) }),
										],
									}),
									plan.balance !== null && plan.balance !== undefined
										? [
											react_jsx_runtime.jsx("div", { className: "dsu-planBar", children: react_jsx_runtime.jsx("span", { className: pct >= 80 ? "isLow" : undefined, style: { width: `${Math.max(1, pct)}%` } }) }),
											react_jsx_runtime.jsx("div", {
												className: "dsu-planRow",
												children: [
													react_jsx_runtime.jsx("span", { children: `${t("plan.balance")}：${formatCost(plan.balance, currency)} · ${t("plan.used")} ${Math.round(pct)}%` }),
													react_jsx_runtime.jsx("b", { children: `${t("plan.remaining")}：${formatCost(plan.remaining ?? 0, currency)}` }),
												],
											}),
										]
										: react_jsx_runtime.jsx("div", { className: "dsu-planNote", children: t("plan.noBalance") }),
								],
							}, `plan-token-${plan.provider}`);
						}),
					}),
				],
			});
		}

		/** The full dashboard body (used by the expanded panel). */
		function Dashboard({ t, data, error, lastUpdated, onRefresh, onOpenDetails, cwd, onCwdChange }) {
			const currency = data?.currency ?? "USD";
			const totals = data?.totals;
			const maxProviderCost = data?.byProvider?.reduce((max, row) => Math.max(max, row.cost ?? 0), 0) ?? 0;
			const maxModelCost = data?.byModel?.reduce((max, row) => Math.max(max, row.cost ?? 0), 0) ?? 0;
			const maxDayCost = data?.byDay?.reduce((max, row) => Math.max(max, row.cost ?? 0), 0) ?? 0;
			const maxSessionCost = data?.bySession?.reduce((max, row) => Math.max(max, row.cost ?? 0), 0) ?? 0;
			const [tab, setTab] = react.useState("overview");

			if (error !== null) {
				return react_jsx_runtime.jsx("div", {
					className: "dsu-error",
					children: [
						react_jsx_runtime.jsx("div", { children: `${t("state.error")}：${error}` }),
						react_jsx_runtime.jsx("button", { type: "button", className: "dsu-button", onClick: onRefresh, children: t("state.retry") }),
					],
				});
			}
			if (data === null || totals === undefined || data.callCount === 0) {
				return react_jsx_runtime.jsx("div", { className: "dsu-empty", children: data === null ? t("state.loading") : t("state.empty") });
			}

			const tabs = [
				{ id: "overview", label: t("tab.overview") },
				{ id: "today", label: t("tab.today") },
				{ id: "perf", label: t("tab.perf") },
				{ id: "details", label: t("tab.details") },
			];
			const overview = react_jsx_runtime.jsx(react_jsx_runtime.Fragment, {
				children: [
					react_jsx_runtime.jsx(SummaryCards, { t, totals, callCount: data.callCount, sessionsScanned: data.sessionsScanned, currency, billing: data.billing, budget: data.budget, overview: data.overview }),
					react_jsx_runtime.jsx(PlansSection, { t, plans: data.plans ?? [], currency }),
					react_jsx_runtime.jsx("div", {
						className: "dsu-section",
						children: [
							react_jsx_runtime.jsx("div", { className: "dsu-sectionTitle", children: react_jsx_runtime.jsx("span", { children: t("section.series") }) }),
							react_jsx_runtime.jsx(TimeCurveChart, { hours: data.byHour ?? [], currency, t }),
						],
					}),
					react_jsx_runtime.jsx(Heatmap, { days: data.byDay ?? [], t, currency }),
					react_jsx_runtime.jsx(Section, {
						title: t("section.byProvider"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.provider") },
								{ label: t("col.calls"), numeric: true },
								{ label: t("col.input"), numeric: true },
								{ label: t("col.output"), numeric: true },
								{ label: t("col.cacheRead"), numeric: true },
								{ label: t("col.share") },
							],
							rows: (data.byProvider ?? []).slice(0, 6),
							rowKey: (row) => row.provider,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", { children: row.provider }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.calls) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.inputTokens), children: formatTokens(row.inputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.outputTokens), children: formatTokens(row.outputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.cacheReadTokens), children: formatTokens(row.cacheReadTokens) }),
								react_jsx_runtime.jsx("td", { children: react_jsx_runtime.jsx(ShareCell, { value: row.cost ?? 0, max: maxProviderCost, currency }) }),
							],
						}),
					}),
					react_jsx_runtime.jsx(Section, {
						title: t("section.byModel"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.model") },
								{ label: t("col.calls"), numeric: true },
								{ label: t("col.input"), numeric: true },
								{ label: t("col.output"), numeric: true },
								{ label: t("col.cacheRead"), numeric: true },
								{ label: t("col.cacheWrite"), numeric: true },
								{ label: t("col.share") },
							],
							rows: (data.byModel ?? []).slice(0, 6),
							rowKey: (row) => `${row.model}-${row.provider ?? "?"}`,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", {
									children: [row.model, row.provider !== null && row.provider !== undefined ? react_jsx_runtime.jsx("span", { className: "dsu-pillTag", children: row.provider }) : null],
								}),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.calls) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.inputTokens), children: formatTokens(row.inputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.outputTokens), children: formatTokens(row.outputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.cacheReadTokens), children: formatTokens(row.cacheReadTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.cacheWriteTokens), children: formatTokens(row.cacheWriteTokens) }),
								react_jsx_runtime.jsx("td", { children: react_jsx_runtime.jsx(ShareCell, { value: row.cost ?? 0, max: maxModelCost, currency }) }),
							],
						}),
					}),
					react_jsx_runtime.jsx(Section, {
						title: t("section.byDay"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.day") },
								{ label: t("col.calls"), numeric: true },
								{ label: t("col.tokens"), numeric: true },
								{ label: t("col.share") },
							],
							rows: (data.byDay ?? []).slice(-31),
							rowKey: (row) => row.day,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", { className: "dsu-mono", children: row.day }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.calls) }),
								react_jsx_runtime.jsx("td", {
									className: "dsu-num",
									title: formatTokensFull(row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens),
									children: formatTokens(row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens),
								}),
								react_jsx_runtime.jsx("td", { children: react_jsx_runtime.jsx(ShareCell, { value: row.cost ?? 0, max: maxDayCost, currency }) }),
							],
						}),
					}),
					react_jsx_runtime.jsx("div", {
						className: "dsu-foot",
						children: [
							react_jsx_runtime.jsx("span", { children: t("footnote.scanned", { sessions: String(data.sessionsScanned), calls: String(data.callCount) }) }),
							(data.decodeErrors ?? 0) > 0 ? react_jsx_runtime.jsx("span", { children: t("footnote.errors", { errors: String(data.decodeErrors) }) }) : null,
							react_jsx_runtime.jsx("span", { children: t("footnote.disclaimer") }),
							lastUpdated !== null ? react_jsx_runtime.jsx("span", { children: `${t("lastUpdated")} ${formatTime(lastUpdated)}` }) : null,
						],
					}),
				],
			});

			// Cost anomaly marker: a recent call costing ≥ 8× the mean recent
			// cost gets a red dot in the table (tokmon-style overspend flag).
			const recentRowsForAnomaly = data.recent ?? [];
			const meanRecentCost = recentRowsForAnomaly.length > 0
				? recentRowsForAnomaly.reduce((sum, row) => sum + (row.cost ?? 0), 0) / recentRowsForAnomaly.length
				: 0;
			const anomalyThreshold = meanRecentCost > 0 ? meanRecentCost * 8 : Infinity;

			const details = react_jsx_runtime.jsx("div", {
				className: "dsu-root",
				children: [
					react_jsx_runtime.jsx(Section, {
						title: t("details.title"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.session") },
								{ label: t("col.cwd") },
								{ label: t("col.model") },
								{ label: t("col.provider") },
								{ label: t("col.calls"), numeric: true },
								{ label: t("col.input"), numeric: true },
								{ label: t("col.output"), numeric: true },
								{ label: t("col.cacheRead"), numeric: true },
								{ label: t("col.cost"), numeric: true },
							],
							rows: data.bySessionModel ?? [],
							rowKey: (row) => `${row.sessionId}-${row.model}`,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", { className: "dsu-mono", title: row.sessionId, children: shortId(row.sessionId) }),
								react_jsx_runtime.jsx("td", { title: row.cwd ?? undefined, children: shortCwd(row.cwd) }),
								react_jsx_runtime.jsx("td", { children: row.model ?? "—" }),
								react_jsx_runtime.jsx("td", { children: row.provider ?? "—" }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.calls) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.inputTokens), children: formatTokens(row.inputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.outputTokens), children: formatTokens(row.outputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.cacheReadTokens), children: formatTokens(row.cacheReadTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatCost(row.cost ?? 0, currency) }),
							],
						}),
					}),
					react_jsx_runtime.jsx(Section, {
						title: t("section.byCwd"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.cwd") },
								{ label: t("col.sessions"), numeric: true },
								{ label: t("col.models"), numeric: true },
								{ label: t("col.calls"), numeric: true },
								{ label: t("col.tokens"), numeric: true },
								{ label: t("col.cost"), numeric: true },
							],
							rows: data.byCwd ?? [],
							rowKey: (row) => row.cwd,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", { title: row.cwd, children: shortCwd(row.cwd) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.sessionCount) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.modelCount) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.calls) }),
								react_jsx_runtime.jsx("td", {
									className: "dsu-num",
									title: formatTokensFull(row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens),
									children: formatTokens(row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens),
								}),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatCost(row.cost ?? 0, currency) }),
							],
						}),
					}),
					react_jsx_runtime.jsx(Section, {
						title: t("section.bySession"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.session") },
								{ label: t("col.cwd") },
								{ label: t("col.calls"), numeric: true },
								{ label: t("col.tokens"), numeric: true },
								{ label: t("col.share") },
							],
							rows: data.bySession ?? [],
							rowKey: (row) => row.sessionId,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", { className: "dsu-mono", title: row.sessionId, children: shortId(row.sessionId) }),
								react_jsx_runtime.jsx("td", { title: row.cwd ?? undefined, children: shortCwd(row.cwd) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: formatTokensFull(row.calls) }),
								react_jsx_runtime.jsx("td", {
									className: "dsu-num",
									title: formatTokensFull(row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens),
									children: formatTokens(row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens),
								}),
								react_jsx_runtime.jsx("td", { children: react_jsx_runtime.jsx(ShareCell, { value: row.cost ?? 0, max: maxSessionCost, currency }) }),
							],
						}),
					}),
					react_jsx_runtime.jsx(Section, {
						title: t("section.recent"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.time") },
								{ label: t("col.model") },
								{ label: t("col.session") },
								{ label: t("col.turn") },
								{ label: t("col.input"), numeric: true },
								{ label: t("col.output"), numeric: true },
								{ label: t("col.cacheRead"), numeric: true },
								{ label: t("col.cost"), numeric: true },
							],
							rows: data.recent ?? [],
							rowKey: (row, index) => `${row.sessionId}-${row.turn}-${row.step}-${index}`,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", { className: "dsu-mono", children: formatTime(row.time) }),
								react_jsx_runtime.jsx("td", { children: row.model ?? "—" }),
								react_jsx_runtime.jsx("td", { className: "dsu-mono", title: row.sessionId, children: shortId(row.sessionId) }),
								react_jsx_runtime.jsx("td", { className: "dsu-mono", children: `${row.turn}.${row.step}` }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.inputTokens), children: formatTokens(row.inputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.outputTokens), children: formatTokens(row.outputTokens) }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", title: formatTokensFull(row.cacheReadTokens), children: formatTokens(row.cacheReadTokens) }),
								react_jsx_runtime.jsx("td", {
									className: "dsu-num",
									children: [
										(row.cost ?? 0) >= anomalyThreshold
											? react_jsx_runtime.jsx("span", { className: "dsu-anomaly", title: t("recent.anomaly"), children: "●" })
											: null,
										formatCost(row.cost ?? 0, currency),
									],
								}),
							],
						}),
					}),
					react_jsx_runtime.jsx(Section, {
						title: t("section.pricing"),
						children: react_jsx_runtime.jsx(BreakdownTable, {
							headers: [
								{ label: t("col.model") },
								{ label: t("col.input"), numeric: true },
								{ label: t("col.output"), numeric: true },
								{ label: t("col.cacheRead"), numeric: true },
								{ label: t("col.cacheWrite"), numeric: true },
							],
							rows: data.pricing ?? [],
							rowKey: (row, index) => `price-${index}`,
							renderRow: (row) => [
								react_jsx_runtime.jsx("td", {
									children: [
										row.model,
										row.appliesTo === "default" ? react_jsx_runtime.jsx("span", { className: "dsu-pillTag", children: t("col.default") }) : null,
										row.auto === true ? react_jsx_runtime.jsx("span", { className: "dsu-pillTag", title: t("plan.auto"), children: t("plan.auto") }) : null,
										row.schedule !== undefined && row.schedule !== null ? react_jsx_runtime.jsx("span", { className: "dsu-pillTag", title: `${row.schedule.effectiveAt ?? ""} · ${JSON.stringify(row.schedule.peakHours ?? [])}`, children: t("pricing.peakOffpeak") }) : null,
										typeof row.provider === "string" ? react_jsx_runtime.jsx("span", { className: "dsu-pillTag", children: row.provider }) : null,
									],
								}),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: `${currencySymbol(currency)}${row.inputPerMillion}` }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: `${currencySymbol(currency)}${row.outputPerMillion}` }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: `${currencySymbol(currency)}${row.cacheReadPerMillion}` }),
								react_jsx_runtime.jsx("td", { className: "dsu-num", children: `${currencySymbol(currency)}${row.cacheWritePerMillion}` }),
							],
						}),
					}),
				],
			});

			return react_jsx_runtime.jsx("div", {
				className: "dsu-root",
				children: [
					react_jsx_runtime.jsx("div", {
						className: "dsu-tabs",
						children: tabs.map((item) => react_jsx_runtime.jsx("button", { type: "button", className: tab === item.id ? "dsu-tab active" : "dsu-tab", onClick: () => setTab(item.id), children: item.label }, item.id)),
					}),
					(data.allCwds ?? []).length > 0
						? react_jsx_runtime.jsx("div", {
							className: "dsu-filters",
							children: [
								react_jsx_runtime.jsx("select", {
									className: "dsu-select",
									value: cwd ?? "",
									title: t("filter.scope"),
									onChange: (event) => onCwdChange?.(event.target.value),
									children: [
										react_jsx_runtime.jsx("option", { value: "", children: t("filter.all") }, "all"),
										(data.allCwds ?? []).map((path) => react_jsx_runtime.jsx("option", { value: path, children: shortCwd(path) }, path)),
									],
								}),
								typeof cwd === "string" && cwd !== ""
									? react_jsx_runtime.jsx("span", { className: "dsu-note", title: cwd, children: shortCwd(cwd) })
									: null,
							],
						})
						: null,
					tab === "overview" ? overview : null,
					tab === "today" ? react_jsx_runtime.jsx(TodaySection, { t, data, currency }) : null,
					tab === "perf" ? react_jsx_runtime.jsx(PerfSection, { t, data }) : null,
					tab === "details"
						? react_jsx_runtime.jsx("div", {
							className: "dsu-root",
							children: [
								react_jsx_runtime.jsx("div", {
									className: "dsu-section",
									children: [
										react_jsx_runtime.jsx("div", { className: "dsu-note", children: t("details.hint") }),
										react_jsx_runtime.jsx("div", { children: react_jsx_runtime.jsx("button", { type: "button", className: "dsu-button", onClick: onOpenDetails, children: t("details.open") }) }),
									],
								}),
								details,
							],
						})
						: null,
				],
			});
		}
		//#endregion

		//#region widget
		const REFRESH_INTERVAL_MS = 30000;

		/**
		 * Floating bottom-right widget: a compact pill (cost + tokens) that shows
		 * a hover preview popover and toggles the expanded dashboard panel on
		 * click. Polls the host on an interval the server config controls
		 * (`config.refreshSeconds`, default 30s).
		 */
		function UsageStatsWidget({ t, query }) {
			const [data, setData] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [loading, setLoading] = react.useState(false);
			const [lastUpdated, setLastUpdated] = react.useState(null);
			const [expanded, setExpanded] = react.useState(false);
			const [hovered, setHovered] = react.useState(false);
			const [intervalMs, setIntervalMs] = react.useState(REFRESH_INTERVAL_MS);
			/** Workspace filter: "" = all sessions; otherwise a cwd path. */
			const [cwd, setCwd] = react.useState("");
			const cwdRef = react.useRef(cwd);
			cwdRef.current = cwd;

			// Hover intent: a short show delay plus a hide grace period keep the
			// preview from flapping on boundary crossings. The handlers live on
			// the WRAPPER (pill + gap + pop are one hit area), so moving between
			// the pill and the preview never leaves the hover region.
			const showTimer = react.useRef(null);
			const hideTimer = react.useRef(null);
			const startHover = () => {
				if (hideTimer.current !== null) clearTimeout(hideTimer.current);
				hideTimer.current = null;
				if (showTimer.current === null) {
					showTimer.current = setTimeout(() => {
						showTimer.current = null;
						setHovered(true);
					}, 120);
				}
			};
			const endHover = () => {
				if (showTimer.current !== null) {
					clearTimeout(showTimer.current);
					showTimer.current = null;
				}
				if (hideTimer.current === null) {
					hideTimer.current = setTimeout(() => {
						hideTimer.current = null;
						setHovered(false);
					}, 100);
				}
			};

			const refresh = react.useCallback(() => {
				setLoading(true);
				query(() => cwdRef.current || null)()
					.then((value) => {
						setData(value);
						setError(null);
						setLastUpdated(Date.now());
						// The host config owns the auto-refresh cadence.
						const seconds = Number(value?.refreshSeconds);
						if (Number.isFinite(seconds) && seconds >= 5) setIntervalMs(seconds * 1000);
					})
					.catch((cause) => {
						setError(cause instanceof Error ? cause.message : String(cause));
					})
					.finally(() => setLoading(false));
			}, [query]);

			// Standalone call-details window: opened on demand, re-rendered with
			// every fresh snapshot while it stays open.
			const detailsWin = react.useRef(null);
			const openDetails = () => {
				let win = detailsWin.current;
				if (win === null || win.closed) {
					win = window.open("", "dsh-spend-details", "width=1020,height=680,resizable,scrollbars");
					detailsWin.current = win;
				} else {
					win.focus();
				}
				if (win !== null && !win.closed && data !== null && data.totals !== undefined) {
					renderDetailsWindow(win, data, currency, t, lastUpdated);
				}
			};
			react.useEffect(() => {
				const win = detailsWin.current;
				if (win !== null && !win.closed && data !== null && data.totals !== undefined) {
					renderDetailsWindow(win, data, data?.currency ?? "USD", t, lastUpdated);
				}
			}, [data, lastUpdated]);

			react.useEffect(() => {
				refresh();
				const timer = setInterval(refresh, intervalMs);
				return () => {
					clearInterval(timer);
					if (showTimer.current !== null) clearTimeout(showTimer.current);
					if (hideTimer.current !== null) clearTimeout(hideTimer.current);
				};
			}, [refresh, intervalMs]);

			// Re-query immediately when the workspace filter changes.
			react.useEffect(() => {
				refresh();
			}, [cwd, refresh]);

			const currency = data?.currency ?? "USD";
			const totals = data?.totals;
			const cost = totals?.cost ?? 0;
			const totalTokens = totals === undefined
				? 0
				: totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
			const todayRow = (data?.byDay ?? []).find((row) => row.day === localDayKey(new Date()));
			const showPreview = hovered && !expanded;

			return react_jsx_runtime.jsx("div", {
				className: "dsu-widget",
				onMouseEnter: startHover,
				onMouseLeave: endHover,
				children: [
					showPreview
						? react_jsx_runtime.jsx("div", {
							className: "dsu-pop",
							children: [
								react_jsx_runtime.jsx("div", {
									className: "dsu-popTitle",
									children: [
										react_jsx_runtime.jsx("span", { children: t("widget.hint") }),
										react_jsx_runtime.jsx("span", { className: "dsu-toolbar", children: loading ? t("state.loading") : lastUpdated !== null ? `${t("lastUpdated")} ${formatTime(lastUpdated)}` : "" }),
									],
								}),
								error !== null
									? react_jsx_runtime.jsx("div", { className: "dsu-error", children: [`${t("state.error")}：${error}`, react_jsx_runtime.jsx("button", { type: "button", className: "dsu-button", onClick: refresh, children: t("state.retry") })] })
									: totals === undefined || data.callCount === 0
										? react_jsx_runtime.jsx("div", { className: "dsu-empty", children: totals === undefined ? t("state.loading") : t("state.empty") })
										: react_jsx_runtime.jsx("div", {
											className: "dsu-popGrid",
											children: [
												react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.cost") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue isCost", children: formatCost(cost, currency) })] }),
												react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.tokens") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue", title: formatTokensFull(totalTokens), children: formatTokens(totalTokens) })] }),
												react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.input") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue", children: formatTokens(totals.inputTokens) })] }),
												react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.output") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue", children: formatTokens(totals.outputTokens) })] }),
												react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.cacheRead") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue", children: formatTokens(totals.cacheReadTokens) })] }),
												react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.calls") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue", children: formatTokensFull(data.callCount) })] }),
												(todayRow === undefined ? null : react_jsx_runtime.jsx("div", { className: "dsu-popItem", children: [react_jsx_runtime.jsx("span", { className: "dsu-popLabel", children: t("summary.today") }), react_jsx_runtime.jsx("span", { className: "dsu-popValue", children: `${formatTokensFull(todayRow.calls)} · ${formatCost(todayRow.cost, currency)}` })] })),
											],
										}),
								react_jsx_runtime.jsx("div", {
									className: "dsu-popHint",
									children: [
										react_jsx_runtime.jsx("span", { children: t("widget.hoverHint") }),
										react_jsx_runtime.jsx("button", { type: "button", className: "dsu-button", onClick: () => setExpanded(true), children: t("widget.open") }),
									],
								}),
							],
						})
						: null,
					expanded
						? react_jsx_runtime.jsx("div", {
							className: "dsu-panel",
							children: [
								react_jsx_runtime.jsx("div", {
									className: "dsu-panelHead",
									children: [
										react_jsx_runtime.jsx("span", { className: "dsu-panelTitle", children: [react_jsx_runtime.jsx("span", { className: "dsu-pillDot" }), t("widget.hint")] }),
										react_jsx_runtime.jsx("div", { className: "dsu-toolbar", children: [react_jsx_runtime.jsx("button", { type: "button", className: "dsu-button", disabled: loading, onClick: refresh, children: t("refresh") }), react_jsx_runtime.jsx("button", { type: "button", className: "dsu-button", title: t("details.open"), onClick: openDetails, children: t("tab.details") }), react_jsx_runtime.jsx("button", { type: "button", className: "dsu-close", title: t("widget.close"), onClick: () => setExpanded(false), children: "✕" })] }),
									],
								}),
								react_jsx_runtime.jsx("div", {
									className: "dsu-panelBody",
									children: react_jsx_runtime.jsx(Dashboard, { t, data, error, loading, lastUpdated, onRefresh: refresh, onOpenDetails: openDetails, cwd, onCwdChange: setCwd }),
								}),
							],
						})
						: null,
					react_jsx_runtime.jsx("button", {
						type: "button",
						className: "dsu-pill",
						title: t("widget.hint"),
						onClick: () => setExpanded((value) => !value),
						children: [
							react_jsx_runtime.jsx("span", { className: "dsu-pillDot", style: error !== null ? { background: "var(--dsw-alias-state-warning-primary,#bf8700)" } : (data?.budget?.pct ?? 0) >= 100 ? { background: "var(--dsw-alias-state-error-primary,#cf222e)" } : (data?.budget?.pct ?? 0) >= 80 ? { background: "var(--dsw-alias-state-warning-primary,#bf8700)" } : undefined }),
							react_jsx_runtime.jsx("span", { className: "dsu-pillCost", children: totals === undefined ? "…" : formatCost(cost, currency) }),
							totals !== undefined ? react_jsx_runtime.jsx("span", { className: "dsu-pillTokens", children: `· ${formatTokens(totalTokens)}` }) : null,
							react_jsx_runtime.jsx("span", { className: "dsu-pillHint", children: expanded ? "▾" : "▴" }),
						],
					}),
				],
			});
		}
		//#endregion

		//#region plugin body
		/** Required services: the RPC carrier and the locale service. */
		const inject = [
			"connection",
			"locale"
		];

		/**
		 * Client plugin body: register dictionaries, inject the widget styles,
		 * then mount the floating widget into its own React root on
		 * `document.body` (removed again on plugin unload).
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-spend: dictionaries");
			ctx.effect(() => injectStyles(), "dsh-spend: styles");
			const t = ctx.locale.bind(NS);
			const query = buildQuery(ctx);
			ctx.effect(() => {
				const container = document.createElement("div");
				container.id = "dsh-spend-widget";
				document.body.appendChild(container);
				const root = react_dom_client.createRoot(container);
				root.render(react_jsx_runtime.jsx(UsageStatsWidget, { t, query }));
				return () => {
					root.unmount();
					container.remove();
				};
			}, "dsh-spend: widget mount");
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
