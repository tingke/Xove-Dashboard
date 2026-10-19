import { App, Modal } from 'obsidian';
import type Dashboard from '../main';
import { ImportWizardModal } from './ImportWizardModal';
import { t } from '../i18n';

/* ============================================================
   F3 首启导览 — ≤4 步分步导览（规划 F3-1/F3-2）：
   定位 → 七视图一览（甘特优先）→ 布局拖拽演示 → 上手联动
   （F1 到期提醒引导开启 + F2 导入入口）。
   触发：仅首次安装（无 lastSeenVersion）自动弹出一次；
   跳过/完成后不再自动弹出（lastSeenVersion 当场落盘保证）；
   设置 → 通用 → 「重看功能导览」可随时重看。
   ============================================================ */

const STEP_COUNT = 4;

export class OnboardingModal extends Modal {
	private step = 0;

	constructor(app: App, private plugin: Dashboard) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass('ad-onb-modal');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		// ---- 头部：标题 + 跳过（规划：跳过导览不再自动弹出） ----
		const head = contentEl.createDiv({ cls: 'ad-onb-head' });
		head.createEl('h3', { cls: 'ad-modal-title', text: t('onb.title') });
		head.createEl('button', { cls: 'ad-onb-skip', text: t('onb.skip') })
			.addEventListener('click', () => this.close());

		if (this.step === 0) this.renderStep1(contentEl);
		else if (this.step === 1) this.renderStep2(contentEl);
		else if (this.step === 2) this.renderStep3(contentEl);
		else this.renderStep4(contentEl);

		// ---- 底部：步骤圆点 + 上一步/下一步/完成 ----
		const foot = contentEl.createDiv({ cls: 'ad-onb-foot' });
		const dots = foot.createDiv({ cls: 'ad-onb-dots' });
		for (let i = 0; i < STEP_COUNT; i++) {
			dots.createDiv({ cls: 'ad-onb-dot' + (i === this.step ? ' is-on' : '') });
		}
		const btns = foot.createDiv({ cls: 'ad-onb-btns' });
		if (this.step > 0) {
			btns.createEl('button', { cls: 'ad-modal-btn', text: t('onb.back') })
				.addEventListener('click', () => { this.step--; this.render(); });
		}
		if (this.step < STEP_COUNT - 1) {
			btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: t('onb.next') })
				.addEventListener('click', () => { this.step++; this.render(); });
		} else {
			btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: t('onb.finish') })
				.addEventListener('click', () => this.close());
		}
	}

	/** 第 1 步：一句话定位 + 三个核心卖点 */
	private renderStep1(root: HTMLElement): void {
		root.createEl('h3', { cls: 'ad-onb-step-title', text: t('onb.s1Title') });
		root.createDiv({ cls: 'ad-onb-step-desc', text: t('onb.s1Desc') });
		const points = root.createDiv({ cls: 'ad-onb-points' });
		const items: [string, string][] = [
			[t('onb.s1Point1T'), t('onb.s1Point1D')],
			[t('onb.s1Point2T'), t('onb.s1Point2D')],
			[t('onb.s1Point3T'), t('onb.s1Point3D')],
		];
		for (const [pt, d] of items) {
			const row = points.createDiv({ cls: 'ad-onb-point' });
			row.createSpan({ cls: 'pt', text: pt });
			row.createSpan({ text: d });
		}
	}

	/** 第 2 步：项目总览七视图（甘特置顶 + 旗舰徽标） */
	private renderStep2(root: HTMLElement): void {
		root.createEl('h3', { cls: 'ad-onb-step-title', text: t('onb.s2Title') });
		root.createDiv({ cls: 'ad-onb-step-desc', text: t('onb.s2Desc') });
		const tiles = root.createDiv({ cls: 'ad-onb-tiles' });
		const views: [string, string, boolean][] = [
			['📊', 'viewGantt', true],
			['☰', 'viewList', false],
			['📅', 'viewCalendar', false],
			['▦', 'viewKanban', false],
			['🔗', 'viewDeps', false],
			['🗂', 'viewFiles', false],
			['📈', 'viewStats', false],
		];
		for (const [icon, key, flag] of views) {
			const tile = tiles.createDiv({ cls: 'ad-onb-tile' + (flag ? ' is-flag' : '') });
			const name = tile.createDiv({ cls: 'ad-onb-tile__name' });
			name.createSpan({ text: icon });
			name.createSpan({ text: t(`onb.${key}`) });
			if (flag) name.createSpan({ cls: 'ad-onb-tile__badge', text: t('onb.s2GanttBadge') });
			tile.createDiv({ cls: 'ad-onb-tile__desc', text: t(`onb.${key}Desc`) });
		}
	}

	/** 第 3 步：自由布局演示（纯 CSS 动画模拟长按拖拽） */
	private renderStep3(root: HTMLElement): void {
		root.createEl('h3', { cls: 'ad-onb-step-title', text: t('onb.s3Title') });
		root.createDiv({ cls: 'ad-onb-step-desc', text: t('onb.s3Desc') });
		const demo = root.createDiv({ cls: 'ad-onb-demo' });
		const c1 = demo.createDiv({ cls: 'ad-onb-demo__card', text: 'TODO' });
		c1.style.left = '16px';
		c1.style.top = '16px';
		const c2 = demo.createDiv({ cls: 'ad-onb-demo__card', text: '📊' });
		c2.style.left = '110px';
		c2.style.top = '16px';
		demo.createDiv({ cls: 'ad-onb-demo__card is-move', text: ' ✓ ' });
		demo.createDiv({ cls: 'ad-onb-demo__hint', text: t('onb.s3DemoHint') });
	}

	/** 第 4 步：三步上手（F1 提醒引导开启 + F2 导入入口联动） */
	private renderStep4(root: HTMLElement): void {
		root.createEl('h3', { cls: 'ad-onb-step-title', text: t('onb.s4Title') });
		const steps = root.createDiv({ cls: 'ad-onb-steps' });

		// ① 建任务（静态）
		const r1 = steps.createDiv({ cls: 'ad-onb-row' });
		const t1 = r1.createDiv({ cls: 'ad-onb-row__text' });
		t1.createDiv({ cls: 'ad-onb-row__name', text: t('onb.s4Create') });
		t1.createDiv({ cls: 'ad-onb-row__desc', text: t('onb.s4CreateDesc') });

		// ② 开启到期提醒（F1 联动：默认关，导览引导开启）
		const r2 = steps.createDiv({ cls: 'ad-onb-row' });
		const t2 = r2.createDiv({ cls: 'ad-onb-row__text' });
		t2.createDiv({ cls: 'ad-onb-row__name', text: t('onb.s4Remind') });
		t2.createDiv({ cls: 'ad-onb-row__desc', text: t('onb.s4RemindDesc') });
		const toggle = r2.createDiv({ cls: 'ad-onb-row__ctl' }).createEl('input', { type: 'checkbox' });
		toggle.checked = !!this.plugin.settings.reminder?.enabled;
		toggle.addEventListener('change', () => {
			this.plugin.settings.reminder.enabled = toggle.checked;
			void this.plugin.saveSettings();
		});

		// ③ 迁移旧数据（F2 联动：导入向导入口）
		const r3 = steps.createDiv({ cls: 'ad-onb-row' });
		const t3 = r3.createDiv({ cls: 'ad-onb-row__text' });
		t3.createDiv({ cls: 'ad-onb-row__name', text: t('onb.s4Import') });
		t3.createDiv({ cls: 'ad-onb-row__desc', text: t('onb.s4ImportDesc') });
		r3.createDiv({ cls: 'ad-onb-row__ctl' })
			.createEl('button', { cls: 'ad-modal-btn', text: t('onb.importBtn') })
			.addEventListener('click', () => new ImportWizardModal(this.app, this.plugin).open());
	}
}
