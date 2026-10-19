/**
 * F5 性能基准跑分器（规划 F5-2 / F5-3）。
 *
 * 测的是插件热路径的纯逻辑层（随库规模扩展的支配成本），五场景与规划的映射：
 *   S1 scan        全库遍历→读取→frontmatter 解析→taskFromFm 建模（≈启动到首页可交互的主导成本）
 *   S2 home        getTodayTasks + 逾期/优先级排序 + computeWindow 虚拟窗口 + 时间块布局（≈首屏渲染数据准备）
 *   S3 views ×3    状态过滤 filterWithOrig + 排序 + computeWindow，连跑三轮（≈甘特/看板/日历切换）
 *   S4 writeback   applyFrontmatterUpdates 行级变更 + calcNextRemindDate 推进（≈拖拽改期写回，单次）
 *   S5 batch100    100 次「状态/完成时间」行级变更 + 1 次全量重扫（≈批量完成；写回与重扫分项如实报告）
 *
 * 口径声明（README 同步披露）：
 * - Obsidian 的 parseYaml / vault.cachedRead 在 Node 不可用。S1/S5 用受控子集 YAML 解析器
 *   （只解析生成器产出的平铺标量 / 行内数组 / 一层嵌套块）+ fs 读取，忠实镜像 scanAllTasks
 *   的链路与并发形态；DOM 渲染、Obsidian 索引不在基准范围。
 * - S5 的磁盘写入未计入（vault.modify 的 syscall 成本相对解析可忽略，避免污染生成库）。
 *
 * 用法：
 *   npx tsx scripts/bench.ts                    # 四档全跑
 *   npx tsx scripts/bench.ts --scale=10k        # 单档
 *   npx tsx scripts/bench.ts --scale=10k --check # 对照 scripts/bench-budgets.json 门禁（超限退出码 1）
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

/* ---- 纯模块（无 obsidian 运行时依赖） ---- */
import { taskFromFm, projectFromFm, priorityWeight } from '../src/data/taskParseCore';
import type { TaskItem } from '../src/data/taskParseCore';
import { getTodayTasks, calcNextRemindDate } from '../src/data/taskLogic';
import { computeWindow, filterWithOrig } from '../src/data/virtualList';
import { applyFrontmatterUpdates } from '../src/data/frontmatterCore';
import { collectTimeblockTasks, layoutBlocks } from '../src/data/timeBlocks';
import { collectDueTasks } from '../src/data/reminderLogic';

/* ---- args ---- */
const argStr = (name: string, def: string): string => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? (hit.split('=').slice(1).join('=') || def) : def;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);
const WARMUP = 2;
const RUNS = 3;
const SCALES = ['1k', '5k', '10k', '50k'] as const;
const SCALE_TASKS: Record<string, number> = { '1k': 1000, '5k': 5000, '10k': 10000, '50k': 50000 };
const TODAY = '2026-10-19'; // 与生成器基准日一致，保证口径确定

/* ---- 受控子集 frontmatter 解析（基准专用） ---- */
function fmBlock(content: string): string {
	const lines = content.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') return '';
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === '---') { end = i; break; }
	}
	return end === -1 ? '' : lines.slice(1, end).join('\n');
}
function scalar(v: string): unknown {
	if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
	if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
	return v.replace(/^["']|["']$/g, '');
}
function parseFmSubset(block: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!block.trim()) return out;
	const lines = block.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (!line.trim()) continue;
		const m = line.match(/^([^\s:][^:]*):\s*(.*)$/);
		if (!m) continue;
		const key = m[1]!.trim();
		const val = m[2]!.trim();
		if (val === '') {
			const nested: Record<string, unknown> = {};
			while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) {
				i++;
				const nm = (lines[i] ?? '').trim().match(/^([^:]+):\s*(.*)$/);
				if (nm) nested[nm[1]!.trim()] = scalar(nm[2]!.trim());
			}
			out[key] = nested;
		} else {
			out[key] = scalar(val);
		}
	}
	return out;
}

/* ---- vault 遍历 + 解析（镜像 TaskStore.scanAllTasks 链路） ---- */
interface ParsedVault { tasks: TaskItem[]; projectCount: number; fileCount: number }
function parseVault(root: string): ParsedVault {
	const tasks: TaskItem[] = [];
	let projectCount = 0;
	let fileCount = 0;
	const readAll = (paths: string[]): string[] => paths.map((p) => readFileSync(p, 'utf8'));
	const collectTasks = (dir: string, projectId: string, color: string): void => {
		const files: string[] = [];
		const walk = (d: string): void => {
			for (const e of readdirSync(d, { withFileTypes: true })) {
				const p = join(d, e.name);
				if (e.isDirectory()) walk(p);
				else if (e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('project-')) files.push(p);
			}
		};
		walk(dir);
		fileCount += files.length;
		const contents = readAll(files);
		for (let i = 0; i < files.length; i++) {
			const p = files[i]!;
			const content = contents[i] ?? '';
			tasks.push(taskFromFm(parseFmSubset(fmBlock(content)), content, relative(root, p), projectId, color));
		}
	};
	const walkDir = (dir: string): void => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (!e.isDirectory()) continue;
			const sub = join(dir, e.name);
			const projPath = join(sub, `project-${e.name}.md`);
			if (existsSync(projPath)) {
				projectCount++;
				const meta = projectFromFm(parseFmSubset(fmBlock(readFileSync(projPath, 'utf8'))));
				collectTasks(sub, meta.name ?? e.name, meta.color ?? '#3b82f6');
			}
			walkDir(sub);
		}
	};
	walkDir(root);
	return { tasks, projectCount, fileCount };
}

/* ---- 计时（预热 + 中位数） ---- */
function bench(fn: () => void, runs = RUNS, warmup = WARMUP): number {
	for (let i = 0; i < warmup; i++) fn();
	const times: number[] = [];
	for (let i = 0; i < runs; i++) {
		const t0 = performance.now();
		fn();
		times.push(performance.now() - t0);
	}
	times.sort((a, b) => a - b);
	return times[Math.floor(runs / 2)] as number;
}

/* ---- 场景 ---- */
function runScenarios(root: string): { scan: number; home: number; views: number; writebackOp: number; batch: number; batchRescan: number; taskCount: number; projectCount: number } {
	// S1 全库扫描→解析→建模
	const scan = bench(() => { parseVault(root); });
	const parsed = parseVault(root);
	const tasks = parsed.tasks;

	// S2 首页首屏数据准备：今日集合 + 排序 + 虚拟窗口 + 时间块布局
	const home = bench(() => {
		const today = getTodayTasks(tasks, TODAY, false);
		const sorted = [...today].sort((a, b) => {
			if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
			return priorityWeight(a.priority) - priorityWeight(b.priority);
		});
		computeWindow({ scrollTop: 0, viewportHeight: 800, rowHeight: 34, total: sorted.length, overscan: 10 });
		layoutBlocks(collectTimeblockTasks(tasks, TODAY));
		collectDueTasks(tasks, TODAY);
	});

	// S3 视图切换 ×3：过滤 + 排序 + 虚拟窗口
	const views = bench(() => {
		for (const status of ['待办', '进行中', '已完成']) {
			const { items } = filterWithOrig(tasks, (t) => t.status === status);
			const sorted = [...items].sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
			computeWindow({ scrollTop: 120, viewportHeight: 800, rowHeight: 34, total: sorted.length, overscan: 10 });
		}
	});

	// S4 拖拽改期写回（单次）：取真实生成任务文件做行级变更 + 重复推进计算；S5 批量写回复用同一批文件
	const batchFiles: { path: string; content: string }[] = [];
	const collectSome = (dir: string): void => {
		if (batchFiles.length >= 100) return;
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (batchFiles.length >= 100) return;
			if (e.isDirectory()) collectSome(p);
			else if (e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('project-')) {
				batchFiles.push({ path: p, content: readFileSync(p, 'utf8') });
			}
		}
	};
	collectSome(join(root, 'Projects'));
	if (!tasks.length || !batchFiles.length) return { scan, home, views, writebackOp: 0, batch: 0, batchRescan: 0, taskCount: tasks.length, projectCount: parsed.projectCount };
	const sampleLines = batchFiles[0]?.content ?? '';
	const repeatItem = tasks.find((t) => t.repeatRule) ?? { ...tasks[0]!, repeatRule: { '频率': '每天' } } as TaskItem;
	const writebackOp = bench(() => {
		const lines = sampleLines.split(/\r?\n/);
		applyFrontmatterUpdates(lines, { '截止日期': '2026-11-01' });
		const joined = lines.join('\n');
		calcNextRemindDate(repeatItem, new Date(2026, 9, 19));
		return joined.length > 0;
	});

	// S5 批量完成 100 条：100 次行级变更 + 1 次全量重扫（写回与重扫分项报告）
	const writePart = bench(() => {
		for (const f of batchFiles) {
			const lines = f.content.split(/\r?\n/);
			applyFrontmatterUpdates(lines, { '状态': '已完成', '完成时间': '2026-10-19 12:00' });
			lines.join('\n');
		}
	});
	const rescan = bench(() => { parseVault(root); }, 3, 0);

	return {
		scan,
		home,
		views,
		writebackOp,
		batch: writePart + rescan,
		batchRescan: rescan,
		taskCount: tasks.length,
		projectCount: parsed.projectCount,
	};
}

/* ---- 门禁 ---- */
interface Budgets { [scale: string]: { scan: number; home: number; views: number; writebackOp: number; batch: number } }
function loadBudgets(): Budgets {
	const p = new URL('./bench-budgets.json', import.meta.url);
	try {
		return JSON.parse(readFileSync(p, 'utf8')) as Budgets;
	} catch {
		return {}; // 缺文件/损坏 → 空预算（--check 会报「无可用预算」退出码 2）
	}
}

/* ---- main ---- */
function main(): void {
	const scaleArg = argStr('scale', 'all');
	const check = hasFlag('check');
	const scales = scaleArg === 'all' ? SCALES : [scaleArg as typeof SCALES[number]];
	const budgets = loadBudgets();
	const results: { scale: string; r: ReturnType<typeof runScenarios> }[] = [];

	console.log(`[bench] node=${process.version} platform=${os.platform()} cpu=${os.cpus()[0]?.model?.trim() ?? '?'} cores=${os.cpus().length}`);
	console.log(`[bench] 口径：纯逻辑热路径（详见 scripts/bench.ts 头注释与 docs/benchmarks.md）；每场景预热 ${WARMUP} 次取 ${RUNS} 次中位数\n`);

	for (const scale of scales) {
		const n = SCALE_TASKS[scale];
		if (!n) { console.error(`[bench] 未知档位 --scale=${scaleArg}（可选 ${SCALES.join('/')}/all）`); process.exit(2); }
		const root = join(process.cwd(), '.bench-vault', String(n));
		if (!existsSync(root)) {
			console.log(`[bench] 生成合成 vault：${scale} → .bench-vault/${n}`);
			execSync(`npx tsx scripts/bench-vault.ts --tasks=${n} --out=${root}`, { stdio: 'inherit' });
		}
		const sizeMiB = (statSync(root).isDirectory() ? dirSize(root) : 0) / 1024 / 1024;
		const r = runScenarios(root);
		results.push({ scale, r });
		console.log(`── ${scale}（${r.taskCount} 任务 / ${r.projectCount} 项目 / ${sizeMiB.toFixed(1)} MiB）──`);
		console.log(`  S1 scan（扫描+解析+建模）      ${r.scan.toFixed(1)} ms`);
		console.log(`  S2 home（首屏数据准备）        ${r.home.toFixed(1)} ms`);
		console.log(`  S3 views ×3（切换数据准备）    ${r.views.toFixed(1)} ms`);
		console.log(`  S4 writeback（单次写回）       ${r.writebackOp.toFixed(3)} ms/op`);
		console.log(`  S5 batch100（100 写回+重扫）   ${r.batch.toFixed(1)} ms  （重扫 ${r.batchRescan.toFixed(1)} ms）`);
		console.log('');
	}

	if (check) {
		const target = results.find((x) => x.scale === '10k') ?? results[0];
		const budget = budgets[target?.scale ?? ''];
		if (!target || !budget) { console.error('[bench] 无可用预算（scripts/bench-budgets.json 缺失或档位不符）'); process.exit(2); }
		const violations: string[] = [];
		const cmp: [string, number, number][] = [
			['S1 scan', target.r.scan, budget.scan],
			['S2 home', target.r.home, budget.home],
			['S3 views', target.r.views, budget.views],
			['S4 writeback/op', target.r.writebackOp, budget.writebackOp],
			['S5 batch100', target.r.batch, budget.batch],
		];
		for (const [name, actual, limit] of cmp) {
			const ok = actual <= limit;
			console.log(`[gate] ${name.padEnd(16)} ${actual.toFixed(1).padStart(8)} / ${limit.toFixed(1).padStart(8)} ms  ${ok ? 'OK' : '❌ 超预算'}`);
			if (!ok) violations.push(name);
		}
		if (violations.length) {
			console.error(`\n[gate] 超预算场景：${violations.join('、')}。按 docs/release-checklist.md 记录豁免原因或先做优化。`);
			process.exit(1);
		}
		console.log('[gate] 全部场景在预算内 ✅');
	}
}

function dirSize(dir: string): number {
	let total = 0;
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) total += dirSize(p);
		else total += statSync(p).size;
	}
	return total;
}


main();
