import { Modal, Notice, TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';import type Dashboard from '../main';
import { yamlScalar } from '../data/yamlScalar';
import { writeFrontmatter as fmWriteFrontmatter } from '../data/frontmatterWriter';
import { DEFAULT_HABIT_COLOR } from '../data/habits';
import type { HabitDef, HabitFreq } from '../data/habits';
import { ConfirmModal } from './ConfirmModal';
import { t } from '../i18n';

/* ============================================================
   F6 习惯编辑弹窗：新建 / 编辑 / 删除。
   习惯 = habitsFolder 下的一个 Markdown 文件（frontmatter：
   习惯/颜色/频率/目标 + 打卡数组），免 JSON、Dataview 可查。
   ============================================================ */

const HABIT_COLORS = ['#7c6cf0', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];

export class HabitEditModal extends Modal {
	private name = '';
	private color = DEFAULT_HABIT_COLOR;
	private freq: HabitFreq = '每天';
	private target = 3;

	constructor(app: App, private plugin: Dashboard, private habit: HabitDef | null) {
		super(app);
		this.name = habit?.name ?? '';
		this.color = habit?.color ?? DEFAULT_HABIT_COLOR;
		this.freq = habit?.freq ?? '每天';
		this.target = habit?.target ?? 3;
	}

	onOpen(): void {
		const editing = !!this.habit;
		const { contentEl } = this;
		contentEl.addClass('ad-task-modal');
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: t(editing ? 'habits.editTitle' : 'habits.createTitle') });

		// 名称
		const nameRow = contentEl.createDiv({ cls: 'ad-habit-field' });
		nameRow.createSpan({ cls: 'ad-habit-field__label', text: t('habits.name') });
		const nameInput = nameRow.createEl('input', { cls: 'ad-modal-input', type: 'text', value: this.name, attr: { placeholder: t('habits.namePlaceholder') } });
		nameInput.addEventListener('input', () => { this.name = nameInput.value.trim(); });

		// 颜色色板
		const colorRow = contentEl.createDiv({ cls: 'ad-habit-field' });
		colorRow.createSpan({ cls: 'ad-habit-field__label', text: t('habits.color') });
		const swatches = colorRow.createDiv({ cls: 'ad-habit-swatches' });
		for (const c of HABIT_COLORS) {
			const sw = swatches.createDiv({ cls: 'ad-habit-swatch' + (c === this.color ? ' is-on' : '') });
			sw.style.background = c;
			sw.addEventListener('click', () => {
				this.color = c;
				swatches.querySelectorAll('.ad-habit-swatch').forEach((el) => el.removeClass('is-on'));
				sw.addClass('is-on');
			});
		}

		// 频率
		const freqRow = contentEl.createDiv({ cls: 'ad-habit-field' });
		freqRow.createSpan({ cls: 'ad-habit-field__label', text: t('habits.freq') });
		const freqSel = freqRow.createEl('select', { cls: 'ad-modal-input' });
		freqSel.createEl('option', { value: '每天', text: t('habits.freqDaily') });
		freqSel.createEl('option', { value: '每周', text: t('habits.freqWeekly') });
		freqSel.value = this.freq;
		freqSel.addEventListener('change', () => { this.freq = freqSel.value === '每周' ? '每周' : '每天'; });

		// 每周目标（仅每周频率下可用）
		const targetRow = contentEl.createDiv({ cls: 'ad-habit-field' });
		targetRow.createSpan({ cls: 'ad-habit-field__label', text: t('habits.target') });
		const targetInput = targetRow.createEl('input', { cls: 'ad-modal-input', type: 'number', value: String(this.target), attr: { min: '1', max: '7' } });
		targetInput.addEventListener('input', () => { this.target = Math.max(1, Math.min(7, parseInt(targetInput.value) || 3)); });
		const syncTarget = (): void => {
			targetInput.disabled = this.freq !== '每周';
			targetRow.toggleClass('is-off', this.freq !== '每周');
		};
		freqSel.addEventListener('change', () => { this.freq = freqSel.value === '每周' ? '每周' : '每天'; syncTarget(); });
		syncTarget();

		// 按钮行
		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		if (editing && this.habit) {
			btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--danger', text: t('habits.delete') })
				.addEventListener('click', () => this.deleteHabit());
		}
		btns.createEl('button', { cls: 'ad-modal-btn', text: t('common.cancel') })
			.addEventListener('click', () => this.close());
		btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: t('common.save') })
			.addEventListener('click', () => void this.save());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const name = this.name || this.habit?.name || '';
		if (!name) { new Notice(t('habits.nameRequired')); return; }
		const folderPath = this.plugin.settings.habitsFolder || '习惯';
		try {
			if (this.habit) {
				// 编辑：仅改 frontmatter 字段（文件名不动，避免破坏引用）
				const file = this.app.vault.getAbstractFileByPath(this.habit.path);
				if (!(file instanceof TFile)) { new Notice(t('habits.openFail')); return; }
				await fmWriteFrontmatter(this.app, file, {
					'习惯': name,
					'颜色': this.color,
					'频率': this.freq,
					// 从每周切回每天时删除目标字段
					'目标': this.freq === '每周' ? String(this.target) : null,
				});
			} else {
				// 新建：目录逐级创建 + 文件名去重
				const parts = folderPath.split('/').filter(Boolean);
				let cur = '';
				for (const part of parts) {
					cur = cur ? `${cur}/${part}` : part;
					if (!(this.app.vault.getAbstractFileByPath(cur) instanceof TFolder)) {
						await this.app.vault.createFolder(cur);
					}
				}
				let fname = name;
				let n = 2;
				while (this.app.vault.getAbstractFileByPath(`${folderPath}/${fname}.md`)) fname = `${name} ${n++}`;
				const lines = ['---', `习惯: ${yamlScalar(name)}`, `颜色: ${this.color}`, `频率: ${this.freq}`];
				if (this.freq === '每周') lines.push(`目标: ${this.target}`);
				lines.push('打卡: []', '---', '', `# ${name}`, '');
				await this.app.vault.create(`${folderPath}/${fname}.md`, lines.join('\n'));
			}
			this.plugin.refreshDashboardAfterExternalEdit();
			this.close();
		} catch (e) {
			console.error('[Dashboard] habit save failed', e);
			new Notice(t('habits.saveFail'));
		}
	}

	private deleteHabit(): void {
		if (!this.habit) return;
		const habit = this.habit;
		new ConfirmModal({
			app: this.app,
			title: t('habits.delete'),
			message: t('habits.deleteMsg', { name: habit.name }),
			confirmLabel: t('habits.delete'),
			cancelLabel: t('common.cancel'),
			onConfirm: () => {
				void (async () => {
					const file = this.app.vault.getAbstractFileByPath(habit.path);
					if (file instanceof TFile) await this.app.vault.trash(file, true);
					this.plugin.refreshDashboardAfterExternalEdit();
					this.close();
				})();
			},
		}).open();
	}
}
