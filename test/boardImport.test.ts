import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseKanbanBoard, looksLikeKanbanBoard, defaultColumnStatus,
	buildKanbanCandidates, collectFmKeys, fmScalar, fmScalarList,
	statusFromValue, buildProjectCandidates, EMPTY_FIELD_MAP,
} from '../src/data/boardImport.ts';
import type { ProjectRecord } from '../src/data/boardImport.ts';

/* ---- 看板解析 ---- */

const BOARD = `---

kanban-plugin: board

## 待办
- [ ] 写发布说明 📅 2026-10-25 🔺 #work
- [ ] 评审方案

## 进行中
- [ ] 重构导入向导

## 已完成
- [x] 调研竞品 ✅ 2026-10-10

`;

test('kanban: 列与卡片解析（含勾选态、emoji、围栏跳过）', () => {
	const { columns, cards } = parseKanbanBoard(BOARD);
	assert.deepEqual(columns.map((c) => c.name), ['待办', '进行中', '已完成']);
	assert.equal(cards.length, 4);
	assert.equal(cards[0]?.column, '待办');
	assert.equal(cards[0]?.done, false);
	assert.equal(cards[3]?.done, true);
	assert.equal(cards[0]?.text.includes('写发布说明'), true);
	// 围栏内的 ## 与列表项不入列
	const fenced = parseKanbanBoard('```\n## 假列\n- 假卡\n```');
	assert.equal(fenced.columns.length, 0);
	assert.equal(fenced.cards.length, 0);
});

test('kanban: looksLikeKanbanBoard 识别 frontmatter 标记', () => {
	assert.equal(looksLikeKanbanBoard(BOARD), true);
	assert.equal(looksLikeKanbanBoard('# 普通笔记\n\n## 标题\n- 列表'), false);
});

test('kanban: 列名预填默认', () => {
	assert.equal(defaultColumnStatus('Done'), '已完成');
	assert.equal(defaultColumnStatus('进行中'), '进行中');
	assert.equal(defaultColumnStatus('Blocked'), '已阻塞');
	assert.equal(defaultColumnStatus('Backlog'), '待办');
	assert.equal(defaultColumnStatus('奇怪列名'), '待办');
});

/* ---- 看板候选构建 ---- */

test('kanban: 列映射→状态、忽略列、勾选卡、emoji 提取', () => {
	const { cards } = parseKanbanBoard(BOARD);
	const res = buildKanbanCandidates(
		{ cards },
		{
			sourcePath: '看板.md',
			columnStatus: { '待办': '待办', '进行中': '进行中', '已完成': '已完成' },
			defaultPriority: '重要不紧急',
			includeCompleted: false,
			existingKeys: new Set(),
		},
	);
	// 已完成列的勾选卡被 includeCompleted=false 跳过
	assert.equal(res.skipped.completed, 1);
	assert.equal(res.candidates.length, 3);
	const first = res.candidates[0]!;
	assert.equal(first.status, '待办');
	assert.equal(first.due, '2026-10-25');
	assert.equal(first.priority, '重要不紧急'); // 🔺 默认归入，可预览调整
	assert.deepEqual(first.warnings, ['priority']);
	assert.deepEqual(first.tags, ['#work']);
	assert.equal(first.content, '写发布说明');
	const second = res.candidates[2]!; // 重构导入向导（进行中列）
	assert.equal(second.status, '进行中');
});

test('kanban: ignore 列跳过 + 幂等键去重', () => {
	const { cards } = parseKanbanBoard(BOARD);
	const seen = new Set<string>();
	const first = buildKanbanCandidates({ cards }, {
		sourcePath: '看板.md',
		columnStatus: { '待办': 'ignore', '进行中': '进行中', '已完成': '已完成' },
		defaultPriority: '重要不紧急', includeCompleted: true, existingKeys: seen,
	});
	assert.equal(first.skipped.ignored, 2); // 待办列 2 张卡忽略
	const imported = first.candidates[0]!;
	seen.add(imported.key);
	const again = buildKanbanCandidates({ cards }, {
		sourcePath: '看板.md',
		columnStatus: { '待办': 'ignore', '进行中': '进行中', '已完成': '已完成' },
		defaultPriority: '重要不紧急', includeCompleted: true, existingKeys: seen,
	});
	assert.equal(again.skipped.duplicate, 1);
});

/* ---- Projects ---- */

test('projects: 键并集与标量归一（含 Date）', () => {
	const records: ProjectRecord[] = [
		{ path: 'p/a.md', fm: { name: 'A', status: 'active', due: new Date(2026, 9, 25), tags: ['x', 'y'] } },
		{ path: 'p/b.md', fm: { name: 'B', priority: '重要且紧急', complete: true } },
	];
	assert.deepEqual(collectFmKeys(records), ['complete', 'due', 'name', 'priority', 'status', 'tags']);
	assert.equal(fmScalar(new Date(2026, 9, 25)), '2026-10-25');
	assert.deepEqual(fmScalarList(['x', 'y']), ['x', 'y']);
	assert.equal(fmScalar(null), null);
});

test('projects: 状态值启发式', () => {
	assert.equal(statusFromValue('active', null), '进行中');
	assert.equal(statusFromValue('completed', null), '已完成');
	assert.equal(statusFromValue('open', null), '待办');
	assert.equal(statusFromValue('进行中', null), '进行中');
	assert.equal(statusFromValue(null, 'true'), '已完成');
	assert.equal(statusFromValue('done', 'false'), '待办'); // complete=false 优先
	assert.equal(statusFromValue('archived-ish', null), '已完成');
	assert.equal(statusFromValue('cancelled', null), '已取消');
});

test('projects: 字段映射构建候选（缺省标题回退文件名 + 幂等）', () => {
	const records: ProjectRecord[] = [
		{ path: 'P/任务A.md', fm: { title: 'A1', status: 'active', due: '2026-10-30', tags: ['w'] } },
		{ path: 'P/任务B.md', fm: { complete: true } },
	];
	const map = { title: 'title', status: 'status', priority: '', start: '', due: 'due', complete: 'complete', tags: 'tags' };
	const first = buildProjectCandidates(records, map, { existingKeys: new Set() });
	assert.equal(first.candidates.length, 2);
	const a = first.candidates[0]!;
	assert.equal(a.content, 'A1');
	assert.equal(a.status, '进行中');
	assert.equal(a.due, '2026-10-30');
	assert.deepEqual(a.tags, ['w']);
	const b = first.candidates[1]!;
	assert.equal(b.content, '任务B'); // 无 title 字段 → 文件名兜底
	assert.equal(b.status, '已完成');
	assert.deepEqual(b.notes[0], '导入自：P/任务B.md');
	// 重跑去重
	const seen = new Set(first.candidates.map((c) => c.key));
	const again = buildProjectCandidates(records, map, { existingKeys: seen });
	assert.equal(again.skipped.duplicate, 2);
	assert.equal(again.candidates.length, 0);
	// 空映射（EMPTY_FIELD_MAP）→ 全部文件名兜底 + 待办
	const bare = buildProjectCandidates(records, EMPTY_FIELD_MAP, { existingKeys: new Set() });
	assert.equal(bare.candidates[0]?.status, '待办');
	assert.equal(bare.candidates[0]?.due, null);
});
