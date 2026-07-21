# CLAUDE.md

本文件只保留 Claude 专属入口，项目协作与工程规则以根目录 `AGENTS.md` 为唯一真相源。

## 开始任务前

1. 完整阅读并遵守 `AGENTS.md`。
2. 先运行 `git status --short --branch`，不得覆盖、回滚或清理用户已有改动。
3. 按 `AGENTS.md` 的 L0–L3 任务分级决定检查范围和验证门禁。

## Claude 补充约定

- Windows 终端优先使用 `pwsh`、`npm.cmd`、`npx.cmd` 和 `rg`。
- 仓库不是 npm workspaces；根管理端和各子项目保留独立安装、构建与部署边界。
- 业务 API、数据、权限和 AI Gateway 的事实源统一为 `packages/server-v2`。
- 不读取或输出 `.env`、`.env.local`、真实数据库连接、模型 Key 和部署 Secret。
- 不批量删除 `outputs/`、产品资料、历史原型或未跟踪文件。

## 常用入口

- 项目命令和目录说明：`AGENTS.md`
- 运行与部署参考：`docs/03-开发计划/09-Git发布与项目治理/AGENTS补充参考信息.md`
- API 契约：`docs/03-开发计划/08-数据接口测试与治理/api-contract.md`
- 终端契约：`docs/03-开发计划/08-数据接口测试与治理/terminal-api.md`
- 正式测试数据与验收证据：`docs/04-测试数据/`

如本文件与 `AGENTS.md` 冲突，以 `AGENTS.md` 为准。
