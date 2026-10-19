/* ============================================================
   F2 阶段二 — Kanban 看板 / Projects 项目导入的纯逻辑核心
   （无 Obsidian 导入，保持可单测）。候选结构复用 tasksImport 的
   ImportCandidate（同一 buildTaskFileMd 写入、同一幂等键口径：
   源路径 + 行内容/标题内容）。规划红线：复制式、源文件零改写。
   ============================================================ */

import type { TaskPriority, TaskStatus } from './taskParseCore';
import { PRIORITY_LIST } from './taskParseCore';
import type { ImportCandidate } from './tasksImport';
import { importKey, mapRecurrence, parseTasksLine } from './tasksImport';

/* ============================================================
   ① Kanban 看板（obsidian-kanban 格式：## 列标题 + 列下列表项）
   ============================================================ */

export interface KanbanColumn { name: string; lineNo: number }
export interface KanbanCard { column: string; lineNo: number; raw: string; text: string; done: boolean }

/** 解析看板文件：## 标题为列，列下的列表项为卡片（跳过代码围栏） */
export function parseKanbanBoard(content: string): { columns: KanbanColumn[]; cards: KanbanCard[] } {
	const columns: KanbanColumn[] = [];
	const cards: KanbanCard[] = [];
	const lines = content.split(/\r?\n/);
	let inFence = false;
	let current: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
		if (inFence) continue;
		const h = line.match(/^##\s+(.+?)\s*$/);
		if (h) {
			current = (h[1] ?? '').trim();
			if (current) columns.push({ name: current, lineNo: i + 1 });
			continue;
		}
		if (!current) continue;
		const item = line.match(/^\s*[-*+]\s+(.*)$/);
		if (!item) continue;
		let rest = item[1] ?? '';
		let done = false;
		const cb = rest.match(/^\[([ xX/-])\]\s*/);
		if (cb) {
			done = (cb[1] ?? '').toLowerCase() === 'x';
			rest = rest.slice(cb[0].length);
		}
		const text = rest.trim();
		if (!text) continue;
		cards.push({ column: current, lineNo: i + 1, raw: line, text, done });
	}
	return { columns, cards };
}

/** 看板文件识别：frontmatter 含 kanban-plugin 标记（文件夹扫描时防误吞普通笔记） */
export function looksLikeKanbanBoard(content: string): boolean {
	const lines = content.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') return false;
	for (let i = 1; i < lines.length && i < 40; i++) {
		const l = lines[i] ?? '';
		if (l.trim() === '---') break;
		if (/^kanban-plugin\s*:/.test(l)) return true;
	}
	return false;
}

/** 列映射的可选项（ignore = 该列不导入） */
export const KANBAN_STATUS_OPTIONS: (TaskStatus | 'ignore')[] = ['待办', '进行中', '已阻塞', '已完成', '已取消', 'ignore'];

/** 常见列名的预填默认（映射 UI 初值，用户可改——规划 [TBD]：不做静默猜测） */
export function defaultColumnStatus(column: string): TaskStatus | 'ignore' {
	const s = column.trim().toLowerCase();
	if (/(done|完成|完結|归档|archive)/.test(s)) return '已完成';
	if (/(cancel|取消|放弃|drop)/.test(s)) return '已取消';
	if (/(block|阻塞|卡|wait|等待|hold)/.test(s)) return '已阻塞';
	if (/(doing|进行|progress|active|wip)/.test(s)) return '进行中';
	return '待办';
}

export interface KanbanBuildOptions {
	sourcePath: string;
	/** 列名 → 状态（'ignore' = 不导入该列） */
	columnStatus: Record<string, TaskStatus | 'ignore'>;
	/** 单轴优先级默认象限（卡片带 emoji 时归入并可改，对齐阶段一口径） */
	defaultPriority: TaskPriority;
	includeCompleted: boolean;
	existingKeys: Set<string>;
}

export function buildKanbanCandidates(
	board: { cards: KanbanCard[] },
	opts: KanbanBuildOptions,
): { candidates: ImportCandidate[]; skipped: { ignored: number; completed: number; duplicate: number } } {
	const candidates: ImportCandidate[] = [];
	const skipped = { ignored: 0, completed: 0, duplicate: 0 };
	for (const card of board.cards) {
		const columnStatus = opts.columnStatus[card.column] ?? '待办';
		if (columnStatus === 'ignore') { skipped.ignored++; continue; }
		if (card.done && !opts.includeCompleted) { skipped.completed++; continue; }
		const key = importKey(opts.sourcePath, card.raw);
		if (opts.existingKeys.has(key)) { skipped.duplicate++; continue; }

		// 复用阶段一 emoji 解析器：合成 checkbox 行，提取日期/优先级/标签/重复
		const emoji = parseTasksLine(`- [${card.done ? 'x' : ' '}] ${card.text}`, card.lineNo);
		const status: TaskStatus = card.done ? '已完成' : columnStatus;
		const notes: string[] = [`导入自：${opts.sourcePath} 第 ${card.lineNo} 行（看板列「${card.column}」）`];
		const warnings: ImportCandidate['warnings'] = [];
		let type: '普通' | '重复' = '普通';
		let repeatRule: ImportCandidate['repeatRule'] = null;
		if (emoji?.recurrenceRaw) {
			const r = mapRecurrence(emoji.recurrenceRaw);
			if (r.mapped) {
				type = r.type;
				repeatRule = r.rule;
			} else {
				notes.push(`原重复规则「${emoji.recurrenceRaw}」无法映射，已导入为普通任务`);
				warnings.push('recurrence');
			}
		}
		let priority: TaskPriority | null = null;
		if (emoji?.priorityEmoji) {
			priority = opts.defaultPriority;
			warnings.push('priority');
		}

		candidates.push({
			key,
			sourcePath: opts.sourcePath,
			lineNo: card.lineNo,
			content: emoji?.content || card.text || '未命名卡片',
			status,
			completeTime: card.done ? (emoji?.completedDate ?? null) : null,
			due: emoji?.due ?? null,
			start: emoji?.start ?? null,
			remindDate: emoji?.scheduled ?? null,
			type,
			repeatRule,
			priority,
			tags: emoji?.tags ?? [],
			notes,
			warnings,
			priorityEmoji: emoji?.priorityEmoji ?? null,
			recurrenceRaw: emoji?.recurrenceRaw ?? null,
		});
	}
	return { candidates, skipped };
}

/* ============================================================
   ② Projects 项目（frontmatter 字段名因用户模板而异 → 映射向导）
   ============================================================ */

/** Xove 目标字段 → 源 frontmatter 键（空串 = 不映射） */
export interface ProjectFieldMap {
	title: string;
	status: string;
	priority: string;
	start: string;
	due: string;
	complete: string;
	tags: string;
}

export const EMPTY_FIELD_MAP: ProjectFieldMap = { title: '', status: '', priority: '', start: '', due: '', complete: '', tags: '' };

/** 映射模板（保存复用）：模板名 → 字段映射（存 data.json 插件状态） */
export type ProjectTemplateMap = Record<string, ProjectFieldMap>;

export interface ProjectRecord {
	/** 源文件路径（幂等键组成部分） */
	path: string;
	/** 解析好的 frontmatter */
	fm: Record<string, unknown>;
}

/** 收集记录集 frontmatter 键的并集（供映射 UI 下拉） */
export function collectFmKeys(records: ProjectRecord[]): string[] {
	const keys = new Set<string>();
	for (const r of records) for (const k of Object.keys(r.fm)) keys.add(k);
	return [...keys].sort((a, b) => a.localeCompare(b));
}

/** 任意 frontmatter 值 → 字符串（Date → YYYY-MM-DD；空值 → null） */
export function fmScalar(v: unknown): string | null {
	if (v == null) return null;
	if (v instanceof Date) {
		if (isNaN(v.getTime())) return null;
		return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
	}
	if (typeof v === 'string') { const s = v.trim(); return s || null; }
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return null;
}

/** 数组值（标签等）→ 字符串数组 */
export function fmScalarList(v: unknown): string[] {
	if (Array.isArray(v)) return v.map(fmScalar).filter((s): s is string => !!s);
	const s = fmScalar(v);
	return s ? [s] : [];
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const asDate = (v: unknown): string | null => {
	const s = fmScalar(v);
	return s && DATE_PREFIX.test(s) ? s.slice(0, 10) : null;
};

/** 状态值启发式映射（complete 布尔字段优先；映射 UI 可见可改） */
export function statusFromValue(statusVal: string | null, completeVal: string | null): TaskStatus {
	if (completeVal !== null) {
		const c = completeVal.toLowerCase();
		if (c === 'true' || c === 'yes' || c === '1' || /(done|完成)/.test(c)) return '已完成';
		if (c === 'false' || c === 'no' || c === '0') return '待办';
	}
	const s = (statusVal ?? '').toLowerCase();
	if (!s) return '待办';
	if (/(cancel|取消|放弃|drop)/.test(s)) return '已取消';
	if (/(done|complet|finish|closed|归档|archived|完成)/.test(s)) return '已完成';
	if (/(block|阻塞|卡|wait|等待|hold)/.test(s)) return '已阻塞';
	if (/(doing|active|进行|progress|wip|开始)/.test(s)) return '进行中';
	return '待办';
}

export interface ProjectBuildOptions {
	existingKeys: Set<string>;
}

export function buildProjectCandidates(
	records: ProjectRecord[],
	map: ProjectFieldMap,
	opts: ProjectBuildOptions,
): { candidates: ImportCandidate[]; skipped: { duplicate: number } } {
	const candidates: ImportCandidate[] = [];
	const skipped = { duplicate: 0 };
	for (const rec of records) {
		const titleVal = map.title ? fmScalar(rec.fm[map.title]) : null;
		const title = titleVal ?? rec.path.split('/').pop()?.replace(/\.md$/, '') ?? '未命名记录';
		const key = importKey(rec.path, titleVal ?? basenameOf(rec.path));
		if (opts.existingKeys.has(key)) { skipped.duplicate++; continue; }

		const status = statusFromValue(
			map.status ? fmScalar(rec.fm[map.status]) : null,
			map.complete ? fmScalar(rec.fm[map.complete]) : null,
		);
		const rawPrio = map.priority ? fmScalar(rec.fm[map.priority]) : null;
		const priority = rawPrio && (PRIORITY_LIST as string[]).includes(rawPrio) ? (rawPrio as TaskPriority) : null;
		const tags = map.tags ? fmScalarList(rec.fm[map.tags]) : [];
		const due = map.due ? asDate(rec.fm[map.due]) : null;
		const start = map.start ? asDate(rec.fm[map.start]) : null;
		const completeDate = map.complete ? asDate(rec.fm[map.complete]) : null;

		candidates.push({
			key,
			sourcePath: rec.path,
			lineNo: 0,
			content: title,
			status: status === '已完成' && completeDate ? '已完成' : status,
			completeTime: status === '已完成' ? (completeDate ?? null) : null,
			due,
			start,
			remindDate: null,
			type: '普通',
			repeatRule: null,
			priority,
			tags,
			notes: [`导入自：${rec.path}`],
			warnings: [],
			priorityEmoji: null,
			recurrenceRaw: null,
		});
	}
	return { candidates, skipped };
}

function basenameOf(p: string): string {
	return p.split('/').pop() ?? p;
}
