# 美业管理平台 API 契约草案

本文用于当前 MVP 联调阶段。前端通过 `VITE_API_MODE=mock|real` 切换实现，`real` 模式下所有请求基于 `VITE_API_BASE_URL`，默认回退 `/api`。

## 通用约定

- 认证头：`Authorization: Bearer <token>`
- 门店头：`X-Store-Id: <storeId>`，未选门店时不发送
- 分页请求：`page` 从 `1` 开始，`pageSize` 为每页条数
- 分页响应：

```json
{
  "items": [],
  "data": [],
  "total": 0,
  "page": 1,
  "pageSize": 10
}
```

- 错误响应：

```json
{
  "message": "业务错误说明",
  "code": "OPTIONAL_ERROR_CODE",
  "details": {}
}
```

## 当前已收口接口

### 认证

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 登录 |
| POST | `/auth/logout` | 登出 |
| GET | `/auth/user-info` | 获取当前用户 |
| POST | `/auth/register` | 注册门店管理员 |

### 客户与画像

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/customers` | 客户列表 |
| GET | `/customers/paginated` | 客户分页 |
| GET | `/customers/consumption-records` | 客户消费记录 |
| GET | `/customers/health-profiles` | 客户健康档案 |

### 库存与调拨

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/inventory/transfers/paginated` | 门店调拨列表 |
| POST | `/inventory/transfers` | 创建调拨单 |

### 营销推荐

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/marketing/recommendations` | 智能推荐列表 |
| GET | `/marketing/recommendations/{id}/audience` | 推荐命中客户列表 |

### 自动营销

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/marketing/automation/trigger-options` | 触发规则目录 |
| GET | `/marketing/automation/strategies/paginated` | 策略分页 |
| POST | `/marketing/automation/strategies` | 创建策略 |
| PUT | `/marketing/automation/strategies/{id}` | 更新策略 |
| POST | `/marketing/automation/strategies/{id}/enable` | 启用策略 |
| POST | `/marketing/automation/strategies/{id}/pause` | 暂停策略 |
| POST | `/marketing/automation/strategies/{id}/preview-audience` | 预估命中客户 |
| POST | `/marketing/automation/strategies/{id}/execute` | 执行策略 |
| GET | `/marketing/automation/executions/paginated` | 执行记录分页 |
| GET | `/marketing/automation/effects` | 效果统计 |

### 终端

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/terminal/device/login` | 设备登录 |
| GET | `/terminal/bootstrap` | 终端初始化数据 |
| GET | `/terminal/customers/search` | 客户搜索 |
| GET | `/terminal/service-tasks` | 服务任务列表 |
| POST | `/terminal/card-usage/preview` | 次卡核销预览 |
| POST | `/terminal/card-usage/verify` | 次卡核销确认 |

## 说明

- 客户画像页、智能推荐页、门店调拨页已尽量复用同一批基础数据源。
- 后续新增 API 时，优先沿用 `mock / real / export` 三层结构，并保持返回结构和本文一致。

## AI Gateway / 大模型能力

所有大模型能力必须经 `packages/server-v2` 调用，前端和 Ami Aura Lite 不直连模型供应商，不保存模型 Key。`server-v2` 负责鉴权、门店隔离、字段脱敏、Prompt 模板版本、审计日志、成本统计和限流；历史 Claude 代理调用继续通过 `POST /v1/messages` 兼容入口返回 Anthropic-compatible 响应。

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/ai/chat/messages` | 管理端智能助手，后续支持 SSE 流式返回 |
| POST | `/ai/generate/customer-invitation-script` | 客户邀约话术生成 |
| POST | `/ai/generate/marketing-copy` | 营销渠道文案生成 |
| POST | `/ai/generate/campaign-variants` | 营销活动多版本文案生成 |
| POST | `/ai/generate/customer-summary` | 客户画像摘要 |
| POST | `/ai/generate/service-note-summary` | 服务记录摘要 |
| POST | `/ai/generate/skin-test-explanation` | 肌肤检测报告解释 |
| POST | `/ai/generate/terminal-service-advice` | Ami Aura Lite 服务建议话术 |
| POST | `/ai/recommend/next-best-action` | 基于规则结果生成下一步建议说明 |
| GET | `/ai/audit-logs/paginated` | AI 调用审计日志 |

AI 生成响应：

```json
{
  "id": "ai-marketing_copy-1770000000000",
  "scenario": "marketing_copy",
  "text": "生成后的可展示文本",
  "variants": [
    { "title": "短信版本", "text": "短信文案", "channel": "sms" }
  ],
  "structured": {},
  "safety": {
    "masked": true,
    "blocked": false,
    "reasons": []
  },
  "usage": {
    "provider": "mock",
    "model": "ami-core-mock-llm",
    "inputTokens": 120,
    "outputTokens": 80,
    "estimatedCost": 0
  }
}
```

AI Gateway 环境变量：

| 变量 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | `mock`、`openai_compatible`、`claude_compatible` |
| `LLM_MODEL` | 默认模型名 |
| `LLM_BASE_URL` | 模型供应商服务地址 |
| `LLM_API_KEY` | 仅后端保存的模型 Key |
| `LLM_TIMEOUT_MS` | 模型调用超时时间 |
| `LLM_DAILY_BUDGET` | 每日预算上限，第一阶段先记录配置 |
