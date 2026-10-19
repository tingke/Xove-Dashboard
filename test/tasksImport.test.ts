import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseTasksLine, scanTasksSyntax, mapRecurrence, importKey,
	sanitizeImportFilename, buildCandidates, buildTaskFileMd,
} from '../src/data/tasksImport.ts';
import type { ImportCandidateOptions, RecurrenceMap } from '../src/data/tasksImport.ts';

/** 断言可映射并收窄类型（联合类型上直接取 .rule 无法通过 tsc） */
function mustMap(raw: string): Extract<RecurrenceMap, { mapped: true }> {
	const r = mapRecurrence(raw);
	if (!r.mapped) throw new Error('expected mapped: ' + raw);
	return r;
}

/* ---- parseTasksLine：行解析 ---- */

test('parse: 非 checkbox 行返回 null', () => {
	assert.equal(parseTasksLine('普通文本行', 1), null);
	assert.equal(parseTasksLine('- 无括号列表', 1), null);
	assert.equal(parseTasksLine('1. 有序列表', 1), null);
});

test('parse: 待办行拆出 📅🛫⏳ 与正文', () => {
	const p = parseTasksLine('- [ ] 评审竞品调研报告 📅 2026-10-20 🛫 2026-10-12 ⏳ 2026-10-15', 3)!;
	assert.equal(p.state, 'todo');
	assert.equal(p.lineNo, 3);
	assert.equal(p.content, '评审竞品调研报告');
	assert.equal(p.due, '2026-10-20');
	assert.equal(p.start, '2026-10-12');
	assert.equal(p.scheduled, '2026-10-15');
	assert.equal(p.priorityEmoji, null);
});

test('parse: 已完成 / 取消行与 ✅ 完成日期', () => {
	const d = parseTasksLine('- [X] 写周报 ✅ 2026-10-10', 1)!;
	assert.equal(d.state, 'done');
	assert.equal(d.completedDate, '2026-10-10');
	const c = parseTasksLine('- [-] 废弃项', 1)!;
	assert.equal(c.state, 'cancelled');
});

test('parse: 优先级 emoji + tags + ⛔ 依赖', () => {
	const p = parseTasksLine('- [ ] 交付方案 🔺 #work/urgent ⛔ abc123, def456', 1)!;
	assert.equal(p.priorityEmoji, '🔺');
	assert.deepEqual(p.tags, ['#work/urgent']);
	assert.deepEqual(p.depIds, ['abc123', 'def456']);
	assert.equal(p.content, '交付方案');
});

test('parse: marker 参数的剩余文字并回正文（不吞字）', () => {
	const p = parseTasksLine('- [ ] 任务 A 📅 2026-10-20 很急 ⏫ 备注', 1)!;
	assert.equal(p.content, '任务 A 很急 备注');
	assert.equal(p.priorityEmoji, '⏫');
	assert.equal(p.due, '2026-10-20');
});

test('parse: 🔁 原文到下一个 marker 为止', () => {
	const p = parseTasksLine('- [ ] 每日站会 🔁 every week on Monday, Wednesday 📅 2026-10-20', 1)!;
	assert.equal(p.recurrenceRaw, 'every week on Monday, Wednesday');
	assert.equal(p.due, '2026-10-20');
});

test('scan: 跳过代码围栏内的行', () => {
	const md = ['- [ ] a 📅 2026-10-20', '```', '- [ ] b', '```', '', '- [x] c ✅ 2026-10-01'].join('\n');
	const lines = scanTasksSyntax(md);
	assert.equal(lines.length, 2);
	assert.equal(lines[0]!.content, 'a');
	assert.equal(lines[1]!.state, 'done');
});

/* ---- mapRecurrence：五种规则映射 ---- */

test('recurrence: 每天 / 每 N 天', () => {
	assert.deepEqual(mapRecurrence('every day'), { mapped: true, type: '重复', rule: { '频率': '每天' }, whenDone: false });
	assert.deepEqual(mapRecurrence('every 3 days'), { mapped: true, type: '重复', rule: { '频率': '每天', '间隔天数': 3 }, whenDone: false });
});

test('recurrence: 工作日 / 每周 / 每周几', () => {
	assert.deepEqual(mapRecurrence('every weekday'), { mapped: true, type: '重复', rule: { '频率': '工作日' }, whenDone: false });
	assert.deepEqual(mustMap('every workday').rule, { '频率': '工作日' });
	assert.deepEqual(mustMap('every week').rule, { '频率': '每周' });
	assert.deepEqual(mustMap('every week on Monday and Wednesday').rule, { '频率': '每周', '每周几': [1, 3] });
	assert.deepEqual(mustMap('every week on mon,fri').rule, { '频率': '每周', '每周几': [1, 5] });
});

test('recurrence: 每月 / 每月几号', () => {
	assert.deepEqual(mustMap('every month').rule, { '频率': '每月' });
	assert.deepEqual(mustMap('every month on the 15th').rule, { '频率': '每月', '每月几号': 15 });
	assert.deepEqual(mustMap('every month on 31').rule, { '频率': '每月', '每月几号': 31 });
});

test('recurrence: 不可映射规则返回 unmapped', () => {
	assert.equal(mapRecurrence('every 2 weeks').mapped, false);
	assert.equal(mapRecurrence('every year').mapped, false);
	assert.equal(mapRecurrence('every 4th monday of month').mapped, false);
	assert.equal(mapRecurrence('every month on the last friday').mapped, false);
});

test('recurrence: when done 标记保留且不影响节奏映射', () => {
	const r = mapRecurrence('every day when done');
	assert.ok(r.mapped && r.whenDone);
	assert.deepEqual(r.rule, { '频率': '每天' });
});

/* ---- importKey / sanitizeImportFilename ---- */

test('key: 去 checkbox 状态、折叠空白；区分源路径', () => {
	assert.equal(importKey('a.md', '- [x] 任务 📅 2026-10-20'), importKey('a.md', '- [ ]  任务 📅 2026-10-20'));
	assert.notEqual(importKey('a.md', '- [ ] x'), importKey('b.md', '- [ ] x'));
});

test('filename: 非法字符清洗、限长与兜底', () => {
	assert.equal(sanitizeImportFilename('a/b:c*d?"<>|'), 'a b c d');
	assert.equal(sanitizeImportFilename('///'), '未命名任务');
	assert.ok(sanitizeImportFilename('x'.repeat(100)).length <= 80);
	assert.ok(!sanitizeImportFilename('任务:一章').includes(':'));
});

/* ---- buildCandidates：映射表 + 跳过 + 幂等 ---- */

function opts(over: Partial<ImportCandidateOptions> = {}): ImportCandidateOptions {
	return {
		sourcePath: 'notes/t.md',
		defaultPriority: '重要不紧急',
		includeCompleted: false,
		existingKeys: new Set<string>(),
		today: '2026-10-18',
		...over,
	};
}

const SAMPLE = [
	'- [ ] 待办任务 📅 2026-10-20 ⏳ 2026-10-15 🔁 every 3 days',
	'- [x] 已完成 ✅ 2026-10-10',
	'- [-] 已取消',
	'- [ ] 一次性任务 🔁 every 2 weeks',
	'- [ ] 带优先级 🔺',
	'- [ ] 简单任务 📅 2026-10-20',
].join('\n');

test('candidates: 默认跳过已完成/已取消，其余全部成为候选', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	assert.equal(res.candidates.length, 4);
	assert.deepEqual(res.skipped, { completed: 1, cancelled: 1, duplicate: 0 });
});

test('candidates: 📅→截止 / ⏳→提醒日期 / 🔁可映射→重复', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const c = res.candidates[0]!;
	assert.equal(c.type, '重复');
	assert.deepEqual(c.repeatRule, { '频率': '每天', '间隔天数': 3 });
	assert.equal(c.remindDate, '2026-10-15');
	assert.equal(c.due, '2026-10-20');
	assert.equal(c.status, '待办');
	assert.ok(c.key.startsWith('notes/t.md::'));
});

test('candidates: 不可映射重复 → 普通任务 + 警示 + 备注原文', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const c = res.candidates.find((x) => x.content === '一次性任务')!;
	assert.equal(c.type, '普通');
	assert.equal(c.repeatRule, null);
	assert.ok(c.warnings.includes('recurrence'));
	assert.ok(c.notes.some((n) => n.includes('every 2 weeks')));
});

test('candidates: 单轴优先级默认归入并警示（不同构不猜测）', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const c = res.candidates.find((x) => x.content === '带优先级')!;
	assert.equal(c.priority, '重要不紧急');
	assert.equal(c.priorityEmoji, '🔺');
	assert.ok(c.warnings.includes('priority'));
	const plain = res.candidates.find((x) => x.content === '简单任务')!;
	assert.equal(plain.priority, null);
	assert.equal(plain.warnings.length, 0);
});

test('candidates: includeCompleted 导入为已完成归档（完成时间取 ✅）', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts({ includeCompleted: true }));
	assert.equal(res.candidates.length, 6);
	const done = res.candidates.find((x) => x.status === '已完成')!;
	assert.equal(done.completeTime, '2026-10-10');
	const cancelled = res.candidates.find((x) => x.status === '已取消')!;
	assert.ok(cancelled);
});

test('candidates: 幂等——命中已有键的行跳过并计数', () => {
	const first = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts({
		existingKeys: new Set([first.candidates[0]!.key]),
	}));
	assert.equal(res.skipped.duplicate, 1);
	assert.equal(res.candidates.length, 3);
});

test('candidates: 备注含导入来源（路径 + 行号）', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const c = res.candidates[0]!;
	assert.ok(c.notes.some((n) => n.includes('notes/t.md') && n.includes('第 1 行')));
});

/* ---- buildTaskFileMd：文件格式对齐 createTaskFile 先例 ---- */

test('file: 重复任务 frontmatter + 链接字段 + 正文标题', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const md = buildTaskFileMd(res.candidates[0]!, 'Tasks 导入');
	assert.ok(md.startsWith('---\n'));
	assert.ok(md.includes('状态: 待办'));
	assert.ok(md.includes('截止日期: 2026-10-20'));
	assert.ok(md.includes('类型: 重复'));
	assert.ok(md.includes('重复规则:'));
	assert.ok(md.includes('  频率: 每天'));
	assert.ok(md.includes('  间隔天数: 3'));
	assert.ok(md.includes('提醒日期: 2026-10-15'));
	assert.ok(md.includes('链接: "[[notes/t.md]]"')); // [[..]] 裸写会被 YAML 解析为 flow 数组，必须引号包裹
	assert.ok(md.includes('项目: Tasks 导入'));
	assert.ok(md.trimEnd().endsWith('# 待办任务'));
});

test('file: 普通任务无提醒日期字段、优先级缺省不写', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const c = res.candidates.find((x) => x.content === '简单任务')!;
	const md = buildTaskFileMd(c, 'P');
	assert.ok(!md.includes('提醒日期'));
	assert.ok(!md.includes('优先级'));
	assert.ok(md.includes('截止日期: 2026-10-20'));
});

test('file: 备注多行安全序列化（yamlScalar 引号包裹）', () => {
	const res = buildCandidates(scanTasksSyntax(SAMPLE), opts());
	const c = res.candidates.find((x) => x.content === '一次性任务')!;
	const md = buildTaskFileMd(c, 'P');
	// 多行备注应为 JSON 双引号标量（含 \n 转义），不破坏 YAML 结构
	assert.ok(/^备注: "/m.test(md));
});
