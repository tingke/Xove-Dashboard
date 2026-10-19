/* ============================================================
   F1 到期提醒 — 调度与系统通知投递（Electron 桌面端）。
   - 启动 15s 后首次核对（含逾期汇总），随后按设置间隔轮询；
   - 单任务提醒：命中提醒日的任务逐条系统通知（同批超过阈值合并为一条汇总）；
   - 去重：`taskId|date` 记录持久化在 data.json（插件状态，非业务数据），重启不复发；
   - 勿扰时段：系统通知降级为应用内提示；环境不支持系统通知时同样降级。
   通知内容完全由本地任务数据生成，零网络请求。
   ============================================================ */

import { Notice } from 'obsidian';
import type { TaskItem } from './taskParser';
import { t } from '../i18n';
import { collectDueTasks, isInDndWindow, todayStr } from './reminderLogic';
import { UI_TEXT } from '../constants';

/** 系统通知授权状态；环境不支持时返回 unsupported（设置页据此展示降级警示） */
export function notificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
	try {
		if (typeof Notification === 'undefined') return 'unsupported';
		return Notification.permission;
	} catch {
		return 'unsupported';
	}
}

/** 提醒设置的最小视图（来自 DashboardSettings.reminder） */
export interface ReminderSettingsLike {
	enabled: boolean;
	digest: boolean;
	dndEnabled: boolean;
	dndFrom: string;
	dndTo: string;
	intervalMin: number;
	/** 已通知去重记录：`${taskId}|${date}`（插件状态，仅保留最近若干条） */
	notifiedKeys?: string[];
	/** 逾期汇总最近一次发送日期（当日只发一次，等效「忽略今天」） */
	digestSentDate?: string;
}

export interface ReminderHost {
	getSettings: () => ReminderSettingsLike;
	getTasks: () => Promise<TaskItem[]>;
	/** 去重记录变更后落盘（saveSettings） */
	persist: () => Promise<void>;
	/** 点击通知后激活仪表盘视图（尽力而为） */
	onActivate?: () => void;
	/** 点击单任务通知后打开该任务详情弹窗（尽力而为） */
	onOpenTask?: (task: TaskItem) => void;
}

/** 单次扫描命中任务数的合并阈值：达到该数量改为一条汇总，避免通知风暴 */
const MERGE_THRESHOLD = 4;
/** 去重记录上限（键含日期，历史键随任务完成/日期推进自然失效） */
const MAX_KEYS = 400;
/** 启动后首次核对的延迟（ms）：等 Obsidian 完成启动与首次扫描 */
const STARTUP_DELAY_MS = 15_000;

/** 单任务通知正文：任务名 + 到期语义 + 优先级（无优先级时省略），全部由本地任务数据生成 */
function dueNotiBody(task: TaskItem, offsetDays: number): string {
	const semantic = offsetDays === 0
		? t('noti.dueToday', { task: task.content })
		: t('noti.dueIn', { task: task.content, n: offsetDays });
	return task.priority ? `${semantic} · ${t('noti.prioLabel', { p: UI_TEXT.prioText(task.priority) })}` : semantic;
}

export class ReminderNotifier {
	private timer: number | null = null;
	private startupTimer: number | null = null;

	constructor(private host: ReminderHost) {}

	/** 启动轮询（内部先 stop，重复调用等效重启；设置修改间隔后可安全调用） */
	start(): void {
		this.stop();
		const intervalMin = Math.max(5, this.host.getSettings().intervalMin || 30);
		this.startupTimer = window.setTimeout(() => {
			this.startupTimer = null;
			void this.scan(true);
		}, STARTUP_DELAY_MS);
		this.timer = window.setInterval(() => {
			void this.scan(false);
		}, intervalMin * 60_000);
	}

	stop(): void {
		if (this.startupTimer !== null) {
			window.clearTimeout(this.startupTimer);
			this.startupTimer = null;
		}
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	/** @param isStartup true = 启动核对（含逾期汇总）；false = 周期扫描 */
	async scan(isStartup: boolean): Promise<void> {
		const cfg = this.host.getSettings();
		if (!cfg.enabled && !cfg.digest) return;
		const today = todayStr();
		let tasks: TaskItem[] = [];
		try {
			tasks = await this.host.getTasks();
		} catch (err) {
			console.warn('[Dashboard] reminder scan failed', err);
			return;
		}
		// 勿扰时段不撤销提醒本身：仅把系统通知降级为应用内提示（设计稿 -03 row-dnd）
		const inDnd = cfg.dndEnabled && isInDndWindow(new Date(), cfg.dndFrom, cfg.dndTo);
		if (cfg.enabled) await this.notifyDue(tasks, today, cfg, inDnd);
		if (cfg.digest && isStartup) this.notifyOverdueDigest(tasks, today, cfg, inDnd);
	}

	/** 单任务到期提醒：命中且当日未通知过的任务，逐条投递；批量命中合并为汇总 */
	private async notifyDue(tasks: TaskItem[], today: string, cfg: ReminderSettingsLike, inDnd: boolean): Promise<void> {
		const seen = new Set(cfg.notifiedKeys ?? []);
		const hits = collectDueTasks(tasks, today).filter((h) => !seen.has(`${h.task.id}|${today}`));
		if (hits.length === 0) return;

		if (hits.length >= MERGE_THRESHOLD) {
			const names = hits.slice(0, 3).map((h) => h.task.content);
			const more = hits.length - names.length;
			this.deliver(
				t('noti.upcomingTitle', { n: hits.length }),
				names.join('、') + (more > 0 ? t('noti.digestMore', { n: more }) : ''),
				{ inDnd },
			);
		} else {
			for (const h of hits) {
				this.deliver(t('noti.appName'), dueNotiBody(h.task, h.offsetDays), { inDnd, task: h.task });
			}
		}

		for (const h of hits) seen.add(`${h.task.id}|${today}`);
		// 只保留最近 MAX_KEYS 条：键含日期，旧键随任务完成自然失效
		cfg.notifiedKeys = [...seen].slice(-MAX_KEYS);
		await this.host.persist();
	}

	/** 启动逾期汇总（当日只发一次；无按钮，「忽略今天」由当日不再发送的语义覆盖） */
	private notifyOverdueDigest(tasks: TaskItem[], today: string, cfg: ReminderSettingsLike, inDnd: boolean): void {
		if (cfg.digestSentDate === today) return;
		const overdue = tasks.filter((t) => t.isOverdue && t.status !== '已完成' && t.status !== '已取消');
		if (overdue.length === 0) return;
		const names = overdue.slice(0, 3).map((t2) => t2.content);
		const more = overdue.length - names.length;
		this.deliver(
			t('noti.digestTitle', { n: overdue.length }),
			names.join('、') + (more > 0 ? t('noti.digestMore', { n: more }) : ''),
			{ inDnd },
		);
		cfg.digestSentDate = today;
		void this.host.persist();
	}

	/** 系统通知投递；勿扰时段、环境不支持或构造失败时降级为应用内 Notice。
	 *  单任务通知点击 → onOpenTask（打开任务详情）；汇总/合并通知点击 → onActivate（聚焦仪表盘）。 */
	private deliver(title: string, body: string, opts: { inDnd?: boolean; task?: TaskItem } = {}): void {
		const inApp = (): void => {
			try { new Notice(body ? `${title}\n${body}` : title); } catch { /* 忽略 */ }
		};
		if (opts.inDnd) {
			inApp();
			return;
		}
		try {
			if (typeof Notification === 'undefined') {
				inApp();
				return;
			}
			const n = new Notification(title, { body });
			n.onclick = (): void => {
				try { window.focus(); } catch { /* 忽略 */ }
				if (opts.task) this.host.onOpenTask?.(opts.task);
				else this.host.onActivate?.();
			};
		} catch {
			inApp();
		}
	}
}
