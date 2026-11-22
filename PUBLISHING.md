# 发布到 DSH 插件市场

## 先搞清楚"市场"是什么

DSH **没有中心化商店**，也没有官方收录渠道。所谓"插件市场"是：

> **一份 JSON 索引（format 1）+ 用户自己把它加进去。**

流程是：你发 npm（或 git 仓库）→ 你托管一份索引 JSON（任意 https 静态站）→ 用户打开 **Plugins → Experimental plugins → Custom plugin indexes**，在 **Discover** 里 **Add index source** 填你的索引 URL → 搜索、点安装、确认。

DSH 会校验索引**格式**，但不会校验索引里的声明是否属实（标题、作者、来源都是第三方内容），所以安装时会弹确认框显示真实的 npm 包名和版本。

> 参考：[官方指南](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market)

## 已改好的东西（这个包现在的形态）

市场只安装 **bundle**（声明了 `dsh.bundle` 的包），裸插件装不进去。所以做了四处改动：

| 改动 | 文件 | 说明 |
|---|---|---|
| 加 bundle 声明 | `package.json` → `dsh.bundle.patch` | 指向 `cordis.patch.yml` |
| 加 bundle 层 | `cordis.patch.yml` | 里面就是那一行 `insert: drag-reference`，安装后由启动器应用 |
| 去私有化 | `package.json` | 删掉 `private`，补 `files` / `engines` / `keywords` |
| 去调试副作用 | `lib/index.js` | 删掉了写 `~/.dsh/cache` 的探针，宿主侧现在是纯空壳 |
| 市场素材 | `market/index.json`、`market/icons/` | 索引 + 图标（不进 npm 包，单独托管） |

已验证：

- 索引通过 DSH 自带的校验器（`parseMarketIndex`），图标相对路径被正确解析成绝对 URL，安装参数算出来是 `dsh-plugin-drag-reference@0.1.0`
- `npm pack --dry-run` 打出来正好 6 个文件：`LICENSE`、`README.md`、`cordis.patch.yml`、`lib/client.js`、`lib/index.js`、`package.json`

## 1. 发布到 npm

先确认名字没被占（404 = 可用）：

```powershell
npm view dsh-plugin-drag-reference version
```

**被占了就换 scope**（`@你的名字/dsh-plugin-drag-reference`），然后同步改三处：
`package.json` 的 `name`、`cordis.patch.yml` 里的 `name:`、`market/index.json` 的 `name`。

```powershell
cd D:\测试程序\dhs\dsh-plugin-drag-reference
npm login
npm publish --access public    # 非 scope 包不需要 --access
```

发布后拿到真实的发布时间，索引里必须用它（不是"现在"的时间）：

```powershell
npm view dsh-plugin-drag-reference time --json
# 取 "0.1.0" 这一项，例如 "2026-11-21T07:30:00.000Z"
# 转 unix 秒：[DateTimeOffset]::Parse('2026-11-21T07:30:00Z').ToUnixTimeSeconds()
```

## 2. 改索引

`market/index.json` 里只有三处要动（其余已经填好）：

- `versions[0].publishTimestamp` → 上一步拿到的真实时间
- `author` → 你的名字或 ID
- 可选：`homepage`、`repository: { "url": "https://github.com/你/仓库" }`（都是可选的展示字段，但要填就必须是合法的 http(s) 绝对 URL）

本地先验一遍（用 DSH 自带的校验器，和用户端读到的规则完全一致）：

```powershell
# 在任意有 node 的地方，把 dsh-plugin-market-index 装上或解出来
node -e "import('@deepseek-ai/dsh-plugin-market-index').then(m=>{const fs=require('fs');const d=JSON.parse(fs.readFileSync('market/index.json','utf8'));console.log(JSON.stringify(m.parseMarketIndex(d,'https://你的域名/market/index.json')).plugins[0].name)})"
```

## 3. 托管索引

把 `market/` 整个目录传到一个 https 静态站，保持目录结构：

```
https://你的域名/market/index.json
https://你的域名/market/icons/drag-reference.svg
```

硬性要求（不满足会被 DSH 整份拒绝，并在 **Manage index sources…** 里显示原因）：

- UTF-8 JSON，**2xx 状态、不能有重定向**，默认上限 128 MiB
- 索引 URL 不能带用户名、密码、`#` 片段；走公网一律用 **https**
- 图标可以是内联 `data:` URL（≤32 KiB，SVG/PNG/JPEG/WebP）或 URL；**相对路径按索引 URL 解析**；跨域绝对 URL 必须 https

最省事的是 GitHub Pages：仓库里放 `market/` 作为发布目录，开启 Pages 后就是
`https://<你>.github.io/<仓库>/market/index.json`。

## 4. 用户侧怎么装到

1. **Plugins** → **Experimental plugins** → 打开 **Custom plugin indexes**（默认关闭，打开后出现 **Discover** 页）
2. **Discover** → **Add index source** → 填索引 URL
3. 搜索（匹配名字/作者/关键词/标题/描述/分类，容忍拼写错误）→ 点卡片 → **Install**
4. 确认框会显示 `dsh-plugin-drag-reference@0.1.0` 和 registry → 确认后走正常的 `pnpm add` + 兼容性校验
5. 装完它会作为一项加进 profile 的 `dsh.profile.bundles`，插件行由 bundle 的 patch 注入

推荐版本规则：取**最高且与当前 DSH 兼容的非预发布版**；如果只有预发布版，则取最高的兼容预发布版。所以 `0.1.0` 这种正式版才会被优先推荐。

## 5. 发新版本

1. 改 `package.json` 的 `version` → `npm publish`
2. 在 `market/index.json` 的 `versions` 数组**追加**一条（旧的保留，用户可以在版本页装回旧版）
3. 重新上传索引

用户端就会显示 **Update available**。

## 坑

- **`engines.dsh` 要和 `package.json` 一致**。安装时 DSH 会再查一遍包的 `engines.dsh`；包上没写才退回去查 `@deepseek-ai/dsh*` peer 依赖。写错或写窄了，用户装到一半被拒（错误码 `incompatible-version`，可以走版本豁免，但那是给用户添麻烦）。
- **`engines.dsh` 的 rc 语义容易写错**。DSH 的判定用 `semver.satisfies(v, range, { includePrerelease: true })`，运行时版本取 `@deepseek-ai/dsh-app-boot` 的版本（这台机器上是 `0.2.2-rc.5`，注意它和桌面端版本号 `0.2.1-rc.5` 不是一回事）。所以：
  - `>=0.2.1-rc.5` 能接受 `0.2.2-rc.5` ✅，但它**没有上界**，将来 `1.0.0` 也算满足
  - `<0.3.0` 在 includePrerelease 下会**放过 `0.3.0-rc.1`** ❌
  - 要卡住 0.3 线又不误放 rc，用 `>=0.2.1-rc.5 <0.3.0-0`（本包采用的值）
- **不要同时用 bundle 入口和手写 row**。这个包现在既能在 `dsh.profile.bundles` 里被启动器应用，也能被 profile 的 `cordis.patch.yml` 手写一行注入；两个都生效会插入重复的 `drag-reference`，Loader 直接报错。二选一。
- **`publishTimestamp` 必须是 npm 的真实发布时间**，写"现在"会让"按发布时间排序"和推荐版本判断变得奇怪。
- 索引发出去之后**改不了历史**：用户可能已经缓存（默认 TTL 10 分钟），删条目不会卸载已装插件。
- 这个插件依赖 `shell.addFiles()` / `conversation.input.for()` 这类非公开接缝。**DSH 升级后要先自己回归一遍**，再放宽 `engines.dsh`。

## 还能怎么被更多人看到

除了自建索引，社区有两个现成的聚合入口（都是第三方，和官方无关）：

- [awesome-dsh-plugin](https://github.com/) 之类的策展列表：提交 PR 加一条，很多"市场"客户端直接读它的 `plugins.json`
- 别人的公开索引仓库（例如 `dsh-plugin-lab/market`）：按其 README 提交索引条目

这些都不是官方渠道，收录标准各不相同，但比让每个用户手动加你的 URL 更容易被发现。
