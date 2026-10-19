import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskItem } from '../src/data/taskParser.ts';
import {
	reminderOffsetDays, collectDueTasks, isInDndWindow, shiftDate, todayStr, dueHitOffset,
} from '../src/data/reminderLogic.ts';

function makeTask(partial: Partial<TaskItem> = {}): TaskItem {
	return {
		id: 'p/t.md', content: 't', status: '待办', priority: null,
		startDate: null, dueDate: null, startTime: null, tags: [], type: '普通',
		repeatRule: null, reminder: [], notes: '', completeTime: null,
		dailyNodes: {}, projectId: 'p', color: '#fff', sourceFile: 'p/t.md',
		isOverdue: false, remindDate: null, parent: '', deps: [],
		archived: false,
		...partial,
	};
}

/* ---- reminderOffsetDays：中英文案 → 提前天数 ---- */

test('offset: 任务当天 / On the day → 0', () => {
	assert.equal(reminderOffsetDays('任务当天'), 0);
	assert.equal(reminderOffsetDays('当天'), 0);
	assert.equal(reminderOffsetDays('On the day'), 0);
});

test('offset: 中文提前 N 天/周', () => {
	assert.equal(reminderOffsetDays('提前 1 天'), 1);
	assert.equal(reminderOffsetDays('提前 3 天'), 3);
	assert.equal(reminderOffsetDays('提前 1 周'), 7);
	assert.equal(reminderOffsetDays('提前2天'), 2);
});

test('offset: 英文 N day(s)/week(s) before', () => {
	assert.equal(reminderOffsetDays('1 day before'), 1);
	assert.equal(reminderOffsetDays('3 days before'), 3);
	assert.equal(reminderOffsetDays('1 week before'), 7);
});

test('offset: 无法识别的串（如时间 09:00）返回 null', () => {
	assert.equal(reminderOffsetDays('09:00'), null);
	assert.equal(reminderOffsetDays(''), null);
	assert.equal(reminderOffsetDays('随时'), null);
});

/* ---- collectDueTasks ---- */

test('due: 截止日当天命中（任务当天）', () => {
	const tasks = [makeTask({ id: 'a.md', content: 'A', dueDate: '2026-10-14', reminder: ['任务当天'] })];
	assert.equal(collectDueTasks(tasks, '2026-10-14').length, 1);
});

test('due: 提前 3 天命中', () => {
	const tasks = [makeTask({ id: 'a.md', content: 'A', dueDate: '2026-10-17', reminder: ['提前 3 天'] })];
	assert.equal(collectDueTasks(tasks, '2026-10-14').length, 1);
	// 非命中日
	assert.equal(collectDueTasks(tasks, '2026-10-15').length, 0);
});

test('due: 已逾期任务不进单任务提醒（走启动汇总）', () => {
	const tasks = [makeTask({ id: 'a.md', content: 'A', dueDate: '2026-10-10', reminder: ['任务当天'] })];
	assert.equal(collectDueTasks(tasks, '2026-10-14').length, 0);
});

test('due: 已完成/已取消/今日已完成跳过', () => {
	assert.equal(collectDueTasks([makeTask({ status: '已完成', dueDate: '2026-10-14', reminder: ['任务当天'] })], '2026-10-14').length, 0);
	assert.equal(collectDueTasks([makeTask({ status: '已取消', dueDate: '2026-10-14', reminder: ['任务当天'] })], '2026-10-14').length, 0);
	assert.equal(collectDueTasks([makeTask({ completeTime: '2026-10-14 09:00', dueDate: '2026-10-14', reminder: ['任务当天'] })], '2026-10-14').length, 0);
});

test('due: 重复任务 remindDate <= 今天 命中一次（错过保持可达）', () => {
	const tasks = [
		makeTask({ type: '重复', remindDate: '2026-10-14' }),
		makeTask({ type: '重复', remindDate: '2026-10-10' }),
		makeTask({ type: '重复', remindDate: '2026-10-20' }),
	];
	assert.equal(collectDueTasks(tasks, '2026-10-14').length, 2);
});

test('due: 同一任务多个提醒选项同日命中只算一条（Set 去重）', () => {
	// 提前 1 天 与 提前 3 天 不可能同日命中同一截止日；构造两个不同选项跨任务验证：
	const tasks = [makeTask({ id: 'a.md', dueDate: '2026-10-15', reminder: ['提前 1 天', '提前 3 天'] })];
	assert.equal(collectDueTasks(tasks, '2026-10-14').length, 1);
});

/* ---- dueHitOffset：TODO 卡「今日到期」徽标 ---- */

test('dueHitOffset: 命中返回提前天数（0 = 任务当天）', () => {
	const t = makeTask({ dueDate: '2026-10-14', reminder: ['任务当天', '提前 1 天'] });
	assert.equal(dueHitOffset(t, '2026-10-14'), 0);
	assert.equal(dueHitOffset(t, '2026-10-13'), 1);
	assert.equal(dueHitOffset(t, '2026-10-12'), null);
});

test('dueHitOffset: 已完成 / 已逾期 / 无提醒不命中；重复任务按 remindDate', () => {
	assert.equal(dueHitOffset(makeTask({ status: '已完成', dueDate: '2026-10-14', reminder: ['任务当天'] }), '2026-10-14'), null);
	assert.equal(dueHitOffset(makeTask({ dueDate: '2026-10-10', reminder: ['任务当天'] }), '2026-10-14'), null);
	assert.equal(dueHitOffset(makeTask({ dueDate: '2026-10-14' }), '2026-10-14'), null);
	assert.equal(dueHitOffset(makeTask({ type: '重复', remindDate: '2026-10-14' }), '2026-10-14'), 0);
});

/* ---- isInDndWindow ---- */

test('dnd: 普通时段', () => {
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 23, 0), '22:00', '08:00'), true);
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 12, 0), '22:00', '08:00'), false);
});

test('dnd: 跨零点 22:00–08:00', () => {
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 7, 59), '22:00', '08:00'), true);
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 8, 0), '22:00', '08:00'), false);
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 21, 59), '22:00', '08:00'), false);
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 22, 0), '22:00', '08:00'), true);
});

test('dnd: 非法或相等起止视为未启用', () => {
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 23, 0), 'abc', '08:00'), false);
	assert.equal(isInDndWindow(new Date(2026, 9, 14, 23, 0), '22:00', '22:00'), false);
});

/* ---- 日期工具 ---- */

test('shiftDate / todayStr', () => {
	assert.equal(shiftDate('2026-10-14', -3), '2026-10-11');
	assert.equal(shiftDate('2026-10-01', -1), '2026-09-30');
	assert.equal(shiftDate('bad', 1), 'bad');
	assert.match(todayStr(new Date(2026, 9, 5)), /^2026-10-05$/);
});
