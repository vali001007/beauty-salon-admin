# Ami Brain 模型降级与熔断恢复报告

> 日期：2026-07-21
>
> 范围：AI Gateway 结构化输出、Ami Brain 语义编译与 Supervisor 规划
>
> 结论：模型瞬时失败已具备受控降级、熔断和恢复能力；当前生产配置属于同网关重试，不是独立供应商容灾。

## 一、产品结论

本轮关闭“主模型失败后 Ami Brain 无法继续语义理解或规划”的产品断点。现在结构化模型调用具备以下行为：

1. 主模型正常时直接返回，并记录实际路由、模型和 token 消耗。
2. 主模型出现网络不可用或鉴权失败时，按请求显式授权切换备用路由。
3. 连续失败达到阈值后打开熔断，冷却期内跳过已知故障路由，避免每个用户请求重复等待超时。
4. 冷却结束只允许一个半开探针；探针成功后自动恢复，失败则重新进入熔断。
5. Supervisor 规划与语义意图编译统一启用结构化备用路径，不再只有部分认知链路能降级。

## 二、修复前真实问题

| 问题 | 产品影响 | 本轮处理 |
| --- | --- | --- |
| `openai_responses` 未进入结构化备用白名单 | Terra 可作为主模型，但配置成备用模型时实际不会调用 | 已支持 Responses 作为结构化备用提供方 |
| Supervisor 未传 `allowFallback` 和备用消息 | 主模型失败时，复杂问题的自主规划直接中止 | 已使用同一份脱敏规划上下文进入受控备用调用 |
| 无熔断状态 | 网关故障期间每个请求都先等待一次失败 | 新增 closed/open/half-open 状态机 |
| 主备健康状态不可见 | 运维无法判断备用是否配置、是否同路由、是否已熔断 | 新增受权限保护的 `/ai/provider-health` |
| 当前主备指向同一 Terra 中转，备用密钥失效 | 原配置会在主调用失败后再次收到 401 | 同路由重试默认继承已验证主凭据，不再使用漂移密钥 |

## 三、实现合同

### 3.1 熔断

- `LLM_CIRCUIT_FAILURE_THRESHOLD`：默认连续 3 次提供方/鉴权失败后打开熔断。
- `LLM_CIRCUIT_OPEN_MS`：默认冷却 30 秒。
- JSON schema 不匹配属于模型输出质量问题，不计入提供方健康故障。
- 半开状态只允许一个恢复探针，避免并发请求同时冲击刚恢复的网关。

### 3.2 主备路由分类

- `independent_route`：provider、base URL、path、model 中至少一项不同，使用备用独立凭据。
- `same_route_retry`：四项全部相同，只用于同网关瞬时重试，不宣称容灾。
- `disabled`：没有可用备用配置。

同路由重试默认启用 `LLM_FALLBACK_INHERIT_PRIMARY_AUTH_WHEN_SAME_ROUTE=true`。该设置只复用同一模型路由的主凭据；独立路由继续使用 `LLM_FALLBACK_API_KEY`，不会把主密钥发送给其他提供方。

### 3.3 可观测性与安全

- 健康接口需要 `core:system:view`。
- 返回 provider、model、gateway、冗余模式、鉴权模式和熔断状态。
- 不返回 API Key，不把密钥写入审计日志。
- 结构化调用审计增加 routing 信息，可区分主调用、备用调用、跳过主路由和熔断状态。

## 四、真实探针

探针使用当前 Terra 中转和 `gpt-5.6-terra`，发送固定的无业务数据请求，只要求返回 `{ "ok": true }`：

1. 第一次 fetch 被测试代码主动模拟为网络失败。
2. 第二次进入 `openai_responses(fallback)`。
3. 备用配置保留一个故意失效的密钥，以验证实际使用的是同路由继承的主凭据。
4. 第二次调用真实成功，返回 `{ "ok": true }`。

观测结果：

| 项目 | 结果 |
| --- | --- |
| 调用次数 | 2 |
| 最终 provider | `openai_responses(fallback)` |
| 最终 model | `gpt-5.6-terra` |
| 主错误 | `PROVIDER_UNAVAILABLE` |
| 冗余模式 | `same_route_retry` |
| 备用鉴权 | `inherited_primary` |
| 最终熔断状态 | `closed`，失败计数已恢复为 0 |
| 业务读取/写入 | 0 |

## 五、验证门禁

| 门禁 | 结果 |
| --- | --- |
| AI Service、熔断、Controller、Supervisor 定向测试 | `4 suites / 95 tests passed` |
| Brain + AI 全量测试 | `338 passed / 3 skipped` suites；`3843 passed / 10 skipped` tests |
| `packages/server-v2` build | 通过 |
| 真实 Terra 主调用 | 通过 |
| 人工制造首次失败后的真实备用恢复 | 通过 |
| `git diff --check` | 通过 |

## 六、剩余边界

当前配置只能抵御单次网络抖动和进程内连续故障，不能抵御 Terra 中转整体不可用。达到真正模型高可用还需要平台侧提供不同 gateway 或不同 provider 的有效备用凭据；配置完成后健康接口必须显示 `independent_route`，再执行独立路由故障演练。

熔断状态目前保存在单个后端进程内。多实例生产部署时，各实例独立熔断不会造成数据错误，但会增加故障期重复探测流量；后续可根据实例规模决定是否接入 Redis 共享健康状态。
