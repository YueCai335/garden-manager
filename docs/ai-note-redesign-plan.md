# AI Garden Note 重新设计：实施计划

- 日期：2026-11-19（America/Toronto）
- 状态：N1、N2 已完成（2026-11-20），N3–N8 未开始。决定记录在 [ADR-0085](decisions/0085-split-one-garden-note-into-reviewed-records-across-gardens.md)。
- 本文读者：负责实现的工程师或 Agent。请先读完本文，再打开第 2 节的设计稿对照。
- 设计稿是视觉的唯一依据。本文与设计稿冲突时，外观以设计稿为准，行为规则以本文为准；仍有疑问就问用户，不要自己猜。
- 付费模型评估和公开 demo 的改动放在最后一步（N8），每一步都要先得到用户同意。N0–N7 都不花钱。

## 1. 目标

用户用一小段话（打字或用键盘自带的语音输入）记下今天在几个花园里做的事，AI 把它拆成一条条记录，按花园分组给用户审核；保存时，今天到期或已经逾期的对应待办会一起被划掉。

完成后，用户能做到：

1. 在首页卡片或页头 "+ Note" 写一段话，点 "Split into records"。
2. 看到荧光绿分叉线从原文分到各个花园卡片，下面是按花园分组的记录清单。
3. 把鼠标停在记录、句子或花园卡上，看到它们之间的对应关系。
4. 补全空着的字段，取消不想要的记录或"顺便完成待办"。
5. 一次保存所有记录，看到划掉了哪些待办、新加了哪些待办。
6. 在 Care 和 History 里看到并新建五种操作：浇水、施肥、定植、修剪、病虫害处理。

审美规则见 [design/frontend-aesthetic-preferences.md](../design/frontend-aesthetic-preferences.md)，动手前必须先读。

## 2. 设计稿

| 文件 | 内容 |
| --- | --- |
| [design/ai-note-redesign/note-flow.html](../design/ai-note-redesign/note-flow.html) | 弹窗的全部画面。顶部工具栏切换 Write、Reading、Review、Saved 和四种 Problems；"Run it" 会自动播放 写 → 读 → 审核。窗口宽度小于 720px 时是手机版。 |
| [design/ai-note-redesign/home-entry.html](../design/ai-note-redesign/home-entry.html) | Gardens 首页的 AI Garden Notes 卡片。下方工具栏切换 空 / 正在写 / 等待审核 / 刚保存。 |
| [design/ai-note-redesign/care-types.html](../design/ai-note-redesign/care-types.html) | Care 页面使用五种操作；底部是新建待办的类型选择和 History 筛选。 |
| [design/ai-note-redesign/screenshots/](../design/ai-note-redesign/screenshots/) | 定稿截图。`before-*` 是改版前的样子。 |
| [design/ai-note-redesign/explorations/](../design/ai-note-redesign/explorations/) | 被否掉的方案，只作记录，不要照着做。 |

设计稿用 Google Fonts 链接、内联脚本和示例数据。App 里字体用 `next/font` 自托管，样式用 CSS Modules 和 `src/styles/tokens.css`，不要把设计稿的写法搬进 App。设计稿里的 `note-flow.html` 工具栏上还留着几组旧按钮（Top area、Branch colour、Footer），它们已经没有作用，以本文为准：版本 3、荧光绿分叉线、深绿底栏。

## 3. 现状核查（2026-11-19）

| 位置 | 现状 |
| --- | --- |
| `src/lib/gardenWorkspace.ts` 第 288 行 | `careEventTypes = ["watering", "fertilizing"]`；`CareEvent` 有肥料三个字段，`CareTask` 没有任何细节字段；浏览器里的工作区格式是 `version: 10`。 |
| `backend/app/schemas.py` 第 9 行 | `CareType = Literal["watering", "fertilizing"]`；`fertilizer_details_match_type` 禁止浇水带肥料信息。 |
| `backend/app/models.py` | `care_events`、`care_tasks`、`workspace_care_events`、`workspace_care_tasks` 四张表。类型存成 `String(32)`，不是数据库枚举。 |
| `backend/alembic/versions/` | 最新一版是 `20261004_09_add_care_note_public_budget.py`。 |
| `backend/app/care_note_batch.py` | 本地批量提取。`MAX_DRAFTS = 6`，`MAX_FRAGMENTS = 12`，`MAX_OUTPUT_TOKENS = 4096`；计划中的片段只返回一条提示。 |
| `backend/app/main.py` 第 210 行 | `POST /workspaces/{workspace_id}/ai/care-note-drafts`；`/runtime-config` 里的 `careNoteBatchAvailable` 只在非 demo 模式下为真。 |
| `src/lib/careNoteBatch.ts`、`src/hooks/useCareNoteBatchSession.ts` | 草稿行、校验和整批保存。 |
| `src/components/notes/BatchGardenNote.tsx`、`GardenNoteDialog.tsx`、`WorkspaceGardenNote.tsx` | 现在的弹窗和 `/notes` 页面：每条草稿一整张表单。 |
| `src/components/workspace/OverviewGardenNote.tsx` | 首页卡片：横格纸输入框、"Open note editor" 链接、"Generate draft" 按钮。 |
| `src/lib/careLabels.ts`、`src/components/care/CareMarks.tsx` | 只有 Water / Fertilize 两种文字和两种图标。 |
| `src/components/care/CareForms.tsx` 第 78 行 | 操作类型是只有两个选项的下拉框。 |
| `src/lib/careViews.ts` | `completeCareTask` 写完成记录并推进重复任务。 |
| 测试 | `backend/tests/test_care_note_batch.py`、`src/components/notes/BatchGardenNote.test.tsx`、`e2e/batch-notes.spec.ts`、`e2e/global-care.spec.ts`。 |

## 4. 已确认的决定

这些是用户在 2026-11-19 逐条确认的，实现时不要改。

| 编号 | 决定 |
| --- | --- |
| D1 | 五种操作：浇水、施肥、定植（含播种）、修剪、病虫害处理。不做采收。 |
| D2 | 定植只写记录；植物在图上就关联上，不在就提示 "Add on plan"，不自动改画布。 |
| D3 | Care 的待办和 History 也用这五种。 |
| D4 | 语音用键盘自带的麦克风，App 里只写一句提示，不做麦克风按钮。 |
| D5 | 审核页按花园分组，原文和记录互相高亮。 |
| D6 | 审核页顶部：短深绿条，浅色磨砂原文卡，荧光绿分叉线，浅色花园卡骑在深绿和灰底的分界线上，深绿底栏配白色主按钮。 |
| D7 | 输入页只有输入框，花园卡在开始读取时才出现。保留 "Due today" 一行。 |
| D8 | 一条笔记最多 12 件已完成的事；超出就整条退回，请用户拆开。 |
| D9 | 保存后画面和四种问题画面照设计稿。 |
| D10 | 首页卡片保留，按钮改名 "Split into records"，去掉 "Open note editor"，卡片显示草稿状态。 |
| D11 | 手机版用迷你分叉。 |
| D12 | 新图标：小铲子（定植）、剪刀（修剪）、小虫子（病虫害）；新颜色 `#4a6a12`、`#44506a`、`#8f3a1c`。新建待办用五个带图标的胶囊按钮选类型。 |

## 5. 数据规则

### 5.1 每种操作的细节字段

记录（`CareEvent`）和待办（`CareTask`）都加同样的可选字段。前端用 camelCase，后端列名用 snake_case。

| 类型 | 字段 | 限制 |
| --- | --- | --- |
| fertilizing | `fertilizerProduct`、`fertilizerAmount`、`fertilizerUnit` | 不变 |
| planting | `plantName`（≤ 200 字）、`plantCount`（正整数，≤ 999） | 都可选 |
| pruning | `pruneDetail`（≤ 200 字） | 可选 |
| pest-treatment | `pestProblem`、`pestTreatment`（各 ≤ 200 字） | 都可选 |

某个字段只能出现在它自己的类型上，前后端都校验，和现在"浇水不能带肥料"一样。待办现在没有肥料字段，这次一起补上。

### 5.2 任务匹配（纯代码，不用 AI）

在 `src/lib/` 新建一个纯函数模块，例如 `noteTaskMatch.ts`。

1. 只看没完成的待办，且到期日 ≤ 记录日期（今天到期或已逾期）。
2. 类型必须相同。
3. 目标：记录的目标等于或宽于待办的目标。整个花园能覆盖这个花园里的种植区和植物组；种植区能覆盖里面的植物组。反过来不行。
4. "所有花园"的待办，只有这条笔记的记录覆盖了每一个花园时才算完成。
5. 一条待办最多被一条记录完成；同时有多条记录能匹配时，选目标最窄的那条。
6. 匹配上的记录就是这个待办的完成记录，保存时调用现有的完成逻辑，不再另写一条历史。

## 6. 任务拆分

每一步都是一个能单独测试的小改动，按顺序做。每步结束时跑第 7 节的检查，把结果写进交接说明。

### N1 数据模型：五种操作和细节字段

- 前端：`careEventTypes` 加 `planting`、`pruning`、`pest-treatment`；`CareEvent` 和 `CareTask` 加第 5.1 节的字段；旧数据原样读入。（实现时决定：工作区格式保持 `version: 10`。这次改动只增不减，旧数据本来就合法，不需要迁移函数。）
- 后端：`CareType` 加三种；四张表加新列（都可为空），写一个 Alembic 迁移；同步读写新字段；校验字段只属于自己的类型。
- 测试：前端规范化和往返测试；后端 schema 校验、同步往返、迁移升级和回退（`test_migrations.py`）。
- 用户看不到变化。

### N2 Care、History 和首页的五种操作

- `careLabels.ts`：五种动词和标题，例如 "Prune Front Yard"、"Plant basil in Front Yard"、"Treat pests in Community Garden"；花园卡片里省略花园名。
- `CareMarks.tsx`：三个新图标和三种颜色，颜色写进 `tokens.css`，深色背景上用浅色版本（`#d2e6a0`、`#cdd4e6`、`#f4bda6`）。
- `CareForms.tsx`：类型改成五个带图标的胶囊按钮，并按类型显示细节字段；记录表单同样处理。
- History 的类型筛选改成五种。
- 测试：标签、表单校验、History 筛选；`e2e/global-care.spec.ts` 加一条修剪待办从新建到完成的流程。

### N3 提取接口第二版（离线，用假模型测试）

- `care_note_batch.py`：类型扩到五种并带细节字段；`MAX_DRAFTS` 改为 12，`MAX_FRAGMENTS` 改为 24，输出预算按需要提高；计划中的片段也返回类型、目标和日期；提问类片段单独标出来，供前端显示 "Ask Plant Doctor"。
- 服务器端检查照旧：名字只按已存记录和原文证据解析，日期要有原文证据，不知道的留空。
- 新的固定测试用例：多花园、五种操作、计划、提问、超出 12 件、中英混写。
- 用本地 Ollama 跑一遍冒烟测试，把结果写进交接说明（不花钱）。

### N4 任务匹配和"加为待办"

- 实现第 5.2 节的匹配函数，配完整的单元测试，覆盖每一条规则和反例。
- 草稿行带上匹配到的待办，默认勾选，可以取消。
- 保存：匹配上的待办走现有完成逻辑；没匹配上的写成普通记录；"Add as a task" 用计划片段的值新建待办。整批仍然只做一次带版本检查的保存。

### N5 新弹窗

- 用新组件替换 `BatchGardenNote.tsx` 的内容，五个画面照设计稿：Write、Reading、Review、Saved、Problems。
- 分叉线用 SVG，按花园卡的实际位置计算；窗口大小变化时重新计算。
- 记录、句子和花园卡三者互相高亮；点花园卡滚动到它的清单。
- 动画（扫光、流动、生长）在 `prefers-reduced-motion` 下全部关闭。
- 手机版：全屏、底栏固定、迷你分叉。
- `/notes` 页面用同一套组件。
- 测试：组件测试覆盖每个画面和键盘操作；焦点规则沿用 ADR-0069。

### N6 首页入口

- `OverviewGardenNote.tsx`：按钮改名、去掉 "Open note editor"、显示 等待审核 / 刚保存 两种状态。
- 点 "Split into records" 打开弹窗并直接进入 Reading。

### N7 收尾检查和文档

- 端到端：首页写一段话 → 审核 → 保存 → Care 里待办被划掉、History 里出现新记录。
- 390、768、1440 宽度和 200% 缩放下没有横向滚动；对比度检查；键盘可以走完整个流程。
- 更新 README 的功能说明和截图，在 ADR-0085 补 "Implementation notes"，改决策索引里的状态。

### N8 付费评估和公开 demo（需要用户逐步同意）

- 用新的固定用例对 `gpt-4o-mini` 跑付费评估，记录花费和结果。
- 和用户一起决定公开 demo 是否换成新流程；如果换，按 `docs/portfolio-demo-deployment.md` 的步骤先关着部署，再小批量打开。
- 这一步涉及花钱、密钥和部署，每一项都要先问用户。

## 7. 每步都要跑的检查

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
cd backend && .venv/bin/pytest
```

改到界面的步骤还要跑相关的 Playwright 测试，并在浏览器里对照设计稿截图。

## 8. 不在这次范围内

- 采收和其他操作类型。
- 定植时自动在画布上添加植物。
- App 内的麦克风按钮和语音转文字服务。
- Plant Doctor 和 Plant Guide 本身的改动（只加一个跳转按钮）。
- 公开 demo 的改动（N8 之前不动）。
