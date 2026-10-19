/**
 * 版本变更记录：用于「更新日志弹窗」（UpdateLogModal）。
 * 维护规则：每次发版在此处追加一条 { 版本号: 该版新增/修复摘要 }，zh/en 双语。
 * CHANGELOG_ORDER 保证展示顺序；跨多版本更新时会按顺序列出 (lastSeen, 当前] 之间的全部条目。
 */
export interface ChangelogEntry {
	zh: string;
	en: string;
}

export const CHANGELOG: Record<string, ChangelogEntry> = {
	'0.5.0': {
		zh: '到期提醒：任务到达提醒日发送系统通知，点击通知打开任务详情；支持启动逾期汇总、勿扰时段与授权降级指引\n导入向导：三种来源一键导入——Tasks 语法任务行、Kanban 看板（列→状态映射）、Projects 笔记（字段映射模板可复用）；预览可调、重跑不重复、源文件不改写\n首启导览：四步上手（定位 / 七视图 / 布局演示 / 提醒与导入联动），设置中可随时重看\n今日时间块：首页时间线拖任务排程（15 分钟吸附、重叠分道、时刻刻度与当前时刻线），点块可开始番茄钟\n习惯打卡与周报：习惯用 frontmatter 免 JSON 定义，30 天格点打卡与连击（每周目标断档容忍）；周报卡展示近 4 周趋势与番茄汇总\n任务详情新增「打开源笔记」快捷按钮；TODO 卡新增「今日到期」徽标',
		en: 'Due reminders: system notifications on the reminder day — click a notification to open the task; startup overdue digest, do-not-disturb window and authorization fallback guidance\nImport wizard: three sources in one flow — Tasks-syntax lines, Kanban boards (column → status mapping) and Projects notes (field mapping with reusable templates); adjustable preview, re-run safe, sources untouched\nFirst-run tour: 4 steps (positioning / seven views / layout demo / reminders & import), replayable from Settings → General\nToday schedule: drag tasks onto a home timeline (15-min snap, overlap lanes, hour ticks & now line); click a block to start a pomodoro\nHabits & weekly report: habits defined in frontmatter (no JSON), 30-day check-in grid with streaks (weekly-target gap tolerance); weekly report card with 4-week trends and pomodoro summary\nTask detail: quick "open source note" button; TODO card shows a due-today badge',
	},
	'0.4.1': {
		zh: '样式合规重构：卡片拖拽、甘特插入线、日历、倒计时等处的静态样式从脚本内联迁移到 CSS 类，主题与用户自定义样式覆盖更容易\n发布产物附带构建来源证明（artifact attestation），可在 GitHub 上验证安装包确由本仓库源码构建',
		en: 'Style-compliance refactor: static styles for card dragging, gantt drop-line, calendar and countdown moved from script inline styles to CSS classes, making theme & user-CSS overrides easier\nRelease assets now carry build provenance attestations, so anyone can verify the plugin files were built from this repository',
	},
	'0.4.0': {
		zh: '新增收藏笔记卡片，常用笔记一键收藏，点开即达\n新增最近打开卡片，最近看过的文档快速回去接着写\n项目支持归档，结束后不再出现在首页\n项目阶段数量上限提高，多阶段项目不再挤不下\n倒计时支持按月重复（选 1–31 号，过了自动滚到下月）与按日到点，卡片实时显示今日剩余时间与进度条\n番茄钟显示当天专注总时长，新增统计界面\n全部项目右侧视图（甘特图 / 列表 / 日历 / 看板 / 依赖图 / 文件 / 统计）可按需开关，关闭的版块完全不占用性能\n设置新增顶部统计条（VAULT PULSE）开关\n优化全部项目切换视图动效，过渡更顺滑\n修复看板任务过多时的面板高度问题\n修复外部修改插件配置会被旧值覆盖且无提示的问题（配置文件变更自动同步）\n修复其他已知问题',
		en: 'New Favorite Notes card — pin go-to notes and open them with one click\nNew Recent Files card — jump back to documents you just read\nProjects can now be archived and no longer show on the home page\nHigher stage-count cap for multi-phase projects\nCountdown: repeat by month (pick day 1–31, auto-rolls to the next month) or by day to a set time, with live remaining time and progress on the card\nPomodoro shows today’s focus total, plus a new stats view\nProject views (gantt / list / calendar / board / deps / files / stats) can be toggled off in settings — disabled views cost zero performance\nNew setting to toggle the VAULT PULSE stats bar at the top\nSmoother cross-fade when switching project views\nFixed board panel height when tasks overflow (now scrolls)\nFixed external config edits being silently overwritten (config file changes now sync automatically)\nFixed other known issues',
	},
	'0.3.1': {
		zh: '新增番茄钟卡片（自定义时长 / 完成声音提醒 / 状态栏实时显示）\n优化 TODO 卡片与项目完成状态展示\n新增每日节点回看：在任务详情中点击任意日期节点，即可查看当日备注\n修复灵感看板弹窗输入框高度不可调、项目阶段修改后主页不同步等问题',
		en: 'New Pomodoro card (custom durations, finish sound, live status bar)\nPolished TODO card and project completion display\nNew daily node review: click any day in task details to view its note\nFixed resizable textarea in opportunity modal and phase sync with the home page',
	},
	'0.3.0': {
		zh: '设置菜单分组重构 · 任务详情简洁/详细模式 · 项目日历图标与英文文案优化 · 「完成后不消失」支持本周待办与逾期任务',
		en: 'Settings regrouped · task detail compact/detailed mode · calendar icon & English copy polish · "keep completed" now applies to weekly & overdue tasks',
	},
};

/** 版本号按时间升序排列，用于遍历 (lastSeen, 当前] 之间的更新记录 */
export const CHANGELOG_ORDER: string[] = ['0.3.0', '0.3.1', '0.4.0', '0.4.1', '0.5.0'];
