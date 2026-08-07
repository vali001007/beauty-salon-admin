# Ami Brain RC350 release-core 验收绑定报告（2026-08-07）

## 结论

本次按产品决定执行的是 **release-core acceptance**：正式发布只覆盖 350 道核心题；额外 690 道仅作后续人工观察，未执行、也不参与本次发布判定。

当前结论为 **No-Go / blocked**。原因不是核心功能单测、题集治理或目标库迁移异常，而是 Zeabur 运行实例未就绪，无法将候选代码、云端运行提交、模型和目标数据库锁成同一个 Candidate。因此没有启动 350 道正式评测，更没有把历史 targeted 结果伪装成正式发布证据。

## 已重新核验的输入

| 维度 | 当前事实 | 结果 |
| --- | --- | --- |
| Candidate 代码 | `fba30629f235e7331039f9ade62989ad8f7f4b7f`，分支 `codex/ami-brain-release-switch-exec-20260806` | 已冻结候选提交 |
| Candidate 工作树 | 独立干净工作树 `ami-brain-release-core-clean-20260807`；评测原始文件未混入候选 | 通过 |
| 评测 Release | #455 / `EV-002` / `Query Only V1 RC-350 ecda1abb`，状态 `draft` | 可作为评测 Release，尚未激活 |
| 模型配置 | 本地评测配置：`deepseek` / `deepseek-v4-flash`，fallback 同为 DeepSeek | 已读取；尚未取得同候选云端运行回执 |
| 目标数据库 | Supabase Session Pooler，`postgres/public`（脱敏身份） | 只读审计 ready，尚未绑定 Candidate |
| 部署健康 | `https://ami-service.zeabur.app/api/health/ready` 在 2026-08-07 返回 HTTP 502；正式预检亦超时 | 阻断 |

## 已完成的验证与修复

1. 正式预检首先发现 BQ1634 的新增单测题干缺失题集治理登记。已将该题干与 `BQ1634` 就近绑定并提交：
   - commit：`fba3062 test(brain): register BQ1634 release fixture`
2. 修复后执行：
   - `npm run brain:test-question:governance`：通过。
   - `npm run brain:release:acceptance:test`：161/161 通过。
3. 在干净候选工作树执行目标 Supabase 的只读迁移审计：
   - 148/148 migrations 已应用，`pending=[]`；关键表、列和索引均齐全；`databaseWritePerformed=false`。
   - 证据：`outputs/ami-brain-release-acceptance/rc350_deepseek_fba3062_releasecore_20260807/target-db-prebind.json`。
4. 已执行正式 release-core 预检。该脚本没有开始题目评测：历史工作树预检记录为 `production_health_unavailable`；干净候选的重试也因同一健康端点持续超时而被终止。两者都不能生成 candidate lock。

## 发布门禁状态

```text
candidate fba3062 ── clean worktree ── PASS
Release #455 / DeepSeek config ─────── PASS (local configuration)
target Supabase migration audit ────── PASS (read-only, pre-bind)
Zeabur health + deployed commit ────── BLOCKED (502/timeout)
candidate lock ─────────────────────── NOT CREATED
release-core 350 acceptance ────────── NOT STARTED
690 manual observation ─────────────── NOT RUN (by product scope)
```

## 继续执行条件与命令

先让 Zeabur 部署恢复，且 `/api/health/ready` 返回 `ready` 并明确包含提交 `fba30629f235e7331039f9ade62989ad8f7f4b7f`、DeepSeek 模型身份和与上述 Supabase 相同的脱敏数据库目标。随后从干净候选工作树依次执行：

```bash
npm --prefix packages/server-v2 run brain:release:candidate -- lock \
  --product-profile=query_only_v1 \
  --evaluation-release-id=455 \
  --runtime-commit=fba30629f235e7331039f9ade62989ad8f7f4b7f \
  --production-health-url=https://ami-service.zeabur.app/api/health/ready \
  --store-id=6 \
  --run-key=rc350_deepseek_fba3062_releasecore_20260807

npm --prefix packages/server-v2 run brain:release:acceptance -- \
  --release-id=455 \
  --evaluation-release-id=455 \
  --runtime-commit=fba30629f235e7331039f9ade62989ad8f7f4b7f \
  --production-health-url=https://ami-service.zeabur.app/api/health/ready \
  --store-id=6 \
  --run-key=rc350_deepseek_fba3062_releasecore_20260807
```

第二条命令才会执行正式 350 核心题验收；不会自动运行 690 扩展题。任何候选提交、云端提交、Release、模型或数据库目标发生变化，都必须重新建锁并重新执行该 350 核心验收。
