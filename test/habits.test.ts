import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseHabit, serializeCheckins, toggleCheckin, isDone, lastNDays,
	weekStartOf, computeStreak, DEFAULT_HABIT_COLOR,
} from '../src/data/habits.ts';
import type { HabitDef } from '../src/data/habits.ts';
import { applyFrontmatterUpdates } from '../src/data/frontmatterCore.ts';

function makeHabit(partial: Partial<HabitDef> = {}): HabitDef {
	return {
		path: '习惯/阅读.md', name: '每日阅读', color: DEFAULT_HABIT_COLOR,
		freq: '每天', target: 3, checkins: [],
		...partial,
	};
}

/* ---- parseHabit ---- */

test('parse: 无「习惯/打卡」键的文件返回 null（普通笔记不误判）', () => {
	assert.equal(parseHabit('x.md', {}), null);
	assert.equal(parseHabit('x.md', { 标题: '随手记' }), null);
});

test('parse: 默认值与频率/目标收敛', () => {
	const h = parseHabit('x.md', { 习惯: '阅读' })!;
	assert.equal(h.name, '阅读');
	assert.equal(h.freq, '每天');
	assert.equal(h.target, 3);
	assert.equal(h.color, DEFAULT_HABIT_COLOR);
	assert.deepEqual(h.checkins, []);
	const w = parseHabit('x.md', { 习惯: '健身', 频率: '每周', 目标: 99, 颜色: ' #ff0000 ' })!;
	assert.equal(w.freq, '每周');
	assert.equal(w.target, 7); // 钳制 1..7
	assert.equal(w.color, '#ff0000');
});

test('parse: 打卡数组过滤非法日期并去重排序', () => {
	const h = parseHabit('x.md', { 打卡: ['2026-10-03', 'bad', '2026-10-01', '2026-10-03'] })!;
	assert.deepEqual(h.checkins, ['2026-10-01', '2026-10-03']);
});

/* ---- 打卡数组 ---- */

test('toggle: 加/删/去重且不改原数组', () => {
	const h = makeHabit({ checkins: ['2026-10-02'] });
	const added = toggleCheckin(h, '2026-10-01');
	assert.deepEqual(added, ['2026-10-01', '2026-10-02']);
	const removed = toggleCheckin({ ...h, checkins: added }, '2026-10-01');
	assert.deepEqual(removed, ['2026-10-02']);
	assert.deepEqual(h.checkins, ['2026-10-02']); // 原数组不变
	assert.deepEqual(serializeCheckins(['2026-10-02', 'bad', '2026-10-02']), ['2026-10-02']);
});

test('isDone / lastNDays / weekStartOf', () => {
	const h = makeHabit({ checkins: ['2026-10-18'] });
	assert.equal(isDone(h, '2026-10-18'), true);
	assert.equal(isDone(h, '2026-10-19'), false);
	const days = lastNDays(7, '2026-10-19');
	assert.equal(days.length, 7);
	assert.equal(days[0], '2026-10-13');
	assert.equal(days[6], '2026-10-19');
	assert.equal(weekStartOf('2026-10-19'), '2026-10-19'); // 周一
	assert.equal(weekStartOf('2026-10-18'), '2026-10-12'); // 周日 → 上周一
});

/* ---- 连击：每天 ---- */

test('streak 每天：连续计数，今天未打从昨天起算，缺口即断', () => {
	const done = (dates: string[]) => makeHabit({ checkins: dates });
	// 今天打了：18/19 连续
	assert.equal(computeStreak(done(['2026-10-17', '2026-10-18', '2026-10-19']), '2026-10-19'), 3);
	// 今天没打：从昨天起算
	assert.equal(computeStreak(done(['2026-10-17', '2026-10-18']), '2026-10-19'), 2);
	// 昨天断了
	assert.equal(computeStreak(done(['2026-10-15', '2026-10-16', '2026-10-19']), '2026-10-19'), 1);
	assert.equal(computeStreak(done([]), '2026-10-19'), 0);
});

/* ---- 连击：每周（断档容忍）---- */

test('streak 每周：达标周连续计数，进行中的本周未达标不断档', () => {
	// 2026-10-19 是周一。上周（10-12~10-18）打卡 3 次 ≥ 目标 3 → 连击 1
	const h = makeHabit({ freq: '每周', target: 3, checkins: ['2026-10-12', '2026-10-13', '2026-10-14'] });
	assert.equal(computeStreak(h, '2026-10-19'), 1);
	// 本周（10-19~）又打 3 次 → 2
	h.checkins = [...h.checkins, '2026-10-19', '2026-10-20', '2026-10-21'].sort();
	assert.equal(computeStreak(h, '2026-10-21'), 2);
	// 上上周（10-05~10-11）也 3 次 → 3
	h.checkins = [...h.checkins, '2026-10-05', '2026-10-06', '2026-10-07'].sort();
	assert.equal(computeStreak(h, '2026-10-21'), 3);
});

test('streak 每周：整周未达标才断；缺席单日不断', () => {
	// 上周只打 1 次（< 3）→ 断，连击 0（本周进行中不计）
	const broken = makeHabit({ freq: '每周', target: 3, checkins: ['2026-10-13'] });
	assert.equal(computeStreak(broken, '2026-10-19'), 0);
	// 上周 3 次达标；本周进行中只打 1 次 → 不断（容忍缺席单日）
	const tolerant = makeHabit({ freq: '每周', target: 3, checkins: ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19'] });
	assert.equal(computeStreak(tolerant, '2026-10-19'), 1);
});

/* ---- 写入器数组值（F6 打卡记录写 frontmatter 行内数组）---- */

test('frontmatter 写入器：字符串数组序列化为行内数组', () => {
	const lines = ['---', '习惯: 阅读', '打卡: [2026-10-01]', '---', '# 阅读'];
	applyFrontmatterUpdates(lines, { '打卡': ['2026-10-01', '2026-10-02', '2026-10-03'] });
	assert.deepEqual(lines, ['---', '习惯: 阅读', '打卡: [2026-10-01, 2026-10-02, 2026-10-03]', '---', '# 阅读']);
	// 无该字段时插入
	const lines2 = ['---', '习惯: 阅读', '---'];
	applyFrontmatterUpdates(lines2, { '打卡': ['2026-10-01'] });
	assert.deepEqual(lines2, ['---', '习惯: 阅读', '打卡: [2026-10-01]', '---']);
	// 需要转义的值在数组内安全
	const lines3 = ['---', '打卡: []'];
	applyFrontmatterUpdates(lines3, { '打卡': ['a: b'] });
	assert.equal(lines3[1], '打卡: ["a: b"]');
});
