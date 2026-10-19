/* ============================================================
   F6 习惯打卡 — 纯逻辑核心（无 Obsidian 导入，保持可单测）。
   习惯以 frontmatter 定义（习惯/颜色/频率/目标），打卡记录为
   frontmatter 数组「打卡: [YYYY-MM-DD, …]」（免 JSON，Dataview 可查）。
   连击含断档容忍：每天=连续天数（今天未打从昨天起算）；
   每周=连续达标周数（进行中的本周未达标不断档，从上周起算）。
   ============================================================ */

export type HabitFreq = '每天' | '每周';

export interface HabitDef {
	/** 习惯文件路径 */
	path: string;
	name: string;
	color: string;
	freq: HabitFreq;
	/** 每周目标次数（freq === '每周' 时生效） */
	target: number;
	/** 打卡日期（YYYY-MM-DD 升序去重） */
	checkins: string[];
}

/** 打卡格点窗口（规划 [Assumption, TBD]：30 天） */
export const HABIT_GRID_DAYS = 30;
export const DEFAULT_HABIT_COLOR = '#7c6cf0';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateStr = (s: string): boolean => DATE_RE.test(s);
const fmt = (d: Date): string =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 从 frontmatter 构建习惯定义；文件不含「习惯/打卡」任一键时返回 null
 * （避免把习惯文件夹里的普通笔记误当习惯）。
 */
export function parseHabit(path: string, fm: Record<string, unknown>): HabitDef | null {
	const rawName = fm['习惯'];
	const rawCheckins = fm['打卡'];
	if (typeof rawName !== 'string' && !Array.isArray(rawCheckins)) return null;
	const freq: HabitFreq = fm['频率'] === '每周' ? '每周' : '每天';
	const rawTarget = fm['目标'];
	const target = typeof rawTarget === 'number' && rawTarget >= 1 ? Math.min(7, Math.round(rawTarget)) : 3;
	const color = typeof fm['颜色'] === 'string' && fm['颜色'].trim() ? (fm['颜色'] as string).trim() : DEFAULT_HABIT_COLOR;
	const list = Array.isArray(rawCheckins) ? rawCheckins.map(String) : typeof rawCheckins === 'string' ? [rawCheckins] : [];
	const checkins = [...new Set(list.filter(isDateStr))].sort();
	return {
		path,
		name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : path.split('/').pop()?.replace(/\.md$/, '') || path,
		color,
		freq,
		target,
		checkins,
	};
}

/** 序列化打卡数组：升序去重（写回 frontmatter 前调用） */
export function serializeCheckins(dates: string[]): string[] {
	return [...new Set(dates.filter(isDateStr))].sort();
}

/** 打卡/取消某天：返回新数组（升序去重，不改动原数组） */
export function toggleCheckin(habit: HabitDef, date: string): string[] {
	const set = new Set(habit.checkins);
	if (set.has(date)) set.delete(date);
	else set.add(date);
	return serializeCheckins([...set]);
}

export function isDone(habit: HabitDef, date: string): boolean {
	return habit.checkins.includes(date);
}

/** 近 n 天日期（升序，含 today） */
export function lastNDays(n: number, today: string): string[] {
	const out: string[] = [];
	const base = new Date(`${today}T00:00:00`);
	if (isNaN(base.getTime())) return out;
	for (let i = n - 1; i >= 0; i--) {
		const d = new Date(base);
		d.setDate(base.getDate() - i);
		out.push(fmt(d));
	}
	return out;
}

/** 周起始（周一）YYYY-MM-DD */
export function weekStartOf(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00`);
	if (isNaN(d.getTime())) return dateStr;
	const dow = (d.getDay() + 6) % 7; // 周一=0
	d.setDate(d.getDate() - dow);
	return fmt(d);
}

function shiftDays(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00`);
	if (isNaN(d.getTime())) return dateStr;
	d.setDate(d.getDate() + days);
	return fmt(d);
}

/** [ws, ws+7) 区间内的打卡数（YYYY-MM-DD 字符串比较） */
function weeklyCount(habit: HabitDef, ws: string): number {
	const we = shiftDays(ws, 7);
	return habit.checkins.filter((c) => c >= ws && c < we).length;
}

/**
 * 当前连击（规划 F6-4 断档容忍）：
 * - 每天：从今天往回的连续打卡天数；今天未打卡不立即断（从昨天起算，宽容「今天还没到点」）；
 * - 每周：连续达标周数；进行中的本周未达标不扣（从上周起算），缺席单日不断，仅整周未达 target 才断。
 */
export function computeStreak(habit: HabitDef, today: string): number {
	if (!isDateStr(today)) return 0;
	if (habit.freq === '每天') {
		let streak = 0;
		let cursor = today;
		if (!isDone(habit, cursor)) cursor = shiftDays(cursor, -1);
		while (isDone(habit, cursor)) {
			streak++;
			cursor = shiftDays(cursor, -1);
		}
		return streak;
	}
	const target = Math.max(1, habit.target);
	let streak = 0;
	let ws = weekStartOf(today);
	if (weeklyCount(habit, ws) < target) ws = shiftDays(ws, -7);
	while (weeklyCount(habit, ws) >= target) {
		streak++;
		ws = shiftDays(ws, -7);
	}
	return streak;
}
