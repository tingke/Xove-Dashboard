/* ============================================================
   Pure frontmatter mutation core (no Obsidian imports) —
   shared by the plugin's writer (frontmatterWriter.ts) and the
   perf benchmark (scripts/bench.ts, F5). Logic unchanged; moved
   verbatim out of frontmatterWriter so the benchmark can exercise
   the exact same implementation in Node.
   ============================================================ */

import { yamlScalar } from './yamlScalar';

/** 值 -> frontmatter 行右侧内容（含转义；字符串数组 → YAML 行内数组，F6 打卡记录用）。 */
function fmValue(value: string | string[]): string {
	if (Array.isArray(value)) return `[${value.map((v) => yamlScalar(v)).join(', ')}]`;
	return yamlScalar(value);
}

/** Mutate a lines array: update existing frontmatter fields, insert missing ones before closing ---,
 *  delete fields whose value is null. CRLF-safe (works on already-split lines). */
export function applyFrontmatterUpdates(lines: string[], updates: Record<string, string | string[] | null>): void {
	let inFM = false;
	let fmEnd = -1;
	const done = new Set<string>();
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;
		if (line.trim() === '---') {
			if (!inFM) { inFM = true; continue; }
			fmEnd = i;
			inFM = false;
			continue;
		}
		if (!inFM) continue;
		for (const key of Object.keys(updates)) {
			if (line.startsWith(key + ':')) {
				if (updates[key] === null) {
					lines.splice(i, 1);
					i--;
				} else {
					lines[i] = `${key}: ${fmValue(updates[key] as string | string[])}`;
				}
				done.add(key);
			}
		}
	}
	const missing = Object.keys(updates).filter((k) => !done.has(k) && updates[k] !== null);
	if (missing.length === 0) return;
	if (fmEnd > 0) {
		lines.splice(fmEnd, 0, ...missing.map((k) => `${k}: ${fmValue(updates[k] as string | string[])}`));
	} else {
		// No frontmatter at all — prepend a block
		lines.unshift(...['---', ...missing.map((k) => `${k}: ${fmValue(updates[k] as string | string[])}`), '---', '']);
	}
}
