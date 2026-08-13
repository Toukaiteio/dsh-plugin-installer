# DSH Plugin Installer

[![CI](https://github.com/Toukaiteio/dsh-plugin-installer/actions/workflows/ci.yml/badge.svg)](https://github.com/Toukaiteio/dsh-plugin-installer/actions/workflows/ci.yml)
[![最新版本](https://img.shields.io/github/v/release/Toukaiteio/dsh-plugin-installer?display_name=tag)](https://github.com/Toukaiteio/dsh-plugin-installer/releases)
[![许可证](https://img.shields.io/github/license/Toukaiteio/dsh-plugin-installer)](LICENSE)

[English](README.md) | 简体中文

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的内置插件市场与 Profile 切换工具。

DSH Plugin Installer 会在官方 Web UI 的 **设置 → 插件** 中增加“插件市场”标签页。它从 GitHub 的 `dsh-plugin` 和 `dsh` Topic 发现仓库，验证仓库是否为真实 DSH bundle，将插件固定到具体 commit 后安装，并帮助用户在不同 Web Profile 之间切换。

界面保持简洁和新人友好，直接使用官方 Web UI 的插槽与设计令牌，不创建独立管理后台，不使用 emoji 或渐变色。

## 功能

- 在线发现 GitHub `dsh-plugin` 和 `dsh` Topic 下的仓库。
- 安装前验证根目录 `package.json` 是否声明 `dsh.bundle.patch`。
- 使用 `github:owner/repository#commit` 固定到具体提交后安装。
- 第三方仓库包含 `prepare` 安装脚本时，必须明确确认后才允许执行。
- 安装到选中的 DSH Profile。
- 通过 GitHub 依赖地址和包的 repository 元数据识别“已安装”状态。
- 自动检查固定 GitHub 提交安装的插件更新，并提供页面内更新与删除操作。
- 文案和日期格式自动跟随官方 DSH 的语言偏好。
- 列出 Web Profile，快速打开其他 Profile，也可以创建新的 Web Profile。
- 安装到当前 Profile 后提示重启，并提供一键重启按钮。
- 服务端缓存搜索结果五分钟，降低 GitHub API 请求压力。

## 环境要求

- Node.js `>=22.19.0`
- pnpm `>=10`
- DeepSeek Harness `0.1.0-rc.6` 或兼容版本
- 一个可以正常运行的 DSH Web Profile

## 安装

可以从[最新 GitHub Release](https://github.com/Toukaiteio/dsh-plugin-installer/releases) 下载压缩包，也可以自行构建，然后将它添加到正在使用的 Web Profile：

```bash
dsh plugin --profile web add ./dsh-plugin-installer-0.1.2.tgz
dsh web
```

仓库发布后，也可以直接从 GitHub 的指定提交安装：

```bash
dsh plugin --profile web add github:Toukaiteio/dsh-plugin-installer#<commit>
dsh web
```

启动 Web UI 后进入 **设置 → 插件 → 插件市场**。

## 工作方式

GitHub Topic 只作为发现信号，不代表安全审核或官方背书。用户点击“安装”后，host 端会：

1. 读取仓库元数据和默认分支。
2. 读取仓库根目录的 `package.json`。
3. 要求存在有效的 `dsh.bundle.patch` 声明。
4. 将默认分支解析成完整 commit SHA。
5. 调用 DSH 自己的插件命令，并使用固定后的 GitHub 地址安装。

包含 `prepare` 脚本的仓库会被拦截，直到用户明确授予构建权限。这是有意设计的，因为包安装过程可能执行第三方代码。

## 已安装插件管理

插件市场会跟随 DSH **设置 → 通用设置 → 语言** 中选择的语言，并用该语言格式化仓库日期。

**已安装插件** 区域对应当前选定的 Profile。页面打开时，会将每个以固定 GitHub commit 安装的插件与仓库默认分支的最新 commit 比较：

- **有可用更新**：会重新验证仓库，并以新的固定 commit 安装最新 bundle。
- **已是最新**：已安装 commit 与默认分支最新 commit 一致。
- **暂无法检查更新**：注册表/本地安装的插件，或 GitHub 无法访问时的保守状态；不会在没有成功比较时提示有更新。
- **删除**：先要求确认，再调用 DSH 自己的 `plugin remove` 命令，使 Profile bundle 清单与实际包状态保持一致。

在当前 Web Profile 更新或删除插件后，点击 **立即重启 DSH** 即可应用新的 bundle 叠加层。

## Profile 行为

- **打开 Profile** 会在新的本地端口启动所选 Web Profile，然后跳转到新地址。当前进程会暂时保留，切换失败时不会丢失当前会话。
- **创建并打开** 会初始化一个包含官方 Web bundle 和本插件的新 Profile，然后自动打开。
- 安装到当前 Web Profile 后，点击 **立即重启 DSH** 会先启动新的进程，确认新地址可用后跳转，再关闭旧进程。

当前 DSH 预览版存在一个上游 npm 打包问题：`@deepseek-ai/dsh-web-app` 可能依赖 npm 仓库中不存在的 `@deepseek-ai/dsh-frontend`。此时创建全新的 Web Profile 会被上游包阻断，但已经可以正常运行的 Web Profile 不受影响。

## 开发

```bash
pnpm install
pnpm check
pnpm build
pnpm pack
```

也可以单独运行：

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

项目会提交 `lib/` 构建产物，因为 DSH 从 Git 仓库安装插件时不会默认先替你构建。`.gitignore` 会忽略本地 `.tgz`、依赖、缓存和环境文件。

## Plugin 与 Skill 编写

仓库包含 [SKILL.md](SKILL.md)，其中提供了插件市场使用流程和兼容 DSH bundle 的编写说明。

一个最小 DSH plugin bundle 需要：

1. 根目录 `package.json` 声明 `dsh.bundle.patch`。
2. `cordis.patch.yml` 插入 host 模块。
3. 一个导出 `apply(ctx)` 的 ESM host 模块。
4. 如果需要 Web UI，再增加 `dsh.client` 声明和 `./client` 导出。

原生 DSH Skill 则需要创建带 YAML frontmatter 的 `SKILL.md`，放在 DSH 能发现的目录，例如 `$DSH_HOME/skills/<skill-name>/SKILL.md`。Skill 描述操作指令和工作流；Plugin 修改 Harness 的运行时或 UI。

## 安全说明

GitHub Topic 不代表安全审核或官方推荐。安装器会验证 bundle 结构并固定 commit，但无法审计第三方源代码。安装前应检查仓库内容，尤其要注意包含安装脚本或构建脚本的仓库。

如果服务端设置了 `GITHUB_TOKEN`，安装器只在服务端读取它，不会将 Token 发送到浏览器。

## 自动构建与发布

GitHub Actions 会在推送到 `main` 和创建 Pull Request 时运行完整校验，并上传生成的 `.tgz` CI 构件。

推送与 `package.json` 版本一致的 tag 后，会自动创建 GitHub Release 并上传安装包：

```bash
git tag v0.1.2
git push origin v0.1.2
```

如果 tag 版本与 `package.json` 不一致，发布工作流会直接失败。

## 许可证

[MIT](LICENSE)

## 相关链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH plugin Topic](https://github.com/topics/dsh-plugin)
- [DSH 发布文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [English README](README.md)
