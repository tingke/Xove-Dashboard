/* ============================================================
   F4 今日时间块 — 纯逻辑核心（无 Obsidian 导入，保持可单测）。
   今日归属复用 taskLogic.getTodayTasks 口径（重复任务按 remindDate、
   多日任务取今日段、今日不做排除）；时间字段唯一为 frontmatter
   「开始时间」（HH:MM），块时长固定 60 分钟（规划 §8.2）。
   ============================================================ */

import type { TaskItem } from './taskParseCore';
import { getTodayTasks } from './taskLogic';

/** 默认时间线范围 7:00–23:00（规划 [Assumption]） */
export const DEFAULT_RANGE_START_MIN = 7 * 60;
export const DEFAULT_RANGE_END_MIN = 23 * 60;
/** 块时长：只有「开始时间」一个时间字段，块统一渲染 60 分钟 */
export const BLOCK_MINUTES = 60;
/** 拖放落点吸附粒度（分钟） */
export const SNAP_MINUTES = 15;

/** HH:MM → 分钟数（0..1439）；非法返回 null */
export function hhmmToMin(s: string | null | undefined): number | null {
	const m = (s || '').match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const h = Number(m[1]);
	const mm = Number(m[2]);
	if (h > 23 || mm > 59) return null;
	return h * 60 + mm;
}

/** 分钟数 → HH:MM（钳制到 0..1439） */
export function minToHHmm(m: number): string {
	const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
	return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

export interface TimeBlockTask {
	task: TaskItem;
	startMin: number;
}

/** 今日时间线任务集合：今日待办口径 ∩ 有合法「开始时间」，按开始时间升序 */
export function collectTimeblockTasks(tasks: TaskItem[], today: string): TimeBlockTask[] {
	const out: TimeBlockTask[] = [];
	for (const t of getTodayTasks(tasks, today, false)) {
		const startMin = hhmmToMin(t.startTime);
		if (startMin === null) continue;
		out.push({ task: t, startMin });
	}
	return out.sort((a, b) => a.startMin - b.startMin);
}

/** 归一化时间线范围：非法回退默认 7:00–23:00，保证 end > start（至少容纳一小时） */
export function clampRange(from: string, to: string): { start: number; end: number } {
	let start = hhmmToMin(from) ?? DEFAULT_RANGE_START_MIN;
	let end = hhmmToMin(to) ?? DEFAULT_RANGE_END_MIN;
	if (start < 0) start = 0;
	if (end > 24 * 60) end = 24 * 60;
	if (end - start < 60) end = Math.min(24 * 60, start + 60);
	return { start, end };
}

/** 拖放落点（画布高度比例 0..1）→ 吸附到 SNAP_MINUTES 并钳制在 [start, end-块长] */
export function snapDropToSlot(ratio: number, start: number, end: number, snapMin: number = SNAP_MINUTES): number {
	const r = Math.max(0, Math.min(1, ratio));
	const raw = start + r * (end - start);
	const snapped = Math.round(raw / snapMin) * snapMin;
	return Math.max(start, Math.min(end - BLOCK_MINUTES, snapped));
}

export interface LaidBlock {
	task: TaskItem;
	startMin: number;
	endMin: number;
	/** 重叠簇内的分道下标（0 起） */
	lane: number;
	/** 该重叠簇的总道数（并列渲染用） */
	lanes: number;
}

/** 布局：按开始时间排序，重叠簇内贪婪分道（冲突并列渲染），块高固定 blockMin */
export function layoutBlocks(blocks: TimeBlockTask[], blockMin: number = BLOCK_MINUTES): LaidBlock[] {
	const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.task.id.localeCompare(b.task.id));
	const out: LaidBlock[] = [];
	let cluster: TimeBlockTask[] = [];
	let clusterEnd = -1;

	const flush = (): void => {
		if (!cluster.length) return;
		const laneEnds: number[] = [];
		const laneOf = new Map<string, number>();
		let laneCount = 0;
		for (const b of cluster) {
			let lane = laneEnds.findIndex((e) => e <= b.startMin);
			if (lane < 0) {
				laneEnds.push(b.startMin + blockMin);
				lane = laneEnds.length - 1;
			} else {
				laneEnds[lane] = b.startMin + blockMin;
			}
			laneOf.set(b.task.id, lane);
			laneCount = Math.max(laneCount, lane + 1);
		}
		for (const b of cluster) {
			out.push({ task: b.task, startMin: b.startMin, endMin: b.startMin + blockMin, lane: laneOf.get(b.task.id) ?? 0, lanes: laneCount });
		}
		cluster = [];
		clusterEnd = -1;
	};

	for (const b of sorted) {
		if (cluster.length && b.startMin >= clusterEnd) flush();
		cluster.push(b);
		clusterEnd = Math.max(clusterEnd, b.startMin + blockMin);
	}
	flush();
	return out;
}
