# Xove Dashboard

[English](#english) · [中文](#中文)

<!-- TODO: 补一张七视图动图/截图（建议 docs/assets/overview.gif：首页 + 项目总览甘特/看板/日历切换）
![Xove Dashboard — home & seven project views](docs/assets/overview.gif)
-->

> Open Obsidian and see everything — a home-tab command center with **Gantt + seven linked project views**, stored **100% in plain Markdown**.

Xove Dashboard is a **home-tab-first personal work console**. One plugin gives you what used to take a jigsaw of five: a customizable home dashboard, a project overview with Gantt / list / calendar / kanban / dependency graph / files / stats, a complete task system, an idea board, note heatmaps, and countdowns — all stored as plain Markdown your other tools can still read.

---

## English

### ✨ Highlights

- **Gantt + seven linked views** — the flagship. Drag bars to reschedule, dependency lines between tasks, day / week / month / quarter zoom. The same project in Gantt / list / calendar / kanban / dependency graph / files / stats, with cross-view highlight linking. If you miss the discontinued Projects plugin, this is the drop-in successor.
- **Fast at any scale** — benchmarked on synthetic vaults: a 10k-task vault scans, parses and builds the model in ~135 ms, home data-prep ~2 ms, 100 batch completions + full rescan ~153 ms; 50k tasks still scan in under 2 s (Apple M5; methodology & full table in [docs/benchmarks.md](docs/benchmarks.md)).
- **One plugin instead of a plugin stack** — home dashboard + quick capture + note activity heatmap + idea board + countdowns, all in one install. No Homepage / Dataview / CardBoard jigsaw to assemble and maintain.
- **Pure Markdown, zero lock-in** — tasks, projects, and the board are plain Markdown + YAML frontmatter, readable and editable by any tool. Zero network calls, zero telemetry: your vault never phones home, and your data survives even if the plugin disappears.
- **Actively maintained** — regular releases with a public changelog (see [Releases](../../releases)). Install via BRAT for automatic updates.
- **A real "home = command center"**: greeting, TODO, weekly tasks, project progress, note heatmap, and countdowns on one canvas.
- **Free home layout**: long-press a card to drag & reorder, resize width/height, add or remove modules, reset with one click — your home, your rules.
- **Complete task model**: four-quadrant priorities, start/due dates, parent & child tasks, repeating tasks (auto-advance), a daily check-in axis, overdue-on-top sorting, and optional system notifications for due reminders (click a notification to open the task).
- **Bilingual & theme-aware**: Chinese / English one-click switch; dark / light follows Obsidian or can be forced.
- **Zero dependencies**: pure TypeScript + Obsidian API.

### 📦 Feature Overview

#### Home

| Module | Description |
| --- | --- |
| **Top banner** | Upload a cover image and drag to adjust its vertical position |
| **Vault Pulse** | Notes / pending / added-today / current streak, refreshed live |
| **Quick capture** | Type and hit Enter to save a Markdown note instantly (template supported) |
| **TODO** | Today's tasks, overdue pinned on top, sorted by priority, due-today badge |
| **Progress** | Dual ring charts: today's completion + overall completion |
| **This week & overdue** | This week's tasks plus a red overdue section, with colored urgency tags |
| **Project pipeline** | Initiate → Plan → Develop → Test → Launch stage pipeline |
| **Note stats** | GitHub-style 52-week activity heatmap |
| **Countdown** | Up to 5 custom events with live progress bars |

#### Project overview (click "All projects")

- Draggable project sidebar (order persisted), right-click to edit/delete.
- **Seven views**: Gantt / list / calendar / kanban / dependency graph / files / stats — cross-view highlight linking.
- **Gantt**: day / week / month / quarter zoom, drag bars to edit dates (edge or whole), parent-child indentation, today line, adjustable header-height divider.
- **List**: column sorting, status filter, context menu.
- **Calendar**: tasks rendered inside month-grid cells, drag to change date.
- **Kanban**: To-do / In progress / Blocked / Done / Cancelled, cross-column drag updates status.
- **Dependency graph**: predecessor relations rendered as a graph, editable in the task modal.
- **Files & stats**: project artifacts in one place; completion rhythm and distribution.

#### Inspiration board (click "Inspirations")

- A separate kanban workflow: **Inbox → Evaluating → In progress → Done / Dropped**.
- Cross-column drag to change stage, star items as important, inline detail editing, and a list view.
- All items live in a single Markdown file; a readable table projection is generated in the body.

#### Task management

- **Four-quadrant priority**: Urgent & important / Important, not urgent / Urgent, not important / Neither.
- **Repeating tasks**: daily / workdays / weekly days / monthly date / custom interval; completion auto-advances to the next reminder.
- **Parent & child tasks**: multi-level nesting with completion links.
- **Daily check-in axis**: multi-day tasks show a per-day check-in axis in the detail modal, with a four-color status.
- **Reminders**: on the day / 1 day / 3 days / 1 week before — with optional **system notifications** (turn on in Settings → Reminders; click a notification to open the task detail).
- **Import from Tasks syntax**: coming from the Tasks / CardBoard plugins? Run the import wizard (command palette or Settings) to copy existing task lines into Xove task files — sources stay untouched, re-running never duplicates.
- Tags, notes, postpone a day, mark done / postpone to today, and more.

### 🛟 Active maintenance

Xove Dashboard is in active development — no abandonment, no dead plugin. Every release ships with a changelog (shown in-app on update, and listed in [Releases](../../releases)); BRAT users get updates automatically. Performance and data safety come first: everything is local Markdown, nothing leaves your vault.

### ⚡ Performance

Benchmarked on synthetic vaults (pure hot-path logic; see [docs/benchmarks.md](docs/benchmarks.md) for methodology and caveats — Apple M5, 2026-10-19):

| Scenario | 1k tasks | 10k tasks | 50k tasks |
| --- | ---: | ---: | ---: |
| Full vault scan + parse + model | 14 ms | 135 ms | 1.79 s |
| Home first-paint data prep | 0.3 ms | 2.1 ms | 11 ms |
| 3 project-view switches (filter+sort+window) | 0.3 ms | 1.6 ms | 13 ms |
| Batch complete 100 + full rescan | 17 ms | 153 ms | 1.98 s |

Release budgets are enforced via `npm run bench:check` (10k tier); releases over budget require a documented waiver in [docs/release-checklist.md](docs/release-checklist.md).

### 🚀 Installation

#### First-time install

1. Download `main.js`, `manifest.json`, `styles.css` from the latest Release.
2. Create a folder `YourVault/.obsidian/plugins/xove-dashboard/` and put the three files inside:
   ```
   YourVault/.obsidian/plugins/xove-dashboard/
       ├── main.js
       ├── manifest.json
       └── styles.css
   ```
3. Open Obsidian → **Settings → Community plugins**.
4. Enable **Xove Dashboard** — a short first-run tour shows you around.

> If it doesn't appear immediately, run **Reload app without saving** (`Ctrl+R`) from the command palette.

#### Install & auto-update with BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from Obsidian's community plugins.
2. Run **BRAT: Add a beta plugin for testing** from the command palette, enter `tingke/Xove-Dashboard`, then enable **Xove Dashboard**.
3. From now on every new Release is picked up automatically — BRAT notifies you about updates (or run **BRAT: Update plugins** / enable its auto-update).

#### Upgrade from an older version (v0.2.x → 0.3.0)

> Since 0.3.0 the plugin was renamed from `dashboard` to `xove-dashboard` (both the plugin ID and the install folder changed).

The old version used a folder named `dashboard` or `agent-dashboard`; the new version uses `xove-dashboard`. Because the ID changed, settings are not carried over automatically.

1. **Back up** your old plugin folder (including its `data.json`).
2. Put the new `xove-dashboard/` folder into `.obsidian/plugins/`.
3. *(Optional)* To keep your settings, copy the old `data.json` into the new `xove-dashboard/data.json`.
4. In **Settings → Community plugins**, disable and remove the old `Dashboard`, then delete its old folder.
5. Enable **Xove Dashboard**.

### 📖 Quick Start

1. **Set up your task system** — click **＋ New project** to create a project (e.g. Work / Study), set color, dates, and description. Enter "All projects", select it, click **＋ New task** (project auto-filled), and fill in name, priority, dates, type, reminder, tags, notes.
2. **Bring the home to life** — capture ideas in the **Quick capture** box; mark today's tasks done in TODO (repeating tasks auto-advance); track progress with the ring charts and this-week/overdue cards.
3. **See the big picture** — in "All projects", use Gantt for the timeline (drag bars to reschedule), Calendar for scheduling, Kanban for status flow, and the dependency graph for task relations. Drag to edit — changes write back to Markdown in real time.
4. **Capture inspiration** — open "Inspirations", drop ideas into the Inbox, then drag them through Evaluating → In progress → Done.
5. **Customize** — **Settings → Xove Dashboard**: language, home layout (long-press a card to edit), reminders, board stages, project pipeline stages, storage paths, and theme. You can replay the first-run tour anytime from Settings → General.

### 🛠 Quick Reference

| I want to… | How |
| --- | --- |
| New task | Toolbar **＋ New task** |
| New project | Toolbar **＋ New project** |
| Diary / capture | Toolbar **＋ New note** / Quick capture box |
| Mark a task done | Click the circle before the task |
| Edit a task | Click the task text / right-click → Edit |
| Postpone a day | Right-click → Postpone one day |
| Advance a repeating task | Click the circle |
| Import from Tasks syntax | Command palette → **Import tasks from Tasks syntax** |
| Get due reminders | Settings → Reminders → enable **Due reminders** |
| Rearrange home layout | Long-press a card to enter edit mode |
| Toggle theme | Top **☾** button |
| Change plugin title | Settings → Plugin title |

### 💡 FAQ

**Where is my data stored?**
As Markdown files (frontmatter) in your vault. No database, nothing external.

**Is mobile supported?**
Not yet — this plugin is desktop-only.

**Can I rename the "Inspirations" board?**
Yes. Settings → Board → Board name — change it to anything (Opportunities / Pipeline / Ideas…).

**How many countdowns can I track?**
Up to 5.

**Can I bring my existing Tasks-plugin todos in?**
Yes — command palette → **Import tasks from Tasks syntax**. The wizard scans your vault for Tasks emoji lines, previews the mapping, then creates Xove task files as copies. Your original notes are never modified, and re-running never duplicates.

**Does it phone home / collect data?**
No. Zero network calls, zero telemetry — everything stays local.

### 📄 Notes

- Desktop only; not available on mobile.
- Plugin ID: `xove-dashboard` · Version: 0.5.0 · Min Obsidian version: 1.8.0.

---

## 中文

[English](#english) · [中文](#中文)

<!-- TODO: 补一张七视图动图/截图（建议 docs/assets/overview.gif：首页 + 项目总览甘特/看板/日历切换） -->

> 打开 Obsidian 即见全局——首页工作控制台，**甘特图 + 七种联动视图**，数据 **100% 存于纯 Markdown**。

Xove Dashboard 是一套**以首页为核心的个人工作控制台**。过去要拼五件套才能搭出的能力——可自定义首页仪表盘、甘特 / 列表 / 日历 / 看板 / 依赖图 / 文件 / 统计七视图项目总览、完整任务体系、灵感看板、笔记热力图、倒计时——现在装一个插件全部就位，而且全部以纯 Markdown 存储，任何工具都能继续读取。

### ✨ 亮点

- **甘特图 + 七视图联动**（旗舰卖点）：任务条拖拽改期、依赖连线、日 / 周 / 月 / 季度四档缩放；同一项目在甘特 / 列表 / 日历 / 看板 / 依赖图 / 文件 / 统计七种视角间联动切换。已停更的 Projects 插件，这里是接盘首选。
- **大库也快**：合成库实测——1 万任务全库扫描+解析+建模 ≈ 135ms，首页数据准备 ≈ 2ms，批量完成 100 条 + 全量重扫 ≈ 153ms；5 万任务全库扫描仍 < 2s（Apple M5；方法与完整数据见 [docs/benchmarks.md](docs/benchmarks.md)）。
- **装 1 个插件 = 替代一摞拼装**：首页仪表盘 + 快速捕捉 + 笔记热力图 + 灵感看板 + 倒计时一体搞定，不用再拼 Homepage / Dataview / CardBoard。
- **纯 Markdown 零锁定**：任务、项目、看板全部存为普通 Markdown + frontmatter，任何工具可读可编辑；零网络请求、零遥测——插件消失数据也还在。
- **活跃维护**：持续发版、更新日志公开（见 [Releases](../../releases)）；BRAT 安装可自动更新。
- **真正的「首页即控制台」**：问候语、TODO、本周待办、项目进度、笔记热力图、倒计时，全部聚合在首页一张画布上。
- **首页模块自由布局**：长按卡片拖拽排序、调整宽高、增删模块、一键重置——你的首页你说了算。
- **任务体系完整**：四象限优先级、开始/截止日期、父子任务、重复任务（自动推进）、每日节点打卡轴、逾期置顶，以及可选的**到期系统通知**（点击通知打开任务详情）。
- **中英双语**：界面一键切换；深色 / 浅色主题自动跟随或手动强制。
- **零外部依赖**：纯 TypeScript + Obsidian API。

### 📦 功能总览

#### 首页（Home）

| 模块 | 说明 |
| --- | --- |
| **顶部横幅** | 上传封面图并拖拽调整位置 |
| **Vault Pulse** | 笔记数 / 未完成数 / 今日新增 / 连续天数，实时刷新 |
| **快速捕捉** | 输入即存为 Markdown 笔记，支持模板 |
| **TODO** | 今日任务，逾期置顶 + 优先级排序 + 今日到期徽标 |
| **工作进度** | 双环形图：今日完成率 + 全部完成率 |
| **本周待办 & 逾期** | 本周任务 + 逾期红色置顶，紧急程度彩色标签 |
| **项目进度** | 立项 → 规划 → 开发 → 测试 → 上线 阶段管道 |
| **笔记统计** | GitHub 风格 52 周热力图 |
| **倒计时** | 最多 5 个自定义事件，实时进度条 |

#### 项目总览（点击「全部项目」）

- 侧边栏项目列表，可拖拽排序、右键编辑/删除。
- **七个视图**：甘特图 / 列表 / 日历 / 看板 / 依赖图 / 文件 / 统计，跨视图高亮联动。
- **甘特图**：日 / 周 / 月 / 季度缩放，任务条边缘/整体拖拽改日期，父子缩进，今日线，可调高度分隔条。
- **列表**：列排序、状态筛选、右键菜单。
- **日历**：月视图网格内直接渲染任务条，拖拽改日期。
- **看板**：待办 / 进行中 / 已阻塞 / 已完成 / 已取消，跨列拖拽改状态。
- **依赖图**：前置任务关系图形化展示，详情弹窗内可编辑。
- **文件 & 统计**：项目产物集中管理；完成节奏与分布一目了然。

#### 灵感收集（点击导航「灵感收集」）

- 独立的灵感看板：**收集箱 → 评估中 → 进行中 → 已完成 / 已放弃**。
- 跨列拖拽改阶段、★ 星标标记重要性、内联详情编辑、列表视图。
- 所有条目存于一个 Markdown 文件，正文自动生成可读表格投影。

#### 任务管理

- **四象限优先级**：重要且紧急 / 重要不紧急 / 紧急不重要 / 不重要不紧急。
- **重复任务**：每天 / 工作日 / 每周几 / 每月几号 / 自定义间隔，完成自动推进下次提醒。
- **父子任务**：多级嵌套，父任务完成态联动。
- **每日节点轴**：多日任务在详情弹窗中展示每日打卡日期轴，四色状态一目了然。
- **提醒**：任务当天 / 提前 1 天 / 提前 3 天 / 提前 1 周——支持**系统级通知**（设置 → 提醒通知中开启；点击通知打开任务详情）。
- **从 Tasks 语法导入**：在用 Tasks / CardBoard？命令面板或设置中打开导入向导，把已有任务行复制为 Xove 任务文件——源笔记不改写，重跑不重复。
- 标签、备注、延期一天、标记完成/延后到今天等快捷操作。

### 🛟 活跃维护

Xove Dashboard 持续开发中——不弃坑、不断更。每次发版都附带更新日志（应用内升级时展示，也在 [Releases](../../releases) 归档）；BRAT 用户自动收到更新。性能与数据安全优先：一切皆本地 Markdown，数据绝不离开你的 vault。

### ⚡ 性能

基于合成库的基准实测（纯逻辑热路径；方法与口径声明见 [docs/benchmarks.md](docs/benchmarks.md)——Apple M5，2026-10-19）：

| 场景 | 1k 任务 | 10k 任务 | 50k 任务 |
| --- | ---: | ---: | ---: |
| 全库扫描 + 解析 + 建模 | 14 ms | 135 ms | 1.79 s |
| 首页首屏数据准备 | 0.3 ms | 2.1 ms | 11 ms |
| 项目视图切换 ×3（过滤+排序+窗口） | 0.3 ms | 1.6 ms | 13 ms |
| 批量完成 100 条 + 全量重扫 | 17 ms | 153 ms | 1.98 s |

发版预算通过 `npm run bench:check` 门禁（10k 档）；超预算发版须在 [docs/release-checklist.md](docs/release-checklist.md) 登记豁免。

### 🚀 安装

#### 首次安装

1. 下载最新 Release 中的 `main.js`、`manifest.json`、`styles.css`。
2. 在代码库中创建文件夹 `你的代码库/.obsidian/plugins/xove-dashboard/`，把三个文件放进去：
   ```
   YourVault/.obsidian/plugins/xove-dashboard/
       ├── main.js
       ├── manifest.json
       └── styles.css
   ```
3. 打开 Obsidian → **设置 → 第三方插件（Community plugins）**。
4. 启用 **Xove Dashboard**——首次启用会出现四步导览。

> 若安装后未立即出现，在命令面板执行 **重新加载应用，不保存**（`Ctrl+R`）。

#### 通过 BRAT 安装（自动更新）

1. 在第三方插件中安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 命令面板执行 **BRAT: Add a beta plugin for testing**，输入 `tingke/Xove-Dashboard`，然后启用 **Xove Dashboard**。
3. 之后每次发布新版本 BRAT 会自动提示更新（也可手动执行 **BRAT: Update plugins** 或开启其自动更新）。

#### 从旧版升级（v0.2.x → 0.3.0）

> v0.3.0 起插件由 `dashboard` 改名为 `xove-dashboard`（插件 ID 与安装目录都变了）。

旧版目录名为 `dashboard` 或 `agent-dashboard`；新版用 `xove-dashboard`。由于 ID 改变，配置不会自动继承。

1. **备份**旧插件目录（含其 `data.json`）。
2. 把新的 `xove-dashboard/` 文件夹放入 `.obsidian/plugins/`。
3. *（可选）* 保留配置：把旧 `data.json` 复制到新 `xove-dashboard/data.json`。
4. 在 **设置 → 第三方插件** 禁用并移除旧的 `Dashboard`，删除其旧目录。
5. 启用 **Xove Dashboard**。

### 📖 快速上手

1. **建立任务体系** — 点击工具栏 **＋ 新建项目**创建项目（设置颜色、起止日期、描述），进入「全部项目」选中后点 **＋ 新建任务**（所属项目自动预填），填写名称、优先级、日期、类型、提醒、标签、备注。
2. **让首页活起来** — 在首页「快速捕捉」输入直接存笔记；TODO 点圆圈标记完成；用工作进度双环图 + 本周待办把握每天节奏。
3. **掌控全局** — 在「全部项目」用甘特图看时间线（拖任务条直接改期）、日历看排期、看板看状态流转、依赖图理清前置关系；拖拽即改，实时写回 Markdown。
4. **记录灵感** — 打开「灵感收集」，丢进收集箱，随后拖到评估中、进行中直到已完成。
5. **自定义** — **设置 → Xove Dashboard**：语言、首页布局（长按卡片编辑）、提醒通知、看板阶段、项目阶段管道、存储路径、主题；设置 → 通用可随时重看首启导览。

### 🛠 常用操作速查

| 想做 | 怎么做 |
| --- | --- |
| 新建任务 | 工具栏「＋ 新建任务」 |
| 新建项目 | 工具栏「＋ 新建项目」 |
| 日记 / 捕捉 | 工具栏「＋ 新日记」/ 首页快速捕捉框 |
| 标记任务完成 | 点任务前的圆圈 |
| 编辑任务 | 点任务文字 / 右键 → 编辑 |
| 任务延后一天 | 右键 → 延后一天 |
| 重复任务推进 | 点圆圈（自动推进到下次提醒）|
| 导入 Tasks 语法任务 | 命令面板 →「Import tasks from Tasks syntax」 |
| 开启到期提醒 | 设置 → 提醒通知 → 打开「到期提醒」 |
| 调整首页布局 | 长按卡片进入编辑态 |
| 切换深/浅色 | 顶部 ☾ 按钮 |
| 修改插件标题 | 设置 → 插件标题 |

### 💡 常见问题

**我的数据存哪？**
全部存为 Vault 中的 Markdown 文件（frontmatter），不存数据库，不外传。

**支持移动端吗？**
暂时只支持桌面端。

**能改「灵感收集」的名字吗？**
能。设置 → 看板 → 看板名称，可改成任意名字（机会点 / 管道 / Ideas…）。

**能同时跟踪几个倒计时？**
最多 5 个。

**Tasks 插件里的旧待办能搬进来吗？**
能。命令面板 →「Import tasks from Tasks syntax」。向导扫描库中的 Tasks emoji 任务行，预览映射后复制为 Xove 任务文件；原笔记绝不改写，重跑不产生重复。

**会联网吗？会收集数据吗？**
不会。零网络请求、零遥测，数据 100% 本地。

### 📄 说明

- **桌面端专用**：移动端不可用。
- 插件 ID：`xove-dashboard` · 版本：0.5.0 · 最低 Obsidian 版本：1.8.0。
