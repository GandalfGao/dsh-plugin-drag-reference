# 交接说明（换机器 / 换会话时先读这个）

一份自包含的上下文重建文档：读完就能接着改，不需要翻聊天记录。

## 这是什么

`dsh-plugin-drag-reference` —— DSH Web 客户端的 UI 插件：把右侧「文件」页里的文件/文件夹行**拖进对话框**，或在行上**右键**，在输入框里插入一个 `@路径` 引用芯片（和 `@` 补全选出来的完全等价，提交时序列化为 `@相对路径`）。

## 当前状态

| 项 | 状态 |
|---|---|
| 拖拽 → 芯片 | ✅ 已实现并在真机验证 |
| 右键 → 引用到对话 | ✅ 已实现并在真机验证 |
| 单元/行为测试 | ✅ `test/smoke.mjs`：18 个用例，假 DOM，零依赖，`node test/smoke.mjs` 直接跑 |
| 本地安装 | ✅ 已装进 `desktop` profile（`link:` + 手写 row） |
| npm 发布 | ❌ **未发布**（账号未登录；名字 `dsh-plugin-drag-reference` 在 registry.npmjs.org 上可用） |
| 市场索引 | ⚠️ `market/index.json` 已写好并通过 DSH 自带校验器，但 `publishTimestamp` 是占位值，且**尚未托管** |
| 社区目录收录 | ❌ 未提交 |

## 目录结构

```
package.json            bundle 形态（dsh.bundle.patch + dsh.client.platform=web）
cordis.patch.yml        bundle 层：insert 一行 drag-reference
lib/index.js            宿主侧空壳（无副作用）
lib/client.js           全部逻辑：指针拖拽、右键菜单、芯片插入、纯文本兜底
test/smoke.mjs          18 个行为用例（假 DOM，无依赖，不进 npm 包）
market/index.json       format-1 市场索引（含单版本 0.1.0）
market/icons/*.svg      索引图标（相对索引 URL 解析）
README.md               行为/安装/限制
PUBLISHING.md           发布流程（npm → 索引 → 托管 → 用户订阅）
```

## 改完怎么验证

**1. 本地先跑行为测试**（不动应用，几秒）

```powershell
node test/smoke.mjs          # 或 npm test
```

覆盖：芯片插入（文件/文件夹/带空格路径/工作区外绝对路径）、文本兜底、落点外不插、跨会话拒绝、点击不误触、Esc 取消、表头伪行忽略、右键菜单开合与执行、菜单外点击/Escape/滚动关闭、重挂载不残留。

**2. 让浏览器拿到新代码**

宿主按 `mtime + size` 给客户端 bundle 算版本号，**只刷新页面不一定够**。可靠做法是让插件行重新加载一次：

1. 在 profile 的 `cordis.patch.yml` 里给这一行加 `disabled: true`
2. 等 ~2 秒（HMR 会卸载它）
3. 删掉 `disabled: true`（重新加载，浏览器拿到新 revision）
4. 实在不行重启应用

**3. 真机自检**

- 拖文件行 → 应出芯片；右键文件行 → 应弹菜单
- `Ctrl+Shift+I` 开控制台，按日志定位：
  - `[drag-reference] dock registered` → 插件加载了
  - `inputActions unavailable` → 标准属性没下发，**换挂载点**
  - `reference chip refused; falling back…` → 芯片通道被拒（相位锁定或内部 API 变了），此时插入的是纯文本

## 换机器怎么装

### 方案 A：开发安装（当前机器用的就是这条）

```powershell
# 1) 把整个 dsh-plugin-drag-reference 目录拷到新机器（建议放同一路径，省得改 link）
# 2) profile 里加依赖
#    C:\Users\<你>\.dsh\profiles\desktop\package.json
"dependencies": {
  "dsh-plugin-drag-reference": "link:<插件目录的绝对路径，正斜杠>"
}
# 3) 手写一行 row
#    C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml
- insert:
    - id: drag-reference
      name: dsh-plugin-drag-reference
# 4) 装依赖（用桌面端自带的 node + pnpm）
& "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" `
  "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs" install
# 5) 重启应用
```

### 方案 B：bundle 安装（等价于市场安装的路径）

把包名加进 profile `package.json` 的 `dsh.profile.bundles`，**删掉**上面那段手写 `insert`，重启。
两者不要同时用：会插入重复的 `drag-reference` 行。

### 方案 C：npm 发布之后

```powershell
dsh plugin --profile desktop add dsh-plugin-drag-reference
```

## 代码里依赖的外部接缝（升级 DSH 后先看这几处）

| 依赖 | 用途 | 破了会怎样 |
|---|---|---|
| `conversation.input.dock` 座位 + `inputActions` 标准属性 | 拿到会话级输入动作 | 拖拽/右键全部失效（控制台会有 `[drag-reference] inputActions unavailable`） |
| `ctx.sessions.scope(id).get('conversation').input.for(actx)` → `shell.addFiles([reference], [])` | 插真芯片 | 退化成纯文本 `@路径`（控制台有 `chip refused` 警告） |
| 文件树行 DOM：`[data-files-entry]` / `[data-files-path]` / `[data-files-root]` / `[data-files-body]` | 拖拽源 | 拖不动（右键也不弹菜单） |
| 输入框：`[data-conversation-region="composer"]` / `[data-conversation-session]` | 落点判定与会话归属 | 落点失效，插不进去 |
| `InputActions.captureInsertion()` / `insertText()` | 纯文本兜底 | 兜底失效（芯片路径仍可用） |

## 待办

1. `npm login` → `npm publish` → `npm view <包名> time --json` → 回填 `market/index.json` 的 `publishTimestamp`
2. 托管 `market/` 到 https 静态站（2xx、无重定向、UTF-8）
3. 在索引里补 `author` / `homepage` / `repository`
4. 去 awesome-dsh-plugin 的仓库提 PR 收录（大多数用户从那个目录发现插件）
5. 可选：把本地安装从"手写 row"切到 bundle 形态，预演市场安装路径

## 这个会话里做过的关键决策（省得重新论证）

- **芯片不自己造**：走 `shell.addFiles([reference], [])`，和 `@` 补全同一条通道，所以渲染/序列化/点击预览天然一致；纯文本只作兜底。
- **不可见的 dock 条目挂载**：插件没有可见 UI，靠 `conversation.input.dock` 上空渲染组件拿到 `inputActions`。
- **右键菜单自绘**：产品没有可复用的菜单插槽；菜单接管文件行上的原生右键，其余区域不劫持。
- **拖拽 + 右键共用一个 `drop()`**：避免两条入口行为漂移。
- **`engines.dsh: ">=0.2.1-rc.5 <0.3.0-0"`**：DSH 用 `includePrerelease: true` 判定，运行时版本取 `@deepseek-ai/dsh-app-boot` 的版本（本机 `0.2.2-rc.5`，注意与桌面端版本号不同）；`<0.3.0` 会误放 `0.3.0-rc.1`，所以写成 `<0.3.0-0`。

## 关于会话本身

- GUI 导出：Session 头部「更多」→ *Download session log*，或在输入框发 `/export`，浏览器会下载 `dsh-session-<id>.zip`（含会话 JSONL、子会话、附件）。
- **导出是归档/分享用途，DSH 没有导入通道**。要在另一台机器上"接着聊"，只能搬会话存储：
  `~\.dsh\sessions\<工作区路径编码的桶>\session-<id>\session.vN.jsonl.zstd`
  桶名由工作区绝对路径编码（`D:\测试程序\dhs` → `--D-~6D4B~8BD5~7A0B~5E8F-dhs--`）。新机器上工作区路径不同就要改桶名或对齐路径。
- 更稳的做法是只搬这个目录 + 本文件，在新会话里从代码和文档重建上下文。
