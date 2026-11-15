# 官网与 App 重新设计：实施计划

- 日期：2026-11-14（America/Toronto）
- 状态：方向与分阶段计划已确认（[ADR-0073](decisions/0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md)）；第 8 节记录确认结果。官网功能展示的形式（S6b）暂不决定。
- 依据：
  - 用户确认的两份原型：[官网第 4 版](https://claude.ai/artifact/9C4EYxPXFYGcg3DGzonWwn)、[App 与画布第 8 版](https://claude.ai/artifact/41FXSnHJFAVvBBVppYA5iH)
  - 2026-11-14 的讨论记录
  - 当前代码核查（第 3 节）

## 1. 目标

面试官打开链接时，先看到这个产品是什么，以及两个最值得看的功能：画花园布局、AI Note 把一段话拆成几条照料记录。点一下就进入能用的 App。

- 官网和 App 是两个“外框”，各有各的页头，互不混用。官网炫，App 安静。
- App 里层级严格：
  - 页头放全局模块。
  - 单个花园只用来编辑布局。
  - 放大后是单块种植区。
- 不再出现两份 Care 和 Next Season。
- 视觉上：
  - 深绿只出现在带纹理的页头、页尾和有意义的元素上。
  - 其他地方是中性白。
  - 画布是清楚的种植图，不是卡通，也不是园林效果图。

## 2. 前置条件（S0，不写代码）

1. 当前分支是 `design-source-photos`，上面只有一个提交 `8618336`（素材照片的 CREDITS 和 `.gitignore`），还没推送。本计划和 ADR-0073 也放在这个分支上，经用户授权后一起提交。
2. 用户回答第 8 节的问题，ADR-0073 改为 Accepted。
3. 从这个分支切出专用分支，建议名 `site-redesign`。每个阶段一个提交，逐个审阅。

## 3. 现状核查（2026-11-14）

| 位置 | 现状 | 本计划的处理 |
| --- | --- | --- |
| `src/app/(workspace)/` | 唯一的路由组；`/` 是 Overview | 改名 `(app)`；Overview 移到 `/gardens`；新增 `(marketing)`，`/` 是官网 |
| `src/lib/workspaceRoutes.ts` | `routeFromPath` 把 `/` 当作 `home` | `home` 对应 `/gardens`；`/` 不再属于 App |
| `AppShell.tsx` | 链接 Overview、Care、Next Season、Plant Doctor、Plant Guide；花园页有 “Back to gardens” 文字链接、花园下拉框和 Plan/Care/Next Season 三个子标签 | 页头改为 Gardens、Care、Next Season ｜ Plant Doctor、Plant Guide，再加 “+ Note”；删除子标签；加面包屑和 “All gardens” 按钮 |
| `/gardens/[id]/care`、`/gardens/[id]/season` | 花园级的 Care 和 Season 页面 | 重定向到 `/care?location=<id>` 和 `/season?garden=<id>`；全局页面已有 `location` 筛选，Season 的筛选在 S3 核实或补上 |
| `src/styles/tokens.css` | 浅绿偏灰的中性色（`#f6f7f4`、`#eef3ee`、`#d9e1d8`），品牌绿 `#2f6846` | 换成无色相的中性色和内容绿 `#1F4230`；变量名尽量保留，减少改动面 |
| `src/lib/planAppearance.ts` | 饱和的土色和陶土色区域填充，`planColors` 偏绿 | 换成原型的淡色种植图配色；植物按作物科配色（第 8 节第 1 条） |
| `GardenPlanOverview.tsx` | 植物圆的半径已经是 `diameterMeters / 2`，即株距范围 | 保留；加每组标签和图例；工具栏、缩放、侧栏改成浮动玻璃层 |
| 植物颜色 | 每株植物有自己的颜色，可手动选（ADR-0030、0049） | 画布按作物科配色；`color` 字段保留，颜色选择器隐藏 |
| `e2e/` | 18 个 spec，几乎都从 `/` 开始 | S1 加一个共用的 `openWorkspace(page)`，统一从 `/gardens` 进入 |
| 字体 | 没有引入网页字体，App 用系统字体 | 两边正文都用 Instrument Sans（S2）；官网大标题用 Bricolage Grotesque（S6）；都通过 `next/font` 自托管 |
| `design/source-photos/` | 原图在本地，不进 Git；CREDITS 已提交 | S6 导出约 2400px 宽的 WebP 到 `public/` |

**改动范围**：
- 全部阶段不改 API，不做数据库迁移，不加新的运行时依赖。
- WebGL 着色器手写，不引入 three.js 之类的库。

## 4. 阶段总览

| 阶段 | 用户能做到什么 | 依赖 | 主要风险 |
| --- | --- | --- | --- |
| S1 路由拆分 | 打开 `/` 看到一个简单的官网占位页，点 “Open app” 进入 `/gardens`；App 全部功能照常 | S0 | e2e 全部要改入口 |
| S2 App 页头与层级 | 页头分组清楚、有视觉区分；花园页没有重复的子标签；有面包屑和明显的返回按钮；“+ Note” 在任何页面都能打开 | S1 | 焦点管理、手机菜单 |
| S3 跨层链接 | 从花园去它的照料记录或下季规划，进入的是带筛选的全局页面；旧链接自动跳转 | S2 | Season 页的筛选可能需要补 |
| S4 画布换装 | 种植图变成淡色图表：株距圆、作物科配色、每组标签、图例；工具栏、缩放、图例、侧栏浮在画布上，是磨砂玻璃 | S2 | 浮动侧栏在中等宽度下的空间；截图全部更新 |
| S5 其余页面换装 | Gardens、Care、Next Season、Notes、Doctor、Guide、表单和弹窗都用新配色 | S2 | 改动面大，要逐页对照 |
| S6 正式官网 | 首屏是带凹凸纹理、跟着光标的深绿香蕉叶；两个功能展示的占位；页尾是会亮的叶脉电路 | S1 | WebGL 性能和兼容；素材体积 |
| S6b 功能展示 | 官网上的 Garden Plan 和 AI Note 展示，用定稿后的真实界面制作 | S5、第 8 节第 3 条 | 形式未定 |
| S7 验收与文档 | 四种尺寸的浏览器旅程、README 截图、ADR 状态、面试故事 | S1–S6 | — |

**顺序**：
- S1 → S2 → S3 按顺序做，它们都改 `AppShell` 和路由。
- S4 和 S5 都依赖 S2 的配色变量。S4 主要改画布，S5 改其他页面，文件基本不重叠，但仍建议先 S4（最显眼）后 S5。
- S6 只改 `(marketing)` 和 `public/`，S1 完成后可以和 S2–S5 并行。

## 5. 各阶段细节

### S1 路由拆分

- **范围**：
  - `src/app/` 的两个路由组
  - `workspaceRoutes.ts`
  - `AppShell` 的品牌链接和返回链接
  - 引导设置 Ready 步骤里的链接
  - 所有写死 `"/"` 的 App 内链接
  - e2e 入口
- **做**：
  - 把 `(workspace)` 改名为 `(app)`，`page.tsx` 移到 `gardens/page.tsx`。
  - 新增 `(marketing)/layout.tsx` 和 `(marketing)/page.tsx`。这一阶段只放：
    - 官网页头：品牌名和 “Open app”
    - 一句产品介绍
    - 两个功能的文字卡片和各自的 “Try it” 链接
  - 官网不挂 `WorkspaceProvider`，不请求 API。
  - App 内回到首页的链接全部指向 `/gardens`。
  - e2e 加 `openWorkspace(page)` 辅助函数，所有 spec 改用它。
- **不做**：新的视觉样式（S2、S6）。
- **验收**：
  - 不启动后端时，`/` 能正常显示。
  - 从 `/` 点 “Open app” 进入 `/gardens`，原来的 Overview 功能全部可用。
  - 直接打开 `/gardens/<id>/plan` 不受影响。
- **测试**：
  - `workspaceRoutes` 单元测试更新。
  - 新增 `e2e/landing.spec.ts`：不连后端时打开 `/`，点进 App。
  - 所有现有 spec 通过。

> 实施说明（2026-11-14 完成）：
> - `(workspace)` 改名为 `(app)`，Overview 移到 `/gardens`。
> - `workspaceRoutes.ts` 新增 `workspaceHomePath`。品牌链接、“Back to gardens”、删除花园后的跳转、“Return to overview”、恢复浏览器副本后的跳转都改用它。
> - `(marketing)` 只放占位：页头（品牌名、“Open app”）、一句介绍、两张功能卡片和各自的 “Try it”。Garden Plan 的 “Try it” 进入 `/gardens`，那里有 “Load demo garden”；AI Note 的进入 `/notes`。
> - e2e 新增 `e2e/workspace.ts` 的 `openWorkspace(page)` 和 `workspaceHome`，13 个 spec 改用它。新增 `e2e/landing.spec.ts`：1440 和 390px 下打开 `/`，不发出任何 API 请求，没有横向滚动；四个入口都进入 App；App 内的品牌链接留在 App。
> - 单元测试的默认路由改为 `/gardens`，新增 `Landing.test.tsx`。README 的入口说明已更新。
> - 页头文字仍叫 “Overview”，改名 “Gardens” 放在 S2。

### S2 App 页头与层级

- **范围**：`AppShell.tsx` 及其样式、`tokens.css`（只加新变量，不删旧的）、`Button`、`PageHeader`、根布局的字体配置。
- **做**：
  - 在根布局用 `next/font` 引入 Instrument Sans，作为官网和 App 共用的正文字体。
  - 页头：
    - 深绿底 `#264A33`，叠一张灰度的香蕉叶纹理（overlay 混合，75%）。
    - 导航文字白色，15.5px，字重 500。
    - 当前模块显示一个浅色胶囊。
    - Plant Doctor 前加分隔线。
    - 右侧是 “+ Note” 和保存状态。
  - 手机：沿用现有的 Menu 折叠菜单。“+ Note” 留在页头外面，不收进菜单。
  - “+ Note” 打开现有的 Garden Note 弹窗，不改它的内部逻辑。在 Gardens 页，它和页面里的 Note 入口打开的是同一个会话。
  - 删除花园页的 Plan/Care/Next Season 子标签。
  - 花园下拉框保留在面包屑旁边，切换花园仍然停在 Plan。
  - L1 以下显示面包屑（Gardens › 花园名 › 种植区名）和 “All gardens” 按钮。按钮用次要按钮样式，不是文字链接。
- **不做**：页面内容区的换装（S4、S5）。
- **验收**：
  - 1440px 和 390px 下都能用键盘走完页头。
  - 从任何页面点 “+ Note”，弹窗打开；Escape 关闭后，焦点回到按钮。
  - 花园页上没有第二份 Care 或 Next Season。
  - 页头不会被看成黑色，和原型第 8 版对照。
- **测试**：
  - `WorkspaceRouting.test.tsx` 和 `GardenWorkspace.test.tsx` 中关于子标签的断言更新。
  - `workspace-routes.spec.ts` 增加面包屑和 “+ Note” 的旅程。

> 实施说明（2026-11-14 完成）：
> - 纹理：从香蕉叶原图（Pexels 12321610）裁出 35% 高度附近的一条横带，用 macOS 自带的 `sips` 转成灰度，再用 `cwebp` 输出 2400 × 480 的 WebP，放在 `public/textures/leaf-ridges-gray.webp`（约 157 KB）。没有新增 npm 依赖。
> - 页头（`AppShell`）：
>   - 深绿底 `#264A33`，纹理叠在 `::before` 上（overlay 混合，75%，对比度 1.7），左侧渐变在 `::after` 上。
>   - 和原型第 8 版并排截图对照过，读起来是绿色，不是黑色。e2e 也检查页头的背景色。
>   - 导航分两组：Gardens、Care、Next Season ｜ Plant Doctor、Plant Guide。当前模块是白色胶囊。在花园页上，Gardens 用 `aria-current="true"` 标出所在的模块。
>   - 右侧是 “+ Note” 和保存状态。
> - “+ Note”：
>   - 走原来的 `openNote`，所以和 Gardens 页里的 Note 入口是同一个会话。
>   - 在花园页打开时，会预选这个花园。
>   - Escape 关闭后，焦点回到按钮。
>   - 手机上它在 Menu 外面。Menu 和 “+ Note” 的视觉顺序和 Tab 顺序一致。
> - 页面层级：
>   - 删除了花园页的 Plan/Care/Next Season 子标签。
>   - L2、L3 页面（花园、种植区、新建花园，以及 S3 之前还在的花园级 Care/Season）显示 “← All gardens” 胶囊按钮、面包屑（Gardens › 花园 › 种植区）和花园下拉框。
>   - L1 页面不显示这些，回到 Gardens 用页头。
> - 中等宽度：1024 到 1279px 之间，页头用紧凑的间距和胶囊（顺序和内容不变），1024px 时 “Plant Guide” 不再压到 “+ Note”。Menu 断点仍是 1023px。`workspace-routes.spec.ts` 在 1024、1100、1279、1440px 检查页头每一项的边界框不和相邻项重叠、不换行、不被裁掉；去掉这段样式时，这条检查会报出原来的重叠。
> - 修了一个旧问题：手机菜单打开时按 Escape，以前会同时让画布退出放大的种植区。现在菜单先处理 Escape，并标记为已处理。
> - 其他：
>   - `Button` 和 `ButtonLink` 增加 `shape="pill"`，是新外观的胶囊按钮。
>   - `PageHeader` 标题用内容绿 `#173322`。
>   - `tokens.css` 只新增变量（app bar、无色相中性色、内容绿、`--radius-pill`、`--font-body`），旧变量不动，留给 S5。
>   - 根布局用 `next/font/google` 引入 Instrument Sans。字体在构建时下载并由本站提供，运行时不请求 Google。
>   - “Overview” 改名为 “Gardens”（链接、页面标题、`<title>`、测试）。
> - 测试：
>   - 单元测试改了子标签、“Back to gardens” 和 “Overview” 的断言。
>   - `WorkspaceRouting.test.tsx` 新增两条：面包屑和层级、从 `/care` 打开 “+ Note” 后焦点返回。
>   - `workspace-routes.spec.ts` 新增 1440px 的旅程：面包屑、键盘走完页头、“+ Note” 焦点返回、页头颜色。手机那条旅程改为从 `/guide` 用 “+ Note” 打开同一个会话。
> - 已知限制：
>   - 内容区还是旧配色，S4、S5 处理。
>   - 花园级的 Care/Season 地址在 S3 之前仍可访问，面包屑显示为 “Gardens › 花园 › Care”。

### S3 跨层链接

- **范围**：两个旧的花园级路由、`/season` 的花园筛选、引导设置 Ready 的 “Log the first watering” 和 “Plan next season”、花园卡片上的入口。
- **做**：
  - `/gardens/[id]/care` 重定向到 `/care?location=<id>`，保留 `view` 参数。
  - `/gardens/[id]/season` 重定向到 `/season?garden=<id>`。
  - 如果 `/season` 还不支持 `garden` 筛选，就加上。筛选时显示 “只看 Backyard · 显示全部”。
  - Ready 步骤和花园卡片的链接改为带筛选的地址。
- **不做**：Care 和 Season 的功能改动。
- **验收**：
  - 旧地址都能跳到正确的筛选视图。
  - 浏览器后退不会卡在重定向上（使用 replace）。
  - 从 Ready 去照料记录，看到的是这个花园的记录。
- **测试**：
  - 重定向的路由测试。
  - `global-care.spec.ts` 和 `season-hierarchy.spec.ts` 更新。

> 实施说明（2026-11-15 完成）：
> - 重定向：
>   - 规则写在 `workspaceRoutes.ts` 的 `legacyGardenRedirects`，由 `next.config.ts` 的 `redirects()` 读取。两个旧页面文件已删除。
>   - `/gardens/<id>/care` → `/care?location=<id>`，Next.js 会把原来的查询参数带过去，所以 `view` 保留（无效值由 Care 页归为 `tasks`）。`/gardens/<id>/season` → `/season?garden=<id>`。
>   - 服务器在渲染前直接回 307，旧地址不进浏览器历史，所以后退不会卡住。用 307 而不是 308，浏览器不会永久缓存，以后还能改。
>   - 先试过在页面里调用 `redirect()`。因为 `(app)` 布局外层有 Suspense，页面已经开始流式输出，生产构建里它变成 200 加页面内跳转，会先闪一下 App 外壳，所以改用配置里的重定向。生产构建里用 curl 检查过：两个旧地址都回 307，带中文和 `?` 的花园 ID 编码正确，Plan 地址仍是 200。
> - 路由工具：
>   - `gardenPath(id)` 只生成 Plan 地址，L2 只剩这一种花园页。新增 `careLocationPath(location, view?)` 和 `seasonGardenPath(id)`。
>   - `routeFromPath` 不再把 `/gardens/<id>/care|season` 解析成花园级模块。
> - Next Season 的花园筛选：
>   - 原来就有页内的下拉框，但状态存在草稿里，地址里没有。现在 `?garden=` 是唯一来源：下拉框改地址（push），刷新和后退都保留筛选。
>   - 筛选时下拉框下方显示 “Only Backyard · Show all”，“Show all” 链接回 `/season`。不认识的花园显示 “Only an unavailable garden”，下面是原有的 “Garden unavailable” 空状态。
>   - 去掉了花园级专用的 `gardenId` 属性。季节草稿键统一为 `season:all:*`。
> - 改成带筛选地址的入口：
>   - 引导设置 Ready 的 “Log the first watering” 和 “Plan next season”。
>   - Gardens 页任务列表里的单条任务。
>   - 单条 AI 笔记保存后的 “View records”（全花园的笔记仍去 `/care?view=history`）。
>   - Care 页底部 “Care by location” 里每个花园的 “Open care”（原标题 “Open a garden Care page” 已不准确）。
> - 页头：Care 和 Next Season 都是 L1，不再有 “Gardens › 花园 › Care” 面包屑。花园下拉框只在 Plan 上出现，切换花园始终进入 Plan。
> - 随旧页面一起删除的：花园 Care 页的 “Applies to all gardens” 区块（`SharedCare`）及其样式。按花园筛选的 Care 只显示这个花园自己的记录，全花园记录在 “All gardens” 位置里看。ADR-0067 的状态已注明。
> - 测试：
>   - `workspaceRoutes.test.ts` 检查 `next.config.ts` 实际返回的重定向规则（来源、目标、307），目标和 App 内链接用的筛选地址一致，并覆盖新路径函数和编码。
>   - `WorkspaceRouting.test.tsx` 新增 Season 筛选旅程（地址筛选、Show all、下拉框、后退）。`GardenWorkspace.test.tsx` 的 Ready → Care 断言改为 `/care?location=`，并检查后退回到 Plan。
>   - e2e：`workspace-routes.spec.ts` 新增旧地址旅程（检查响应是 307、后退、前进、Show all）；`global-care.spec.ts`、`season-hierarchy.spec.ts`、`guided-setup.spec.ts`、`confirmation.spec.ts` 改用新地址；`readme-screenshots.spec.ts` 的地址也已更新。
> - 已知限制：
>   - `CareWorkspace` 仍保留单个花园模式（`garden` 不是 “all-gardens” 时），App 里已不再使用，只在组件测试里出现。删掉它属于 Care 的重构，不在 S3 范围内。
>   - Care 位置筛选没有加 “Only … · Show all” 这一行，它已有 “Location” 下拉框，计划只要求 Season 加。

### S4 画布换装

- **范围**：`planAppearance.ts`、`GardenPlanOverview.tsx` 的绘制部分、`canvas/Canvas.module.css`、Garden Plan 页的工具栏、缩放、侧栏布局、首页缩略图。
- **做**：
  - 区域外观：
    - 高床：淡土色加细木框。
    - 地栽：虚线边。
    - 盆栽：圆形，陶土色边。
    - 温室：淡蓝玻璃色加屋脊线，保留。
    - 花园边界用内容绿 2px。
    - 花园外面是淡点阵。
  - 植物：
    - 圆的直径就是株距范围。
    - 浅色填充，深色描边；颜色按作物科。植物面板里的颜色选择器隐藏，`color` 字段不动。
    - 不认识科的植物用中性的 “Other”。
  - 标签：每块地里的每组植物一个标签（“Tomato ×2”），沿用 G1 不压住植物的规则，放不下时只显示数量。
  - 图例：左下角，只列当前视图里出现的作物科。
  - 玻璃层：
    - 900px 以上，工具栏（左上）、缩放（右下）、图例（左下）、种植区侧栏（右上，300px）浮在画布上。
    - 样式是白色 40%、模糊 10px、饱和度 150%、白色细边。
    - 画布占满宽度，取景时给浮动层留出边距，不让它们盖住选中的区域。
  - 900px 以下，这些层回到正常的页面流，和 G3 的窄屏布局一致。
  - 浏览器不支持 `backdrop-filter` 时，改用不透明的白色。
- **不做**：交互改动。放大、放置、拖动、铺满、撤销、引导设置全部不变。
- **验收**：
  - 在 Demo Garden 里不看文字也能说出每块地种了什么、各占多少地方。
  - 1440、1080、900、768、390px 下，浮动层都不盖住选中区域。
  - 选中区域和引导步骤的操作和以前一样。
- **测试**：
  - `planAppearance` 单元测试（作物科到颜色、未知科的颜色）。
  - 标签放置的纯函数测试。
  - `garden-plan-acceptance.spec.ts` 的截图更新。
  - 增加 “浮动层不覆盖选中区域” 的几何检查。

> 实施说明（2026-11-15 完成）：
> - 区域外观（`planAppearance.ts`）：
>   - 高床：淡土色 `#F1ECE4`，4px 木色框 `#8C6A48`，带一层淡阴影。
>   - 地栽：`#ECE6DC`，1.5px 虚线边。
>   - 盆栽：圆角到圆形，陶土色边 `#B5704E`，带淡阴影。
>   - 温室：淡蓝玻璃 `#E4EFF2`，屋脊线保留。
>   - 花园地面 `#FAFAFA`，网格线 `#E2E2E0`，边界是 2px 内容绿 `#1F4230`，画在网格上面。选中框也用内容绿，离区域边 6px，不和木框叠在一起。
>   - 花园外面的点阵是画布容器的 CSS 背景（`--color-plan-outside`、`--color-plan-dot`，`tokens.css` 只新增变量）。Konva 的地面矩形盖住花园里面的部分。
>   - 标尺贴着花园的上边和左边，并夹在浮动层之外，不再固定在画布最上面。
> - 植物：
>   - 圆的直径仍是 `diameterMeters`，即株距范围。浅色填充、深色描边，中心一个小点。
>   - 颜色按作物科（`cropFamilyColors`），作物科和轮作提醒（ADR-0025）是同一套 8 类：原型给出的 5 种颜色用在茄科、叶菜、豆科、瓜类上，十字花科、葱蒜、根菜三种是新选的，Other 是中性灰。每种描边对填充色、土色、地面的对比度都不低于 3:1，单元测试检查。
>   - 作物科的来源：植物链接了种植记录时用记录的科，否则按名字推断（`inferPlantCropFamily`），都不匹配就是 Other。所以 Basil、Marigold 这类不在轮作分类里的植物显示为 Other。
>   - 植物面板（新增和编辑）里的颜色选择器已去掉；`color` 字段和草稿里的 `allocationColor` 都保留，恢复只需改界面。放置预览也改用作物科颜色。
> - 标签和图例：
>   - `src/lib/plantLabels.ts` 是纯函数：每块地里同一种植物一组，一个标签（“Tomato ×2”，单株只写名字）。依次试组的下方、上方、右侧、左侧；不能压到任何植物圆、区域名、尺寸标签和别的标签，也不能进入浮动层占用的边带。全名放不下就只写 “×2”，数量也放不下就不显示（图例和植物面板仍能看出种了什么）。
>   - 标签用 Konva 画，文字加一圈白色描边，字体读取页面的 Instrument Sans。区域被拖动、拉伸，或正在拖植物时，这块地的标签先隐藏，落下后重画。
>   - 放大到一块地时，只给这块地加标签，图例也只列这块地的作物科。
>   - 图例标题 “Crop family”，只列视图里出现的科，按固定顺序。
> - 玻璃浮动层：
>   - 900px 及以上（媒体查询 `(min-width: 900px)`，和 CSS 一致）是 wide 布局：画布占满宽度，高度 `clamp(520px, 100dvh − 160px, 760px)`；工具栏（左上：添加区域、Undo/Redo）、缩放（右下：“← Whole garden”）、图例（左下）、种植区侧栏（右上，300px，高度不超过画布，内部滚动）浮在上面。
>   - 玻璃样式：白色 40%、`blur(10px) saturate(1.5)`、白色细边和柔和阴影；不支持 `backdrop-filter` 时用不透明白色（`@supports not`）。
>   - 取景：`useOverlayInsets` 测量每个浮动层的位置，`overlayInsets` 按角落算出四边要留的边带（右上的侧栏占右侧一整条，其他层占上边或下边一条），`insetViewport` 把目标区域放进剩下的矩形中央。渲染和指针换算仍然只用一个 `fitCanvas` 变换，拖动、放置的坐标计算不变。
>   - 原来 wide 的判断是 “容器宽度 ≥ 1080px”。页面有没有滚动条会让容器宽度差 15px，所以改成和 CSS 一样的媒体查询，900px 整齐地切换。900 到 1079px 原来是 overlay 布局，现在也是浮动布局。
>   - 侧栏就是原来 wide 布局的 “Edit planting area” 面板（属性和植物），挂进画布里浮动；没有选中区域时不显示，种植区列表统一放在画布下面（原来 wide 布局右侧的 “Garden area summary” 去掉了）。
>   - 原型里的缩放是 −/100%/+，现在的产品没有自由缩放，加上就是交互改动（本阶段不做），所以右下角放的是已有的 “← Whole garden”，只在放大到一块地时出现。
>   - 900px 以下回到页面流，和 G3 的窄屏一样：“Whole garden” 和添加按钮在画布上方，Undo/Redo 留在标题行，图例在画布下方。
> - 首页缩略图：同样的区域外观和作物科颜色，卡片背景换成同样的点阵。
> - 测试：
>   - `planAppearance.test.ts`：每种区域的外观、边界和选中色、每个作物科的颜色（逐个列出）、Other 是中性灰、描边对比度、记录优先于名字推断、图例只列出现的科。
>   - `plantLabels.test.ts`：标签在组下方居中且不压植物；下方被占时换到上方；全名放不下只显示数量；数量也放不下就不显示；标签之间、和区域名之间不重叠，并留在允许的范围里。
>   - `canvasViewport.test.ts`：`insetViewport` 把目标放在剩余区域中央、没有边带时原样返回、没有空间时退回；`overlayInsets` 按角落计算边带。
>   - `GardenWorkspace.test.tsx`：原来 “选一个植物颜色并保存” 的断言改为：植物按作物科着色，面板里没有颜色选择器，图例列出 Nightshade。jsdom 的 `matchMedia` 桩现在按 `testLayout.viewportWidth` 计算宽度查询，wide 布局的测试把它设为 1280。
>   - e2e：`garden-plan-acceptance.spec.ts` 增加 1080 和 900px（共 1440、1080、900、768、390px 和 200% 缩放），每一步的截图都重新生成。新增几何检查：从 Konva 的场景树读出选中区域的实际包围盒（包括植物和选中框），确认它在画布内；900px 及以上四个浮动层都在，且没有一个和它相交；900px 以下没有浮动层。另外检查图例在填满生菜后出现 “Leafy green”。
>   - `e2e/areaHelpers.ts` 新增 `planTransform(page, target)`：测量浮动层后用同样的纯函数算出画布变换，五个依赖点击坐标的 spec 改用它。`responsive-editor.spec.ts` 的宽度改为 390、820（overlay）、900、1440（浮动），检查侧栏 300px 宽、浮在画布右上。
> - 触屏：Move 关闭时，在地块上竖着滑动是滚动页面。图例放到画布下方后页面变高，手指可能停在起点那块地上，Konva 会把这次滑动当成点按，打开这块地。现在手指移动超过 10px 的触摸不算点按（区域和植物都一样），`responsive-editor.spec.ts` 也改为等滚动停下后再检查地址没变。这是 Konva 原有的行为，只是页面变高后才暴露出来，交互规则（滑动滚动页面、Move 打开后才拖动）没有变。
> - 和原型第 8 版的截图对照：在原型的同一个花园（同样的地块、植物和位置）上截 1440px 的整个花园和放大的 Raised bed A，与原型并排比较。区域外观、株距圆、组标签位置、图例、玻璃层位置都和原型一致。差别：Basil 和 Marigold 在原型里有 “Herbs” 和 “Lettuce family” 两类，这里按轮作的 8 类显示为 Other；原型的 −/100%/+ 缩放和比例尺没有做；侧栏内容是现有的属性和植物编辑器，不是原型里的摘要卡片。
> - 已知限制：
>   - Demo Garden 的数据很少（只有一株番茄，另外两块地是空的），“不看文字也能看出每块地种了什么” 要等填了植物才明显。是否丰富 Demo 数据留给用户决定。
>   - Next Season 页的小地图仍按旧的单株颜色画（`SeasonPlanner.tsx`），属于 S5 的其他页面。
>   - Basil、Marigold 等没有轮作科的植物都是 Other 灰色；要细分需要扩充作物科，会影响轮作逻辑，不在本阶段。
>   - 浮动侧栏 300px 宽，属性表单在里面需要滚动；900px 时工具栏会折成两行。

### S5 其余页面换装

- **范围**：`tokens.css` 中旧变量的取值、`controls.css`、`legacy-workspace.css`，以及 Gardens、Care、Next Season、Notes、Doctor、Guide、表单、弹窗、确认框、空状态的样式。
- **做**：
  - 中性色换成无色相的灰：
    - 页面 `#F4F4F3`
    - 卡片 `#FFFFFF`
    - 线 `#E3E3E1`
    - 文字 `#18181A`、`#5F5F63`、`#8D8D91`
  - 品牌色换成 `#1F4230`，悬停 `#285239`，标题 `#173322`。
  - 主按钮、选中状态、标题、保存状态点用内容绿。其他地方不加绿。
  - 逐页检查对比度：正文至少 4.5:1，大字和图形至少 3:1。
- **不做**：页面结构和功能改动。Gardens 页顶部加一条简短的 “今天” 提示，链接到 Care（第 8 节第 2 条）。
- **验收**：
  - 每个页面的截图和原型第 8 版的配色一致。
  - 没有残留的浅绿偏灰背景。
  - 对比度检查通过。
- **测试**：
  - 现有单元测试和 e2e 全部通过。
  - 增加一条把每个 L1 页面截图的旅程，供审阅。

### S6 正式官网

- **范围**：`src/app/(marketing)/`、`src/components/marketing/`（新）、`public/landing/`（新）、`next/font` 字体配置。
- **做**：
  - 素材：
    - 从 `design/source-photos/` 导出香蕉叶和密网叶脉两张，约 2400px 宽的 WebP。
    - 另外各导出一张调好色的静态图，供不支持 WebGL 时使用。
    - 写一个可重复运行的导出脚本，放在 `scripts/`。
  - 首屏：
    - WebGL2 着色器把亮度映射到三种固定的深绿。
    - 用模糊后的亮度算法线，光跟着光标走；没有指针时慢慢绕圈。
    - 文字全白，主按钮是荧光绿 `#D6FF5C`。
  - 两个功能展示：S6 只放占位（标题、一句说明、“Try it”）。真正的展示等 App 定稿后作为 S6b 交付，形式见第 8 节第 3 条。设想中的内容：
    - Garden Plan：画一块地、放进植物的过程。
    - AI Note：一段话沿着“叶脉”分开，变成两条记录，分隔线是荧光绿。
  - 页尾：
    - 用带通滤波提取叶脉，光标附近的叶脉亮成荧光绿。
    - SVG 节点放在叶脉最亮的点上。
  - 性能：
    - 画布像素比上限 2。
    - 离开视口就暂停。
    - 用户开启“减少动态效果”时只显示静态图。
    - 图片在文字之后加载。
    - 不支持 WebGL2 时用静态图。
  - SEO 和分享：页面标题、描述、Open Graph 图片。
- **不做**：真实注册、价格、博客。
- **验收**：
  - 首屏和页尾的质感和原型第 4 版一致（用户目测确认）。
  - 关掉 WebGL 或开启减少动态效果时，显示的是调好色的静态图，不是空白。
  - 在普通笔记本上滚动和移动光标不卡顿。
  - Lighthouse 性能分不低于 85，无障碍分不低于 95。
- **测试**：
  - `landing.spec.ts` 增加：
    - WebGL 画布出现
    - 禁用 WebGL 时出现静态图
    - 减少动态效果
    - 三个入口链接都能进入 App
  - 着色器之外的逻辑（叶脉节点的选点、光标坐标换算）抽成纯函数，写单元测试。

### S7 验收与文档

- 在 1440、768、390px 和模拟 200% 缩放下，走一遍官网 → App → 画布 → 记一条 Note，每一步留截图，并检查没有横向滚动。
- 重新生成 README 截图，README 的入口说明改为：`/` 是官网，`/gardens` 是 App。
- ADR-0073 状态改为 Accepted 并写明已实施；ADR-0051、0063、0069、0072 在索引中标为部分被替代，ADR-0030、0049 标为对画布颜色部分修订。
- 在 `docs/interview-stories.md` 记录这次重新设计。要点：
  - 为什么要拆出官网
  - 怎样用原型一轮轮排除方案
  - 为什么选真实照片加着色器，而不是程序生成纹理
  - 为什么整页深绿被否决
- 更新 `frontend-professionalization-progress.md`。

## 6. 每阶段统一的完成标准

- 只交付本阶段的用户能力，不顺手改其他页面。
- 以下检查全部通过：
  - `npm test`
  - `npm run lint`
  - `npm run typecheck`
  - 在独立目录做的生产构建
  - `git diff --check`
- 本阶段相关的 Playwright 旅程在用户的 macOS 环境运行通过。运行不了时明确写“待验收”，不用静态检查代替。
- 交付说明列出：改了哪些文件、测试与验证结果、已知限制、下一阶段。
- 每阶段一个提交，提交前由用户审阅并授权。

## 7. 部署影响

- Vercel 演示站（ADR-0040）的 `/` 会变成官网。已有的 App 深链接（`/gardens/<id>/plan`、`/care` 等）不变，只有原来的 `/` 首页变成 `/gardens`。
- 官网不依赖 Render 后端，后端休眠时首页照常显示。这对面试官第一次打开很重要。
- 不需要新的服务、域名或费用。

## 8. 已确认的决定（2026-11-14）

用户确认第 1、2、4、5 条按建议执行；第 3 条暂不决定。

1. **植物颜色按作物科**（S4）。
   - 画布和缩略图按作物科配色，和轮作提醒（ADR-0025）对得上。不认识科的植物用中性的 “Other”。
   - 植物自己的 `color` 字段保留在数据里，不删除。植物面板里的颜色选择器隐藏，以后要恢复只需改界面。
   - 落地时把 ADR-0030、0049 标为对画布颜色部分修订。
2. **“今天的照料任务”**（S5）：Gardens 页顶部放一条简短的 “今天” 提示（几项任务，链接到 Care），完整列表只在 Care 里。
3. **官网功能展示的形式**：暂不决定。
   - 用户决定：先把整个花园管理流程跑通、定稿，再截图做特效放到首页。用户会先研究展示怎么做得更酷炫。
   - 候选方案：
     - 真实截图做卡片动画（CSS 和少量 JS），画面清晰、体积小，截图可以由 `readme-screenshots.spec.ts` 重新生成。
     - 录屏视频（WebM/MP4），更直观，但录制、压缩和更新的成本更高。
   - 影响：S6 先做首屏、页尾和两块展示的占位，展示内容在 S5 完成、App 定稿之后单独作为 S6b 交付。
4. **花园级 Care 和 Season 的旧地址**（S3）：重定向到带筛选的全局页面，不保留独立页面。
5. **字体**（S2、S6）：
   - 正文字体 Instrument Sans 在官网和 App 都用。这样两边是同一个品牌；系统字体在 Mac 和 Windows 上不一样，面试官看到的界面会和你的不同。
   - 标题字体 Bricolage Grotesque 只用在官网大标题上。它个性强，不适合 App 里的小按钮、表单和数字。
   - 两种字体都通过 `next/font` 打包进项目，不在运行时请求谷歌服务器。
