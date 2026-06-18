# AGENTS 补充参考信息

本文承接从根目录 `AGENTS.md` 移出的长教程和参考信息。这里的信息用于查询，不作为当前状态真相；真正执行前仍以 `package.json`、实际源码和 `git status --short --branch` 为准。

## 本地访问地址

管理端：

```text
http://127.0.0.1:5173
```

后端 API：

```text
http://localhost:8080/api
http://localhost:8080/docs
```

Ami Aura Lite 智能终端：

```text
http://127.0.0.1:5175
```

营销 H5：

```text
http://127.0.0.1:5177
```

营销 H5 preview：

```text
http://127.0.0.1:4177
```

常用本地组合：先启动后端 API，再启动管理端；管理端默认通过 Vite `/api` 代理访问 `http://localhost:8080`。Ami Glow 小程序需要联调接口时，也先启动后端 API。

## Ami Glow 小程序预览

Ami Glow 是原生微信小程序工程，当前没有 Vite/Web dev server；`npm.cmd run typecheck` 只用于本地代码检查，实际页面预览在微信开发者工具里编译运行。

本地预览步骤：

1. 安装并打开微信开发者工具。
2. 在启动页选择“小程序”，然后选择“导入项目”。如果已经在工具内，可从项目列表或菜单进入“导入项目”。
3. 项目目录选择：

```text
D:\AI coding\beauty-salon-admin\packages\Ami-Glow-MiniApp
```

4. 不要选择里面的 `miniprogram` 子目录；`project.config.json` 已配置 `miniprogramRoot: "miniprogram/"`，工具会自动识别小程序源码目录。
5. AppID 使用当前配置里的 `touristappid`，或在没有正式小程序 AppID 时选择“测试号/无 AppID”模式；有正式 AppID 后再替换为真实 AppID。
6. 项目名称填写 `Ami-Glow-MiniApp`，云开发不启用。
7. 点击“导入/确定”后，进入开发者工具主界面，点击顶部“编译”。
8. 左侧模拟器能看到 Ami Glow 页面即表示本地预览成功；如果需要联调真实接口，先在仓库根目录执行 `npm.cmd run dev:api` 启动后端 API。

常见处理：

- 如果提示域名、HTTPS 或证书校验问题：在微信开发者工具“详情/本地设置”里勾选不校验合法域名相关选项，仅用于本地调试。
- 如果导入后找不到页面：确认导入的是 `packages/Ami-Glow-MiniApp`，不是仓库根目录，也不是 `miniprogram` 子目录。
- 如果模拟器空白并报 `module 'components/.../index.js' is not defined`：确认 `project.config.json` 里的 `setting.useCompilerPlugins` 包含 `typescript`，并在微信开发者工具里重新编译；必要时关闭并重新打开项目，让工具重新读取配置。
- 如果只是看到 `tsc --noEmit -p tsconfig.json` 输出且无报错：这是 `typecheck` 检查通过，不代表已经打开预览，需要继续用微信开发者工具导入项目。

## 更多命令

根项目：

```powershell
npm.cmd run dev
npm.cmd run dev:web
npm.cmd run dev:full
npm.cmd run build
npm.cmd run test
npm.cmd run test:watch
npm.cmd run test:coverage
npm.cmd run test:e2e
npm.cmd run test:e2e:kiosk
npm.cmd run lint
npm.cmd run format
npm.cmd run check:no-runtime-mock
npm.cmd run check:marketing-promotion-p0
npm.cmd run check:ami-semantic-agent
npm.cmd run check:ami-query-hub
```

后端 `packages/server-v2`：

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run start:prod
npm.cmd run lint
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:migrate:prod
npm.cmd run db:seed
npm.cmd run db:studio
```

移动/助手端 `packages/app`：

```powershell
Set-Location "packages/app"
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

## 默认登录账号

- 用户名：`admin`
- 密码：`11111111`
- 角色：超级管理员，拥有 `['*']` 权限

## 项目结构参考

```text
src/                         # 管理端主应用
packages/server-v2           # NestJS + Prisma 主线后端、AI Gateway
packages/Ami-Aura-Lite-Kiosk # Ami Aura Lite 智能终端 kiosk 主线
packages/Ami-Glow-MiniApp    # Ami Glow 客户服务小程序
packages/marketing-h5        # 营销 H5 子应用
packages/app                 # 移动/AI 助手端应用
docs/                        # API 契约、终端接口、生产计划等文档
e2e/                         # Playwright 用例
outputs/                     # 生成产物/演示输出，谨慎改动
01-市场调研/ ... 05-市场营销/ # 产品、市场、开发、测试资料目录
```

`packages/Ami-Aura-Lite-Kiosk/` 是当前 Ami Aura Lite 终端主线；废弃轻量终端包已退役，不再作为开发目标。

## 技术栈参考

| 类别 | 技术 |
| --- | --- |
| 管理端框架 | React 18.3 + TypeScript + Vite 6.3.5 |
| 样式 | Tailwind CSS v4 + MUI 7 共存 |
| UI | shadcn/ui 风格、Radix UI、CVA、tailwind-merge、lucide-react |
| 状态管理 | Zustand 5 |
| 表单校验 | react-hook-form + zodResolver + Zod v4 |
| HTTP | Axios 1.x |
| 路由 | react-router v7 `createBrowserRouter` |
| 图表 | Recharts 2 |
| 导入导出 | xlsx / SheetJS |
| 通知 | Sonner |
| 富文本 | Tiptap 3 |
| 动画 | motion |
| 拖拽 | react-dnd + react-dnd-html5-backend |
| 后端 v2 | NestJS 11 + Prisma 7 + PostgreSQL |

## 部署参考

已有部署相关文件：

- `Dockerfile.app`：管理端静态构建 + `serve`，端口 8080。
- `docker-compose.yml`
- `vercel.json`
- `nixpacks.toml`
- `packages/server-v2/Dockerfile`
- `packages/server-v2/railway.toml`

管理端 Docker 示例：

```powershell
docker build -f Dockerfile.app -t ami-core-admin .
docker run --rm -p 8080:8080 ami-core-admin
```
