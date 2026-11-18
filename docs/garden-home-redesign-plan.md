# Gardens 首页重新设计：实施计划

- 日期：2026-11-16（America/Toronto）
- 状态：设计已确认；2026-11-17 已实现（H0–H4）。决定记录在 [ADR-0081](decisions/0081-stage-the-gardens-on-a-textured-band-on-the-gardens-home.md)。
- 本文读者：负责实现的工程师或 Agent。请先读完本文，再打开第 2 节的设计稿对照。
- 设计稿是视觉的唯一依据。本文与设计稿冲突时，以设计稿的外观为准、以本文的行为规则为准；仍有疑问就问用户，不要自己猜。

## 1. 目标

Gardens 是打开 App 看到的第一页。用户在这一页按顺序看到三件事：

1. 我的花园（主角）：每个花园的平面缩略图，点进去编辑。
2. 今天要做的照料：只有今天的（含逾期的），可以直接打勾。
3. AI Garden Notes：一眼看得出"在这里写一句话"，写完生成记录草稿。

这次要解决两个问题：

- **对齐**：旧页面里 "Care to do" 的方框和花园缩略图的上沿错开。新页面所有方框共用一套网格。
- **头重脚轻**：旧页面只有页头是深绿，下面全是白卡片。新页面把有纹理的深绿分到三处：上方的花园色带、左下的日期牌、右下的笔记块。

设计思路一句话：**这一页的主角是花园，所以深绿托着的是花园；Care 页的深绿托着的是任务。两页各有分工。** 深绿不把花园卡片整个包住，卡片一半站在色带上、一半落到浅色页面。

审美规则见 [design/frontend-aesthetic-preferences.md](../design/frontend-aesthetic-preferences.md)，动手前必须先读。

## 2. 设计稿

| 文件 | 内容 |
| --- | --- |
| [design/garden-home-redesign/gardens.html](../design/garden-home-redesign/gardens.html) | 定稿。任务的圆圈可以点，格线纸可以打字。底部的黑色胶囊只是原型用的状态切换器，不属于设计。 |
| [design/garden-home-redesign/gardens.css](../design/garden-home-redesign/gardens.css) | 定稿的样式。所有尺寸、颜色、圆角、间距都在这里，实现时照抄数值。 |
| [design/garden-home-redesign/screenshots/](../design/garden-home-redesign/screenshots/) | `gardens-1440.png`、`gardens-768.png`、`gardens-390.png` 三个宽度；`state-5-gardens-1440.png`（5 个花园、今天全部完成）；`state-no-gardens-1440.png`（还没有花园）；`before-1440.png`（改之前）。 |
| [design/garden-home-redesign/assets/](../design/garden-home-redesign/assets/) | 从真实 App 截下来的三个花园缩略图，只给原型用。 |
| [design/garden-home-redesign/explorations/](../design/garden-home-redesign/explorations/) | 两轮被否定的方案（`round-1.html`、`round-2.html`）和截图，对应 ADR-0081 的 Alternatives。不要照着它们实现。 |

用浏览器直接打开 `gardens.html` 即可（它用相对路径读取 `public/` 里的纹理图）。地址后面可以加参数看各种状态：`?gardens=3|5|0` 和 `&care=open|done|none`。

原型里的任务是示例数据，"今天"固定为 2026-11-16（周一）。花园名和缩略图是真实的三个演示花园。原型用了 Google Fonts 链接和内联脚本；App 里字体用 `next/font` 自托管，样式用 CSS Modules 和 `tokens.css`，不要把原型的写法搬进 App。

## 3. 现状核查（2026-11-16）

| 位置 | 现状 |
| --- | --- |
| `src/app/(app)/gardens/page.tsx` | Gardens 首页路由。 |
| `src/components/workspace/WorkspaceHome.tsx` | `WorkspaceHome` 画整页：`GardenCard`（缩略图 + 名字 + 两行文字）、`CareToDo`（Overdue / Today / Coming up 三组）、`tick` / `untick`、`WorkspaceHomeLoading`。 |
| `src/components/workspace/WorkspaceHome.module.css` | 首页样式。≥1024px 时左边花园、右边 300px 一列（Care to do 在上，AI Garden Notes 在下）；窄屏顺序是 Care to do、花园、笔记。 |
| `src/components/workspace/OverviewGardenNote.tsx` | 首页的笔记框：标题、一句说明、`textarea`、主按钮（`Generate draft` 或 `Open note editor` 等）。可以直接在首页写、直接生成草稿。 |
| `src/components/workspace/AppShell.tsx` | 首页时在内容上方渲染 `PageHeader`，`h1` 是 "Gardens"；用 context 把 `OverviewGardenNote` 传给首页。 |
| `src/components/GardenWorkspace.tsx` 约 694–706 行 | 还没有工作区时，把 `Onboarding`（"Create your garden" 表单）作为 `onboarding` 传给 `WorkspaceHome`。 |
| `src/lib/homeTasks.ts` | 首页任务的数据：`overdue`、`today`、`upcoming`、`done`、`total`。逾期文字（`Due yesterday`）现在拼在 `detail` 里。 |
| `src/lib/planAppearance.ts` | `gardenPlantColors`（每种植物的颜色）和 `plantsInView`（图例的植物清单和顺序）。 |
| `src/components/GardenPlanOverview.tsx` | `compact` 模式画缩略图。本次不改。 |
| `public/landing/hero-still.webp`、`public/landing/footer-still.webp` | 官网首屏和页尾的静态纹理图，已经在仓库里。 |
| 线上现象 | 右栏方框的上沿和花园卡片的上沿不在一条线上；页头以下没有深色；缩略图只有 148px 高。 |

数据模型不变。本次只改首页的展示和排版，不改后端、不改存储结构、不改笔记弹窗、不改 Care 页。

## 4. 已确认的决定

这些是用户在 2026-11-16 看过原型后确认的，实现时不要改。

| 编号 | 决定 |
| --- | --- |
| G1 | 页面上方是一块深绿纹理色带，只放日期、标题 "Your gardens"、一行统计和 "Demo garden" 按钮。花园卡片的第一排一半站在色带上、一半落到浅色页面。色带不把卡片整个包住。 |
| G2 | 新建花园的入口是花园网格里最后一格的虚线卡片 "New garden"。页面上不再有别的 "Add garden" 按钮。 |
| G3 | 色带下面一排是两个独立的块：左边 Today，右边 AI Garden Notes。两个功能不合并成一个块。 |
| G4 | Today 只显示今天要做的（含逾期）和今天已经做的。首页不再显示 "Coming up"；接下来几天的任务在 Care 页看。 |
| G5 | AI Garden Notes 的主体是一张带格线的白纸，放在深绿叶脉纹理上。白纸就是输入框，可以直接在首页写。 |
| G6 | 植物配色不变。花园卡片下方的植物色点直接用缩略图里的颜色。 |
| G7 | 不新增颜色。色带大标题、日期数字、笔记标题用 Bricolage Grotesque；今日进度条用青柠色。 |

## 5. 页面规格

页面左右留白沿用 `--workspace-gutters`，内容最大宽度沿用 `--content-width`（1440px）。页面从上到下两个区块，间距 32px：花园区、下排。

### 5.1 页面标题

- `AppShell` 在首页仍然输出 `h1` "Gardens"，但把它做成视觉隐藏（屏幕阅读器和焦点管理照旧）。首页上方不再有可见的 "Gardens" 标题行，也不留它的上边距。
- 色带里的 "Your gardens" 是 `h2`。旧的 "Your gardens (3)" 标题行和 "Add garden" 按钮删除。

### 5.2 花园色带

外观：圆角 20px；底色 `#14281D`，上面铺 `public/landing/hero-still.webp`（`cover`、居中），再盖一层从左到右的深色渐变（数值见 `gardens.css` 的 `.tex-ridges::before`）。文字全部白色或带透明度的白色，不用淡绿字。色带必须一眼看得出是绿色，不能暗到发黑。

内边距：上 44px，左右 48px，下 = 40px + 卡片踩上来的高度（桌面和平板 164px，手机 56px）。

内容：

1. 小标题：`Monday, Nov 16`（星期全称、月份缩写、日期），12.5px 全大写。日期来自 `todayDate()`。
2. 标题（`h2`，Bricolage Grotesque）：`Your gardens`。
3. 统计一行，用 ` · ` 连接：`{g} gardens · {a} planting areas · {p} plants growing`。
   - `g` = 显示出来的花园数；`a` = 这些花园的种植区总数；`p` = 每个花园"正在种的植物种类数"相加（算法见 5.3 的 `k`）。
   - 单数时用 `garden`、`planting area`、`plant growing`。数量为 0 的那一段省略。
   - 还没有花园时整行改成：`Start with one garden. You can add more later.`
4. 右侧按钮 `Demo garden`（毛玻璃胶囊）。显示条件和行为与现在的 "Demo garden" 文字按钮相同：只有用户有自己的花园时才显示，点击调用 `onOpenDemoGarden`。

### 5.3 花园网格和卡片

网格紧跟在色带下面，用负的上边距踩上色带：`margin-top: -164px`（手机 `-56px`），左右各缩进 48px（手机 12px），和色带里的文字左对齐。只有第一排踩在色带上，更多的排自然落在浅色页面上。

| 宽度 | 列数 |
| --- | --- |
| ≥ 1100px | 4 列 |
| 700–1099px | 2 列 |
| < 700px | 1 列，卡片改成横向的矮行（见 6.6） |

列间距和行间距 20px（手机 12px）。花园按现在的顺序排列，"New garden" 虚线卡片永远是最后一格。

每张花园卡片整张是一个链接（`aria-label="Open {花园名}"`，去 `gardenPath(id)`），圆角 16px，白底，1px 浅灰边，向下的柔和投影（数值见 `.g-card`）。悬停时边框变品牌深绿、上移 2px。

卡片上半：缩略图区，最小高度 168px，白底加浅色点阵（和 Garden Plan 画布同一种点阵），里面是 `<GardenPlanOverview compact>`。没有可画的种植区时显示现有的两句话之一：`Planting areas need a size` 或 `No planting areas yet`。缩略图里不放文字（ADR-0073 的规则不变）。

卡片下半（内边距 18px 20px 20px）：

1. 花园名（`h3`，18px，字重 650，`--color-heading`）。
2. 一行说明：`{n} planting areas · {k} plants`。
   - `k` = 这个花园正在种的植物种类数。数据和缩略图用同一份（只算当前在种的，不算历史和计划中的），种类的划分用 `plantsInView` 的结果。
   - 有没量尺寸的种植区时，后面加现有的那句：` · {m} need a size`（单数 `needs`）。
   - 没有种植区时整行写 `Nothing planted yet`。
3. 植物色点：按 `plantsInView` 的顺序取前 3 种，每种一个 11px 圆点加植物名。圆点的填充色和描边色来自 `gardenPlantColors`，必须和缩略图里那种植物的圆圈颜色一致。超过 3 种时末尾加 `+{k-3} more`。没有在种的植物时不显示这一行。
4. 当日标签：压在缩略图和文字的分界线上（右侧，`top: -13px`），带 3px 白色外圈。
   - 这个花园今天还有 `n` 条没做（逾期 + 今天到期，owner 是这个花园）：品牌深绿底白字，`{n} to do today`。
   - 今天有任务并且都做完了：浅灰底，`All done today`。
   - 今天没有任务：不显示标签。
   - 工作区级的任务（all gardens）不算进任何一张卡片。

### 5.4 New garden 虚线卡片

- 网格最后一格，链接到 `/gardens/new`。白底，1.5px 虚线边（`#BDBDBA`），圆角 16px，高度跟同一排的卡片拉齐。
- 居中三样：48px 品牌深绿圆形加号、`New garden`（17px，字重 650）、`Draw the outline, then add planting areas`（13.5px，次要色）。
- 悬停时虚线变品牌深绿。

### 5.5 没有花园、加载中

- **还没有工作区**（`onboarding` 有值）：网格里只放一张白卡片，占 2 列（手机占满），里面是现有的 `Onboarding` 表单（Garden name、Create garden、Load demo garden），样式见 `.first-garden`。不显示虚线卡片。色带的统计行换成 5.2 里的那句话，不显示 "Demo garden"。
- **有工作区但没有花园**：同样的白卡片，里面是现有的一句话 `Add your first garden to start recording care.` 和主按钮 `Create garden`（去 `/gardens/new`）。
- **加载中**（`WorkspaceHomeLoading`）：色带照常显示（标题在，统计行空着），网格里两张浅灰骨架卡片踩在色带上。下排不显示。保留现有的视觉隐藏文字 `Loading your gardens…`。

### 5.6 下排：Today

下排是两列网格：左 `1.45fr`，右 `1fr`，间距 24px，两块等高。小于 1100px 时改成上下排列（Today 在上）。

Today 是一张白卡片（圆角 20px，内边距 14px），里面左右两部分。整块 `aria-label="Care today"`。

左：日期牌。宽 172px，圆角 14px，深绿纹理（和色带同一张图，`background-size: 1300px auto`）。从上到下：星期全称（全大写小标题）、日期数字（Bricolage，76px）、月份全称、进度条（6px 高，轨道白色 20%，填充青柠色，下面一行 `{done} of {total} done`）。今天没有任何任务时不显示进度条和那行字。

右：

1. 小标题 `Care today`，下面是标题（`h2`，26px）：
   - 还剩 2 条及以上：`{n} things left`
   - 还剩 1 条：`1 thing left`
   - 今天有任务并且都做完了：`All done for today`
   - 今天没有任务：`Nothing due today`
2. 标题右侧的链接 `Open Care →`，去 `/care?view=tasks`。整个工作区一条照料任务都没有时，文字改成 `Add a care task →`（和现在的规则一样）。
3. 任务清单，一行一条，行高至少 50px，行与行之间一条细线：
   - 顺序：逾期的（按到期日从早到晚）、今天到期的、最后是"今天早些时候在别处完成的"。
   - 每行从左到右：圆圈、类型图标（水滴 = Watering，嫩芽 = Fertilizing，30px 浅灰圆底）、标题（`Water {花园名}` 等，沿用 `homeTasks.ts` 的 `title()`）、同一行里跟着次要色的副标题（种植区或"种植区 · 植物组"；整园任务写 `Whole garden`）、逾期的行最右边一个红字浅红底的小胶囊（`Due yesterday` / `Due {n} days ago`）。
   - 需要把 `homeTasks.ts` 里拼在 `detail` 里的逾期文字拆成单独的字段（建议 `late?: string`），这样胶囊和副标题才能分开放。
   - 打勾的行为和现在完全一样：点圆圈用今天的日期完成（`careEventForTask` + `completeCareTask`），行留在原位、标题划掉；这次访问里打的勾可以再点一下取消（`undoCareTaskCompletion`）。今天在别处完成的记录显示为已完成的圆圈，不可点。
   - 圆圈是 `<button role="checkbox" aria-checked>`，点击区域 44×44px，可见圆圈 22px，`aria-label` 是"标题, 副标题"。打勾或取消后焦点留在这个圆圈上。
   - 最多显示 6 行。超过时第 6 行后面加一行链接 `+{n} more in Care →`（样式 `.today-more`）。
4. 今天没有任务时，清单的位置显示一句话：有花园时 `No watering or fertilizing is due today.`；还没有花园时 `Care tasks appear here on the day they are due.`

首页不再显示 "Coming up" 分组。`homeTasks()` 返回的 `upcoming` 只用来判断"整个工作区有没有任务"。

### 5.7 下排：AI Garden Notes

整块是一个深绿纹理块（圆角 20px，内边距 26px 28px 24px）：底色 `#14281D`，铺 `public/landing/footer-still.webp`（叶脉那张，`cover`，位置 `30% 60%`），盖一层斜向的深色渐变（数值见 `.tex-veins::before`）。整块 `aria-labelledby` 指向标题。

从上到下：

1. 标题行：34px 圆形铅笔图标、标题 `AI Garden Notes`（`h2`，Bricolage，28px）、右侧一句 `Becomes care records`（13.5px）。
2. 白纸：白底、圆角 12px、有投影。白纸里面就是现有的 `textarea`（`aria-label="Quick garden note"`，占位文字不变）：没有边框，字号 16px，行高 34px，背景是每 34px 一条浅灰横线。最小高度 136px（4 行），块更高时跟着变高。焦点在里面时，白纸外圈出现 2px 白色描边。
3. 超过字数上限时，白纸下面一行浅红色文字（`#FFC9C2`）：`Shorten your note to 500 characters or fewer.`（沿用现在的文字和 `AI_CARE_NOTE_MAX_LENGTH`）。
4. 底部一行：左边一句 `Write it your way. You review before anything is saved.`；右边是按钮。

按钮沿用 `OverviewGardenNote.tsx` 现在的全部逻辑，只换外观：

| 情况 | 右边显示 |
| --- | --- |
| 可以直接生成（`canGenerate`） | 文字链接 `Open note editor` + 白色实心胶囊 `Generate draft`（提交表单；没写字或超长时禁用）。 |
| 其他情况 | 只有一个白色实心胶囊，文字是现有的 `Open note editor` / `Continue note` / `Continue note · {n} drafts` / `View note status`，点击打开弹窗。 |

弹窗里正在编辑时 `textarea` 仍然只读。`primaryButton` 的 ref 仍然挂在白色胶囊上，弹窗关闭后焦点回到它。原来标题下面那句 `Turn a quick note into care records you can review.` 由上面两句新文字取代。

### 5.8 页面底部的提示

`message`（例如 `Demo garden loaded.`）仍然显示在下排的下面，样式不变。

## 6. 视觉规格

所有数值以 `design/garden-home-redesign/gardens.css` 为准。下面是需要新增或特别注意的部分。

### 6.1 token

下面这些和 [Care 重新设计计划](care-redesign-plan.md) 第 7.1 节是同一批。哪个功能先实现，就由它加进 `src/styles/tokens.css`；后实现的直接复用，不要重复定义。

| 名字 | 值 | 本页用途 |
| --- | --- | --- |
| `--color-band-base` | `#14281d` | 三块深绿纹理下面的底色 |
| `--color-band-ink` | `#0e1d14` | 白色胶囊按钮上的深色文字 |
| `--color-accent-lime` | `#d6ff5c` | 只用于今日进度条 |
| `--color-error-on-dark` | `#ffc9c2` | 笔记块里的超长提示 |
| `--color-done-ink` | `#6b6b6f` | 白底上被划掉的任务标题 |

本页另外需要一个中性灰：虚线卡片的边 `#bdbdba`（无色相，介于 `--color-line` 和 `--color-ink-subtle` 之间）。建议命名 `--color-neutral-dash`。

### 6.2 字体

- 把 `Bricolage_Grotesque` 的 `next/font` 声明放到 `(app)` 布局也能拿到的共用模块（Care 计划 7.2 节是同一件事，只做一次）。
- 本页只有三处用它：色带标题 `Your gardens`、日期牌的数字、`AI Garden Notes` 标题。其他文字一律 Instrument Sans。

### 6.3 颜色、纹理和形状

- 深绿纹理只出现在三处：花园色带、日期牌、笔记块。其余是中性灰白，不染绿。三处都用真实照片，不用纯色块，不用程序画的纹理。
- 花园色带和日期牌用叶脊那张（`hero-still.webp`）；笔记块用叶脉那张（`footer-still.webp`）。两张图已经在 `public/landing/` 里，用 CSS 背景引用，不引入 WebGL。图没加载出来时露出 `#14281D` 底色。
- 内容区的品牌深绿只用在有意义的元素上：小标题、标题、当日标签、已完成的圆圈、加号圆、链接。
- 青柠色只用在今日进度条。它和 Care 页的进度条是同一个含义（今天的照料进度）。
- 圆角：色带、Today 卡片、笔记块 20px；花园卡片和虚线卡片 16px；日期牌 14px；白纸 12px；按钮和标签是胶囊形。
- 投影只有三处：花园卡片（踩在色带上需要）、白纸、加号圆。Today 卡片不加投影。
- 不用 emoji，图标一律内联 SVG 描边。

### 6.4 动效

- 进度条宽度 350ms；圆圈填充 140ms；花园卡片悬停上移 2px；按钮按下下移 1px。
- `prefers-reduced-motion: reduce` 时全部关闭。

### 6.5 无障碍

- 标题层级：`h1` "Gardens"（视觉隐藏）；`h2` 是 `Your gardens`、Today 的标题、`AI Garden Notes`；花园名是 `h3`。
- 深绿块里的焦点描边用白色，其余地方用品牌深绿。
- 所有可点的东西至少 44×44px（圆圈靠外扩的点击区域达到）。
- 白底上的文字对比度不低于 4.5:1；不要用 `--color-ink-subtle` 写字。深绿块上的次要文字用白色 88% 或更高。
- 当日标签和逾期胶囊都带文字，不只靠颜色表达状态。

### 6.6 响应式

| 宽度 | 变化 |
| --- | --- |
| ≥ 1100px | 花园 4 列；下排左右两块。 |
| 700–1099px | 花园 2 列；下排改成上下（Today、笔记）。 |
| < 700px | 见下。 |

手机（< 700px）：

- 顺序：色带、花园、New garden、Today、AI Garden Notes。旧页面在窄屏把 Care 放在花园前面，新页面不这样做；为了让 Today 不被挤得太远，花园卡片改成矮行。
- 色带内边距 28px 20px，卡片只踩上来 56px。
- 花园卡片改成横向：左边 124px 宽的缩略图，右边文字。当日标签回到文字区第一行（不再压线），植物色点一行隐藏。
- 虚线卡片改成 72px 高的一行：加号圆 + `New garden`，说明文字隐藏。
- Today：日期牌变成卡片顶部的一条（数字在左，星期和月份在右，进度条在下面）；任务行的副标题换到第二行；逾期胶囊改成副标题下面的一行红字。
- 笔记块：`Becomes care records` 换到标题下面；底部按钮靠左。

在 1440、768、390、320px 宽度和 200% 缩放下都不能出现整页横向滚动。花园名很长时在卡片里换行，不撑宽卡片。

## 7. 分阶段实施

每个阶段是一个可以独立验收的小功能，一个阶段一个提交。阶段之间不要并行改同一个文件。

### H0 准备（不写功能代码）

- 本文、ADR-0081、`design/garden-home-redesign/` 和 ADR 索引已经提交在 `garden-home-redesign` 分支上。这个分支是从 `care-redesign-plan` 切出来的（本文链接了那里的 ADR-0080 和 Care 计划）。
- 这个分支比 `origin/main` 旧。开始写代码前先问用户：在这个分支上并入最新的 `main` 再做，还是另切实现分支。
- 检查 6.1 的 token 和 6.2 的字体是否已经由 Care 的实现加好；没有就在 H1 里加，名字保持一致。

### H1 花园色带和花园卡片

- 范围：`WorkspaceHome.tsx`、`WorkspaceHome.module.css`、`AppShell.tsx`（首页的 `h1` 视觉隐藏）、`tokens.css`、字体模块。
- 内容：5.1 到 5.5。这个阶段先保留旧的 Care to do 和笔记框，把它们临时放到花园区下面的两列里，页面不能出现半成品的错位。
- 验收：用演示花园打开首页，色带、统计行、四列网格、虚线卡片和原型一致；卡片的色点颜色和缩略图一致；当日标签的数字和 Care 页该花园今天未完成的数量一致；没有花园、加载中两种状态正常。
- 测试：统计行的单复数和省略；`k` 只算当前在种的植物；当日标签的三种状态；虚线卡片的链接；`tokens.test.ts` 的对比度。

### H2 Today 卡片

- 范围：`WorkspaceHome.tsx`、`WorkspaceHome.module.css`、`src/lib/homeTasks.ts`。
- 内容：5.6。`homeTasks()` 增加 `late` 字段，调整"早些时候完成"的行的位置。
- 验收：打勾后行留在原位并划掉，标题、进度条、对应花园卡片上的标签同时变化；取消打勾后全部恢复；今天没有任务、全部完成两种状态的文字正确；首页不再出现 Coming up。
- 测试：更新 `homeTasks.test.ts`；标题的四种文字；超过 6 行时的 `+{n} more in Care`；打勾后焦点位置。

### H3 AI Garden Notes 块

- 范围：`OverviewGardenNote.tsx`、`WorkspaceHome.module.css`。
- 内容：5.7。只换结构和样式，逻辑一行不改。
- 验收：在白纸上写一句话，`Generate draft` 从禁用变成可用；点击后的行为和改之前一样；弹窗关闭后焦点回到白色按钮；超长提示在深绿上清晰可读。
- 测试：现有的笔记相关测试全部通过（只更新选择器）。

### H4 响应式、清理和文档

- 范围：`WorkspaceHome.module.css`、e2e、文档。
- 内容：6.6 的三档宽度；删除不再使用的旧样式（`.sectionHeading`、`.todayArea`、`.noteArea`、`.taskGroup` 等，删之前确认没有别处引用）。
- 需要更新的现有测试：`src/components/WorkspaceHome.test.tsx`、`src/components/GardenWorkspace.test.tsx`（约 114–127 行的区块顺序、约 1383 行的 `Your gardens (3)`）、`e2e/homepage.spec.ts`（各宽度的列数、区块名字、笔记框的位置、8 个长名字花园在 320px 的换行）、`e2e/app-pages-review.spec.ts`（约 76 行的 `Care to do` 改成 `Care today`）。
- 文档：把 ADR-0081 的状态改成已实现；README 里如果有首页截图就更新。
- 验收：1440、768、390、320px 四个宽度和 200% 缩放没有横向滚动；`prefers-reduced-motion` 下没有动画。

## 8. 不做的事和已知限制

- 不改数据模型、后端、笔记弹窗、Care 页、花园缩略图的画法。
- 不引入新的依赖、组件库或 WebGL。
- 不做花园排序、搜索、分页。
- 花园超过 3 个时，第二排落在浅色页面上，只有第一排踩在色带上。花园数是 4 的倍数时，虚线卡片会单独占一排的第一格。这是接受的结果。
- 首页会加载两张纹理图（约 300 KB 和 200 KB）。它们和官网共用同一份文件，浏览器会缓存。
- 首页只显示今天的任务。明天以后的任务要去 Care 页看。

## 9. 每阶段统一的完成标准

- `npm run typecheck`、`npm run lint`、`npm test` 通过；涉及页面的阶段再跑相关的 `npx playwright test e2e/homepage.spec.ts`。
- `git diff --check` 干净；提交里没有无关改动、生成文件或密钥。
- 交接说明写清楚：改了哪些文件、跑了哪些检查、有什么限制、下一步是什么。
- 提交、推送、合并之前先问用户。
