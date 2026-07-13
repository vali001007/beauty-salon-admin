# CustomerInvitationScript 与 vendor-src 退役边界治理详细开发计划

更新时间：2026-06-15

## 1. 背景与结论

本项目管理端 API 主线已经固定走 `src/api/real/*` 与 `packages/server-v2`，`VITE_API_MODE` 不再控制运行时 mock/real 切换。当前仍需要治理的不是全局 mock 数据，而是两个容易造成团队认知混乱的边界：

1. `src/app/pages/CustomerInvitationScript.tsx` 仍在页面内用 `setTimeout`、硬编码文案和 `mockCustomers` 模拟 AI 回复与 10 位邀约客户。
2. `packages/app/vendor-src` 仍保留历史 `api/mock`、本地 JSON 与 mock/real 双实现，并且 `packages/app/vite.config.ts` 仍存在当根目录 `src` 不存在时 fallback 到 `vendor-src` 的逻辑。

本计划目标是把“客户邀约助手”从页面级模拟能力迁到真实 API/真实客户数据链路，并把 `vendor-src` 明确退役为不可参与主构建的历史快照。计划不包含未经确认的批量删除；涉及删除 `vendor-src` 时必须单独确认。

## 2. 当前证据

### 2.1 CustomerInvitationScript 当前问题

文件：`src/app/pages/CustomerInvitationScript.tsx`

现状：

- `handleSubmit()` 拼接 prompt 后，通过 `setTimeout` 返回页面内模板文案。
- `handleOneClickGenerate()` 通过 `setTimeout` 返回 10 条硬编码客户、肤质、偏好、邀约理由和话术。
- 页面没有调用已有的 `generateCustomerInvitationScript()`。
- 页面没有调用客户画像、客户预测、推荐候选等真实接口。
- 文案里的“基于用户画像分析”是模拟表述，实际没有读取 `server-v2` 数据。

已有可复用能力：

- `src/api/ai.ts` 已导出 `generateCustomerInvitationScript`。
- `src/api/real/ai.ts` 已实现 `POST /ai/generate/customer-invitation-script`。
- `packages/server-v2/src/ai/ai.controller.ts` 已有 `POST /ai/generate/customer-invitation-script`。
- `packages/server-v2/src/ai/ai.service.ts` 已有 `generateInvitationScript()`，但输入字段偏窄，当前仅覆盖 `customerName`、`skinType`、`lastVisit`。
- 客户数据和画像能力已集中在 `src/api/customer.ts`、`src/api/marketing.ts`、`packages/server-v2/src/customers`、`packages/server-v2/src/marketing`。

### 2.2 vendor-src 当前问题

文件：

- `packages/app/vendor-src/**`
- `packages/app/vite.config.ts`
- `Dockerfile.app`

现状：

- `packages/app/vendor-src/README.md` 已标注为 Deprecated。
- `packages/app/vite.config.ts` 当前逻辑是：如果根目录 `src` 存在，则 `@` 指向根目录 `src`；否则 fallback 到 `packages/app/vendor-src`。
- `Dockerfile.app` 会复制根目录 `src`，所以主 Docker 构建不应依赖 `vendor-src`。
- `vendor-src` 内仍存在大量历史 mock 引用和本地 JSON，容易被误认为当前主线。

风险：

- 如果某个单包构建环境只复制 `packages/app`，`@` 可能 fallback 到 `vendor-src`，导致旧 mock 代码重新进入构建。
- 新人或自动化 agent 可能误改 `vendor-src`，造成主线与历史快照混淆。
- 若直接删除 `vendor-src`，可能破坏仍在使用的单包 Docker fallback 场景，因此不能直接批量删除。

## 3. 产品目标

1. 客户邀约助手展示的客户、理由、话术来自真实后端数据和 AI Gateway，不再在页面里硬编码客户名单。
2. 一键生成结果必须能承接下一步动作：复制话术、生成营销活动草稿、生成营销 H5 页面、记录触达事件或创建跟进任务。
3. 接口失败时明确展示“后端/AI 服务不可用”的空态，不回退到页面模拟客户。
4. `vendor-src` 不再作为任何默认构建 fallback；如果需要保留，只作为历史归档，不参与主构建、不参与新增开发。
5. 形成可执行的防回退检查，避免后续重新引入页面级业务 mock。

## 4. 范围定义

### 4.1 本轮纳入

- 重构 `CustomerInvitationScript`，移除页面级 `setTimeout` 模拟 AI 回复和 `mockCustomers`。
- 接入 `generateCustomerInvitationScript` 或扩展后端 AI 接口。
- 接入真实客户候选来源，优先复用已有客户画像/营销预测/推荐接口。
- 增加必要的类型、API、测试和空态。
- 明确 `vendor-src` 的退役边界，去掉默认 fallback 或增加构建开关。
- 增加检查脚本，阻止主线代码直接引用 `vendor-src` 或页面业务 mock。

### 4.2 本轮不纳入

- 不直接删除整个 `packages/app/vendor-src` 目录，除非用户单独确认。
- 不重建新的前端 mock 数据平台。
- 不恢复 `VITE_API_MODE=mock` 运行时切换。
- 不改造所有历史文档中的 mock/real 旧描述，只在本轮相关文档和代码注释中更新口径。
- 不把邀约助手做成完整 CRM 外呼系统；本轮只打通真实数据、AI 文案和动作承接。

## 5. 目标体验

### 5.1 单条文案生成

运营人员选择“项目推广 / 促销活动 / 定制邀约”后：

1. 页面根据表单字段构造结构化请求。
2. 调用 `generateCustomerInvitationScript()`。
3. 后端通过 AI Gateway 生成客户可见文案。
4. 页面显示生成结果，并提供复制、保存草稿、生成营销物料入口。
5. 失败时展示错误状态和重试按钮，不生成假内容。

### 5.2 一键生成最值得邀约客户

运营人员点击“一键生成”后：

1. 页面调用真实候选接口获取客户列表、推荐理由、客户画像摘要和建议项目。
2. 对候选客户批量调用或一次性调用 AI 接口生成话术。
3. 每个客户展示成动作卡：
   - 客户姓名、等级、最近到店、消费/偏好证据。
   - 推荐理由。
   - AI 话术。
   - 下一步动作：复制、创建跟进、生成活动、跳转客户画像。
4. 如果候选客户不足，展示真实空态：例如“当前门店暂无满足条件客户，请先运行客户预测或补充消费数据”。

## 6. 技术方案

### 6.1 前端改造

涉及文件：

- `src/app/pages/CustomerInvitationScript.tsx`
- `src/api/ai.ts`
- `src/api/real/ai.ts`
- `src/types/ai.ts`
- 如需要：`src/api/customer.ts`、`src/api/marketing.ts`

改造内容：

1. 引入 `generateCustomerInvitationScript`，替换 `handleSubmit()` 中的 `setTimeout` 模拟回复。
2. 新增页面状态：
   - `loading`
   - `error`
   - `generatedCustomers`
   - `selectedCustomer`
   - `actionSubmitting`
3. 拆分页面结构：
   - 表单区：保留当前三种文案类型。
   - 对话区：展示真实 AI 返回。
   - 候选客户区：展示真实推荐客户动作卡。
4. 去掉 `mockCustomers` 和所有硬编码客户数组。
5. 表单请求结构建议：

```ts
type InvitationScriptPayload = {
  scenario: 'project' | 'promotion' | 'custom';
  customerId?: number;
  customerName?: string;
  projectName?: string;
  activityName?: string;
  offer?: string;
  targetAudience?: string;
  invitationReason?: string;
  preferredTime?: string;
  channel?: 'wechat' | 'sms' | 'miniapp' | 'phone';
};
```

6. 页面错误处理：
   - 401：沿用 API client 统一跳登录。
   - 403：提示无客户邀约权限。
   - 5xx 或 AI 配置缺失：提示“AI 服务暂不可用，请检查后端模型配置或稍后重试”。
   - 无客户候选：提示补充真实数据或运行客户预测。

### 6.2 后端 AI 接口增强

涉及文件：

- `packages/server-v2/src/ai/ai.controller.ts`
- `packages/server-v2/src/ai/ai.service.ts`
- `packages/server-v2/src/ai/ai.service.spec.ts`

当前 `generateInvitationScript()` 入参偏窄，建议增强为结构化场景输入：

```ts
type CustomerInvitationScriptDto = {
  scenario?: 'project' | 'promotion' | 'custom';
  customerId?: number;
  customerName?: string;
  skinType?: string;
  lastVisit?: string;
  projectName?: string;
  activityName?: string;
  offer?: string;
  targetAudience?: string;
  invitationReason?: string;
  preferredTime?: string;
  channel?: string;
  evidence?: string[];
};
```

增强规则：

1. 如果传入 `customerId`，后端尽量从 Prisma 查询客户基础信息、健康档案和最近消费。
2. prompt 中要求只基于传入数据或查询到的数据生成，不编造客户事实。
3. 输出必须是客户可见话术，不暴露 LTV、流失风险、模型分、内部标签。
4. mock provider 模式仍返回稳定结构，但只作为后端 AI fallback，不作为前端业务数据源。
5. AI 审计日志继续记录 scenario、provider、model、latency、status。

### 6.3 候选客户真实来源

优先级：

1. 优先复用已有营销预测接口：
   - `getLatestPredictionSummary`
   - `getPredictionCustomers`
   - `getCustomerPrediction`
2. 如果页面需要“最值得邀约”聚合，可在 `packages/server-v2/src/marketing` 增加轻量接口：

```text
GET /api/marketing/invitation-candidates
```

建议响应：

```ts
type InvitationCandidate = {
  customerId: number;
  customerName: string;
  memberLevel?: string;
  phoneMasked?: string;
  skinType?: string;
  lastVisitDate?: string;
  preferredProjectNames: string[];
  reason: string;
  evidence: string[];
  priority: 'high' | 'medium' | 'low';
};
```

生成规则：

- 复购窗口、较久未到店、最近咨询/浏览、偏好项目、卡项剩余、生日/节日、营销响应分等都可作为证据。
- 不返回敏感原始手机号；页面只展示脱敏字段。
- 没有预测快照时，可基于客户最近消费和健康档案做降级候选，但必须在 `evidence` 中说明“基于历史消费/到店记录”。

### 6.4 动作承接

客户卡片至少保留：

- 复制话术：纯前端动作。
- 查看客户画像：跳转 `/customers/profile?customerId=...` 或现有画像入口。
- 生成营销活动草稿：复用 `createStrategy` / `saveStrategyDraft` 或营销工作台现有草稿能力。
- 生成营销 H5：复用 `generateActivityPage` 和营销页面管理能力。

如果本轮为了控制范围不能全部实现，建议 P0 先实现“复制话术 + 查看客户画像 + 保存策略草稿”。

## 7. vendor-src 退役边界方案

### 7.1 推荐策略

先“禁用默认 fallback”，再“观察构建”，最后“确认后归档/删除”。

### 7.2 阶段 1：禁用默认 fallback

修改 `packages/app/vite.config.ts`：

- 当前：根目录 `src` 不存在时自动使用 `vendor-src`。
- 建议：根目录 `src` 不存在时直接抛错，除非显式设置环境变量。

建议规则：

```ts
const allowVendorFallback = process.env.ALLOW_VENDOR_SRC_FALLBACK === 'true';
if (!fs.existsSync(localSrc) && !allowVendorFallback) {
  throw new Error('Root src is required. vendor-src fallback is deprecated.');
}
const mainSrc = fs.existsSync(localSrc) ? localSrc : vendorSrc;
```

这样历史单包场景仍可通过显式开关运行，但不会被默认构建误用。

### 7.3 阶段 2：构建验证

验证命令：

```powershell
npm.cmd run build
npm.cmd run build --prefix packages/app
docker build -f Dockerfile.app -t ami-core-admin .
```

验收：

- 根管理端构建通过。
- `packages/app` 构建在根目录 `src` 存在时通过。
- Dockerfile.app 构建仍使用根目录 `src`，不依赖 `vendor-src`。

### 7.4 阶段 3：归档或删除决策

需要用户确认的问题：

1. 是否还有人使用只复制 `packages/app` 的单包 Docker 构建？
2. 是否还有部署环境依赖 `ALLOW_VENDOR_SRC_FALLBACK`？
3. 是否需要保留 `vendor-src` 作为历史参考？

若三项答案均为“否”，再单独执行删除任务。删除前必须：

- 先输出删除清单。
- 用户确认后再删除。
- 删除后跑 `rg "vendor-src"`、`npm.cmd run build --prefix packages/app`、`npm.cmd run build`。

## 8. 防回退检查

建议新增脚本：

```text
scripts/check-no-runtime-mock-boundary.mjs
```

检查范围：

- `src/app`
- `src/api`
- `packages/app/vite.config.ts`

规则：

- 禁止 `src/app` 直接出现 `mockCustomers`、`模拟AI回复`、`模拟AI分析`、`api/mock/data`。
- 禁止主线页面 import `@/api/mock`。
- 禁止 `packages/app/vite.config.ts` 默认 fallback 到 `vendor-src`。
- 允许 `*.test.ts`、`*.test.tsx` 使用 `vi.mock`。
- 允许 `src/api/mock/**` 存在，但不得被运行时页面引用。

可接入命令：

```json
{
  "scripts": {
    "check:no-runtime-mock": "node scripts/check-no-runtime-mock-boundary.mjs"
  }
}
```

## 9. 任务拆解

| 阶段 | 优先级 | 任务 | 主要文件 | 验收标准 |
| --- | --- | --- | --- | --- |
| 0 | P0 | 确认当前入口、权限和接口能力 | `src/app/routes.tsx`、`src/api/ai.ts`、`packages/server-v2/src/ai` | 明确页面路径和已有 API |
| 1 | P0 | 页面单条文案接真实 AI | `CustomerInvitationScript.tsx` | `handleSubmit` 不再 `setTimeout` 模拟 |
| 2 | P0 | 一键邀约客户改真实候选 | `CustomerInvitationScript.tsx`、`src/api/marketing.ts`、`server-v2/src/marketing` | 页面不再硬编码 10 位客户 |
| 3 | P0 | 后端 AI 入参增强 | `ai.service.ts`、`ai.controller.ts`、`src/types/ai.ts` | 支持场景、客户证据、渠道 |
| 4 | P1 | 动作卡承接 | 页面、营销 API | 支持复制、跳画像、存草稿 |
| 5 | P1 | vendor-src 默认 fallback 禁用 | `packages/app/vite.config.ts` | 默认构建不再自动用 vendor-src |
| 6 | P1 | 防回退脚本 | `scripts/check-no-runtime-mock-boundary.mjs`、`package.json` | 检查能发现页面级 mock |
| 7 | P1 | 测试与构建 | 单测、构建 | 关键命令通过 |
| 8 | P2 | 文档口径更新 | README / API 文档 | 团队不再把 vendor-src 当主线 |

## 10. 详细执行步骤

### 步骤 1：接口与类型对齐

- [ ] 扩展 `src/types/ai.ts` 的 `CustomerInvitationScriptRequest`。
- [ ] 保持 `src/api/ai.ts` 门面仍直接导出 real 实现。
- [ ] 扩展 `packages/server-v2/src/ai/ai.service.ts` 的 `generateInvitationScript()`。
- [ ] 增加后端单测，覆盖 project、promotion、custom 三类场景。

### 步骤 2：页面单条生成改造

- [ ] 在 `CustomerInvitationScript.tsx` 引入 `generateCustomerInvitationScript`。
- [ ] `handleSubmit()` 改为 async 调用真实接口。
- [ ] 删除单条文案的 `setTimeout` 模拟。
- [ ] 增加 loading、error、retry 状态。
- [ ] 保留当前表单交互，不大改 UI 布局。

### 步骤 3：一键生成客户候选

- [ ] 确认是否已有可直接复用的 `getPredictionCustomers()` 数据能满足候选列表。
- [ ] 如不足，新增 `GET /api/marketing/invitation-candidates`。
- [ ] 页面点击“一键生成”后先拉候选客户。
- [ ] 对候选客户生成话术。
- [ ] 删除 `mockCustomers` 和硬编码 10 人数组。
- [ ] 空数据时展示真实原因，不创建模拟结果。

### 步骤 4：动作卡闭环

- [ ] 每张客户卡增加复制话术。
- [ ] 增加查看客户画像入口。
- [ ] 增加保存营销策略草稿入口。
- [ ] 后续可扩展生成营销 H5，但不阻塞 P0。

### 步骤 5：vendor-src fallback 收口

- [ ] 修改 `packages/app/vite.config.ts`，默认禁止 fallback。
- [ ] 增加 `ALLOW_VENDOR_SRC_FALLBACK=true` 作为临时兼容开关。
- [ ] 更新 `packages/app/vendor-src/README.md`，说明该开关仅限历史构建排障。
- [ ] 不删除 `vendor-src`。

### 步骤 6：防回退检查

- [ ] 新增 `scripts/check-no-runtime-mock-boundary.mjs`。
- [ ] 在根 `package.json` 增加 `check:no-runtime-mock`。
- [ ] 检查 `CustomerInvitationScript` 不再出现 `mockCustomers`、`模拟AI回复`、`模拟AI分析`。
- [ ] 检查 `src/app` 不直接引用 `@/api/mock`。

### 步骤 7：验证

- [ ] `npm.cmd run check:no-runtime-mock`
- [ ] `npx.cmd vitest run src/test/api.test.ts`
- [ ] 如新增页面测试：`npx.cmd vitest run src/app/pages/CustomerInvitationScript.test.tsx`
- [ ] `npm.cmd run check:api`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd run build --prefix packages/app`
- [ ] 如改 Docker 边界：`docker build -f Dockerfile.app -t ami-core-admin .`

## 11. 验收标准

工程验收：

- `CustomerInvitationScript.tsx` 不再包含 `mockCustomers`。
- `CustomerInvitationScript.tsx` 不再通过 `setTimeout` 模拟 AI 生成。
- `src/app` 无直接 `@/api/mock` 或 `api/mock/data` 引用。
- `packages/app/vite.config.ts` 不再默认 fallback 到 `vendor-src`。
- `src/api/mock/**` 可以保留，但仅作为历史样例或测试 fixture。

产品验收：

- 运营人员生成的邀约话术来自真实接口。
- 一键生成客户列表来自真实客户/预测/营销数据。
- 生成结果能承接复制、查看客户画像、保存草稿等下一步动作。
- 后端或 AI 不可用时页面明确报错，不展示假客户。

数据验收：

- 话术中不暴露手机号、内部模型分、LTV、流失风险等内部标签。
- 推荐理由必须能追溯到客户画像、消费、偏好、预测或规则证据。
- 无候选客户时不伪造数据。

## 12. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| AI provider 未配置，生成失败 | 页面无法生成真实话术 | 显示配置缺失错误，允许重试，不回退假数据 |
| 客户预测快照为空 | 一键生成无候选 | 降级到真实客户消费/画像规则，仍无数据则空态 |
| 后端接口字段不足 | 页面动作卡证据不完整 | P0 先返回基础证据字段，P1 补更多画像维度 |
| vendor-src 仍被某部署使用 | 禁用 fallback 可能影响旧构建 | 先保留 `ALLOW_VENDOR_SRC_FALLBACK`，删除需单独确认 |
| 页面 UI 当前较原型化 | 接入真实接口后体验割裂 | P0 保留布局，P1 再做工作台化改版 |

## 13. 建议排期

### Day 1：客户邀约助手真实接口化

- 扩展 AI request 类型。
- 页面单条文案接真实 AI。
- 删除单条生成模拟逻辑。
- 补基础错误态。

### Day 2：一键客户候选真实化

- 接入或新增邀约候选接口。
- 删除硬编码 10 位客户。
- 改造成客户动作卡。
- 补单测。

### Day 3：vendor-src 边界与防回退

- 禁用默认 fallback。
- 增加防回退脚本。
- 更新 README。
- 跑构建和核心测试。

## 14. 实施前确认项

1. `customers/script` 页面是否仍作为正式功能保留？若保留，按本计划接真实数据；若不保留，可改为隐藏入口或跳转到智能营销工作台。
2. “一键生成最值得邀约客户”的候选口径优先用营销预测，还是优先用最近消费/护理周期规则？
3. `packages/app` 是否仍有单独部署链路只复制 `packages/app`？如果没有，后续可以准备删除 `vendor-src` 的单独任务。

## 15. 执行记录

- [x] 已完成：扩展 `CustomerInvitationScript` 前端页面，移除页面内 `setTimeout` 模拟 AI 和硬编码 `mockCustomers`。
- [x] 已完成：新增 `GET /api/marketing/invitation-candidates`，一键生成改为读取真实预测快照或真实客户档案降级候选。
- [x] 已完成：扩展 `generateCustomerInvitationScript` 入参，支持场景、客户、项目、权益、证据和渠道字段。
- [x] 已完成：客户动作卡支持复制话术、查看客户画像、保存自动营销策略草稿。
- [x] 已完成：`packages/app/vite.config.ts` 禁用默认 `vendor-src` fallback，仅允许 `ALLOW_VENDOR_SRC_FALLBACK=true` 临时排障。
- [x] 已完成：新增 `scripts/check-no-runtime-mock-boundary.mjs` 和 `npm.cmd run check:no-runtime-mock`。
- [x] 已完成：更新 `packages/app/vendor-src/README.md`，明确历史 fallback 需要显式开关。
- [x] 已完成：测试与构建验证。
- [ ] 待用户确认：是否在后续单独删除 `packages/app/vendor-src`。

验证记录：

```powershell
npm.cmd run check:no-runtime-mock
npx.cmd vitest run src/test/api.test.ts
npm.cmd --prefix packages/server-v2 test -- ai.service.spec.ts
npm.cmd run check:api
npm.cmd run build
npm.cmd run build --prefix packages/app
```

以上命令均已通过。`npm.cmd run build` 仍存在既有大 chunk 输出体积提示，但本次构建没有失败。
