# Gitee dev_hhm 发布配置计划

更新时间：2026-06-28

## 1. 当前状态

- 当前本地仓库：`D:\AI coding\beauty-salon-admin`
- 当前分支：`main`
- 当前工作区：干净，无未提交改动
- 已有远端：`origin -> git@github.com:vali001007/beauty-salon-admin.git`
- 目标发布地址：`https://gitee.com/cocobao/mradmin/tree/dev_hhm`
- 推断目标 Git 远端：`https://gitee.com/cocobao/mradmin.git`
- 推断目标分支：`dev_hhm`

## 2. 已发现风险

1. 当前本地分支是 `main`，而目标发布分支是 Gitee 的 `dev_hhm`，不能直接默认把 `main` 强推到目标分支。
2. 本机 Git 当前配置了代理：
   - `http.proxy=http://127.0.0.1:14228`
   - `https.proxy=http://127.0.0.1:14228`
3. 访问 Gitee 时出现连接失败：`Failed to connect to gitee.com port 443 via 127.0.0.1`。这说明在发布前必须先解决网络或代理连通性，否则无法校验远端分支，也无法稳定推送。
4. 推送到 Gitee 属于远端状态修改，必须等用户明确授权后再执行。

## 3. 配置目标

本次配置的目标不是立即发布，而是建立一个清晰、安全、可复验的 Gitee 发布通道：

- 保留现有 GitHub `origin` 不变。
- 新增独立 Gitee 远端，例如 `gitee`。
- 将 Gitee 发布分支固定为 `dev_hhm`。
- 推送前先确认远端分支存在、提交差异和是否需要创建本地发布分支。
- 不做自动强推；如确需覆盖远端，必须单独确认。

## 4. 建议执行步骤

### 阶段 1：只读确认

1. 查看本地状态：

```powershell
git status --short --branch
git remote -v
git branch --show-current
```

2. 临时绕过或修复 Gitee 访问代理后，确认远端分支：

```powershell
git ls-remote --heads https://gitee.com/cocobao/mradmin.git dev_hhm
```

验收标准：

- 能访问 Gitee。
- 能确认 `dev_hhm` 是否存在。
- 当前工作区没有意外未提交改动。

### 阶段 2：配置 Gitee 远端

如当前没有 `gitee` 远端，则新增：

```powershell
git remote add gitee https://gitee.com/cocobao/mradmin.git
git remote -v
```

如已存在但地址不对，则先只读确认，再调整：

```powershell
git remote set-url gitee https://gitee.com/cocobao/mradmin.git
git remote -v
```

验收标准：

- `origin` 仍指向 GitHub。
- `gitee` 指向 `https://gitee.com/cocobao/mradmin.git`。

### 阶段 3：建立本地发布分支策略

建议创建或切换本地发布分支 `dev_hhm`，避免直接在 `main` 上推送到 Gitee 发布分支：

```powershell
git fetch gitee dev_hhm
git switch -c dev_hhm --track gitee/dev_hhm
```

如果远端 `dev_hhm` 不存在，则需要确认是否由当前代码创建：

```powershell
git switch -c dev_hhm
```

验收标准：

- 本地 `dev_hhm` 与 Gitee `dev_hhm` 关系清楚。
- 清楚知道当前发布内容来自 `main`、已有远端分支，还是新建分支。

### 阶段 4：发布前差异检查

推送前至少检查：

```powershell
git status --short --branch
git log --oneline --decorate --graph --max-count=20
git diff --stat gitee/dev_hhm...HEAD
```

如果远端分支不存在，则改为检查本地待发布提交：

```powershell
git log --oneline --decorate --graph --max-count=20
```

验收标准：

- 明确本次会推送哪些提交。
- 没有临时文件、测试输出、敏感配置或不该发布的文档进入发布分支。

### 阶段 5：获得授权后推送

常规推送：

```powershell
git push gitee HEAD:dev_hhm
```

仅当明确需要重写远端历史，并获得单独授权后，才考虑：

```powershell
git push --force-with-lease gitee HEAD:dev_hhm
```

验收标准：

- Gitee `dev_hhm` 分支更新成功。
- Gitee 页面能看到最新提交。
- 本地 `git status --short --branch` 无异常。

## 5. 推荐 Go / No-Go 判断

Go：

- Gitee 网络连通。
- `gitee` 远端配置正确。
- `dev_hhm` 分支来源确认清楚。
- 推送差异已检查。
- 用户明确授权执行推送。

No-Go：

- Gitee 仍因代理无法访问。
- 远端分支内容未知。
- 本地分支与目标分支关系不清。
- 需要覆盖远端但未获得单独授权。
- 工作区出现与发布无关的未提交改动。

## 6. 当前建议

下一步建议先处理 Gitee 连通性，并只做远端配置：

1. 临时确认是否需要继续使用当前 Git 代理。
2. 成功访问 Gitee 后，新增 `gitee` 远端。
3. 拉取或检查 `dev_hhm`。
4. 再决定是把当前 `main` 发布到 `dev_hhm`，还是先创建本地 `dev_hhm` 分支做差异整理。

在用户明确授权前，不执行 `git push`。
