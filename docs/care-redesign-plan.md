# Care 页面重新设计：实施计划

- 日期：2026-11-16（America/Toronto）
- 状态：已实现（2026-11-17，C0–C6）。实现中补充的细节见 ADR-0080 的 "Implementation notes"。决定记录在 [ADR-0080](decisions/0080-show-care-as-a-today-board-with-a-separate-history-log.md)。
- 本文读者：负责实现的工程师或 Agent。请先读完本文，再打开第 2 节的设计稿对照。
- 设计稿是视觉的唯一依据。本文与设计稿冲突时，以设计稿的外观为准、以本文的行为规则为准；仍有疑问就问用户，不要自己猜。

## 1. 目标

用户点进 Care，一眼看到四件事，按这个顺序：

1. 今天要做什么（含逾期的）。
2. 今天已经做了什么。
3. 接下来 7 天要做什么。
4. 每个花园分别要做什么。

History（完成记录）是次一级的页面：从 Care 上的一个按钮点进去，只显示确实做过的事，可以按花园和类型筛选。

视觉上要和官网首屏是一家人：一块有纹理的深绿色带压住页面，其余是中性白。不能有浅绿、米色、紫蓝渐变这类"AI 味"。审美规则见 [design/frontend-aesthetic-preferences.md](../design/frontend-aesthetic-preferences.md)，动手前必须先读。

## 2. 设计稿

| 文件 | 内容 |
| --- | --- |
| [design/care-redesign/care.html](../design/care-redesign/care.html) | Care 页（Tasks）。可以点圆圈打勾，所有数字会跟着变。 |
| [design/care-redesign/history.html](../design/care-redesign/history.html) | History 页。筛选和 Show earlier records 可以点。 |
| [design/care-redesign/mockup.css](../design/care-redesign/mockup.css) | 两页共用的样式。所有尺寸、颜色、圆角、间距都在这里，实现时照抄数值。 |
| [design/care-redesign/screenshots/](../design/care-redesign/screenshots/) | `care-1440.png`、`care-390.png`、`history-1440.png`、`history-390.png` 四张整页截图。 |

用浏览器直接打开两个 HTML 文件即可（它们用相对路径读取 `public/` 里的纹理图）。设计稿里的任务和记录是为了演示布局写的示例数据，"今天"固定为 2026-11-16（周一）。种植区名字是编的，花园名是真实的三个花园。

用户还有一份在线画布（私有，其他人打不开）：<https://claude.ai/artifact/DX9vEUh963FEAoq5bH3gu7>。仓库里的文件是它的完整副本，以仓库为准。

设计稿只是静态参考：它用了 Google Fonts 链接和一段内联脚本。App 里字体用 `next/font` 自托管，样式用 CSS Modules 和 `tokens.css`，不要把设计稿的写法搬进 App。

## 3. 现状核查（2026-11-16）

| 位置 | 现状 |
| --- | --- |
| `src/app/(app)/care/page.tsx` | 渲染 `<GardenWorkspace route={{ module: "care" }} />`。 |
| `src/components/GardenWorkspace.tsx` 约 762–777 行 | Care 路由：`<CareWorkspace>` + `<Status>` + `<details>Care by location</details>`（里面是约 985 行的 `CareHub`）。 |
| `src/components/CareWorkspace.tsx`（967 行） | `CareWorkspace` 保存全部状态和处理函数；`CareTasks` 画任务列表、任务表单、完成日期表单；`CareLog` 画记录列表和记录表单；`CareLocation`、`CareTargetSelect` 是表单里的下拉。 |
| `src/components/care/Care.module.css` | 12 行，工具栏和行的样式。 |
| `src/lib/careViews.ts` | `careRows` 把根工作区和各花园的记录投影成带 owner 的行；`careEventForTask`、`completeCareTask`、`undoCareTaskCompletion`、`updateCareOwner` 负责写入。 |
| `src/lib/homeTasks.ts` | Gardens 页 "Care to do" 小盒子的数据：Overdue、Today、Coming up（7 天），以及"这次访问打的勾可以取消"。 |
| `src/components/workspace/WorkspaceHome.tsx` 约 96–114 行 | `tick` / `untick` 的实现；`GardenCard` 用 `<GardenPlanOverview compact>` 画花园缩略图。 |
| `src/components/notes/GardenNoteDialog.tsx` | 现成的 `<dialog>` + `showModal()` 弹窗写法。 |
| `src/app/(marketing)/layout.tsx` | Bricolage Grotesque 只在官网布局里声明，变量名 `--font-bricolage`；App 里现在拿不到。 |
| `src/lib/workspaceRoutes.ts` | `careLocationPath(location, view?)` 生成 `/care?location=…`；`/gardens/:id/care` 重定向到 `/care?location=:id`。 |
| 线上现象 | Tasks 页是 Overdue / Due today / Upcoming 三段纯文字，每行三个按钮（Complete、Edit、Delete）；完成要先点 Complete 再选日期；"各花园"折叠在页面最底部。 |

数据模型不变：`CareTask`（待办，可重复）和 `CareEvent`（完成记录）仍按 ADR-0023、ADR-0034、ADR-0067 的方式存放。本次只改前端展示和交互，不改后端、不改存储结构、不做迁移。

## 4. 已确认的决定

这些是用户在 2026-11-16 逐条确认的，实现时不要改。

| 编号 | 决定 |
| --- | --- |
| D1 | Care 页顶部是一块深绿纹理色带：左边标题和进度，右边毛玻璃清单（To do、Done today）。 |
| D2 | 色带下面是 7 天的 Upcoming 日历条，再下面是各花园卡片。同一条任务会在时间区和花园区各出现一次，两处勾选同步。 |
| D3 | "已做"只显示今天完成的。更早的记录在 History 页。 |
| D4 | 完成任务 = 直接点圆圈打勾，按今天记完成，可以取消。补记其他日期、编辑、删除放进每行的"⋯"菜单。 |
| D5 | Care 页只显示未来 7 天。7 天以后才到期的任务不在这页出现，进入 7 天范围时自然出现。不做 "Later" 列表，不做翻周。 |
| D6 | Tasks 页去掉 Location 下拉。带 `?location=` 的链接改为滚动到那张花园卡片并高亮。 |
| D7 | 添加和编辑任务的表单放进弹窗。 |
| D8 | History 是次级页面：只放确实做过的事，不显示没做的或逾期的。默认最近 15 条，Show earlier records 每次再加 15 条。不按月分组，按天分组。 |
| D9 | History 顶部是一条窄的深绿纹理条（放返回、标题、Add record、筛选），每一天左侧是实心深绿日期方块。 |
| D10 | History 的筛选保留两组：按花园、按照料类型。 |
| D11 | 色带大标题用 Bricolage Grotesque；进度条用荧光青柠色 `#D6FF5C`。这是 App 内唯一的青柠色。 |

## 5. 页面规格：Care（Tasks）

路由：`/care` 和 `/care?view=tasks`。从上到下三个区块，区块间距 64px，页面左右留白沿用 `--workspace-gutters`，内容最大宽度沿用 `--content-width`（1440px）。

### 5.1 今日色带

外观：圆角 20px，内边距 48px，底色 `#14281D`，上面铺 `public/landing/hero-still.webp`（`cover`），再盖一层从左到右的深色渐变保证白字可读。色带里所有文字都是白色或带透明度的白色，不用淡绿字。色带必须一眼看得出是绿色，不能暗到发黑。

左栏（从上到下）：

1. 小标题：`Today · Monday, Nov 16`（星期全称、月份缩写、日期），12.5px 全大写。
2. 大标题（`h1`，Bricolage Grotesque）：
   - 还剩 2 条及以上：`{n} things left today.`
   - 还剩 1 条：`1 thing left today.`
   - 都做完了：`All done for today.`
   - 今天本来就没有任何任务也没有完成记录：`Nothing due today.`
   - `n` = 逾期未完成 + 今天到期未完成。
3. 摘要一行，用 ` · ` 连接，数量为 0 的那段省略：`{a} overdue · {b} due today · {c} already done`。
4. 进度条：6px 高，轨道白色 20%，填充青柠色，宽度 = 已完成 ÷（已完成 + 未完成），变化时有 350ms 过渡。下面一行字 `{done} of {total} done`。今天没有任何任务时不显示进度条和这行字。
5. "Today by garden"：每个花园一个毛玻璃小格，三列排开。
   - 第一行花园名；第二行大字 `{n} left` / `All done` / `Nothing`；第三行 `{x} of {y} done` / `No care today`。
   - 小格是链接，点了滚动到下面对应的花园卡片（`#care-garden-{id}`）。
   - 只列真实花园，不含 "All gardens"。花园超过 3 个时自动换行。
6. 按钮：`Add task`（白底实心胶囊，带加号）和 `History`（毛玻璃胶囊，链接到 `/care?view=history`）。

右栏：毛玻璃卡片，圆角 24px。

- 分组标题 `To do · {n}`，下面是未完成的行：先逾期（按到期日从早到晚），再今天到期。
- 每行：圆圈（打勾）、类型图标（水滴 = Watering，嫩芽 = Fertilizing）、标题、副标题、逾期标记、"⋯"。
  - 标题：`Water {花园名}` / `Fertilize {花园名}`；工作区级任务是 `Water all gardens` / `Fertilize all gardens`。沿用 `homeTasks.ts` 里的 `title()`。
  - 副标题：种植区或"种植区 · 植物组"，整园任务写 `Whole garden`；可重复任务在后面加 ` · Every {n} days`；任务有备注时另起一行显示备注。
  - 逾期标记：红字浅红底的小胶囊，`Due yesterday` 或 `Due {n} days ago`（沿用 `lateLabel()`）。宽度小于 600px 时胶囊放不下，改成副标题下面的一行浅红色文字。
- 没有未完成的行时显示：`Nothing left. Everything for today is done.`
- 分组标题 `Done today · {n}`，下面是今天完成的行：圆圈实心、标题划掉、没有"⋯"。
  - 来源是"日期等于今天的完成记录"，不管它是在这里打勾、在 Gardens 页打勾、从 AI Note 保存，还是在 History 手动添加的。规则和 `homeTasks.ts` 现在的做法一致。
  - 这次访问里打的勾可以取消（再点一下圆圈）。其他来源的记录，圆圈显示为已完成但不可点，更正要去 History。
- 没有完成的行时显示：`Nothing ticked off yet.`

打勾的行为（D4）：

- 点圆圈 = 用今天的日期完成这条任务：调用 `careEventForTask` 生成一条记录，再用 `completeCareTask` 写回这条任务原来的 owner。一次性任务从待办里消失；可重复任务的到期日变成"今天 + 间隔"。
- 取消勾选 = `undoCareTaskCompletion`：删掉刚才那条记录，把任务恢复原样。
- 这两个函数和 Gardens 页用的是同一套。把 `WorkspaceHome.tsx` 里的 `tick` / `untick` 和 `completions` 状态抽成一个共用 hook（建议 `src/hooks/useCareTicks.ts`），两处都用它。
- 打勾后这一行会从 To do 移到 Done today。键盘焦点要跟着这一行走，落在它新位置的圆圈上。
- 圆圈是 `<button role="checkbox" aria-checked>`，点击区域 44×44px，可见圆圈 22px。

"⋯"菜单（只在 To do 的行上）：

| 菜单项 | 行为 |
| --- | --- |
| Edit task | 打开任务弹窗，编辑这条任务。 |
| Complete on another date… | 打开弹窗，只有一个 Completion date 字段，默认今天。保存逻辑沿用现有的 `completeCareTask` 处理函数。 |
| Delete task | 沿用现有的确认对话框和文案（`removeCareTask`）。 |

先在代码里找有没有现成的菜单组件；没有就写一个小的：按钮 `aria-haspopup="menu"` + `aria-expanded`，弹层 `role="menu"`，项 `role="menuitem"`，支持上下方向键、Esc 关闭并把焦点还给按钮、点外面关闭。

任务弹窗（D7）：

- 写法照 `GardenNoteDialog.tsx`：原生 `<dialog>` + `showModal()`，标题 `Add care task` / `Edit care task`。
- 表单字段、校验、提示文案和现在完全一样：Task location（只在新增时显示，必须明确选择）、Care type、Due date、Target、Repeat every whole days (optional)、Note (optional)。
- 现有的草稿保护必须保留：`useWorkspaceDraft` 的各个 key、`useUnsavedDraft`、`confirmDiscard`、"owner 不存在时不写入别处"的检查（ADR-0062、ADR-0067）。做法是保留 `CareWorkspace` 里的状态和处理函数，只把表单从页面里搬进弹窗。
- 新增的任务到期日在 7 天以后时，保存后的提示写成：`Task added. It will appear here 7 days before {日期}.`（见第 9 节的已知限制）。

### 5.2 Upcoming 日历条

- 区块标题：小标题 `Next 7 days`，大标题 `Upcoming`。
- 一张白色卡片（圆角 20px），等分成 7 列，列之间一条细线。列是明天到第 7 天，共 7 天，今天不在里面。
- 每列顶部：星期缩写（全大写小字）+ 日期数字（22px）。
- 每列下面列出当天到期的任务：类型图标 + 标题（`Water {花园名}`）+ 副标题。没有任务的那天写 `Nothing planned`。
- 这里的任务不能打勾，也没有"⋯"。标题本身是一个按钮，点了打开任务弹窗编辑这条任务；弹窗底部提供 Delete task 和 Complete on another date…。（设计稿里没有画出这个点击行为，这是为了让 7 天内的任务有地方修改而补充的规则。）
- 宽度小于 900px：改成 7 行竖排，每行左边是星期和日期，右边是任务。不出现横向滚动。

### 5.3 各花园

- 区块标题：小标题 `By garden`，大标题 `Coming up in each garden`。
- 第一行是 "All gardens" 横条（白色卡片，圆角 14px）：左边深绿圆形图标、`All gardens`、`Applies to every garden`；右边列出工作区级的任务。今天到期、逾期或今天完成的在前（可打勾），未来 7 天的在后（日期小方块样式）。工作区级没有任何任务时，整条不显示。
- 下面是花园卡片，`repeat(auto-fit, minmax(300px, 1fr))`，间距 20px。顺序与 `workspace.gardens` 一致。每张卡片：
  1. 缩略图：132px 高，点阵背景，用 `<GardenPlanOverview compact>`，和 Gardens 页的卡片同一个组件。没有带尺寸的种植区时显示 Gardens 页同样的占位文字。
  2. 花园名（18px）+ `{n} planting areas`，右边一个小胶囊：`{n} to do today`（深绿实心）/ `Done for today` / `Nothing today`（浅灰）。
  3. `Today` 段：这个花园今天到期和逾期的任务，以及今天完成的记录。可以打勾，和色带里的清单是同一份数据。逾期的带 `Overdue` 小胶囊。完成的划掉、留在原位。没有时写 `Nothing due today.`
  4. `Upcoming` 段：这个花园未来 7 天的任务。每行左边是"星期缩写 + 日期"两行小字，然后是图标、标题、副标题。没有时写 `Nothing in the next 7 days.`
  5. 底部链接 `Open {花园名} →`，去 `gardenPath(id)`。
- 卡片里的标题省略花园名：`Water {植物组或种植区}`，整园任务写 `Water whole garden`；副标题是种植区名（标题已经是种植区时留空），可重复任务加 `Every {n} days`。
- 卡片里任务的标题同样是按钮，点了打开任务弹窗（同 5.2）。
- 每张卡片的 `id` 是 `care-garden-{gardenId}`，"All gardens" 横条的 `id` 是 `care-garden-all-gardens`。
- 没有任何花园时：沿用 `EmptyState`，一句话加一个 `Create garden` 按钮。

### 5.4 `?location=` 链接（D6）

- `/care?location={gardenId}`：页面正常显示全部内容，加载后滚动到那张花园卡片，并给它一个 2 秒左右的高亮（深绿描边加外发光，见 `mockup.css` 的 `.garden-card:target`）。`location=all-gardens` 滚动到 "All gardens" 横条。找不到对应花园就什么都不做。
- 滚动时要给固定页头留出位置（`scroll-margin-top`）。开启"减少动态效果"时直接跳转，不做平滑滚动。
- Tasks 页不再有 Location 下拉和 "N tasks" 计数。
- `/gardens/:id/care` 的重定向不变。

## 6. 页面规格：History

路由：`/care?view=history`，可带 `&location=` 和 `&type=`。区块间距 32px。

### 6.1 顶部深绿条

- 和 Care 的色带同一种纹理、渐变、圆角（20px），但只有两行高，内边距 28px 40px 30px。
- 第一行：左边 `‹ Care` 毛玻璃胶囊按钮（链接到 `/care`）、大标题 `History`（`h1`，Bricolage Grotesque）、一句说明 `Care you have done, newest first.`；右边白底实心按钮 `Add record`。
- 第二行：两组筛选和右对齐的计数。
  - `Garden`：`All`、每个花园的名字、`All gardens`。
  - `Care`：`All`、`Watering`、`Fertilizing`。
  - 每个选项是毛玻璃胶囊按钮，`aria-pressed`；选中的那个变成白底深字。最小高度 44px。
  - 计数：全部显示完时写 `{n} records`（1 条写 `1 record`）；还有更多时写 `Showing {shown} of {total} records`。
- 筛选写进 URL：`location` 取 `all`（默认，可省略）、`all-gardens`、或花园 id，含义和 ADR-0067 相同；`type` 取 `watering` 或 `fertilizing`，不带就是全部。改筛选用 `router.replace`，不往浏览器历史里堆记录。筛选一变，显示条数回到 15。
- `location` 指向已不存在的花园时：筛选显示为 `All`，并用页面现有的状态提示告诉用户那个位置不存在了。

### 6.2 记录清单

- 一张连续的白色卡片（圆角 20px），按天分组，天与天之间一条细线。最新的在最上面。
- 只包含 `careEvents`（确实做过的事）。不显示任何待办、逾期或"没做"的内容（D8）。
- 每一天左侧（宽 260px）：
  - 日期方块：56×60px，圆角 12px，实心深绿 `#1F4230`，白字，上面是日期数字，下面是月份缩写（全大写）。
  - 旁边：`Today` / `Yesterday` / 星期全称，下面一行 `{n} records`。
- 每一天右侧是当天的记录行：类型图标、标题、副标题、备注、"⋯"。
  - 标题用过去式：`Watered {花园名}` / `Fertilized {花园名}`；工作区级记录是 `Watered all gardens` / `Fertilized all gardens`。
  - 副标题：目标（种植区、"种植区 · 植物组"，或 `Whole garden`）；施肥记录后面接 `careFertilizerDetails()` 的结果（肥料名和用量）。工作区级记录的副标题写 `Applies to every garden`。目标已被删除时沿用 `careTargetLabel()` 的 `Former planting area: …` 写法。
  - 备注：有就另起一行，正文颜色，保留换行。
  - "⋯"菜单：`Correct record`（打开记录弹窗）和 `Delete record`（沿用现有确认文案）。
- 默认显示最近 15 条（按条数算，不按天数）。还有更多时，卡片下方居中显示实心深绿按钮 `Show earlier records`，每点一次多显示 15 条；全部显示完后按钮消失。
- 同一天内的顺序：后添加的在前。
- 筛选后没有结果：卡片里写 `No care records match these filters.`，下面一个 `Clear filters` 按钮。
- 完全没有任何记录：写 `No care records yet.`，下面一句 `Tick a task on Care, or add a record here.`
- 宽度小于 600px：日期方块那一栏占满一行，记录行排在它下面；筛选按钮自动换行。

### 6.3 记录弹窗

`Add record` 和 `Correct record` 打开同一个弹窗，标题 `Add care event` / `Edit care event`。字段、校验、草稿保护和现在的记录表单完全一样（Record location、Care type、Date、Target、三个肥料字段、Note）。当前有花园筛选时，新增记录默认用那个花园作为 location。

## 7. 视觉规格

所有数值以 `design/care-redesign/mockup.css` 为准。下面是需要新增或特别注意的部分。

### 7.1 需要新增的 token（加进 `src/styles/tokens.css`）

先看 `src/components/marketing/Landing.module.css` 里是否已经有同样用途的值，有就复用它的名字。

| 建议名字 | 值 | 用途 |
| --- | --- | --- |
| `--color-band-base` | `#14281d` | 色带照片下面的底色；毛玻璃上已完成圆圈里的对勾 |
| `--color-band-ink` | `#0e1d14` | 色带里白色按钮、选中筛选上的深色文字 |
| `--color-accent-lime` | `#d6ff5c` | 只用于进度条填充 |
| `--color-care-watering-on-dark` | `#b4e1ee` | 毛玻璃上的浇水图标 |
| `--color-care-fertilizing-on-dark` | `#edd08f` | 毛玻璃上的施肥图标 |
| `--color-error-on-dark` | `#ffc9c2` | 窄屏时毛玻璃上的逾期文字 |
| `--color-done-ink` | `#6b6b6f` | 白底上被划掉的标题 |

`src/styles/tokens.test.ts` 要补上对比度检查：`--color-done-ink` 在白底上不低于 4.5:1。

### 7.2 字体

- 把 `Bricolage_Grotesque` 的 `next/font` 声明从 `src/app/(marketing)/layout.tsx` 移到一个共用模块，让 `(app)` 布局也能拿到 `--font-bricolage`。
- App 里只有两处用它：Care 色带的大标题、History 的 `History` 标题。其他文字一律 Instrument Sans。

### 7.3 颜色和形状规则

- 深绿纹理只出现在两处：Care 的今日色带、History 的窄条。其余区域是中性灰白，不染绿。
- 内容区的品牌深绿只用在有意义的元素上：小标题、区块标题、计数胶囊、日期方块、已完成的圆圈、主按钮、链接。
- 类型图标是 30px 圆形浅灰底，图标颜色用 `--color-care-watering` / `--color-care-fertilizing`。两种类型同时靠图标形状和文字区分，不只靠颜色。
- 圆角：色带和大卡片 20px，毛玻璃卡片 24px，花园卡片和小格 14px，日期方块 12px，按钮和筛选是胶囊形。
- 毛玻璃：`background: rgb(10 26 17 / 38%)` + `backdrop-filter: blur(22px) saturate(1.1)` + 白色 16% 细描边 + 顶部内高光。只用在色带里面。
- 卡片不用重阴影。只有日期方块和毛玻璃卡片有投影。
- 不用 emoji，图标一律内联 SVG 描边。

### 7.4 动效

- 进度条宽度 350ms；圆圈填充 140ms；小格悬停上移 1px；按钮按下下移 1px。
- `prefers-reduced-motion: reduce` 时全部关闭。
- 色带是静态图片，不引入 WebGL 着色器。

### 7.5 响应式

| 宽度 | 变化 |
| --- | --- |
| ≥ 1024px | 左右留白 64px；色带左右两栏；日历条 7 列；花园卡片 3 列左右。 |
| 900–1023px | 留白 48px；色带两栏可能换成上下；日历条仍 7 列。 |
| < 900px | 日历条改成 7 行竖排。 |
| < 600px | 色带内边距 28px 20px；"Today by garden" 小格改成单列；逾期胶囊改成文字；History 的日期栏占满一行。 |

在 1440、768、390px 宽度和 200% 缩放下都不能出现整页横向滚动。

### 7.6 无障碍

- 标题层级：Care 页 `h1` 是色带大标题，区块标题是 `h2`，花园名是 `h3`。History 页 `h1` 是 `History`，每一天的名字是 `h2`。
- 色带里的焦点描边用白色，其余地方用品牌深绿。
- 所有可点的东西至少 44×44px。
- 白底上的正文和次要文字对比度不低于 4.5:1；不要用 `--color-ink-subtle`（`#8D8D91`）写字，它只用于边框。
- 打勾、取消、筛选变化后，用页面现有的 `Status`（`role="status"`）播报结果。

## 8. 分阶段实施

每个阶段是一个可以独立验收的小功能，一个阶段一个提交。阶段之间不要并行改同一个文件。

### C0 准备（不写功能代码）

- 当前分支是 `garden-plan-levels`，比 `origin/main` 多一个未推送的提交 `0aaf99c`（ADR-0078）。从它切出 `care-redesign` 分支。是否先把 `0aaf99c` 推送或合并，由用户决定。
- 本文、ADR-0080、`design/care-redesign/` 随第一个提交一起进仓库。

### C1 数据投影（纯函数，界面不变）

- 新增 `src/lib/careBoard.ts`，导出 `careBoard(workspace, today, completions)`，返回页面需要的全部数据：
  - `todo`：逾期和今天到期的未完成行，已排好序。
  - `doneToday`：今天完成的行，标明哪些可以取消。
  - `progress`：`{ done, total }`。
  - `days`：正好 7 项（明天到第 7 天），每项含日期、星期缩写和当天的行。
  - `gardens`：每个花园的 `today` 行、`upcoming` 行、未完成数、种植区数量。
  - `allGardens`：工作区级的 `today` 行和 `upcoming` 行。
- 和 `homeTasks.ts` 共用标题、目标、逾期文案、排序这些小函数，保证 Gardens 页的小盒子和 Care 页说的是同一套话。`homeTasks` 的对外行为不变，它的现有测试必须原样通过。
- 新增 `src/lib/careHistory.ts`：`careHistory(workspace, { location, type, limit })` 返回按天分组的记录、已显示条数和总条数。
- 单元测试（`careBoard.test.ts`、`careHistory.test.ts`）至少覆盖：
  - 逾期排在今天到期之前；同一天按 id 稳定排序。
  - 到期日在第 7 天的任务出现在最后一列，第 8 天的不出现。
  - 工作区级任务只算在 `allGardens` 和 `todo` 里，不算进任何花园。
  - 根工作区和花园里 id 相同的遗留镜像记录只算一次（沿用 `careRows` 的规则）。
  - 今天的完成记录出现在 `doneToday`；只有这次访问打的勾标记为可取消。
  - 可重复任务打勾后，新到期日在 7 天内就出现在对应那一列，超出就不出现。
  - History：按日期从新到旧；同一天后添加的在前；`location` 和 `type` 筛选；`limit` 截断后总数正确。
- 验收：`npm run test`、`npm run typecheck`、`npm run lint` 通过；页面看起来和之前完全一样。

### C2 今日色带和打勾

- 新增 `src/components/care/CareBoard.tsx` 和 `CareBoard.module.css`，实现 5.1。
- 新增 `src/hooks/useCareTicks.ts`，`WorkspaceHome.tsx` 改为使用它。
- `CareWorkspace` 继续持有状态和处理函数；Tasks 视图改为渲染 `CareBoard`，原来的 `CareTasks` 列表删掉。
- 任务表单和完成日期表单搬进弹窗；实现"⋯"菜单。
- 加 token（7.1）和字体（7.2）。
- 这一阶段结束时，日历条和花园卡片还没有，旧的 "Care by location" 折叠块暂时保留。
- 验收：
  - 打勾后标题、摘要、进度条、小格一起变化；刷新后完成记录还在；到 History 能看到这条记录。
  - 取消勾选后任务回到 To do，记录消失。
  - 可重复任务打勾后，下一次的到期日 = 今天 + 间隔。
  - "⋯"里的三个操作都能用；编辑中的草稿在关闭弹窗、切换页面时按现有规则保护。
  - 根工作区的任务写回根，花园的任务写回那个花园（`GlobalCare.test.tsx` 里 owner 相关的断言保留并通过）。

### C3 Upcoming 日历条

- 在 `CareBoard` 里实现 5.2。
- 验收：7 列的日期正确（跨月、跨年也对）；空的那天写 `Nothing planned`；点任务标题能打开编辑弹窗；390px 宽度下是 7 行竖排，没有横向滚动。

### C4 各花园和 `?location=`

- 实现 5.3 和 5.4。
- 删除 `GardenWorkspace.tsx` 里的 `<details>Care by location</details>` 和 `CareHub`；删除 Tasks 页的 Location 下拉。
- 验收：
  - 在花园卡片里打勾，色带里的同一条任务同步变化，反过来也一样。
  - 打开 `/care?location={某花园 id}` 会滚动到那张卡片并高亮；`/gardens/{id}/care` 仍然重定向并落在那张卡片上。
  - 色带里的小格点了能跳到对应卡片。
  - 没有任务的花园显示两句空状态；没有花园时显示空状态和 `Create garden`。

### C5 History 页

- 新增 `src/components/care/CareHistory.tsx` 和样式，实现第 6 节。原来的 `CareLog` 列表删掉，表单搬进弹窗。
- 验收：
  - 只出现完成记录；逾期任务不出现。
  - 两组筛选可以组合；URL 跟着变；刷新后筛选还在。
  - 超过 15 条时出现 `Show earlier records`，每次加 15 条，计数文字正确。
  - `Correct record` 和 `Delete record` 只改动记录原来的 owner。
  - `‹ Care` 回到 `/care`。

### C6 验收和文档

- 更新受影响的测试：
  - `src/components/GlobalCare.test.tsx`：Location 下拉、Complete 按钮、Tasks/History 标签相关的用例改成新控件；owner 写入的断言全部保留。
  - `src/components/DeletionSafety.test.tsx`：确认删除流程仍然通过。
  - `e2e/global-care.spec.ts`：改成"History 用筛选按钮、Tasks 用打勾"的流程；保留 390 和 1440 两个宽度、保留"写回原 owner"和"无横向滚动"的断言。
  - `e2e/confirmation.spec.ts`（任务表单草稿保护，现在在弹窗里）、`e2e/workspace-routes.spec.ts`（`?location=` 落点）、`e2e/app-pages-review.spec.ts`（Care 页的标题变了）、`e2e/homepage.spec.ts`（"All tasks" 链接仍指向 `/care?view=tasks`）、`e2e/sync-recovery.spec.ts`。
  - 新增一个 e2e：在 Care 打勾 → 刷新 → History 里看到这条记录。
- 文档：
  - `docs/decisions/README.md` 的索引加上 ADR-0080（ADR 文件本身已写好）。
  - `design/frontend-aesthetic-preferences.md`：荧光色的使用处数、展示字体在 App 里的两处例外，按 ADR-0080 更新。
  - README 或 `docs/screenshots/` 里如果有 Care 的截图，重新截。
  - `docs/interview-stories.md` 补一条这次改版的真实经过。
- 全量检查：`npm run test`、`npm run typecheck`、`npm run lint`、`npm run test:e2e`、`git diff --check`。

## 9. 不做的事和已知限制

- 不改后端、数据结构、同步和 AI Note。
- 不做"AI Note 的记录自动勾掉到期任务"（另有约定，单独立项）。
- 不改 Gardens 页的 "Care to do" 小盒子的外观，只让它和 Care 页共用打勾逻辑。
- 不新增照料类型，仍只有 Watering 和 Fertilizing。
- 已知限制（用户已确认接受，D5）：到期日在 7 天以后的任务，在进入 7 天范围之前，Care 页上看不到、也无法编辑或删除。可重复任务完成后如果间隔大于 7 天，也会暂时从页面上消失。新增这类任务时用保存提示告诉用户它什么时候会出现。如果以后要补入口，需要新的决定。

## 10. 每阶段统一的完成标准

- 约定的用户流程从头到尾可用，加载、空、错误状态都处理了。
- 相关单元测试和端到端测试通过；类型检查、lint、`git diff --check` 通过。
- 对照设计稿和四张截图，在 1440 和 390px 宽度下逐块核对；色带看得出是绿色；没有整页横向滚动。
- 没有引入新的组件库或第二套样式系统；颜色都来自 `tokens.css`。
- 提交只包含这一阶段的改动。提交、推送、合并都要先得到用户同意。
- 交接说明写清：改了哪些文件、跑了哪些检查、还有什么限制和后续工作。
