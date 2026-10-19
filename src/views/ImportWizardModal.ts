import { App, Modal, Notice, Setting, TFile, TFolder } from 'obsidian';
import type { TAbstractFile, TFile as OTFile } from 'obsidian';
import type Dashboard from '../main';
import { TaskStore } from '../data/taskStore';
import { PRIORITY_LIST, parseFrontmatter } from '../data/taskParser';
import type { ProjectInfo, TaskPriority, TaskStatus } from '../data/taskParseCore';
import {
	scanTasksSyntax, buildCandidates, buildTaskFileMd, sanitizeImportFilename, MAX_IMPORT_KEYS,
	type ImportCandidate, type SkipReason,
} from '../data/tasksImport';
import {
	parseKanbanBoard, looksLikeKanbanBoard, defaultColumnStatus, buildKanbanCandidates,
	buildProjectCandidates, collectFmKeys, EMPTY_FIELD_MAP, KANBAN_STATUS_OPTIONS,
} from '../data/boardImport';
import type { ProjectFieldMap, ProjectRecord } from '../data/boardImport';
import { yamlScalar } from '../data/yamlScalar';
import { t, tArr } from '../i18n';
import { todayStr } from '../data/taskLogic';

/* ============================================================
   F2 导入向导 — 阶段一（Tasks emoji 语法）+ 阶段二（Kanban 看板 /
   Projects 项目字段映射）。三步：来源与范围 → 预览（逐条/批量调整，
   列映射与字段映射面板）→ 执行导入与摘要。
   红线：复制式导入（源文件零改写）；幂等键按来源分账户存 data.json
   插件状态；新任务文件格式见 tasksImport.buildTaskFileMd（含「链接」源笔记字段）。
   ============================================================ */

/** 默认导入目标项目名（其文件夹位于项目文件夹下，保证能被扫描到） */
const DEFAULT_IMPORT_PROJECT = 'Tasks 导入';
/** 预览列表最多渲染行数（超出部分以「+N」提示，避免弹窗卡顿） */
const PREVIEW_ROW_CAP = 150;
/** 自动创建的导入项目标识色 */
const IMPORT_PROJECT_COLOR = '#7c6cf0';

const NEW_PROJECT = '__new__';
type ImportSource = 'tasks' | 'kanban' | 'projects';

interface KanbanFile { path: string; cards: ReturnType<typeof parseKanbanBoard>['cards'] }

export class ImportWizardModal extends Modal {
	private step: 'scope' | 'preview' | 'done' = 'scope';
	private source: ImportSource = 'tasks';
	private store: TaskStore;
	private projects: ProjectInfo[] = [];

	// 范围步
	private folderPath = '/';
	private includeCompleted = false;
	private targetValue = NEW_PROJECT;

	// 预览步
	private candidates: ImportCandidate[] = [];
	private skipped: Record<string, number> = { completed: 0, cancelled: 0, duplicate: 0, ignored: 0 };
	private scannedFiles = 0;
	/** 排除集合按幂等键记录（列映射/字段映射重建候选对象后仍保留用户选择） */
	private excluded = new Set<string>();

	// Kanban 列映射状态
	private kanbanFiles: KanbanFile[] = [];
	private kanbanStatus: Record<string, TaskStatus | 'ignore'> = {};

	// Projects 字段映射状态
	private projectsRecords: ProjectRecord[] = [];
	private fmKeys: string[] = [];
	private fieldMap: ProjectFieldMap = { ...EMPTY_FIELD_MAP };

	constructor(app: App, private plugin: Dashboard) {
		super(app);
		this.store = new TaskStore(app, () => ({
			projectsFolder: plugin.settings.projectsFolder,
			npdpStages: plugin.settings.npdpStages,
		}));
	}

	onOpen(): void {
		this.contentEl.addClass('ad-task-modal');
		this.contentEl.addClass('ad-import-modal');
		void this.renderScope();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private get importsState(): { tasksKeys: string[]; kanbanKeys: string[]; projectsKeys: string[] } {
		const imp = this.plugin.settings.imports ?? {};
		return {
			tasksKeys: imp.tasksKeys ?? [],
			kanbanKeys: imp.kanbanKeys ?? [],
			projectsKeys: imp.projectsKeys ?? [],
		};
	}

	/* ---- 第 1 步：来源与范围 ---- */

	private async renderScope(): Promise<void> {
		const { contentEl } = this;
		this.step = 'scope';
		contentEl.empty();
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: t('import.title') });
		contentEl.createDiv({ cls: 'ad-modal-desc', text: t('import.desc') });

		// 来源三选一（F2 阶段一 Tasks 语法 / 阶段二 Kanban / Projects）
		new Setting(contentEl)
			.setName(t('import.source'))
			.addDropdown((dd) => {
				dd.addOption('tasks', t('import.sourceTasks'));
				dd.addOption('kanban', t('import.sourceKanban'));
				dd.addOption('projects', t('import.sourceProjects'));
				dd.setValue(this.source);
				dd.onChange((v) => {
					this.source = (v === 'kanban' || v === 'projects') ? v : 'tasks';
					void this.renderScope();
				});
			});
		contentEl.createDiv({ cls: 'ad-modal-desc', text: t(`import.sourceDesc.${this.source}`) });

		new Setting(contentEl)
			.setName(t('import.scopeFolder'))
			.setDesc(t(`import.scopeFolderDesc.${this.source}`))
			.addText((tc) => tc
				.setPlaceholder('/')
				.setValue(this.folderPath)
				.onChange((v) => { this.folderPath = v.trim() || '/'; }));

		if (this.source !== 'projects') {
			new Setting(contentEl)
				.setName(t('import.includeCompleted'))
				.setDesc(t('import.includeCompletedDesc'))
				.addToggle((tg) => tg.setValue(this.includeCompleted).onChange((v) => { this.includeCompleted = v; }));
		}

		const targetSetting = new Setting(contentEl)
			.setName(t('import.targetProject'))
			.setDesc(t('import.targetProjectDesc'));
		const targetSelect = document.createElement('select');
		targetSelect.className = 'ad-modal-input';
		targetSelect.createEl('option', { value: NEW_PROJECT, text: t('import.newProjectOption', { name: DEFAULT_IMPORT_PROJECT }) });
		targetSetting.controlEl.appendChild(targetSelect);
		targetSelect.addEventListener('change', () => { this.targetValue = targetSelect.value; });

		// 已有项目列表异步填充（扫描共享 300ms 缓存）
		void this.store.scanAllProjects().then((projects) => {
			this.projects = projects;
			for (const p of projects) {
				targetSelect.createEl('option', { value: p.path, text: p.name });
			}
			if (this.targetValue !== NEW_PROJECT) targetSelect.value = this.targetValue;
		});

		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn', text: t('common.cancel') })
			.addEventListener('click', () => this.close());
		btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: t('import.scan') })
			.addEventListener('click', () => void this.scan());
	}

	/** 解析目标项目文件夹路径（扫描时排除，避免把生成文件再导入一遍） */
	private targetFolderPath(): string {
		if (this.targetValue === NEW_PROJECT) {
			return `${this.plugin.settings.projectsFolder}/${DEFAULT_IMPORT_PROJECT}`;
		}
		return this.targetValue;
	}

	private async scan(): Promise<void> {
		const scopePath = this.folderPath === '/' || this.folderPath === '' ? '/' : this.folderPath;
		const scope = this.app.vault.getAbstractFileByPath(scopePath);
		if (scopePath !== '/' && !(scope instanceof TFolder) && !(scope instanceof TFile)) {
			new Notice(t('import.openFail'));
			return;
		}
		if (this.source === 'projects') {
			await this.scanProjects(scopePath);
			return;
		}
		if (this.source === 'kanban') {
			await this.scanKanban(scopePath, scope);
			return;
		}
		await this.scanTasks(scopePath, scope);
	}

	/** 阶段一：Tasks emoji 语法扫描 */
	private async scanTasks(scopePath: string, scope: TAbstractFile | null): Promise<void> {
		const root = scope instanceof TFolder ? scope : this.app.vault.getRoot();
		const excludePath = this.targetFolderPath();

		const files: OTFile[] = [];
		const collect = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFolder) {
					if (child.name.startsWith('.')) continue;
					if (child.path === excludePath || child.path.startsWith(excludePath + '/')) continue;
					collect(child);
				} else if (child instanceof TFile && child.name.endsWith('.md')) {
					files.push(child);
				}
			}
		};
		collect(root);

		const existingKeys = new Set(this.importsState.tasksKeys);
		const candidates: ImportCandidate[] = [];
		const skipped: Record<string, number> = { completed: 0, cancelled: 0, duplicate: 0, ignored: 0 };
		const today = todayStr();

		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const parsed = scanTasksSyntax(content);
				if (!parsed.length) continue;
				const res = buildCandidates(parsed, {
					sourcePath: file.path,
					defaultPriority: '重要不紧急',
					includeCompleted: this.includeCompleted,
					existingKeys,
					today,
				});
				candidates.push(...res.candidates);
				skipped.completed += res.skipped.completed;
				skipped.cancelled += res.skipped.cancelled;
				skipped.duplicate += res.skipped.duplicate;
			} catch (e) {
				console.warn('[Dashboard] import scan failed for', file.path, e);
			}
		}

		this.candidates = candidates;
		this.skipped = skipped;
		this.scannedFiles = files.length;
		this.excluded = new Set();
		if (!candidates.length) {
			new Notice(t('import.noResults'));
			return;
		}
		this.renderPreview();
	}

	/** 阶段二：Kanban 看板扫描（文件夹只认 kanban-plugin 标记的文件；单文件直接解析） */
	private async scanKanban(scopePath: string, scope: TAbstractFile | null): Promise<void> {
		const files: OTFile[] = [];
		if (scope instanceof TFile && scope.name.endsWith('.md')) {
			files.push(scope); // 明确指定的单个文件：直接解析
		} else {
			const root = scope instanceof TFolder ? scope : this.app.vault.getRoot();
			const excludePath = this.targetFolderPath();
			const collect = (f: TFolder): void => {
				for (const child of f.children) {
					if (child instanceof TFolder) {
						if (child.name.startsWith('.')) continue;
						if (child.path === excludePath || child.path.startsWith(excludePath + '/')) continue;
						collect(child);
					} else if (child instanceof TFile && child.name.endsWith('.md')) {
						files.push(child);
					}
				}
			};
			collect(root);
		}

		const existingKeys = new Set(this.importsState.kanbanKeys);
		const candidates: ImportCandidate[] = [];
		const skipped: Record<string, number> = { completed: 0, cancelled: 0, duplicate: 0, ignored: 0 };
		const kanbanFiles: KanbanFile[] = [];
		let scanned = 0;

		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (files.length > 1 && !looksLikeKanbanBoard(content)) continue; // 文件夹模式只认看板标记
				const board = parseKanbanBoard(content);
				if (!board.cards.length) continue;
				scanned++;
				kanbanFiles.push({ path: file.path, cards: board.cards });
				for (const col of board.columns) {
					if (!(col.name in this.kanbanStatus)) this.kanbanStatus[col.name] = defaultColumnStatus(col.name);
				}
				const res = buildKanbanCandidates(board, {
					sourcePath: file.path,
					columnStatus: this.kanbanStatus,
					defaultPriority: '重要不紧急',
					includeCompleted: this.includeCompleted,
					existingKeys,
				});
				candidates.push(...res.candidates);
				skipped.completed += res.skipped.completed;
				skipped.duplicate += res.skipped.duplicate;
				skipped.ignored += res.skipped.ignored;
			} catch (e) {
				console.warn('[Dashboard] kanban scan failed for', file.path, e);
			}
		}

		this.kanbanFiles = kanbanFiles;
		this.candidates = candidates;
		this.skipped = skipped;
		this.scannedFiles = scanned;
		this.excluded = new Set();
		if (!candidates.length) {
			new Notice(t('import.noResults'));
			return;
		}
		this.renderPreview();
	}

	/** 阶段二：Projects 扫描（指定文件夹全部 .md = 记录；字段映射在预览步） */
	private async scanProjects(scopePath: string): Promise<void> {
		const scope = this.app.vault.getAbstractFileByPath(scopePath);
		const root = scope instanceof TFolder ? scope : this.app.vault.getAbstractFileByPath(this.folderPath);
		if (!(root instanceof TFolder)) {
			new Notice(t('import.projFolderRequired'));
			return;
		}
		const files: OTFile[] = [];
		const excludePath = this.targetFolderPath();
		const collect = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFolder) {
					if (child.name.startsWith('.')) continue;
					if (child.path === excludePath || child.path.startsWith(excludePath + '/')) continue;
					collect(child);
				} else if (child instanceof TFile && child.name.endsWith('.md')) {
					files.push(child);
				}
			}
		};
		collect(root);

		const records: ProjectRecord[] = [];
		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const fm = parseFrontmatter(content, file.path);
				records.push({ path: file.path, fm });
			} catch (e) {
				console.warn('[Dashboard] projects scan failed for', file.path, e);
			}
		}
		if (!records.length) {
			new Notice(t('import.noResults'));
			return;
		}
		this.projectsRecords = records;
		this.fmKeys = collectFmKeys(records);
		// 模板复用：若当前映射为空且存在已存模板，自动套第一个
		const templates = this.plugin.settings.imports?.projectsTemplates ?? {};
		const first = Object.values(templates)[0];
		this.fieldMap = { ...EMPTY_FIELD_MAP, ...(this.fmKeys.some((k) => k === (first?.title ?? '')) ? first : {}) };

		this.rebuildProjectCandidates();
		this.scannedFiles = files.length;
		this.excluded = new Set();
		if (!this.candidates.length) {
			new Notice(t('import.noResults'));
			return;
		}
		this.renderPreview();
	}

	private rebuildProjectCandidates(): void {
		const existingKeys = new Set(this.importsState.projectsKeys);
		const res = buildProjectCandidates(this.projectsRecords, this.fieldMap, { existingKeys });
		this.candidates = res.candidates;
		this.skipped = { completed: 0, cancelled: 0, duplicate: res.skipped.duplicate, ignored: 0 };
	}

	/** 列映射变化后重建看板候选（excluded 按键保留用户勾选） */
	private rebuildKanbanCandidates(): void {
		const existingKeys = new Set(this.importsState.kanbanKeys);
		const candidates: ImportCandidate[] = [];
		const skipped: Record<string, number> = { completed: 0, cancelled: 0, duplicate: 0, ignored: 0 };
		for (const f of this.kanbanFiles) {
			const res = buildKanbanCandidates({ cards: f.cards }, {
				sourcePath: f.path,
				columnStatus: this.kanbanStatus,
				defaultPriority: '重要不紧急',
				includeCompleted: this.includeCompleted,
				existingKeys,
			});
			candidates.push(...res.candidates);
			skipped.completed += res.skipped.completed;
			skipped.duplicate += res.skipped.duplicate;
			skipped.ignored += res.skipped.ignored;
		}
		this.candidates = candidates;
		this.skipped = skipped;
	}

	/* ---- 第 2 步：预览与调整 ---- */

	private renderPreview(): void {
		const { contentEl } = this;
		this.step = 'preview';
		contentEl.empty();
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: t('import.previewTitle', { n: this.candidates.length, files: this.scannedFiles }) });
		contentEl.createDiv({ cls: 'ad-modal-desc', text: this.skippedLine() });

		if (this.source === 'kanban') this.renderKanbanMapping(contentEl);
		if (this.source === 'projects') this.renderProjectMapping(contentEl);
		if (this.source === 'tasks') this.renderTaskBatchPriority(contentEl);

		const list = contentEl.createDiv({ cls: 'ad-import-list' });
		const shown = this.candidates.slice(0, PREVIEW_ROW_CAP);
		for (const c of shown) this.renderPreviewRow(list, c);
		if (this.candidates.length > shown.length) {
			list.createDiv({ cls: 'ad-import-more', text: `+${this.candidates.length - shown.length}` });
		}

		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn', text: t('import.back') })
			.addEventListener('click', () => void this.renderScope());
		const includedCount = this.candidates.filter((c) => !this.excluded.has(c.key)).length;
		const importBtn = btns.createEl('button', {
			cls: 'ad-modal-btn ad-modal-btn--primary',
			text: t('import.importBtn', { n: includedCount }),
		});
		if (!includedCount) importBtn.setAttribute('disabled', '');
		importBtn.addEventListener('click', () => void this.runImport());
	}

	private skippedLine(): string {
		if (this.source === 'kanban') return t('import.skippedLineKanban', this.skipped as Record<string, number>);
		if (this.source === 'projects') return t('import.skippedLineProjects', this.skipped as Record<string, number>);
		return t('import.skippedLine', this.skipped as Record<string, number>);
	}

	/** Kanban 列映射面板（规划 [TBD]：自由列名不默认猜测，映射可见可改） */
	private renderKanbanMapping(root: HTMLElement): void {
		const columns = [...new Set(this.kanbanFiles.flatMap((f) => f.cards.map((c) => c.column)))];
		if (!columns.length) return;
		const wrap = root.createDiv({ cls: 'ad-import-mapping' });
		wrap.createDiv({ cls: 'ad-import-mapping__title', text: t('import.kanbanMapping') });
		for (const col of columns) {
			const row = wrap.createDiv({ cls: 'ad-import-mapping__row' });
			row.createSpan({ cls: 'ad-import-mapping__name', text: col });
			const sel = document.createElement('select');
			sel.className = 'ad-modal-input';
			for (const opt of KANBAN_STATUS_OPTIONS) {
				sel.createEl('option', { value: opt, text: opt === 'ignore' ? t('import.kanbanIgnore') : opt });
			}
			sel.value = this.kanbanStatus[col] ?? '待办';
			sel.addEventListener('change', () => {
				this.kanbanStatus[col] = sel.value as TaskStatus | 'ignore';
				this.rebuildKanbanCandidates();
				this.renderPreview();
			});
			row.appendChild(sel);
		}
	}

	/** Projects 字段映射面板 + 模板保存/复用 */
	private renderProjectMapping(root: HTMLElement): void {
		const wrap = root.createDiv({ cls: 'ad-import-mapping' });
		wrap.createDiv({ cls: 'ad-import-mapping__title', text: t('import.projMapping') });

		const fields: [keyof ProjectFieldMap, string][] = [
			['title', t('import.projFieldTitle')],
			['status', t('import.projFieldStatus')],
			['priority', t('import.projFieldPriority')],
			['start', t('import.projFieldStart')],
			['due', t('import.projFieldDue')],
			['complete', t('import.projFieldComplete')],
			['tags', t('import.projFieldTags')],
		];
		const mkKeySelect = (current: string): HTMLSelectElement => {
			const sel = document.createElement('select');
			sel.className = 'ad-modal-input';
			sel.createEl('option', { value: '', text: t('import.projFieldNone') });
			for (const k of this.fmKeys) sel.createEl('option', { value: k, text: k });
			if (current) sel.value = current;
			return sel;
		};
		for (const [key, label] of fields) {
			const row = wrap.createDiv({ cls: 'ad-import-mapping__row' });
			row.createSpan({ cls: 'ad-import-mapping__name', text: label });
			const sel = mkKeySelect(this.fieldMap[key]);
			sel.addEventListener('change', () => {
				this.fieldMap[key] = sel.value;
				this.rebuildProjectCandidates();
				this.renderPreview();
			});
			row.appendChild(sel);
		}

		// 模板：保存当前映射 / 套用已存模板
		const tplRow = wrap.createDiv({ cls: 'ad-import-mapping__row' });
		tplRow.createSpan({ cls: 'ad-import-mapping__name', text: t('import.projTemplate') });
		const tplCtl = tplRow.createDiv({ cls: 'ad-import-mapping__ctl' });
		const templates = this.plugin.settings.imports?.projectsTemplates ?? {};
		const tplSel = document.createElement('select');
		tplSel.className = 'ad-modal-input';
		tplSel.createEl('option', { value: '', text: t('import.projTemplateNone') });
		for (const name of Object.keys(templates)) tplSel.createEl('option', { value: name, text: name });
		tplSel.addEventListener('change', () => {
			const tpl = templates[tplSel.value];
			if (tpl) {
				this.fieldMap = { ...EMPTY_FIELD_MAP, ...tpl };
				this.rebuildProjectCandidates();
				this.renderPreview();
			}
		});
		tplCtl.appendChild(tplSel);
		const saveBtn = tplCtl.createEl('button', { cls: 'ad-modal-btn', text: t('import.projTemplateSave') });
		saveBtn.addEventListener('click', () => {
			const name = window.prompt(t('import.projTemplateName'))?.trim();
			if (!name) return;
			const imp = this.plugin.settings.imports ?? {};
			imp.projectsTemplates = { ...(imp.projectsTemplates ?? {}), [name]: { ...this.fieldMap } };
			this.plugin.settings.imports = imp;
			void this.plugin.saveSettings();
			new Notice(t('import.projTemplateSaved', { name }));
		});
	}

	/** Tasks 语法批量优先级（阶段一保留） */
	private renderTaskBatchPriority(root: HTMLElement): void {
		const flagged = this.candidates.filter((c) => c.priorityEmoji);
		if (!flagged.length) return;
		const batch = new Setting(root)
			.setName(t('import.batchPriority') + `（${flagged.length}）`);
		const sel = document.createElement('select');
		sel.className = 'ad-modal-input';
		sel.createEl('option', { value: '', text: t('import.noPriority') });
		for (const p of PRIORITY_LIST) {
			if (!p) continue;
			sel.createEl('option', { value: p, text: p });
		}
		batch.controlEl.appendChild(sel);
		batch.addButton((btn) => btn
			.setButtonText(t('import.batchApply'))
			.onClick(() => {
				const v = sel.value as TaskPriority | '';
				for (const c of flagged) {
					c.priority = v || null;
					c.warnings = c.warnings.filter((w) => w !== 'priority');
				}
				this.renderPreview();
			}));
	}

	private renderPreviewRow(list: HTMLElement, c: ImportCandidate): void {
		const row = list.createDiv({ cls: 'ad-import-row' + (c.warnings.length ? ' has-warning' : '') });

		const head = row.createDiv({ cls: 'ad-import-row__head' });
		const includeLabel = head.createEl('label', { cls: 'ad-import-row__include' });
		const cb = includeLabel.createEl('input', { type: 'checkbox' });
		cb.checked = !this.excluded.has(c.key);
		cb.addEventListener('change', () => {
			if (cb.checked) this.excluded.delete(c.key); else this.excluded.add(c.key);
			this.renderPreview();
		});
		includeLabel.createSpan({ text: t('import.colInclude') });

		head.createSpan({ cls: 'ad-import-row__title', text: c.content });
		if (c.priorityEmoji) {
			// 单轴优先级整列高亮（规划 F2-3），行内可改象限
			const sel = document.createElement('select');
			sel.className = 'ad-modal-input ad-import-row__prio';
			if (!c.priority) sel.createEl('option', { value: '', text: t('import.noPriority') });
			for (const p of PRIORITY_LIST) {
				if (!p) continue;
				sel.createEl('option', { value: p, text: p });
			}
			if (c.priority) sel.value = c.priority;
			sel.addEventListener('change', () => {
				c.priority = (sel.value as TaskPriority | '') || null;
				c.warnings = c.warnings.filter((w) => w !== 'priority');
				row.removeClass('has-warning');
			});
			head.appendChild(sel);
		}

		const meta: string[] = [];
		const date = (label: string, v: string | null): string => (v ? `${label} ${v}` : '');
		meta.push(date('📅', c.due), date('🛫', c.start), date('⏳', c.remindDate && c.type === '普通' ? c.remindDate : null));
		if (c.type === '重复' && c.repeatRule) meta.push(`🔁 ${this.repeatLabel(c.repeatRule)}（${c.recurrenceRaw ?? ''}）`);
		else if (c.recurrenceRaw) meta.push(`🔁 ⚠️ ${c.recurrenceRaw}`);
		if (c.priorityEmoji) meta.push(c.priorityEmoji);
		if (c.tags.length) meta.push(c.tags.join(' '));
		if (c.status !== '待办') meta.push(c.status);
		row.createDiv({ cls: 'ad-import-row__meta', text: meta.filter(Boolean).join(' · ') });

		const warnEl = row.createDiv({ cls: 'ad-import-row__warns' });
		if (c.warnings.includes('recurrence')) warnEl.createSpan({ text: '⚠️ ' + t('import.warnRecurrence') });
		if (c.warnings.includes('priority')) warnEl.createSpan({ text: '⚠️ ' + t('import.warnPriority') });
	}

	/** 重复规则 → 展示文案（Xove 口径） */
	private repeatLabel(rule: NonNullable<ImportCandidate['repeatRule']>): string {
		const freq = rule['频率'];
		if (freq === '每天') {
			const n = rule['间隔天数'];
			return n && n >= 1 ? t('import.repeatDaily', { n }) : t('import.repeatDaily1');
		}
		if (freq === '工作日') return t('import.repeatWorkday');
		if (freq === '每周') {
			const days = rule['每周几'];
			if (days && days.length) {
				const names = tArr('status.weekdayShort');
				return t('import.repeatWeekly', { d: days.map((d) => names[d] ?? String(d)).join('/') });
			}
			return t('import.repeatPlainWeekly');
		}
		if (freq === '每月') {
			const d = rule['每月几号'];
			return d ? t('import.repeatMonthly', { d }) : t('import.repeatPlainMonthly');
		}
		return freq ?? '';
	}

	/* ---- 第 3 步：执行导入与摘要 ---- */

	private async runImport(): Promise<void> {
		const included = this.candidates.filter((c) => !this.excluded.has(c.key));
		if (!included.length) return;

		// 目标项目：新建则补 project-*.md（任务文件必须位于项目夹下才会被扫描）
		let folderPath = this.targetFolderPath();
		let projectName = DEFAULT_IMPORT_PROJECT;
		if (this.targetValue !== NEW_PROJECT) {
			const proj = this.projects.find((p) => p.path === this.targetValue);
			folderPath = this.targetValue;
			projectName = proj?.name ?? folderPath.split('/').pop() ?? projectName;
		} else {
			try {
				await this.ensureImportProject(folderPath);
			} catch (e) {
				console.error('[Dashboard] ensure import project failed', e);
				new Notice(t('import.createFail'));
				return;
			}
		}

		// 文件名净化 + 项目内唯一
		const used = new Set<string>();
		let ok = 0;
		let fail = 0;
		const newKeys: string[] = [];
		for (const c of included) {
			const base = sanitizeImportFilename(c.content);
			let name = base;
			let n = 2;
			while (used.has(name) || this.app.vault.getAbstractFileByPath(`${folderPath}/${name}.md`)) {
				name = `${base} ${n++}`;
			}
			used.add(name);
			try {
				await this.app.vault.create(`${folderPath}/${name}.md`, buildTaskFileMd(c, projectName));
				newKeys.push(c.key);
				ok++;
			} catch (e) {
				console.error('[Dashboard] import create failed', folderPath + '/' + name, e);
				fail++;
			}
		}

		// 幂等键持久化（按来源分账户；data.json 插件状态，FIFO 裁剪）
		const settings = this.plugin.settings;
		settings.imports = settings.imports ?? {};
		if (this.source === 'tasks') settings.imports.tasksKeys = [...(settings.imports.tasksKeys ?? []), ...newKeys].slice(-MAX_IMPORT_KEYS);
		if (this.source === 'kanban') settings.imports.kanbanKeys = [...(settings.imports.kanbanKeys ?? []), ...newKeys].slice(-MAX_IMPORT_KEYS);
		if (this.source === 'projects') settings.imports.projectsKeys = [...(settings.imports.projectsKeys ?? []), ...newKeys].slice(-MAX_IMPORT_KEYS);
		await this.plugin.saveSettings();
		this.plugin.refreshDashboardAfterExternalEdit();

		this.renderSummary(ok, fail, included);
	}

	/** 新建导入项目：文件夹 + project-{name}.md（格式对齐 DashboardView 建项目先例）。 */
	private async ensureImportProject(projectFolderPath: string): Promise<void> {
		// createFolder 只建单层：逐级补父目录（对齐 DashboardView.ensureFolder 先例）
		const parts = projectFolderPath.split('/').filter(Boolean);
		let cur = '';
		for (const part of parts) {
			cur = cur ? `${cur}/${part}` : part;
			if (!(this.app.vault.getAbstractFileByPath(cur) instanceof TFolder)) {
				await this.app.vault.createFolder(cur);
			}
		}
		const safeName = projectFolderPath.split('/').pop() ?? DEFAULT_IMPORT_PROJECT;
		const projectFilePath = `${projectFolderPath}/project-${safeName}.md`;
		if (this.app.vault.getAbstractFileByPath(projectFilePath)) return;
		const now = new Date();
		const createDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		const lines = [
			'---',
			`项目名称: ${yamlScalar(safeName)}`,
			`颜色: ${IMPORT_PROJECT_COLOR}`,
			'项目类型: 非阶段项目',
			'tags: [配置]',
			`描述: ${yamlScalar(t('import.projectDesc'))}`,
			`创建时间: ${createDate}`,
			'---',
			'',
			`# ${safeName}`,
			'',
		];
		await this.app.vault.create(projectFilePath, lines.join('\n'));
	}

	private renderSummary(ok: number, fail: number, included: ImportCandidate[]): void {
		const { contentEl } = this;
		this.step = 'done';
		contentEl.empty();
		contentEl.createEl('h3', { cls: 'ad-modal-title', text: t('import.doneTitle') });
		const warned = included.filter((c) => c.warnings.length).length;
		contentEl.createDiv({ cls: 'ad-modal-desc', text: t('import.doneSummary', { n: ok, w: warned, f: fail }) });
		const skippedTotal = Object.values(this.skipped).reduce((s, n) => s + n, 0);
		contentEl.createDiv({ cls: 'ad-modal-desc', text: t('import.doneSkipped', { n: skippedTotal, ...this.skipped }) });
		contentEl.createDiv({ cls: 'ad-modal-desc ad-import-hint', text: t('import.doneHint') });
		const btns = contentEl.createDiv({ cls: 'ad-modal-btns' });
		btns.createEl('button', { cls: 'ad-modal-btn ad-modal-btn--primary', text: t('common.close') })
			.addEventListener('click', () => this.close());
	}
}
