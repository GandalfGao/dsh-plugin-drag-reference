# dsh-plugin-drag-reference

[![npm](https://img.shields.io/npm/v/dsh-plugin-drag-reference)](https://www.npmjs.com/package/dsh-plugin-drag-reference)

把右侧「文件」页里的**某一行**拖进对话框（或在行上右键），就在输入框里插入一个 `@路径` 引用芯片。

## 和 [dsh-drag](https://github.com/ttmouse/dsh-drag) 的区别

两者都在补"从列表到草稿"这条拖拽路径，本插件是另一套取舍：

| | 本插件 | dsh-drag |
| --- | --- | --- |
| 不想拖 | 文件行**右键** →「＠ 引用到对话」 | 只能拖 |
| 拖拽视觉 | 跟手小标签，进入落点变蓝 | 只有浏览器原生拖影 |
| 芯片被拒绝 | 退化成纯文本 `@路径`，操作不丢 | 提示失败，不插入 |
| 左侧会话行 | 不支持 | 支持 |

拖拽和右键共用同一份解析与插入逻辑，两条入口不会行为漂移。

## 兼容版本

`engines.dsh: ">=0.2.1-rc.5 <0.3.0-0"`，在 DSH `0.2.2-rc.5` 上真机验证。

插件依赖若干未公开的宿主接缝（见「实现要点」）：DSH 升级后若芯片通道变了，插入会退化成纯文本 `@路径` 而不是崩溃，控制台有一条 warn。

## 行为

- 在右侧文件树里按住文件行或文件夹行，向右拖动超过 6px 即进入拖拽（光标变成抓手，并浮现一个小标签显示文件名）。
- 拖到对话框（composer）区域时小标签变蓝，松手后插入一个**引用芯片**（文件/文件夹图标 + 文件名，和 `@` 补全选出来的完全一样）；提交时序列化成 `@相对路径`。
- 文件夹带尾斜杠（`@src/`）；路径含空格时自动写成 `@"带 空格 的文件.doc"`。
- 插入后会顺手把焦点交还输入框，可以接着打字。
- 松手位置不在对话框上、或落在别的会话的对话框上，什么都不做。
- 拖拽过程中按 `Esc` 取消。
- 短按（位移 < 6px）仍然是原来的「点击打开预览」，拖拽结束后也不会误触发打开。

### 右键菜单（拖拽的键盘/免拖半）

在任意文件行或文件夹行上**右键**，弹出一个小菜单：

```
@src/app.ts            ← 这行到底是哪个文件（可选中复制）
＠ 引用到对话            ← 和拖拽完全相同的插入，点一下/回车即可
```

- 树上原本没有右键菜单，所以这里的菜单**替换**了浏览器原生菜单（只对文件行生效，其余区域仍是原生菜单）。
- `Esc`、点菜单外、滚动文件树、切换会话都会关掉它。
- 打开时焦点落在菜单项上，可以直接按回车；这是给"不想拖"或者键盘用户用的同一条路。

## 安装方式

### 方式一：bundle 安装（推荐）

已发布到 npm：

```
dsh plugin --profile web add dsh-plugin-drag-reference
```

或直接从 GitHub 装（不经过 npm）：

```
dsh plugin --profile web add github:GandalfGao/dsh-plugin-drag-reference
```

也可以手动把包名加进 profile `package.json` 的 `dsh.profile.bundles`，然后重启应用：

```json
"dsh": { "profile": { "bundles": ["dsh-plugin-drag-reference"] } }
```

### 方式二：本地开发装（要改代码时用）

把插件目录 `link:` 进 profile，这样改完不用重装：

```json
// <你的用户目录>\.dsh\profiles\desktop\package.json
"dependencies": {
  "dsh-plugin-drag-reference": "link:<插件目录绝对路径，用正斜杠>"
}
```

```yaml
# <你的用户目录>\.dsh\profiles\desktop\cordis.patch.yml
- insert:
    - id: drag-reference
      name: dsh-plugin-drag-reference
```

然后在 profile 目录下装依赖（用桌面端自带的 node + pnpm）：

```powershell
& "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" `
  "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs" install
```

因为依赖是 `link:`，改完 `lib/client.js` 不需要重新安装；重新加载页面即可生效。

> **注意**：两种方式**不要同时用**——都会插入 `drag-reference` 行，Loader 会报重复 id。切换前把另一种撤掉再重启。

## 发布

包已经是 bundle 形态，可以直接从 GitHub 安装：

```powershell
dsh plugin --profile web add github:GandalfGao/dsh-plugin-drag-reference
```

`market/index.json` 是自建的插件市场索引（format-1，尚未托管）：要发 npm 或自建索引时，按它把 `publishTimestamp` 换成真值，再把 `market/` 放到 https 静态站上即可。

## 卸载

删掉上面 `cordis.patch.yml` 里的 `- insert:` 段即可；想彻底移除再删掉 `dependencies` 那一行并重新 `pnpm install`。

## 实现要点

- 只用一个**不可见的** `conversation.input.dock` 条目换到会话级的标准属性 `inputActions`，没有可见 UI。
- 芯片走的是和 `@` 补全选中后同一条内部通道：`ctx.sessions.scope(sessionId)` → `actx.get('conversation').input.for(actx)` → `shell.addFiles([reference], [])`。`reference` 就是补全 pick 的形状（`{ source: 'reference', ref, label, appearance, clipboardText }`），所以渲染、序列化、点击预览的行为都跟内置一致。
- 兜底用公开的 `InputActions.captureInsertion()` + `insertText(text, span)`：投放时若输入框正在提交/仲裁（`addFiles` 返回 false），就退化成纯文本 `@路径`，不会静默失败（控制台会有一条 warn）。
- 拖拽和右键菜单共用同一套解析与插入：`insertionFor()` 产出一份 `{ mention, reference }`，`drop()` 决定插芯片还是退化成文本。所以两条入口的行为不会漂移。
- 菜单是自绘的（`role="menu"` / `role="menuitem"`，打开即聚焦菜单项），没有依赖产品的菜单组件——那个组件不在公开插槽里。
- 依赖文件树行上的 `data-files-entry` / `data-files-path` 与容器上的 `data-files-root` 这几个 DOM 契约（产品自己的浏览器测试也在用），以及对话框的 `data-conversation-region="composer"` / `data-conversation-session`。

## 已知限制

- `shell.addFiles()` 和 `conversation.input.for()` 不是文档化的公开 API（公开的只有 `InputActions` 那两个方法 + `@` 触发源注册）。升级 DSH 后如果这层变了，芯片会退回纯文本，不会崩——但要重新对齐这里。
- 只在桌面窗口（`dsh-app://`）里验证；浏览器标签页里同样可用，因为不依赖真实文件路径。
- 文件夹拖进去只是 `@dir/` 引用，不会递归展开内容；点文件夹芯片不会打开预览（内置行为也是 `false`）。
- 右键菜单只在文件树上生效，且**替换**了原生菜单（行上没有值得保留的原生项）。但树的行走访没有"当前行"焦点模型，所以暂时只能右键打开——纯键盘路径要等产品先给行焦点。
- 宿主侧写了 `~/.dsh/cache/dsh-plugin-drag-reference/mounted.json` 作为「这一行确实被加载了」的探针，不需要可以删掉 `lib/index.js` 里那段 `try`。
- 改完 `lib/client.js` 要让浏览器拿到新版本，需要让插件行重新加载一次（`disabled: true` 再删掉，或重启应用）；只刷新页面不一定够，因为宿主按 mtime/size 算版本号。
