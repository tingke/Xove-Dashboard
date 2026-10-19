/* ============================================================
   F1 到期提醒 — 纯逻辑核心（无 Obsidian 导入，保持可单测）。
   投递与调度见 reminderNotifier.ts；口径与 TODO 卡一致：
   逾期任务归入启动汇总，不在单任务提醒里重复打扰。
   ============================================================ */

import type { TaskItem } from './taskParser';

/** 本地日期 YYYY-MM-DD */
export function todayStr(d: Date = new Date()): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 提醒选项文案 → 提前天数（null = 无法识别，忽略）。
 * 兼容中英文案（'提前 1 天' / '1 day before' / '提前 1 周' / '1 week before'、
 * '任务当天' / 'On the day'）；手写的 '09:00' 类时间串无法解析，安全忽略。
 */
export function reminderOffsetDays(label: string): number | null {
	const s = (label || '').replace(/\s+/g, '');
	if (!s) return null;
	if (s === '任务当天' || s === '当天' || /^onthe(day)?$/i.test(s)) return 0;
	const zh = s.match(/^提前(\d+)(天|周)$/);
	if (zh) return Number(zh[1]) * (zh[2] === '周' ? 7 : 1);
	const en = s.match(/^(\d+)(day|week)s?before$/i);
	if (en) return Number(en[1]) * (/week/i.test(en[2]) ? 7 : 1);
	return null;
}

/** YYYY-MM-DD 加减天数（非法输入原样返回） */
export function shiftDate(dateStr: string, days: number): string {
	const d = new Date(dateStr + 'T00:00:00');
	if (isNaN(d.getTime())) return dateStr;
	d.setDate(d.getDate() + days);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 今天应提醒的一次命中：任务 + 提前天数 + 命中日期（去重键的日期部分） */
export interface DueHit {
	task: TaskItem;
	offsetDays: number;
	date: string;
}

/**
 * 收集今天应提醒的任务：
 * - 普通任务：对每个提醒选项 o，截止日期 - o 天 == 今天 → 命中（0 = 任务当天）；
 * - 重复任务：remindDate（下次提醒日）<= 今天 → 命中一次（错过的提醒保持可达，口径同 TODO 卡）；
 * - 已完成/已取消/今日已完成 → 跳过；已逾期（dueDate < today）→ 跳过（走启动逾期汇总）。
 */
export function collectDueTasks(tasks: TaskItem[], today: string): DueHit[] {
	const hits: DueHit[] = [];
	for (const t of tasks) {
		if (t.status === '已完成' || t.status === '已取消') continue;
		if (t.completeTime && t.completeTime.startsWith(today)) continue;
		if (t.type === '重复') {
			if (t.remindDate && t.remindDate <= today) hits.push({ task: t, offsetDays: 0, date: t.remindDate });
			continue;
		}
		if (!t.dueDate || t.dueDate < today) continue;
		const offsets = new Set<number>();
		for (const label of t.reminder ?? []) {
			const o = reminderOffsetDays(label);
			if (o !== null) offsets.add(o);
		}
		for (const o of offsets) {
			if (shiftDate(t.dueDate, -o) === today) hits.push({ task: t, offsetDays: o, date: today });
		}
	}
	return hits;
}

/**
 * 单任务版 collectDueTasks：今天是否命中提醒窗口（TODO 卡「今日到期 / N 天后到期」徽标用）。
 * 命中返回提前天数（0 = 任务当天），未命中返回 null。
 */
export function dueHitOffset(task: TaskItem, today: string): number | null {
	const hits = collectDueTasks([task], today);
	const first = hits[0];
	return first ? first.offsetDays : null;
}

function parseHm(s: string): number | null {
	const m = (s || '').match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const h = Number(m[1]);
	const mm = Number(m[2]);
	if (h > 24 || mm > 59) return null;
	return h * 60 + mm;
}

/** 勿扰窗口判断（HH:mm，支持跨零点如 22:00–08:00）；起止相等或非法视为未启用 */
export function isInDndWindow(now: Date, from: string, to: string): boolean {
	const a = parseHm(from);
	const b = parseHm(to);
	if (a === null || b === null || a === b) return false;
	const cur = now.getHours() * 60 + now.getMinutes();
	return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
