/* ============================================================
   F2 阶段一 — Tasks emoji 语法解析与映射（纯逻辑，无 Obsidian 导入，
   保持可单测）。向导 UI 见 views/ImportWizardModal.ts。
   红线（规划 §3）：复制式导入，源文件与源行零改写；免代码；幂等可重跑
   （唯一键 = 源路径 + 规范化行内容，规划 §8.5）；零网络。
   ============================================================ */

import type { RepeatRule, TaskPriority, TaskStatus, TaskType } from './taskParseCore';
import { yamlScalar } from './yamlScalar';

/** 去重键持久化上限（存 data.json 的插件状态，FIFO 裁剪） */
export const MAX_IMPORT_KEYS = 4000;

/** Tasks 行的 checkbox 状态 */
export type TasksCheckState = 'todo' | 'done' | 'cancelled';

/** 一行 Tasks 语法任务（emoji 标记已拆解） */
export interface ParsedTasksLine {
	/** 1-based 行号 */
	lineNo: number;
	raw: string;
	state: TasksCheckState;
	/** 任务文本（去 checkbox、去 emoji 标记、去 #tags） */
	content: string;
	/** 📅 到期 */
	due: string | null;
	/** 🛫 开始 */
	start: string | null;
	/** ⏳ 计划（映射到 Xove 提醒日期） */
	scheduled: string | null;
	/** ✅/➖ 完成日期 */
	completedDate: string | null;
	/** 🔁 重复规则原文 */
	recurrenceRaw: string | null;
	/** 单轴优先级 emoji（Tasks 插件口径；与四象限不同构，仅检测不猜测） */
	priorityEmoji: string | null;
	tags: string[];
	/** ⛔ 依赖的 Tasks id（仅记入备注，不建立 Xove 前置任务） */
	depIds: string[];
}

const CHECKBOX_RE = /^\s*[-*+]\s+\[([ xX\/\-])\]\s*/;
const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const PRIORITY_EMOJIS = ['🔺', '⏫', '🔼', '🔽', '⏬'];
// 捕获组切段：偶数段=普通文本，奇数段=marker，其参数是下一个段
const MARKER_SPLIT_RE = /(📅|🛫|⏳|✅|➖|🔁|🆔|⛔|➕|🔺|⏫|🔼|🔽|⏬)/;
const TAG_RE = /(^|\s)(#[^\s#]+)/g;

/** 解析一行 Tasks 语法；非 checkbox 列表行返回 null */
export function parseTasksLine(raw: string, lineNo: number): ParsedTasksLine | null {
	const cb = raw.match(CHECKBOX_RE);
	if (!cb) return null;
	const mark = cb[1] ?? ' ';
	const state: TasksCheckState = mark === '-' ? 'cancelled' : mark.toLowerCase() === 'x' ? 'done' : 'todo';
	let rest = raw.slice(cb[0].length);

	// tags 先摘出，避免 #tag 混入正文
	const tags: string[] = [];
	rest = rest.replace(TAG_RE, (_m, pre: string, tag: string) => {
		tags.push(tag);
		return pre;
	});

	const parts = rest.split(MARKER_SPLIT_RE);
	let due: string | null = null;
	let start: string | null = null;
	let scheduled: string | null = null;
	let completedDate: string | null = null;
	let recurrenceRaw: string | null = null;
	let priorityEmoji: string | null = null;
	const depIds: string[] = [];
	const contentParts: string[] = [];
	// 第 0 段是首个 marker 前的正文，直接入正文
	if (parts[0]) contentParts.push(parts[0]);

	// marker 参数中未构成取值的剩余文字并回正文（避免吞字）
	const takeArg = (arg: string, consumed: string | null): void => {
		const leftover = consumed === null ? arg : arg.replace(consumed, '').trim();
		if (leftover) contentParts.push(leftover);
	};

	for (let i = 1; i < parts.length; i += 2) {
		const marker = parts[i] ?? '';
		const arg = (parts[i + 1] ?? '').trim();
		const dateM = arg.match(DATE_RE);
		switch (marker) {
			case '📅':
				takeArg(arg, dateM ? (dateM[0] ?? null) : null);
				if (dateM) due = dateM[0]!;
				break;
			case '🛫':
				takeArg(arg, dateM ? (dateM[0] ?? null) : null);
				if (dateM) start = dateM[0]!;
				break;
			case '⏳':
				takeArg(arg, dateM ? (dateM[0] ?? null) : null);
				if (dateM) scheduled = dateM[0]!;
				break;
			case '✅':
			case '➖':
				takeArg(arg, dateM ? (dateM[0] ?? null) : null);
				if (dateM) completedDate = dateM[0]!;
				break;
			case '🔁':
				// 参数整体是重复规则原文（至下一个 marker 为止）
				takeArg(arg, arg);
				recurrenceRaw = arg || null;
				break;
			case '⛔': {
				const idRun = arg.match(/^[\w-]+(?:\s*,\s*[\w-]+)*/);
				const taken = idRun ? idRun[0] : null;
				takeArg(arg, taken);
				if (taken) for (const id of taken.split(/[\s,]+/)) if (id) depIds.push(id);
				break;
			}
			case '🆔':
			case '➕':
				// 插件内部 id / 父 id：丢弃
				takeArg(arg, arg);
				break;
			default:
				// 优先级 emoji：无参数
				takeArg(arg, null);
				if (PRIORITY_EMOJIS.includes(marker) && !priorityEmoji) priorityEmoji = marker;
				break;
		}
	}

	return {
		lineNo,
		raw,
		state,
		content: contentParts.join(' ').replace(/\s+/g, ' ').trim(),
		due,
		start,
		scheduled,
		completedDate,
		recurrenceRaw,
		priorityEmoji,
		tags,
		depIds,
	};
}

/** 扫描一段 Markdown 全部 Tasks 语法行（跳过代码围栏内的行） */
export function scanTasksSyntax(content: string): ParsedTasksLine[] {
	const out: ParsedTasksLine[] = [];
	const lines = content.split(/\r?\n/);
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
		if (inFence || !line.trim()) continue;
		const parsed = parseTasksLine(line, i + 1);
		if (parsed) out.push(parsed);
	}
	return out;
}

/* ---- 重复规则映射：Tasks 语法 → Xove 五种（每天 / 工作日 / 每周几 / 每月几号 / 每 N 天） ---- */

export type RecurrenceMap =
	| { mapped: true; type: '重复'; rule: RepeatRule; whenDone: boolean }
	| { mapped: false };

const WEEKDAY_ALIASES: Record<string, number> = {
	mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3,
	thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
	'周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7, '周天': 7,
	'星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 7, '星期天': 7,
};

function clampInt(v: string | undefined, min: number, max: number): number {
	const n = parseInt(v ?? '', 10);
	if (isNaN(n)) return min;
	return Math.min(max, Math.max(min, n));
}

/**
 * Tasks 重复规则 → Xove 规则。仅映射规划允许的五种；其余（每 N 周 / 每 N 月 /
 * 每年第 N 个周一 / every year 等）一律 unmapped，由调用方导入为普通任务并警示。
 * 「when done」（按完成日推进）不改变节奏，映射后由调用方在备注中说明。
 */
export function mapRecurrence(raw: string): RecurrenceMap {
	const whenDone = /when\s+done/i.test(raw);
	const s = raw.toLowerCase().replace(/when\s+done/g, ' ').replace(/\s+/g, ' ').trim();
	if (!s) return { mapped: false };

	let m = s.match(/^every\s+(\d+)\s+days?$/);
	if (m) return { mapped: true, type: '重复', rule: { '频率': '每天', '间隔天数': clampInt(m[1], 1, 365) }, whenDone };
	if (s === 'every day') return { mapped: true, type: '重复', rule: { '频率': '每天' }, whenDone };
	if (s === 'every weekday' || s === 'every workday') {
		return { mapped: true, type: '重复', rule: { '频率': '工作日' }, whenDone };
	}
	if (s === 'every week') return { mapped: true, type: '重复', rule: { '频率': '每周' }, whenDone };
	m = s.match(/^every\s+week\s+(?:on|every)\s+(.+)$/);
	if (m) {
		const days: number[] = [];
		for (const token of (m[1] ?? '').split(/[\s,和]+/)) {
			const n = WEEKDAY_ALIASES[token];
			if (n) days.push(n);
		}
		if (days.length) return { mapped: true, type: '重复', rule: { '频率': '每周', '每周几': [...new Set(days)].sort((a, b) => a - b) }, whenDone };
		return { mapped: false };
	}
	if (s === 'every month') return { mapped: true, type: '重复', rule: { '频率': '每月' }, whenDone };
	m = s.match(/^every\s+month\s+(?:on\s+the\s+|on\s+)?(\d{1,2})(?:st|nd|rd|th)?$/);
	if (m) return { mapped: true, type: '重复', rule: { '频率': '每月', '每月几号': clampInt(m[1], 1, 31) }, whenDone };
	return { mapped: false };
}

/* ---- 幂等键 / 文件名 ---- */

/** 幂等键（规划 §8.5）：源文件路径 + 规范化行内容。
 *  规范化 = 去 checkbox 状态（勾选与否不改变任务身份）+ 折叠空白。 */
export function importKey(sourcePath: string, rawLine: string): string {
	const norm = rawLine.replace(CHECKBOX_RE, '').replace(/\s+/g, ' ').trim();
	return `${sourcePath}::${norm}`;
}

/** 任务文本 → 安全文件名：去文件系统/ frontmatter 破坏字符，限长 80 */
export function sanitizeImportFilename(content: string): string {
	const name = content
		.replace(/[\\/:*?"<>|#^\[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^[-.]+|[-.]+$/g, '');
	return (name || '未命名任务').slice(0, 80);
}

/* ---- 候选构建（映射表落地） ---- */

export interface ImportCandidateOptions {
	sourcePath: string;
	/** 单轴优先级的默认象限（规划 [Assumption]：重要不紧急；预览页可改） */
	defaultPriority: TaskPriority;
	/** ✅ 已完成行：false = 跳过（默认），true = 导入为已完成归档 */
	includeCompleted: boolean;
	existingKeys: Set<string>;
	today: string;
}

export type ImportWarning = 'priority' | 'recurrence';
export type SkipReason = 'completed' | 'cancelled' | 'duplicate';

export interface ImportCandidate {
	key: string;
	sourcePath: string;
	lineNo: number;
	content: string;
	status: TaskStatus;
	completeTime: string | null;
	due: string | null;
	start: string | null;
	remindDate: string | null;
	type: TaskType;
	repeatRule: RepeatRule | null;
	priority: TaskPriority | null;
	tags: string[];
	/** 备注行（导入来源 / 未映射规则 / 原依赖等） */
	notes: string[];
	warnings: ImportWarning[];
	priorityEmoji: string | null;
	recurrenceRaw: string | null;
}

export interface BuildResult {
	candidates: ImportCandidate[];
	skipped: Record<SkipReason, number>;
}

/** 映射表（规划 F2-3）落地：把解析行转成 Xove 任务候选 */
export function buildCandidates(parsed: ParsedTasksLine[], opts: ImportCandidateOptions): BuildResult {
	const candidates: ImportCandidate[] = [];
	const skipped: Record<SkipReason, number> = { completed: 0, cancelled: 0, duplicate: 0 };
	for (const p of parsed) {
		if (p.state !== 'todo' && !opts.includeCompleted) {
			skipped[p.state === 'done' ? 'completed' : 'cancelled']++;
			continue;
		}
		const key = importKey(opts.sourcePath, p.raw);
		if (opts.existingKeys.has(key)) { skipped.duplicate++; continue; }

		const status: TaskStatus = p.state === 'done' ? '已完成' : p.state === 'cancelled' ? '已取消' : '待办';
		const notes: string[] = [`导入自：${opts.sourcePath} 第 ${p.lineNo} 行`];
		const warnings: ImportWarning[] = [];

		let type: TaskType = '普通';
		let repeatRule: RepeatRule | null = null;
		if (p.recurrenceRaw) {
			const r = mapRecurrence(p.recurrenceRaw);
			if (r.mapped) {
				type = r.type;
				repeatRule = r.rule;
				if (r.whenDone) notes.push(`原规则「${p.recurrenceRaw}」按完成日推进，已按固定节奏映射`);
			} else {
				notes.push(`原重复规则「${p.recurrenceRaw}」无法映射，已导入为普通任务`);
				warnings.push('recurrence');
			}
		}
		if (p.depIds.length) notes.push(`原依赖（Tasks id）：${p.depIds.join('、')}`);

		let priority: TaskPriority | null = null;
		if (p.priorityEmoji) {
			// 单轴 → 四象限不同构，不自动猜测：默认归入并警示，预览页可逐条/批量调整
			priority = opts.defaultPriority;
			warnings.push('priority');
		}

		// 重复任务的提醒日期 = ⏳ 计划 ?? 🛫 开始 ?? 今天（对齐 createTaskFile 先例）
		const remindDate = type === '重复' ? (p.scheduled ?? p.start ?? opts.today) : p.scheduled;

		candidates.push({
			key,
			sourcePath: opts.sourcePath,
			lineNo: p.lineNo,
			content: p.content || '未命名任务',
			status,
			completeTime: p.state === 'done' ? (p.completedDate ?? opts.today) : null,
			due: p.due,
			start: p.start,
			remindDate,
			type,
			repeatRule,
			priority,
			tags: [...p.tags],
			notes,
			warnings,
			priorityEmoji: p.priorityEmoji,
			recurrenceRaw: p.recurrenceRaw,
		});
	}
	return { candidates, skipped };
}

/* ---- 任务文件生成 ---- */

/** 生成 Xove 任务文件全文：frontmatter 先例对齐 DashboardView.createTaskFile，
 *  并追加 F2 的「链接」源笔记字段（复用灵感条目 link 先例，链接字段可被 Dataview 查询）。 */
export function buildTaskFileMd(c: ImportCandidate, projectName: string): string {
	const lines: string[] = ['---'];
	lines.push(`状态: ${yamlScalar(c.status)}`);
	if (c.priority) lines.push(`优先级: ${yamlScalar(c.priority)}`);
	if (c.start) lines.push(`开始日期: ${yamlScalar(c.start)}`);
	if (c.due) lines.push(`截止日期: ${yamlScalar(c.due)}`);
	lines.push(`项目: ${yamlScalar(projectName)}`);
	if (c.tags.length) lines.push(`tags: ${JSON.stringify(c.tags)}`);
	lines.push(`类型: ${c.type}`);
	lines.push(`备注: ${yamlScalar(c.notes.join('\n'))}`);
	if (c.type === '重复' && c.repeatRule) {
		const r = c.repeatRule;
		lines.push('重复规则:');
		if (r['频率']) lines.push(`  频率: ${yamlScalar(String(r['频率']))}`);
		if (r['间隔天数'] != null) lines.push(`  间隔天数: ${r['间隔天数']}`);
		if (r['每周几'] && r['每周几'].length) lines.push(`  每周几: [${r['每周几'].join(', ')}]`);
		if (r['每月几号'] != null) lines.push(`  每月几号: ${r['每月几号']}`);
		if (c.remindDate) lines.push(`提醒日期: ${c.remindDate}`);
	} else if (c.remindDate) {
		lines.push(`提醒日期: ${c.remindDate}`);
	}
	if (c.completeTime) lines.push(`完成时间: ${yamlScalar(c.completeTime)}`);
	lines.push(`链接: ${yamlScalar(`[[${c.sourcePath}]]`)}`);
	lines.push('---');
	lines.push('');
	lines.push(`# ${c.content}`);
	lines.push('');
	return lines.join('\n');
}
