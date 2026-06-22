# 经营利润正式确认 JSON 草稿说明

本目录由 `operation-profit:confirmation-template` 生成，只用于业务填写正式确认 JSON 草稿，不代表业务已经确认。

## 文件用途

| 文件 | 用途 | 必填动作 |
| --- | --- | --- |
| `operation-profit-assignee-confirmed.draft.json` | 9 条服务人候选归属 | 确认或修正 `beauticianId`，替换 `confirmedBy` |
| `operation-profit-assignee-manual-review-confirmed.draft.json` | 24 条无候选服务人人工查证 | 补 `resolution`；若 `resolution=assign`，补真实 `beauticianId`；替换 `confirmedBy` |
| `operation-profit-beautician-user-bindings-confirmed.draft.json` | 美容师账号绑定候选 | 确认或修正 `userId`，替换 `confirmedBy` |
| `operation-profit-staff-user-create-confirmed.draft.json` | 韩雨、许诺员工账号创建 | 确认或修正用户名、姓名、手机号、角色、门店和默认密码策略；替换 `confirmedBy` |
| `operation-profit-project-master-confirmed.draft.json` | 项目档案修复或历史异常确认 | 选择 `repair_project` 或 `historical_exception`，替换 `confirmedBy` |

## 禁止事项

- 不要把本目录草稿直接用于 `--apply --yes`。
- 不要保留 `TODO_REAL_BUSINESS_CONFIRMER`、`TODO_assign_or_historical_exception_or_ignore_non_margin`、`TODO_REQUIRED_IF_ASSIGN`。
- 不要用脚本批量写确认人；`operation-profit:confirmation-template` 已禁止 `--confirmer`。
- 不要把 `业务确认人`、`待确认`、`TODO`、`pending_business_confirmation` 当成真实确认人。

## 预检命令

业务填完后，先跑统一预检：

```powershell
npm.cmd --prefix packages/server-v2 run operation-profit:confirmation-audit -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --assigneeFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-confirmed.draft.json --assigneeManualReviewFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-manual-review-confirmed.draft.json --beauticianUserFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-beautician-user-bindings-confirmed.draft.json --staffUserFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json --projectMasterFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-project-master-confirmed.draft.json --requireReady --summaryOnly
```

通过标准：

```text
confirmationReady=true
writeGate.applyAllowed=true
coverage.issueCount=0
inputIntegrity.issueCount=0
staffUser.issueCount=0
```

当前草稿预期仍返回 `EXIT_CODE=2`，因为 TODO 和人工查证结论尚未被业务替换。

## 下一步

统一预检通过后，再执行：

```powershell
npm.cmd --prefix packages/server-v2 run operation-profit:confirmed-dry-run -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --assigneeFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-confirmed.draft.json --assigneeManualReviewFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-manual-review-confirmed.draft.json --beauticianUserFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-beautician-user-bindings-confirmed.draft.json --staffUserFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json --projectMasterFile=docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-project-master-confirmed.draft.json --summaryOnly
```

只有 dry-run 结果经业务确认后，才允许分别执行单项 `--apply --yes --storeId=6` 写库命令。
