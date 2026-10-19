import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskItem } from '../src/data/taskParser.ts';
import {
	hhmmToMin, minToHHmm, collectTimeblockTasks, clampRange, snapDropToSlot, layoutBlocks,
} from '../src/data/timeBlocks.ts';

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

/* ---- hhmmToMin / minToHHmm ---- */

test('time: HH:MM 解析与非法输入', () => {
	assert.equal(hhmmToMin('14:00'), 840);
	assert.equal(hhmmToMin('07:05'), 425);
	assert.equal(hhmmToMin('24:00'), null);
	assert.equal(hhmmToMin('7:5'), null);
	assert.equal(hhmmToMin('abc'), null);
	assert.equal(hhmmToMin(null), null);
});

test('time: minToHHmm 往返与钳制', () => {
	assert.equal(minToHHmm(840), '14:00');
	assert.equal(minToHHmm(0), '00:00');
	assert.equal(minToHHmm(24 * 60), '23:59');
	assert.equal(minToHHmm(-5), '00:00');
	assert.equal(minToHHmm(hhmmToMin('09:30')!), '09:30');
});

/* ---- collectTimeblockTasks：今日口径 ∩ 有开始时间 ---- */

test('collect: 今日任务且有开始时间才上时间线', () => {
	const tasks = [
		makeTask({ id: 'a', dueDate: '2026-10-19', startTime: '14:00', content: 'A' }),
		makeTask({ id: 'b', dueDate: '2026-10-19', content: 'B' }), // 无开始时间
		makeTask({ id: 'c', dueDate: '2026-10-25', startTime: '09:00', content: 'C' }), // 非今日
	];
	const got = collectTimeblockTasks(tasks, '2026-10-19');
	assert.equal(got.length, 1);
	assert.equal(got[0]!.task.id, 'a');
	assert.equal(got[0]!.startMin, 840);
});

test('collect: 重复任务按 remindDate 归属；非法开始时间排除；已完成排除', () => {
	const tasks = [
		makeTask({ id: 'r', type: '重复', remindDate: '2026-10-19', startTime: '08:30', content: 'R' }),
		makeTask({ id: 'x', dueDate: '2026-10-19', startTime: '25:99', content: 'X' }),
		makeTask({ id: 'd', dueDate: '2026-10-19', startTime: '10:00', status: '已完成', content: 'D' }),
	];
	const got = collectTimeblockTasks(tasks, '2026-10-19');
	assert.equal(got.length, 1);
	assert.equal(got[0]!.task.id, 'r');
});

/* ---- clampRange / snapDropToSlot ---- */

test('range: 默认 7:00–23:00，非法回退，过窄拉到一小时', () => {
	assert.deepEqual(clampRange('07:00', '23:00'), { start: 420, end: 1380 });
	assert.deepEqual(clampRange('25:00', 'abc'), { start: 420, end: 1380 });
	assert.deepEqual(clampRange('22:00', '22:30'), { start: 1320, end: 1380 });
});

test('snap: 落点吸附 15 分钟并钳制范围', () => {
	assert.equal(snapDropToSlot(0.5, 420, 1380), 900);
	assert.equal(snapDropToSlot(-1, 420, 1380), 420);
	assert.equal(snapDropToSlot(1, 420, 1380), 1380 - 60);
	assert.equal(snapDropToSlot(0.512, 420, 1380), 915);
});

/* ---- layoutBlocks：重叠分道 ---- */

test('layout: 无重叠单道；重叠并列多道', () => {
	const mk = (id: string, m: number) => ({ task: makeTask({ id, content: id }), startMin: m });
	const one = layoutBlocks([mk('a', 480)]);
	assert.equal(one[0]!.lanes, 1);
	const two = layoutBlocks([mk('a', 480), mk('b', 510)]);
	assert.deepEqual(two.map((x) => [x.task.id, x.lane, x.lanes]), [['a', 0, 2], ['b', 1, 2]]);
});

test('layout: 簇结束后道可复用（A 8:00 / B 8:30 / C 9:05 → 两道）', () => {
	const mk = (id: string, m: number) => ({ task: makeTask({ id, content: id }), startMin: m });
	const laid = layoutBlocks([mk('a', 480), mk('b', 510), mk('c', 545)]);
	assert.deepEqual(laid.map((x) => [x.task.id, x.lane, x.lanes]), [
		['a', 0, 2], ['b', 1, 2], ['c', 0, 2],
	]);
});
