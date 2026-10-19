import { TFile } from 'obsidian';
import type { App } from 'obsidian';

/* ============================================================
   统一的 frontmatter 写入器 —— 全插件唯一实现。
   此前 ProjectBoard 有 4 处、DashboardView 有 2 处各自手写
   行级扫描写入：ProjectBoard 版本不处理 CRLF（会把整份文件的
   换行符改写），且所有版本都不转义值 —— 描述/备注里出现换行、
   ": "、行首 "#" 等会直接破坏 YAML 结构。这里统一修复：
   1. 值经 yamlScalar() 序列化（裸写 or 双引号转义），字符串数组
      序列化为 YAML 行内数组（F6 习惯打卡记录）；
   2. CRLF-safe（按文件原有换行符回写）；
   3. value === null 表示删除该字段。
   纯逻辑本体在 frontmatterCore.ts（无 Obsidian 依赖，测试链与
   F5 性能基准共用同一实现），此处只保留 Obsidian 文件 IO。
   ============================================================ */

import { applyFrontmatterUpdates } from './frontmatterCore';

/** YAML 标量安全序列化：实现在纯模块 yamlScalar.ts（测试链可用），此处按原签名 re-export。 */
export { yamlScalar } from './yamlScalar';

/** 行级 frontmatter 变更（纯逻辑）按原签名 re-export。 */
export { applyFrontmatterUpdates };

/** Read a file and apply frontmatter field updates (create if missing; null = delete). CRLF-safe. */
export async function writeFrontmatter(app: App, file: TFile, updates: Record<string, string | string[] | null>): Promise<void> {
	const content = await app.vault.read(file);
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.split(/\r?\n/);
	applyFrontmatterUpdates(lines, updates);
	await app.vault.modify(file, lines.join(eol));
}
