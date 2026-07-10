# Ami Brain API Contract

## 权限

- `core:brain:use`：使用智能体工作台
- `core:brain:execute`：确认并执行授权动作
- `core:brain-governance:view`：查看治理台
- `core:brain-governance:manage`：编辑语义、角色、技能、巡检、发布
- `core:brain:sensitive:view`：查看敏感字段

## 对话

- `POST /api/brain/conversations`
- `GET /api/brain/conversations`
- `GET /api/brain/conversations/:id/messages`
- `POST /api/brain/conversations/:id/messages`
- `GET /api/brain/runs/:runId/events`

## 操作确认

- `POST /api/brain/actions/:actionId/confirm`
- `POST /api/brain/actions/:actionId/reject`

## 治理

- `GET /api/brain/governance/traces`
- `GET /api/brain/governance/traces/:runId`
- `GET/POST/PATCH /api/brain/governance/semantic/:resource`
- `GET/POST/PATCH /api/brain/governance/roles`
- `GET/POST/PATCH /api/brain/governance/skills`
- `GET/POST/PATCH /api/brain/governance/inspection-rules`
- `POST /api/brain/governance/evals/runs`
- `POST /api/brain/governance/releases`
- `POST /api/brain/feedback`

## 响应原则

- 所有经营数值必须返回 `citations`，说明指标、来源和口径。
- 所有高风险写操作必须先返回 action preview，确认后才执行。
- 所有接口继承 `Authorization` 与 `X-Store-Id` 上下文。
- 前端不保存模型 Key，模型调用统一经 server-v2 和 AI Gateway。
