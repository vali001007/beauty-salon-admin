# Ami Brain 全客户端结构化渲染收口报告

日期：2026-07-21

范围：管理端 `/brain`、Ami Aura Lite Kiosk、移动经营助手 `packages/app`

结论：三端已消费同一 Ami Brain 结构化响应合同；KPI、排行、表格、图表、对比、诊断、澄清、动作预览、限制和证据不再在客户端接线时丢失或统一退化成纯文本。

## 一、审计发现

### 1.1 管理端

- KPI、排行、表格、对比、诊断、限制和证据已有基础渲染。
- `chart` 只显示“数据已返回，共 N 行”，没有绘制实际数据。
- 澄清选项是不可交互文本，用户仍要手动重新输入。
- 整条助手消息使用 `<button>` 包裹，无法安全嵌套澄清按钮。

### 1.2 Ami Aura Lite Kiosk

- `agent-core` 已有 `mapBrainResponseBlocks` 转换器和完整 BlockRenderer。
- `agentRuntimeService` 没有把 `BrainChatResponse.blocks` 写入 `AgentRunResultV2`，因此转换器在真实 Ami Brain 请求上收到空数组。
- 动作预览需要保留 Kiosk 的 `brain:<runId>:<actionId>` 安全决策编码，不能直接使用后端原始 actionId。

### 1.3 移动经营助手

- API 响应类型没有 `blocks`，请求成功后只保留 `answer` 文本。
- 本地渲染器只支持 text/kpi/ranking/table/limitations，缺少 chart、comparison、diagnosis、clarification、action_preview 和 evidence。
- 澄清、确认和拒绝没有形成移动端交互闭环。
- 遇到未来未知 block 时，存在结构数组非空但消息内容为空的风险。

## 二、本轮实现

### 2.1 统一结果合同

- `AgentRunResultV2` 增加 `brainBlocks`，共享 `BrainResponseBlockCompat` 继续作为 Kiosk 转换真相源。
- Kiosk 将后端 blocks 写入运行结果，并将含结构化 block 的回答标记为 `structured_blocks`。
- Kiosk 继续单独生成带 Run 范围的确认动作，过滤原始 `action_preview`，避免重复按钮和失去动作来源校验。
- 移动助手补齐完整 `BrainResponseBlock`、citation 和 action preview 类型。

### 2.2 管理端

- `chart` 使用 Recharts 绘制真实折线图或柱状图，不再显示占位文案。
- 澄清选项改为可点击按钮，点击后作为下一轮消息提交。
- 助手消息容器改为可键盘操作的语义容器，避免按钮嵌套，同时保留打开运行证据的交互。
- 图表容器采用固定高度和响应式宽度，避免消息加载后布局跳动。

### 2.3 Kiosk

- Ami Brain KPI、排行、图表、诊断、澄清、限制和证据经 `agent-core` 映射为现有 Aura blocks。
- 文本答案、证据和动作已有结构 block 时继续去重。
- 旧后端未返回 `blocks` 时按空数组处理，仍显示 `answer`，支持灰度期间前后端版本错位。

### 2.4 移动经营助手

- 支持 text、kpi、ranking、table、chart、comparison、diagnosis、clarification、action_preview、limitations、evidence 全部 block。
- 图表在移动端使用轻量数据条呈现，最多展示 12 个点，避免引入大型图表依赖和横向溢出。
- 澄清选项点击后直接发起下一轮对话。
- 高风险动作提供“确认执行”和“拒绝”两种明确决策；结果返回可读回执。
- 顶层 citations、suggestedActions、clarification 在缺少对应 block 时补成结构 block。
- 未识别未来 block 时回退到兼容 `answer`，不会显示空白消息。

## 三、安全与发布边界

- 客户端不生成新事实，不修改指标口径，也不接受模型任意 HTML 或组件名称。
- 移动端确认/拒绝继续调用受治理 Brain action API，客户端不能直接执行业务服务。
- Kiosk 不把原始 actionId 当成可执行命令，继续绑定来源 Run。
- 本轮没有 Prisma schema、migration、Business Definition、Capability 或生产 Release 变更。
- 浏览器打开了三个当前分支服务；独立端口没有已有登录态，因此停在认证页，没有传输账号密码或执行真实动作。

## 四、验证结果

| 门禁 | 结果 |
| --- | --- |
| 三端结构化渲染定向测试 | `7 files / 38 tests passed` |
| `agent-core` 全量测试 | `7 files / 28 tests passed` |
| Kiosk 全量测试 | `18 files / 135 tests passed` |
| 管理端 Brain Workspace/Renderer | `2 files / 14 tests passed` |
| 移动助手结构化消息与 API 测试 | `2 files / 5 tests passed` |
| 根管理端 typecheck + production build | 通过 |
| Kiosk typecheck + production build | 通过；保留既有大 chunk 警告 |
| 移动助手 TypeScript | 通过 |
| 移动助手 production build | 通过 |
| 真实业务写入 | 0 |

## 五、剩余任务

“8 个产品深度 P1”已完成 6 项：`resultRef、真实动作矩阵、主动巡检产品闭环、预测可信度与回测、长期记忆、全客户端结构化渲染深度`。

剩余 2 项：

1. 模型供应商故障降级与恢复。
2. 持续评测、漂移检测和治理发布闭环。

终极实施计划一级交付保持 `36/37`；加上上述 2 个 P1，整体剩余 `3` 项，当前完成 `42/45 = 93.3%`。
