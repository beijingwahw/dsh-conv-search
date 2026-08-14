# 对话内文本搜索 · dsh-conv-search

[English](README.md) | 中文

为 DeepSeek Harness Web 界面提供会话内文本搜索——把你熟悉的 `Ctrl+F` 限定在当前会话中。浮动搜索栏会高亮渲染出的对话记录中的每一处匹配，并支持在匹配之间跳转，全程不改动 Harness 核心代码的任何一行。

## 解决的问题

- **长会话无法搜索**：浏览器原生查找会搜遍整个页面（侧边栏、输入框、界面元素），且无法跟随仍在流式输出的会话。本插件只搜索当前会话的滚动区域，并在模型持续输出时保持同步。
- **无法在匹配之间跳转**：原生查找没有「第 n / 共 total 个」的导航。本插件提供 Enter / Shift+Enter 与上一个/下一个按钮，支持循环跳转，并自动将当前匹配滚动到视野中央。
- **高亮不能与 React 冲突**：对话 DOM 由 React 管理，流式输出期间持续重渲染。插件不采用包裹 `<mark>` 节点的方式（那会改动 React 管理的文本节点、破坏协调机制），而是通过 CSS Custom Highlight API 绘制高亮——一种覆盖层绘制，能安然度过每一次重渲染，且无需任何 DOM 清理。

## 功能特性

- **Ctrl/Cmd+F** 打开浮动搜索栏（仅在会话已渲染时接管——否则浏览器原生查找不受影响）；**Esc** 随时关闭，即使焦点仍在输入框内。
- 跨所有已渲染的聊天节点进行匹配：用户消息、助手文本、工具卡片、翻页加载的历史记录。两个切换按钮对齐浏览器/IDE 查找栏习惯：**Aa**（区分大小写）与 **ab**（全词匹配）——搜索错误码、函数名、API 标识符时必不可少。
- 实时 `n / total` 计数，**Enter**（下一个）/ **Shift+Enter**（上一个）导航，支持循环；**F3** / **Ctrl+G** 同样可用，与浏览器/IDE 查找栏习惯一致。
- **搜索历史**：**ArrowUp** / **ArrowDown** 循环浏览最近的查询词（最新在前、去重），回退越过最新一条时会恢复你正在输入的草稿。
- 零结果查询会给出回应：计数变红、搜索栏边框随之变红、并给出一次性抖动（遵循 `prefers-reduced-motion`）。在无结果时反复按 Enter 会重新抖动，而非毫无反应。
- 当前匹配以更强的颜色绘制，并自动滚动进入视野。
- 头部操作按钮会镜像打开状态（`aria-pressed`），你随时能知道搜索是否处于激活状态。
- **流式感知**：MutationObserver 在输出流式进行或加载更早分页时（防抖后）重新搜索，且不会抢占你的滚动位置。当前匹配按身份（文本节点 + 偏移）锚定，因此翻页加载的更早内容或流式增量不会把光标跳到另一处匹配。
- 范围约束：输入框区域与插件自身的搜索栏被排除在外，你正在输入的草稿不会产生幽灵匹配。
- 通过 `--dsw-alias-*` 设计令牌跟随 Harness 主题；根据文档语言自动切换中/英文界面。
- 会话头部操作按钮（搜索图标）通过 `conversation.session.header.actions` 插槽注册——可叠加、可安全卸载的组合方式。

## 安装

需要 Node.js ≥ 22 与 pnpm（`npm install -g pnpm`）——`dsh plugin add` 通过 pnpm 把 bundle 装入 profile。

```sh
dsh plugin --profile web add https://github.com/beijingwahw/dsh-conv-search/archive/refs/heads/main.tar.gz
dsh web   # 重启服务以加载插件
```

包内声明了 `dsh.bundle.patch`（挂载宿主注册行）与 `dsh.client`（在 `/plugins/<id>/client.js` 提供浏览器端）。`lib/` 已提交，因此 GitHub tarball 无需构建步骤即可安装。

验证挂载：

```sh
dsh --profile web --dump-config | grep conv-search
```

## 使用

| 操作 | 行为 |
|---|---|
| `Ctrl/Cmd+F`（或头部搜索图标） | 打开搜索栏 |
| 输入 | 边输入边搜索（120 ms 防抖） |
| `Enter` / `F3` / `Ctrl/Cmd+G` | 下一个匹配（循环） |
| `Shift+Enter` / `Shift+F3` / `Ctrl/Cmd+Shift+G` | 上一个匹配（循环） |
| `ArrowUp` / `ArrowDown` | 浏览历史查询词 |
| `Aa` / `ab` 按钮 | 区分大小写 / 全词匹配 |
| `Esc` | 关闭并清除所有高亮 |

## 工作原理

- `src/client/engine.ts` —— 纯 DOM 辅助函数：文本节点遍历、不区分大小写的区间匹配、`CSS.highlights` 绘制（`dsh-conv-search` 绘制全部匹配，`dsh-conv-search-active` 绘制当前匹配）、滚动定位。不依赖 cordis、不依赖 React——可针对 jsdom 做单元测试。
- `src/client/controller.ts` —— 浮动搜索栏（纯 DOM 实现，不与外壳的 React 版本耦合）、键盘捕获、防抖搜索、以及让高亮在流式输出期间保持正确的对话 MutationObserver。
- `src/client/index.ts` —— cordis 客户端半边：通过 `ctx.effect` 安装控制器，并通过 `ctx.slots.inject('conversation.session.header.actions', ...)` 注册头部操作按钮，使按钮随插槽声明与插件 fiber 的出现与消失而同步。
- `src/index.ts` —— 宿主半边是空的注册外壳；全部行为都在浏览器端。

## 模型体验

无。插件只在浏览器中读取已渲染的对话记录；不触碰任何提示词、消息、schema、流、工具或模型请求。

## 开发

```sh
npm install
npm run typecheck   # 严格 TS，不产出
npm run build       # tsdown：宿主 ESM + 浏览器客户端包
npm test            # vitest (jsdom)：engine、controller、i18n
```

客户端包强制执行 Harness 的纯净性规则：平台模块（react、cordis、已注入的客户端包）保持为 external，任何其他 `@deepseek-ai/*` 值导入都会导致构建失败。

## 已知限制与后续计划

- 匹配仅支持纯文本——不支持正则、不支持变音符号归一化、不支持跨节点短语匹配（被样式 span 拆开的短语无法命中）。
- 需要浏览器支持 CSS Custom Highlight API（Chrome/Edge 105+、Safari 17.2+、Firefox 132+）。在不支持的浏览器上，搜索栏仍会计数匹配，但不绘制高亮。
- 搜索栏位置固定（`top: 64px; right: 24px`），暂不可拖拽。
- 搜索范围仅限当前会话列——侧边栏会话标题与设置页面有意排除在外。

## 排障

- `dsh plugin add` 时报 `'pnpm' 不是内部或外部命令` → 先安装 pnpm：`npm install -g pnpm`。
- `dsh web` 报 `EADDRINUSE ... :3080` → 上一个 `dsh web` 仍占用端口。在其终端按 Ctrl+C 停掉；Windows 可用 `Get-NetTCPConnection -LocalPort 3080 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`，或换端口启动：`dsh web --port 3081`。

## 许可证

MIT
