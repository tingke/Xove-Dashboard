import { Modal, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type Dashboard from '../main';
import type { TaskItem } from '../data/taskParseCore';
import { pomoDayKey } from '../data/pomoStats';
import { t } from '../i18n';

/* ============================================================
   F6 周报明细弹窗：本周完成清单 / 逾期 / 番茄场次 / 本周新增
   （新增按任务文件 stat.ctime 惰性统计，上限 2000 个文件防大库卡顿）。
   汇总卡（首页「周报」模块）数字与本弹窗同源，保证一致。
   ============================================================ */

export class WeeklyReportModal extends Modal {
	constructor(app: App, private plugin: Dashboard, private tasks: TaskItem[], private weekStart: string, private weekEnd: string) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('ad-task-modal');
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: t('weekly.title', { range: `${this.weekStart} ~ ${this.weekEnd}` }) });

		const wsMs = new Date(`${this.weekStart}T00:00:00`).getTime();
		const weMs = new Date(`${this.weekEnd}T23:59:59.999`).getTime();
		const inWeek = (d: string): boolean => d >= this.weekStart && d <= this.weekEnd;

		// 本周完成
		const done = this.tasks
			.filter((t2) => t2.status === '已完成' && inWeek((t2.completeTime ?? '').slice(0, 10)))
			.sort((a, b) => ((b.completeTime ?? '').localeCompare(a.completeTime ?? '')));
		const doneSec = contentEl.createDiv({ cls: 'ad-weekly__sec' });
		doneSec.createDiv({ cls: 'ad-weekly__sec-title', text: `${t('weekly.done')} · ${done.length}` });
		if (!done.length) doneSec.createDiv({ cls: 'ad-weekly__empty', text: t('weekly.empty') });
		for (const t2 of done.slice(0, 50)) {
			doneSec.createDiv({ cls: 'ad-weekly__item', text: `✅ ${(t2.completeTime ?? '').slice(0, 10)}  ${t2.content}` });
		}
		if (done.length > 50) doneSec.createDiv({ cls: 'ad-weekly__more', text: `+${done.length - 50}` });

		// 本周番茄
		try {
			const recs = await this.plugin.getPomoRecords();
			const weekRecs = recs.filter((r) => inWeek(pomoDayKey(r.ts)));
			const minutes = Math.round(weekRecs.reduce((s, r) => s + r.ms, 0) / 60000);
			const pomoSec = contentEl.createDiv({ cls: 'ad-weekly__sec' });
			pomoSec.createDiv({ cls: 'ad-weekly__sec-title', text: `${t('weekly.pomo')} · ${t('weekly.minutes', { n: minutes })} · ${t('weekly.sessions', { n: weekRecs.length })}` });
			const byDay = new Map<string, number>();
			for (const r of weekRecs) {
				const d = pomoDayKey(r.ts);
				byDay.set(d, (byDay.get(d) ?? 0) + r.ms);
			}
			for (const d of [...byDay.keys()].sort()) {
				pomoSec.createDiv({ cls: 'ad-weekly__item', text: `🍅 ${d}  ${t('weekly.minutes', { n: Math.round((byDay.get(d) ?? 0) / 60000) })}` });
			}
		} catch (e) {
			console.warn('[Dashboard] weekly pomo stats failed', e);
		}

		// 当前逾期
		const overdue = this.tasks.filter((t2) => t2.isOverdue);
		const odSec = contentEl.createDiv({ cls: 'ad-weekly__sec' });
		odSec.createDiv({ cls: 'ad-weekly__sec-title', text: `${t('weekly.overdue')} · ${overdue.length}` });
		for (const t2 of overdue.slice(0, 30)) {
			odSec.createDiv({ cls: 'ad-weekly__item ad-weekly__item--overdue', text: `⚠️ ${t2.content}` });
		}

		// 本周新增（按文件 ctime，惰性统计）
		void this.renderCreated(contentEl, wsMs, weMs);
	}

	/** 本周新增任务：stat.ctime 惰性统计（大库限量 2000） */
	private async renderCreated(container: HTMLElement, wsMs: number, weMs: number): Promise<void> {
		const sec = container.createDiv({ cls: 'ad-weekly__sec' });
		sec.createDiv({ cls: 'ad-weekly__sec-title', text: `${t('weekly.created')} · …` });
		const list = sec.createDiv();
		let created = 0;
		const names: string[] = [];
		try {
			for (const t2 of this.tasks.slice(0, 2000)) {
				const f = this.app.vault.getAbstractFileByPath(t2.sourceFile);
				if (f instanceof TFile && f.stat.ctime >= wsMs && f.stat.ctime <= weMs) {
					created++;
					if (names.length < 30) names.push(`🆕 ${t2.content}`);
				}
			}
			sec.querySelector('.ad-weekly__sec-title')?.setText(`${t('weekly.created')} · ${created}`);
			for (const n of names) list.createDiv({ cls: 'ad-weekly__item', text: n });
		} catch (e) {
			console.warn('[Dashboard] weekly created stats failed', e);
			sec.querySelector('.ad-weekly__sec-title')?.setText(`${t('weekly.created')} · -`);
			new Notice(t('weekly.createdFail'));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
