# Next Season 重新设计：实施计划

- 日期：2026-11-16（America/Toronto）
- 状态：设计已确认，尚未开始写代码。决定记录在 [ADR-0082](decisions/0082-show-next-season-as-a-rotation-sheet-with-a-dark-plan-lane.md)。
- 本文读者：负责实现的工程师或 Agent。请先读完本文，再打开第 2 节的设计稿对照。
- 设计稿是视觉的唯一依据。本文与设计稿冲突时，以设计稿的外观为准、以本文的行为规则为准；仍有疑问就问用户，不要自己猜。

## 1. 目标

Next Season 是用户决定"明年每块地种什么"的页面，依据是三年轮作：一块地最近三季种过某个科的作物，明年最好换一个科。

用户在这一页一眼要看到四件事：

1. 这个花园计划到哪了（几块地已经选好）。
2. 每块地之前种过什么、明年该避开哪个科。
3. 每块地明年种什么，哪一个选择和轮作冲突。
4. 这些选择落在花园的哪个位置。

这次要解决的问题：

- **全是文字**：旧页面每块地一张卡片，里面是四段句子，演示数据里一共 19 张。新页面一块地一行，植物是色点加名字，科是小标签。
- **平**：旧页面页头以下没有深色。新页面把有纹理的深绿做成"明年计划"这一整列。
- **折叠**：旧页面把地图、三年历史、AI 助手都藏在箭头后面。新页面没有折叠箭头。
- **功能太多**：见第 4 节 N7 的取舍清单。

设计思路一句话：**这一页的主角是明年的计划，所以深绿就是"2027"这一列。** 它是一块压在白色表格右端的深色板，上、下、右三边都比表格多出一截，不被白卡片包住，也不重复 Gardens 和 Care 的横向色带。

审美规则见 [design/frontend-aesthetic-preferences.md](../design/frontend-aesthetic-preferences.md)，动手前必须先读。同系列的两份计划：[Gardens 首页](garden-home-redesign-plan.md)、[Care](care-redesign-plan.md)。

## 2. 设计稿

| 文件 | 内容 |
| --- | --- |
| [design/season-redesign/season.html](../design/season-redesign/season.html) | 定稿。可以点 "Choose a plant"、"+"、"×"、花园切换、"Plan with AI"。底部的黑色胶囊只是原型用的状态切换器，不属于设计。 |
| [design/season-redesign/season.css](../design/season-redesign/season.css) | 定稿的样式。所有尺寸、颜色、圆角、间距都在这里，实现时照抄数值。 |
| [design/season-redesign/screenshots/](../design/season-redesign/screenshots/) | `season-1440.png`、`season-1024.png`、`season-768.png`、`season-390.png` 四个宽度；`state-empty-1440.png`（一块地都没选，线上演示现在的状态）；`state-full-1440.png`（全部选完）；`community-1440.png`、`front-yard-1440.png`（另外两个花园）；`chooser-1440.png`（选植物的输入框展开，并出现冲突提示）；`plan-with-ai-1440.png`、`plan-with-ai-draft-1440.png`（AI 抽屉的表单和草稿）。 |
| [docs/screenshots/season-rotation.png](screenshots/season-rotation.png) | 改之前的页面（README 里的截图）。 |

用浏览器直接打开 `season.html` 即可（它用相对路径读取 `public/` 里的纹理图）。地址后面可以加参数：`?garden=backyard|community|front` 和 `&scene=some|empty|full`。

原型和真实 App 的差别，实现时以本文为准：

- 原型的种植区形状和位置是手工摆的近似值，真实地图用种植区的实际尺寸和位置。
- 原型里 Raised bed 2 的 2025 年记录是为了展示多年历史加的示例，演示数据里只有 2026 年。
- 原型 AI 抽屉里的草稿是脚本按规则排的，不是真实的 Agent 输出。抽屉里的内容以现有的 `AllocationAssistant` 为准（见 5.8）。
- 原型用了 Google Fonts 链接和内联脚本；App 里字体用 `next/font` 自托管，样式用 CSS Modules 和 `tokens.css`，不要把原型的写法搬进 App。

## 3. 现状核查（2026-11-16）

| 位置 | 现状 |
| --- | --- |
| `src/app/(app)/season/page.tsx` | 路由，渲染 `<GardenWorkspace route={{ module: "season" }} />`。 |
| `src/components/SeasonPlanner.tsx` | 整页。花园下拉框（默认 All gardens）、每个花园一节、每块地一张 `article` 卡片、`<details>` "Rotation details"、`<details>` "Plan preview"（`SeasonGardenPreview`，带 Planting areas / Full garden 切换）、`<details>` "Allocation Assistant"。文件里还有全部的计算函数：`recentHistory`、`recentFamilies`、`rotationFit`、`plannedForArea`、`uniqueHistoryLabels`、`planTokens` 等。 |
| `src/components/season/Season.module.css`、`src/styles/legacy-workspace.css`（`.season-*`） | 现在的样式。 |
| `src/components/AllocationAssistant.tsx` | AI 分配助手：选作物（固定 5 种）、可轮作的种植区超过 3 块时选最多 3 块、可选的一句偏好、生成草稿、确认后写入、公开演示里看录制的示例。 |
| `src/lib/seasonPlanner.ts` | `companionNotes()`：番茄 + 罗勒、番茄 + 生菜、同一块地同科两种作物，三类提示，各带来源链接。 |
| `src/lib/seasonAllocation.ts` | `nextSeasonYear()`、`eligibleAllocationAreas()`（温室不参与）、`MAX_ALLOCATION_AREAS = 3`。 |
| `src/components/GardenWorkspace.tsx` 约 562–635、698–707 行 | 保存、删除、确认 AI 草稿的处理函数；把 `?garden=` 传给 `SeasonPlanner`，切换时 `navigate(id === "all" ? "/season" : seasonGardenPath(id))`。 |
| `src/components/workspace/AppShell.tsx` 约 71 行 | 页面 `h1` 是 `Next Season · {年份}`。 |
| `src/lib/gardenWorkspace.ts` 的 `defaultPlantColor`、`src/lib/planAppearance.ts` | 植物配色（ADR-0076）。 |
| `src/styles/tokens.css` | 已有 `--color-plan-bed`、`--color-plan-bed-edge`、`--color-warning`、`--color-warning-surface`。 |
| `public/landing/hero-still.webp`、`public/landing/footer-still.webp` | 官网首屏和页尾的静态纹理图，已经在仓库里。 |
| 线上现象 | 三个花园共 19 张卡片叠成一长页；每张卡片四段文字；地图、历史、AI 都要点箭头才看得到；页头以下没有深色。 |

数据模型不变。本次只改 Next Season 页的展示和排版，不改后端、不改存储结构、不改轮作规则、不改 Agent。

## 4. 已确认的决定

这些是用户在 2026-11-16 看过原型后确认的，实现时不要改。

| 编号 | 决定 |
| --- | --- |
| N1 | 页面主体是一张"轮作表"：一行一块地，从左到右四列：种植区、最近三季种过什么、该避开的科、明年的计划。 |
| N2 | 深绿纹理是"明年计划"这一整列。它是一块深色板，压在白色表格右端，上、下、右各多出 14px。板顶是大号年份、白色进度条、已计划的地块数。 |
| N3 | 一次只看一个花园。页面右上是一排花园切换链接，每个带进度（`Backyard 3/10`）。不再有 All gardens 视图和下拉框。 |
| N4 | 页面上没有折叠箭头。地图常驻在表格右边；三年历史直接写在行里。 |
| N5 | 选了和最近三季同科的作物，旁边出现提示标签（例如 `Root crop again`），板顶显示 `1 to check`。只是提示，不阻止保存。 |
| N6 | Allocation Assistant 收进一个按钮 "Plan with AI"，点了才从右侧打开抽屉。页面上平时看不到它的任何内容。 |
| N7 | 取舍。删掉：All gardens 视图、"Rotation details" 折叠、"Plan preview" 折叠、历史里的具体种植日期、常驻的 "Good rotation fit" 一行、"Planting areas / Full garden" 切换、地图圆圈里的植物缩写。保留但换位置：三年历史（行内）、建议的科（只在选植物时出现）、Companion notes（只在有提示时出现一行）、地图（常驻）、AI 助手（按钮后面）。 |
| N8 | 进度条用白色。青柠色只代表"今天的照料进度"（ADR-0080、ADR-0081），这一页不用。 |
| N9 | 不新增颜色。植物配色沿用 ADR-0076。只有两处用 Bricolage Grotesque：深色板上的年份、AI 抽屉的标题。 |

## 5. 页面规格

页面左右留白沿用 `--workspace-gutters`，内容最大宽度沿用 `--content-width`（1440px）。页面从上到下两个区块，间距 36px：页头行、主体（轮作表 + 地图）。

文中的 `Y` 指计划年份，来自 `nextSeasonYear()`（现在是 2027）。

### 5.1 页头行

左边：

- `h1`：`Next Season`。`AppShell` 里的标题从 `Next Season · {Y}` 改成 `Next Season`，年份由深色板显示。浏览器标签页标题不变。
- 一句说明（16px，次要色，最宽约 60 个字符）：`Choose what grows in each planting area. A bed rests from the crop families it grew in the last three seasons.`

右边：花园切换。

- `<nav aria-label="Garden">`，里面每个花园一个链接，按工作区里的顺序。链接去 `seasonGardenPath(id)`；当前花园 `aria-current="page"`。
- 每个链接显示花园名和一个小计数 `{已计划的地块数}/{地块总数}`；`aria-label` 写成 `{花园名}, {n} of {m} areas planned`。
- 外观：白底胶囊容器，1px 浅灰边；当前项是品牌深绿底白字。数值见 `.garden-switch`。
- 只有一个花园时也显示（一个链接）。
- 地址规则：`/season?garden={id}` 显示那个花园。`/season` 不带参数时显示第一个花园，地址不跳转，第一个链接标为当前。`GardenWorkspace` 里 `id === "all"` 的分支删除。旧地址 `/gardens/{id}/season` 的重定向不变。

`notice`（例如 `Plant removed from the season plan.`）沿用现在的 `InlineNotice`，放在页头行下面。

### 5.2 主体网格

| 宽度 | 布局 |
| --- | --- |
| ≥ 1200px | 两列：轮作表 `minmax(0, 1fr)`，地图 372px，列间距 42px（28px + 深色板多出的 14px）。地图卡片 `position: sticky; top: 24px`（要加上粘性页头的高度 `--app-header-height`）。 |
| 860–1199px | 一列：轮作表在上，地图在下，间距 28px。 |
| < 860px | 一列，轮作表变成卡片（见 6.6）。 |

### 5.3 轮作表

整张表是一个 `<section aria-label="{Y} rotation sheet for {花园名}">`：白底，1px 浅灰边，圆角 20px，上下各留 14px 外边距给深色板。

每一行是四列网格：`212px minmax(0, 1fr) 148px 356px`。

**表头**（数值见 `.b-head`）：

- 左边三列的上方：花园名（`h2`，26px，字重 500）和一行 `{n} planting areas`（单数 `1 planting area`）；最右是 "Plan with AI" 按钮（见 5.8）。
- 下面一行三个列标题（12.5px 全大写，次要色）：`Planting area`、`Grown {Y-3}–{Y-1}`、`Rest from`。
- 第四列是深色板的板顶（见 5.4）。

**每一行**（`role="group"`，`aria-label` 是种植区名）：

1. **种植区**：一个 24px 的圆形序号（浅灰底；这一行被指到或有焦点时变品牌深绿底白字）、种植区名（15.5px，字重 600）、下面一行类型（`growingAreaKindLabels[area.kind]`，13px 次要色）。序号从 1 开始，按种植区在花园里的顺序，和地图上的数字一一对应。序号 `aria-hidden`。
2. **最近三季**：数据是 `recentHistory()`（`Y-3` 到 `Y-1`）。按年份从新到旧分组，每个年份一行：年份（12.5px，次要色，等宽数字）后面跟这一年的植物，每种植物一个 11px 色点加名字。同一年里的植物用 `uniqueHistoryLabels()` 去重。色点的填充色和描边色用 ADR-0076 的植物配色，必须和 Garden Plan 里同一种植物的颜色一致。三季都没有记录时显示 `No record`（次要色）。
3. **Rest from**：`recentFamilies()` 的结果，每个科一个小标签（浅灰底胶囊，12.5px，字重 600，前面一个"圆圈加斜线"图标），文字是 `plantingCropFamilyLabels[family]`。标签的 `title` 用现有 `cropFamilySummaryLabel()` 的文字（带例子，如 `Nightshade (tomato, pepper, eggplant)`）。没有要避开的科时显示 `Any family`（次要色）。所有类型的种植区都按同一规则显示，和现在一样。
4. **{Y} 计划**：在深色板上，见 5.5。

行与行之间一条细线：左边三列是 `--color-line`，深色板上是白色 14%。鼠标指到一行时，左边三列底色变 `#fafaf9`，深色板那一格加白色 7%。

花园没有种植区时，整张表换成一个空状态块（见 5.9），不显示深色板和地图。

### 5.4 深色板和板顶

深色板是表格里一个绝对定位的背景层（`aria-hidden`）：宽 `356px + 14px`，`top: -14px; bottom: -14px; right: -14px`，圆角 20px，投影 `0 36px 60px -34px rgb(10 26 17 / 80%)`。底色 `#14281D`，铺 `public/landing/hero-still.webp`（`background-size: auto max(112%, 880px)`，位置 `58% 50%`），再盖一层渐变（数值见 `.tex-ridges::before`）。板上的字全部白色或带透明度的白色，不用淡绿字。深色板必须一眼看得出是绿色，不能暗到发黑。

板顶从上到下：

1. 小标题 `Planting plan`（12.5px 全大写）。
2. 年份 `{Y}`（Bricolage Grotesque，76px）。
3. 进度条：6px 高，轨道白色 20%，填充白色，宽度 = 已计划的地块数 ÷ 地块总数。
4. 进度条下面一行（14px）：左 `{n} of {m} areas planned`；右 `{k} to check`，`k` = 这个花园里带 5.5 提示标签的计划植物数，`k = 0` 时不显示。

"已计划的地块"指 `plannedForArea()` 至少有一条的种植区（和现在的统计一样）。

### 5.5 计划格

深色板上的每一格（内边距 12px 24px）：

**有计划时**，一行排开：

- 每个计划植物：12px 色点（植物配色的填充色，外圈白色 70% 的 1.5px 描边）加名字（15px，字重 600，白色）。名字用 `planting.commonName`，和现在一样。
- 提示标签：这个植物的 `cropFamily` 在这块地的 `recentFamilies()` 里（并且不是 `other`）时，名字后面跟一个标签 `{科名} again`，例如 `Root crop again`。警告色文字、警告浅底（`--color-warning`、`--color-warning-surface`），前面一个三角图标。标签带文字，不只靠颜色。
- 移除按钮：每个植物后面一个 28px 的圆形 "×"（`aria-label="Remove {植物} from {种植区}"`）。鼠标指到这一行或焦点在这一行里时显示（不透明度 0.6，悬停或有焦点时 1）；没有悬停能力的设备上一直显示。点击后的确认对话框、文字、`onRemovePlan` 都和现在一样。
- 末尾一个 28px 的虚线圆形 "+"（`aria-label="Add a plant to {种植区}"`），点击展开 5.6 的输入框。

**没有计划时**：一个虚线胶囊按钮 `+ Choose a plant`（`aria-label="Choose a plant for {种植区}"`），高 34px，白色 60% 的虚线边，悬停变实线加白色 12% 底。旧的灰底句子 `No plants chosen for {Y}…` 删除。

**Companion notes**：`companionNotes(这块地的计划植物)` 有结果时，在植物下面每条一行（13px，白色），后面跟来源链接（文字是 `sourceLabel`，新标签页打开）。没有结果时什么都不显示，不再有 `No companion notes for the chosen plants.`。三条提示的文字缩短（改 `src/lib/seasonPlanner.ts` 和它的测试），保持原来的审慎说法，不写成规则：

| 类型 | 新文字 |
| --- | --- |
| 番茄 + 罗勒 | `Basil may reduce some tomato pests.` |
| 番茄 + 生菜 | `Lettuce can use the space before the tomato fills in.` |
| 同科两种作物 | `{科名} crops share pests and diseases. Keep an eye on spacing.` |

### 5.6 选植物

点 "Choose a plant" 或 "+" 后，输入表单在这一格里原地展开（这一行变高），白色输入框直接放在深绿上。逻辑一行不改，沿用现在的全部代码：`useWorkspaceDraft` 的三个 key 里保留 `season:all:choosingAreaKey` 和 `season:all:choices`、`useUnsavedDraft`、`inferPlantCropFamily`、手动改科、`confirmDiscard`、`onSavePlan`、保存后清空。同一时间只展开一个。

表单从上到下（数值见 `.chooser`）：

1. 标签 `Plant type`（13px，字重 600，白色）和输入框（白底，圆角 10px，高 44px，占位文字 `e.g. Tomato or Sungold`，自动获得焦点）。
2. 输入了文字后显示一行：`Crop family: {科名}` 和一个带下划线的文字按钮 `Change`。点 `Change` 后这一行换成现有的科下拉框（白底，样式同输入框）。原来的 `(automatic)` / `(edited)` 字样删除。
3. 一行提示，三种情况取一：
   - 当前的科在这块地的 `recentFamilies()` 里：警告标签 `{科名} grew here in {最近一次的年份}`。
   - 否则，这块地有要避开的科：`Good fit here: {rotationFit() 的前 4 个科名，用逗号连接}.`
   - 这块地没有要避开的科：不显示这一行。
4. 按钮：白色实心胶囊 `Add to {Y} plan`（提交）、毛玻璃胶囊 `Cancel`。

键盘：Enter 提交；Esc 等同 Cancel（有内容时走现有的放弃确认）。提交或取消后，焦点回到这一格的 "+" 或 "Choose a plant" 按钮。

### 5.7 地图

一张白卡片（圆角 20px，1px 浅灰边），`aria-labelledby` 指向标题。

1. 标题行：`h2` `{Y} map`（18px，字重 650）；右边文字链接 `Open Garden Plan →`，去 `gardenPath(garden.id)`。
2. 画布：白底加浅色点阵（和 Garden Plan 画布同一种点阵），上下各一条细线。里面是现有的 `SeasonGardenPreview`，做这些改动：
   - 视图固定用 `gardenPlanViewport(plan, areas, "growing-areas")`。`previewMode` 状态、它的 `useWorkspaceDraft` key（`season:all:previewMode`）和切换按钮删除。花园边界线不画。
   - 有计划的种植区：实线，填充 `--color-plan-bed`，描边 `--color-plan-bed-edge`。里面的圆圈沿用 `planTokens()`（每种计划植物一个圆圈，不代表数量），填充色和描边色用植物配色。圆圈里的文字缩写删除。
   - 没有计划的种植区：白底，虚线描边（`--color-ink-subtle`，`5 4`）。
   - 每个种植区上方的名字换成它的行序号（字号见 `.bed-num`，次要色）。位置沿用 `seasonAreaLabelPosition()`。每个种植区的 `<g>` 里加 `<title>`，内容是种植区名。
   - 整个 SVG 的 `aria-label` 不变：`{Y} plan preview for {花园名}`。
3. 图例：这个花园所有计划植物去重后，每种一个色点加名字。一种都没有时显示一句 `Plants appear on the map as you choose them.`
4. 图例下面一行说明：一个实线小方块 `Planned`，一个虚线小方块 `Not planned yet`。
5. 有种植区没量尺寸（`area.layout` 为空，地图上画不出来）时，最下面加一行次要色小字：`{n} planting areas need a size to appear here.`（单数 `1 planting area needs a size to appear here.`）。

表格和地图联动：

- 鼠标指到一行，或焦点在这一行里：地图上对应的种植区描边变品牌深绿、3px、实线，序号变品牌深绿。
- 鼠标指到地图上一个种植区：表格里对应的行高亮（同上面的悬停样式）。
- 点击地图上一个种植区：页面滚动到对应的行；这块地还没有计划时同时展开输入框。地图上的种植区不进入 Tab 顺序，键盘用户在表格里完成同样的操作。

### 5.8 Plan with AI

入口：表头右侧的描边胶囊按钮（火花图标 + `Plan with AI`）。显示条件和现在显示助手的条件一样：花园至少有一块种植区。

点击后从右侧打开抽屉：

- 用原生 `<dialog>` 和 `showModal()`（仓库里 `ConfirmDialog.tsx`、`GardenNoteDialog.tsx` 已经这样用）。宽 `min(480px, 100vw)`，贴右，占满高度，白底；背后的遮罩 `rgb(14 20 16 / 45%)`。
- 关闭方式：右上角圆形关闭按钮（`aria-label="Close"`）、Esc、点遮罩。关闭后焦点回到 "Plan with AI" 按钮。
- 关闭只是关上对话框，`AllocationAssistant` 保持挂载，已选的作物、偏好、已经返回的草稿都留着。切换花园或工作区变化时的清空规则沿用组件现有的逻辑。
- 抽屉头部是一块深绿纹理（`public/landing/footer-still.webp`，叶脉那张，数值见 `.tex-veins`）：标题 `Plan with AI`（`h2`，Bricolage，30px）；下面一句说明，用组件现有的文字 `Choose crops for next season. The assistant checks each placement against this garden's crop rotation history and returns a draft. Nothing is added until you confirm.`
- 抽屉主体是现有的 `<AllocationAssistant>`，可滚动。

`AllocationAssistant` 只改外观和开头，不改逻辑、请求、状态和其余文字：

| 部分 | 处理 |
| --- | --- |
| 开头的 eyebrow `AI planning · {花园}`、`h3` `Allocation Assistant`、说明段落 | 搬到抽屉头部。可见标题改成 `Plan with AI`，区域的可访问名跟着改。eyebrow 删除。 |
| 作物、种植区的复选框 | 仍然是 `<input type="checkbox">`，视觉上做成胶囊：复选框本身视觉隐藏但可聚焦，`label` 是胶囊，选中时品牌深绿底白字。作物胶囊前面加植物色点。禁用的胶囊用浅灰边和次要色文字。 |
| 可轮作的种植区不超过 3 块时的那行 `Planting areas …` | 保留，样式见 `.areas-all`。 |
| 偏好输入框、字数计数、各种提示（等待保存、公开演示说明、过期草稿等） | 保留，只调字号和间距。 |
| 主按钮（Plan、确认写入） | 做成品牌深绿实心胶囊。按钮所在的那一行用 `position: sticky; bottom: 0` 贴在抽屉底部，白底加上边线。 |
| 草稿、警告、解释、步骤、示例运行 | 保留全部内容。草稿的每一条做成"植物色点 + 名字 → 种植区名"，下面一行说明，样式见 `.draft`。 |
| 确认之后 | 抽屉不自动关闭，显示组件现有的确认信息；背后的轮作表同时更新。 |

公开演示里组件的行为不变（ADR-0057、ADR-0077）：只对 Demo Garden 提供录制的示例；其他花园显示组件现有的那句说明。

### 5.9 空状态和加载

| 情况 | 显示 |
| --- | --- |
| 还没有花园 | 沿用现有文字：标题 `Create a garden to start planning`，一句 `Add a garden and a planting area, then choose what to grow next season.`，按钮 `Create a garden`（去 `/gardens/new`）。白卡片，样式见 `.blank`。不显示花园切换、深色板和地图。 |
| `?garden=` 指向不存在的花园 | 花园切换照常显示（没有当前项）。主体是白卡片：标题 `Garden unavailable`，一句 `Choose another garden to see its plan.` |
| 花园没有种植区 | 花园切换照常。主体是白卡片：标题 `Add a planting area first`，一句 `Open Garden Plan to add a bed or container group, then return to choose plants.`，按钮 `Open Garden Plan for {花园名}`。不显示深色板、地图和 "Plan with AI"。 |
| 工作区还在加载 | 沿用 `GardenWorkspace` 现在对 season 模块的处理，本次不改。 |

## 6. 视觉规格

所有数值以 `design/season-redesign/season.css` 为准。下面是需要新增或特别注意的部分。

### 6.1 token

下面这些和 [Care 计划](care-redesign-plan.md) 第 7.1 节、[Gardens 首页计划](garden-home-redesign-plan.md) 第 6.1 节是同一批。哪个功能先实现，就由它加进 `src/styles/tokens.css`；后实现的直接复用，不要重复定义。

| 名字 | 值 | 本页用途 |
| --- | --- | --- |
| `--color-band-base` | `#14281d` | 深色板和抽屉头部纹理下面的底色 |
| `--color-band-ink` | `#0e1d14` | 白色胶囊按钮上的深色文字 |

本页不新增其他 token。地图用已有的 `--color-plan-bed`、`--color-plan-bed-edge`、`--color-plan-dot`；提示标签用已有的 `--color-warning`、`--color-warning-surface`；虚线用已有的 `--color-ink-subtle`（只做边线，不写字）。

### 6.2 字体

- `Bricolage_Grotesque` 的 `next/font` 声明放在 `(app)` 布局也能拿到的共用模块（Care 和 Gardens 首页的计划是同一件事，只做一次）。
- 本页只有两处用它：深色板上的年份、抽屉标题 `Plan with AI`。其他文字一律 Instrument Sans。

### 6.3 颜色、纹理和形状

- 深绿纹理只出现在两处：深色板（叶脊，`hero-still.webp`）和 AI 抽屉的头部（叶脉，`footer-still.webp`）。用 CSS 背景引用真实照片，不用纯色块，不用程序画的纹理，不引入 WebGL。图没加载出来时露出 `#14281D` 底色。
- 其余是中性灰白，不染绿。内容区的品牌深绿只用在有意义的元素上：标题、当前花园、"Plan with AI" 的描边、被指到的行序号和地图描边、链接。
- 这一页不用青柠色。
- 圆角：轮作表、深色板、地图卡片 20px；输入框 10px；按钮、标签、花园切换是胶囊形。
- 投影只有两处：深色板、深绿上的白色输入框。轮作表和地图卡片不加投影。
- 不用 emoji，图标一律内联 SVG 描边。

### 6.4 动效

- 进度条宽度 350ms；行序号和地图描边的颜色 140ms；按钮按下下移 1px。
- 抽屉从右侧滑入可以做（约 200ms），不是必须。
- `prefers-reduced-motion: reduce` 时全部关闭。

### 6.5 无障碍

- 标题层级：`h1` `Next Season`；`h2` 是花园名、`{Y} map`、抽屉里的 `Plan with AI`。
- 页面上同名的按钮很多，所以 "Choose a plant"、"+"、"×" 的可访问名都带上种植区名（见 5.5）。
- 深色板和抽屉头部里的焦点描边用白色，其余地方用品牌深绿。
- 所有可点的东西至少 44×44px 的点击区域（28px 的 "+" 和 "×" 靠外扩的点击区域达到；实现时确认）。
- 深色板上的文字对比度不低于 4.5:1：次要文字用白色 88% 或更高，不用淡绿字。白底上不要用 `--color-ink-subtle` 写字。
- 提示标签带文字和图标，不只靠颜色。行和地图的对应关系靠序号，不只靠悬停。
- 保存、删除后的提示沿用现在的 `InlineNotice` 和 `FeedbackForm` 的播报方式。

### 6.6 响应式

| 宽度 | 变化 |
| --- | --- |
| ≥ 1200px | 轮作表和地图左右并排，地图粘性定位。 |
| 860–1199px | 地图移到轮作表下面，占满宽度。页头的导航按现有规则折叠。 |
| < 860px | 见下。 |

窄屏（< 860px）放不下一整列深色板：

- 花园切换变成可以横向滑动的一行，不换行。
- 板顶变成轮作表上方的一块独立深色牌（圆角 20px，同一张纹理）：`Planting plan`、年份（64px）、进度条、那一行统计。
- 深色牌下面是花园名和 "Plan with AI" 按钮。三个列标题隐藏。
- 每块地变成一张白卡片（圆角 16px，1px 浅灰边，卡片间距 12px）：上半是序号、名字、类型、历史、要避开的科；下半用一条细线隔开，开头一个品牌深绿的小标题 `{Y}`，下面是计划植物或 "Choose a plant"。
- 窄屏的计划格是白底：文字用正文色，虚线和色点描边用 `--color-ink-subtle`，输入框加 1px 边，`Add to {Y} plan` 是品牌深绿实心胶囊，`Cancel` 是品牌深绿描边胶囊。数值见 `season.css` 最后一段媒体查询。
- 地图在所有卡片下面。
- AI 抽屉占满屏幕宽度。

在 1440、1024、768、390、320px 宽度和 200% 缩放下都不能出现整页横向滚动。种植区名和植物名很长时在格子里换行，不撑宽表格。

## 7. 分阶段实施

每个阶段是一个可以独立验收的小功能，一个阶段一个提交。阶段之间不要并行改同一个文件。

### N0 准备（不写功能代码）

- 本文、ADR-0082、`design/season-redesign/` 和 ADR 索引在 `season-redesign` 分支上。这个分支从 `garden-home-redesign` 切出来（那里有 ADR-0080、ADR-0081 和审美指南）。
- 这个分支比 `origin/main` 旧。开始写代码前先问用户：在这个分支上并入最新的 `main` 再做，还是另切实现分支。
- 检查 6.1 的 token 和 6.2 的字体是否已经由 Care 或 Gardens 首页的实现加好；没有就在 N1 里加，名字保持一致。

### N1 一次一个花园

- 范围：`SeasonPlanner.tsx`、`GardenWorkspace.tsx`（切换的导航）、`AppShell.tsx`（`h1`）、`Season.module.css`。
- 内容：5.1 和 5.9。下拉框换成花园切换链接，`/season` 默认第一个花园，删除 All gardens 和 `Only {花园} · Show all`。这个阶段先保留旧的卡片。
- 验收：三个花园的演示里，切换链接的计数和各花园已计划的地块数一致；地址里的 `?garden=` 跟着变；刷新后停在同一个花园；旧地址 `/gardens/{id}/season` 仍然落到对应的花园；三种空状态正确。
- 测试：更新 `SeasonPlanner.test.tsx` 的筛选用例；`h1` 相关的断言（见 N5 的清单）。

### N2 轮作表和深色板

- 范围：`SeasonPlanner.tsx`（建议把行拆成小组件，把计算函数移到 `src/lib/seasonPlanner.ts` 以便单测）、`Season.module.css`、`tokens.css`、字体模块、`src/lib/seasonPlanner.ts`（三条提示的新文字）。
- 内容：5.3 到 5.6。卡片换成行，深色板，提示标签，`{k} to check`，输入框原地展开。删除 "Rotation details" 折叠。这个阶段先保留旧的 "Plan preview" 和 "Allocation Assistant" 折叠，放在轮作表下面。
- 验收：用演示花园打开，行的内容和原型一致；在一块种过茄科的地里输入 `Tomato`，输入框下面出现 `Nightshade grew here in 2026`，保存后出现 `Nightshade again`，板顶出现 `1 to check`；改科、取消、移除的行为和改之前一样；保存后 "All changes saved"，刷新后还在。
- 测试：历史按年份分组和去重；`Rest from` 标签；提示标签只在同科并且不是 `other` 时出现；`k` 的计数；进度的单复数；没有历史时的 `No record` 和 `Any family`；`seasonPlanner.test.ts` 的三条新文字；`tokens.test.ts` 的对比度。

### N3 常驻地图

- 范围：`SeasonPlanner.tsx`（`SeasonGardenPreview`）、`Season.module.css`、`legacy-workspace.css`（删掉不再用的 `.season-garden-*`）。
- 内容：5.2 和 5.7。删除 "Plan preview" 折叠和视图切换。
- 验收：地图上的序号和行序号一致；选了植物的地变实线并出现圆圈，颜色和行里的色点一致；指到一行，地图上对应的地高亮，反过来也一样；点一块没有计划的地，输入框展开；没量尺寸的地不在地图上，并有那行说明。
- 测试：序号和行的对应；有计划、没计划两种画法；图例去重；`season-area-label-*` 的测试改成断言序号。

### N4 Plan with AI 抽屉

- 范围：`SeasonPlanner.tsx`、`AllocationAssistant.tsx`（只改开头和类名）、相关样式。
- 内容：5.8。删除 "Allocation Assistant" 折叠。
- 验收：按钮打开抽屉，Esc、关闭按钮、点遮罩都能关，焦点回到按钮；关了再开，已选的作物还在；本地带 key 时能生成草稿并确认，轮作表同时更新；公开演示配置下，Demo Garden 能看录制的示例，这一步不发出任何 `/ai/` 请求。
- 测试：`AllocationAssistant.test.tsx` 和 `SeasonAllocationFlow.test.tsx` 全部通过（只更新标题、区域名和打开方式）；新增打开、关闭、焦点返回的用例。

### N5 响应式、清理和文档

- 范围：样式、e2e、文档。
- 内容：6.6 的三档宽度；删除不再使用的旧样式和类名（删之前确认没有别处引用）。
- 需要更新的现有测试：
  - `src/components/SeasonPlanner.test.tsx`（三个用例都依赖下拉框、`article` 卡片和折叠）。
  - `src/components/GardenWorkspace.test.tsx`（约 1750–1830 行：`Plan preview · Demo Garden`、`Last season`、`Rotation details`、`season-area-label-demo-raised-bed`；所有 `/Next Season ·/` 的标题断言）。
  - `e2e/season-hierarchy.spec.ts`（下拉框、`Only Demo Garden ·`、`Good rotation fit`、两个 `summary`、复选框尺寸的断言；复选框改成胶囊后，改成断言胶囊的高度不超过 48px）。
  - `e2e/garden-flow.spec.ts`、`e2e/workspace-routes.spec.ts`（`/Next Season ·/` 的标题）。
  - `e2e/readme-screenshots.spec.ts`（`Rotation details` 和 `Allocation Assistant` 两个截图的操作步骤）。
- 文档：把 ADR-0082 的状态改成已实现；重新生成 `docs/screenshots/season-rotation.png` 和助手的截图；更新 README 里 Next Season 的那句说明和第 5 步（不再有 "Expand Rotation details"）；`docs/agent.md` 里提到入口的地方改成 "Plan with AI"。
- 验收：1440、1024、768、390、320px 五个宽度和 200% 缩放没有横向滚动；`prefers-reduced-motion` 下没有动画。

## 8. 不做的事和已知限制

- 不改数据模型、后端、轮作规则、Agent、公开演示的 AI 开关。
- 不引入新的依赖、组件库或 WebGL。
- 不做跨花园对比、复制计划、拖拽植物到地图、多年份规划。
- 一次只能看一个花园的计划。花园切换上的计数是唯一的跨花园信息。
- 历史只显示年份和植物，不显示具体种植日期。日期仍然在 Garden Plan 的植物记录里。
- 地图很小，只回答"这一行是哪块地"和"什么种在哪"。种植区很多或很小的时候，序号可能挤在一起；这是接受的结果。
- 窄屏没有那一整列深色板，深绿只剩顶部的深色牌。
- 花园有二十块以上种植区时，轮作表会很长，地图卡片靠粘性定位留在视野里。
- 页面会加载一张纹理图（约 300 KB），打开 AI 抽屉时再加载一张（约 200 KB）。它们和官网共用同一份文件，浏览器会缓存。
- 公开演示里，三个真实花园的 "Plan with AI" 打开后只有一句说明，直到 AI 功能重做（ADR-0077）。

## 9. 每阶段统一的完成标准

- `npm run typecheck`、`npm run lint`、`npm test` 通过；涉及页面的阶段再跑 `npx playwright test e2e/season-hierarchy.spec.ts`。
- `git diff --check` 干净；提交里没有无关改动、生成文件或密钥。
- 交接说明写清楚：改了哪些文件、跑了哪些检查、有什么限制、下一步是什么。
- 提交、推送、合并之前先问用户。
