/**
 * F5 性能基准 — 合成 vault 生成器（规划 F5-1）。
 *
 * 按 1k / 5k / 10k / 50k 任务四档生成「任务（一任务一文件）/ 项目（project-*.md）/
 * 灵感看板（看板.md）/ 普通笔记（无 frontmatter）」混合数据，固定随机种子保证
 * 各次生成完全一致（跑分可复现、可对比）。
 *
 * 用法：npx tsx scripts/bench-vault.ts --tasks=10000 --out=.bench-vault/10k
 * 结构（镜像 TaskStore 扫描语义）：projectsRoot/<项目-N>/project-项目-N.md + 任务文件。
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/* ---- args ---- */
function argStr(name: string, def: string): string {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? (hit.split('=').slice(1).join('=') || def) : def;
}
function argNum(name: string, def: number): number {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	const n = hit ? parseInt(hit.split('=')[1] ?? '', 10) : NaN;
	return Number.isFinite(n) && n > 0 ? n : def;
}

const total = argNum('tasks', 10000);
const out = argStr('out', `.bench-vault/${total}`);
const PROJECTS_ROOT = join(out, 'Projects');
const SEED = 20261019;

/* ---- deterministic PRNG（mulberry32）---- */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(SEED);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T;
const dateStr = (offsetDays: number): string => {
	const d = new Date(2026, 9, 19);
	d.setDate(d.getDate() + offsetDays);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---- 分布 ---- */
const STATUSES = ['待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '待办', '已完成', '已完成', '已取消'] as const;
const PRIOS = ['重要且紧急', '重要不紧急', '重要不紧急', '紧急不重要', '不重要不紧急'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const TAG_POOL = ['work', 'bench', 'urgent', 'review', 'sprint'] as const;

const BODY = '基准占位正文。这一行模拟用户在任务文件里写的上下文备注，让文件体积接近真实vault。'.repeat(3);

function taskFile(name: string): string {
	const status = pick(STATUSES);
	const isRepeat = status === '待办' && rand() < 0.12;
	const multiDay = rand() < 0.08;
	const due = dateStr(Math.floor(rand() * 90) - 10);
	const lines: string[] = ['---', `状态: ${status}`];
	if (rand() < 0.8) lines.push(`优先级: ${pick(PRIOS)}`);
	if (multiDay) lines.push(`开始日期: ${dateStr(-Math.floor(rand() * 10) - 1)}`);
	lines.push(`截止日期: ${due}`);
	if (isRepeat) {
		lines.push('类型: 重复');
		if (rand() < 0.5) lines.push(`重复规则:\n  频率: 每周\n  每周几: [${pick(WEEKDAYS)}, ${pick(WEEKDAYS)}]`);
		else if (rand() < 0.5) lines.push(`重复规则:\n  频率: 每天`);
		else lines.push(`重复规则:\n  频率: 每月\n  每月几号: ${1 + Math.floor(rand() * 28)}`);
		lines.push(`提醒日期: ${dateStr(Math.floor(rand() * 7))}`);
	} else if (rand() < 0.6) {
		lines.push(`提醒日期: ${dateStr(Math.floor(rand() * 14) - 3)}`);
	}
	if (status === '已完成') lines.push(`完成时间: ${dateStr(-1)}`);
	if (rand() < 0.5) lines.push(`提醒: [${pick(['任务当天', '提前 1 天', '提前 3 天', '提前 1 周'])}]`);
	if (rand() < 0.5) lines.push(`tags: [${pick(TAG_POOL)}, ${pick(TAG_POOL)}]`);
	lines.push(`备注: ${name} 的基准备注（seed=${SEED}）`);
	lines.push('---', '', `# ${name}`, '', BODY, '');
	return lines.join('\n');
}

function projectFile(name: string, stage: number): string {
	return [
		'---',
		`项目名称: ${name}`,
		'颜色: #3b82f6',
		'项目类型: 阶段项目',
		'tags: [配置]',
		'描述: F5 基准合成项目',
		`阶段: ${stage}`,
		'创建时间: 2026-01-01',
		'---', '', `# ${name}`, '',
	].join('\n');
}

/* ---- 生成 ---- */
if (existsSync(out)) {
	rmSync(out, { recursive: true });
}
mkdirSync(PROJECTS_ROOT, { recursive: true });

const projectCount = Math.max(2, Math.round(total / 250));
const perProject = Math.ceil(total / projectCount);
let taskWritten = 0;
let bytes = 0;
const write = (p: string, s: string): void => { bytes += Buffer.byteLength(s); writeFileSync(p, s); };

for (let p = 0; p < projectCount; p++) {
	const pname = `项目-${String(p).padStart(4, '0')}`;
	const dir = join(PROJECTS_ROOT, pname);
	mkdirSync(dir, { recursive: true });
	write(join(dir, `project-${pname}.md`), projectFile(pname, p % 5));
	for (let t = 0; t < perProject && taskWritten < total; t++, taskWritten++) {
		write(join(dir, `任务-${String(p).padStart(4, '0')}-${String(t).padStart(5, '0')}.md`), taskFile(`任务 ${p}-${t}`));
	}
}

// 普通笔记（无 frontmatter，压「跳过」路径）+ 灵感看板（单文件多条目）
mkdirSync(join(out, 'Notes'), { recursive: true });
const noteCount = Math.max(10, Math.round(total / 10));
for (let n = 0; n < Math.min(noteCount, 2000); n++) {
	write(join(out, 'Notes', `笔记-${String(n).padStart(5, '0')}.md`), `# 笔记 ${n}\n\n${BODY}\n`);
}
const oppCount = Math.max(20, Math.round(total / 50));
const oppLines: string[] = ['# 看板', ''];
for (let i = 0; i < oppCount; i++) {
	oppLines.push(`- **想法 ${i}**：阶段${i % 5} · 星标${i % 3 === 0 ? '是' : '否'} · ${BODY.slice(0, 40)}`);
}
write(join(out, '看板.md'), oppLines.join('\n') + '\n');

console.log(`[bench-vault] tasks=${taskWritten} projects=${projectCount} notes=${Math.min(noteCount, 2000)} opp=${oppCount}`);
console.log(`[bench-vault] files≈${taskWritten + projectCount * 2 + Math.min(noteCount, 2000) + 1} bytes=${(bytes / 1024 / 1024).toFixed(1)}MiB out=${out}`);
if (taskWritten < total) console.warn(`[bench-vault] WARN: 请求 ${total} 实写 ${taskWritten}`);

