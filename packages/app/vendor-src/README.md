# Deprecated: vendor-src

`packages/app/vendor-src` 是移动/助手端早期同步进来的历史源码快照，当前不再作为日常开发主线。

## 当前定位

- 本地 `packages/app` 构建优先通过 `@` 引用仓库根目录 `src/`。
- 根目录 `Dockerfile.app` 也会复制根目录 `src/`，因此主构建链路不依赖这里的源码。
- 这里保留的 `api/mock`、`api/real`、页面、store、schema 等文件仅用于历史对照和单包 Docker fallback，不代表当前维护目标。
- `packages/app/vite.config.ts` 默认不再自动 fallback 到本目录；只有显式设置 `ALLOW_VENDOR_SRC_FALLBACK=true` 时才允许临时用于历史构建排障。

## 协作约定

- 不要在这里新增业务功能。
- 不要继续维护这里的 mock/real 双实现。
- 不要把这里作为修复管理端、移动/助手端或智能终端问题的首选位置。
- 若发现必须修改这里，先确认是否仍有人使用只复制 `packages/app` 的单包构建链路，并在命令中显式设置 `ALLOW_VENDOR_SRC_FALLBACK=true`。

## 后续退役条件

确认不再使用 `packages/app/Dockerfile` 单包构建后，可以移除 `vite.config.ts` 中的 `vendor-src` fallback，并在单独清理任务中退役本目录。
