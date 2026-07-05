# 行业标准品到库存采购 BOM 销售链路授权后复验报告

业务日期：2026-07-03

生成时间（北京时间）：2026-07-03 08:33:26 Asia/Shanghai

生成时间（UTC）：2026-07-03T00:33:26.124Z

验收门店 ID：6

总状态：通过

## 1. 闸门结果

| 序号 | 闸门 | 结果 | 退出码 | 脚本 |
| --- | --- | --- | --- | --- |
| 1 | 样本级闭环闸门 | 通过 | 0 | prisma/industry-chain-sample-gate.ts --strict --store-id=6 |
| 2 | 完成度闸门 | 通过 | 0 | prisma/industry-chain-completion-gate.ts --strict --store-id=6 |
| 3 | 收口证据汇总 | 通过 | 0 | prisma/industry-chain-evidence-summary.ts --strict --mode=apply --out-md=../../docs/04-测试数据/industry-chain-evidence-summary-post-apply-verify-2026-07-03.md --out-json=../../docs/04-测试数据/industry-chain-evidence-summary-post-apply-verify-2026-07-03.json |
| 4 | 完成定义逐条审计 | 通过 | 0 | prisma/industry-chain-completion-audit.ts --strict --mode=apply --evidence-report=industry-chain-evidence-summary-post-apply-verify --out-md=../../docs/04-测试数据/industry-chain-completion-audit-post-apply-verify-2026-07-03.md --out-json=../../docs/04-测试数据/industry-chain-completion-audit-post-apply-verify-2026-07-03.json |

## 2. 处理建议

- 已全部通过，可结合 close-loop apply 报告和写入审计确认交付。

post-apply 专用 evidence summary：

- D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-evidence-summary-post-apply-verify-2026-07-03.md
- D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-evidence-summary-post-apply-verify-2026-07-03.json

post-apply 专用完成定义审计：

- D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-audit-post-apply-verify-2026-07-03.md
- D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-audit-post-apply-verify-2026-07-03.json

## 3. 子命令输出摘要

### 样本级闭环闸门

stdout:

```text
◇ injected env (27) from .env // tip: ⌘ enable debugging { debug: true }
样本级闸门报告生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-sample-gate-2026-07-03.md
总状态：已完成
通过 10，未通过 0，待关注 0

```

stderr:

```text
(node:24596) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)

```

### 完成度闸门

stdout:

```text
◇ injected env (27) from .env // tip: ⌁ auth for agents [www.vestauth.com]
完成度闸门报告生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.md
总状态：已完成
通过 10，未通过 0，待关注 0，当前无样本 0

```

stderr:

```text
(node:16632) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)

```

### 收口证据汇总

stdout:

```text
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-evidence-summary-post-apply-verify-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-evidence-summary-post-apply-verify-2026-07-03.json
deliverableReady=true

```

stderr:

```text
(node:12028) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)

```

### 完成定义逐条审计

stdout:

```text
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-audit-post-apply-verify-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-audit-post-apply-verify-2026-07-03.json
allProven=true

```

stderr:

```text
(node:14484) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)

```
