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
- 自动排除 DeepSeek Harness 本体仓库，避免将宿主程序误认为插件。
- 安装前验证根目录 `package.json` 是否声明 `dsh.bundle.patch`。
- 优先使用 GitHub Release 中已构建的 `.tgz` 安装包；仅在已确认仓库提交了可加载入口时才允许源码安装。
- 可以在插件列表中选择 Release 版本；默认优先选择稳定版。
- GitHub 提供摘要时校验 Release 安装包的 SHA-256。
- 安装到选中的 DSH Profile。
- 通过 GitHub 依赖地址和包的 repository 元数据识别“已安装”状态。
- 自动检查 GitHub Release 版本更新，并提供页面内更新与删除操作。
- 打开插件市场时检查安装器自身的新版本 Release，提供一键更新当前 Profile 并重启生效；旧版本在重启前继续运行，其他 Profile 不受影响。
- 文案和日期格式自动跟随官方 DSH 的语言偏好。
- 列出 Web Profile，快速打开其他 Profile，也可以创建新的 Web Profile。
- 安装到当前 Profile 后提示重启，并提供一键重启按钮。
- 插件列表会按搜索词、排序方式和页码在服务端与客户端分别缓存十二分钟，降低 GitHub API 请求压力并加快再次打开的速度。
- 支持无限滚动，在接近列表底部时自动获取下一页 GitHub 搜索结果。
- 市场保留两种 GitHub 仓库搜索官方支持的排序方式：按更新时间和按星标数。
- 可以直接在插件市场配置 GitHub API Token，也支持使用环境变量作为 fallback。

## 环境要求

- Node.js `>=22.19.0`
- pnpm `>=10`
- DeepSeek Harness `0.1.0-rc.6` 或兼容版本
- 一个可以正常运行的 DSH Web Profile

## 安装

### Windows 一键安装

在 Windows 上，可以直接运行 PowerShell 安装脚本。脚本会下载最新稳定版 GitHub Release，在 GitHub 提供 SHA-256 摘要时校验下载内容，并将归档保留在 `DSH_HOME/plugin-archives/dsh-plugin-installer/` 以便后续解析依赖，然后将插件安装到 `web` Profile 并启动 DSH Web：

```powershell
irm https://raw.githubusercontent.com/Toukaiteio/dsh-plugin-installer/main/scripts/Install-DshPluginInstaller.ps1 | iex
```

### 配置 GitHub API Token

当 GitHub 匿名请求额度耗尽时，打开 **设置 → 插件 → 插件市场 → GitHub 请求设置**，粘贴 GitHub Token 并保存。保存后 Token 不会回显到页面，插件会将它写入：

```text
$DSH_HOME/config/dsh-plugin-installer.json
```

如果没有设置 `DSH_HOME`，则使用 DSH 默认目录。保存空值可以清除本插件保存的 Token。无人值守安装场景也可以使用服务端环境变量 `GITHUB_TOKEN`；当插件没有保存 Token 时，它会作为 fallback 使用。

### Windows 本地 MITM 与 TLS 证书错误

如果使用 FastGitHub、steamcommunity_302 等本地 HTTPS 加速器或代理时，插件市场无法连接 GitHub，并提示无法验证 GitHub 的 TLS 证书，通常是因为代理根证书虽然已被 Windows 信任，但 Node.js 尚未使用 Windows 系统证书存储。复现环境和验证过的解决方式记录在 [Issue #1](https://github.com/Toukaiteio/dsh-plugin-installer/issues/1)；感谢 [alphaqwqwq](https://github.com/alphaqwqwq) 报告并验证了这个问题。

请先完全退出 DSH，再在同一个 Windows CMD 窗口中设置 Node.js 使用系统 CA，然后重新启动 DSH：

```bat
set "NODE_OPTIONS=%NODE_OPTIONS% --use-system-ca"
dsh web
```

该选项需要 Node.js 22 或更高版本，并且加速器根证书仍须正确安装并被 Windows 信任。不要使用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过证书校验。

如需指定其他 Profile 或不自动启动 DSH Web，请先下载脚本后再传入参数：

```powershell
$script = "$env:TEMP\Install-DshPluginInstaller.ps1"
Invoke-WebRequest https://raw.githubusercontent.com/Toukaiteio/dsh-plugin-installer/main/scripts/Install-DshPluginInstaller.ps1 -OutFile $script
& $script -Profile work -NoStart
```

### macOS 和 Linux 安装

在 macOS 或 Linux 上，可以下载并运行 Bash 安装脚本。它与 Windows 脚本遵循相同的下载 Release、校验摘要、安装和启动流程：

```bash
curl --fail --location --remote-name https://raw.githubusercontent.com/Toukaiteio/dsh-plugin-installer/main/scripts/install-dsh-plugin-installer.sh
bash ./install-dsh-plugin-installer.sh
```

除 DSH 外，该脚本还需要 `bash`、`curl` 与 Node.js。可以使用 `--profile` 指定其他 Profile，或使用 `--no-start` 仅安装而不启动 DSH：

```bash
bash ./install-dsh-plugin-installer.sh --profile work --no-start
```

### 手动安装

可以从[最新 GitHub Release](https://github.com/Toukaiteio/dsh-plugin-installer/releases) 下载压缩包，也可以自行构建，然后将它添加到正在使用的 Web Profile：

```bash
dsh plugin --profile web add ./dsh-plugin-installer-<版本>.tgz
dsh web
```

仅用于本地开发时，也可以直接从 GitHub 的指定提交安装；此时源码仓库必须已经包含构建后的 `lib/` 目录：

```bash
dsh plugin --profile web add github:Toukaiteio/dsh-plugin-installer#<commit>
dsh web
```

启动 Web UI 后进入 **设置 → 插件 → 插件市场**。

## 工作方式

GitHub Topic 只作为发现信号，不代表安全审核或官方背书。用户点击“安装”后，host 端会：

1. 读取仓库元数据和最新 GitHub Release。
2. 读取仓库根目录的 `package.json`。
3. 要求存在有效的 `dsh.bundle.patch` 声明。
4. 优先使用 Release 中与版本匹配的 `<包名>-<版本>.tgz` 安装包；GitHub 提供摘要时校验内容，并将其保存在 `DSH_HOME/plugin-archives/` 后使用持久化本地路径安装。
5. 没有合适 Release 时，仅在确认包所声明的 JavaScript 入口文件确实存在于该具体提交后，才允许使用固定 commit 的源码安装。

有 Release 时，插件市场会安装已构建的 Release 安装包，不会把源码仓库的 `prepare` 作为市场构建步骤执行。受控的源码回退安装仍遵循 DSH/pnpm 对生命周期脚本的处理规则。

如果仓库既没有可用的 Release 安装包，也没有可验证的已构建 JavaScript 入口，插件市场会拒绝安装并说明原因。源码回退需要执行 `prepare` 构建脚本时，还必须针对该插件明确确认。

## 已安装插件管理

插件市场会跟随 DSH **设置 → 通用设置 → 语言** 中选择的语言，并用该语言格式化仓库日期。

**已安装插件** 区域对应当前选定的 Profile。页面打开时，会优先将市场安装的每个插件与仓库最新 Release 比较；没有 Release 时再比较当前源码提交：

- **有可用更新**：下载并安装经过验证的最新 Release 安装包。
- **已是最新**：已安装包版本与最新 Release 版本一致。
- **暂无法检查更新**：Release 和源码状态都无法检查时的保守状态；不会在没有成功比较时提示有更新。
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

GitHub Token 只在服务端读取。它可以来自插件市场设置，也可以来自服务端环境变量 `GITHUB_TOKEN`；Token 不会返回给浏览器。保存的 Token 位于当前 `DSH_HOME` 下，并使用当前用户的 Profile 权限保护。建议只授予访问公开仓库元数据所需的最小权限。

## 自动构建与发布

GitHub Actions 会在推送到 `main` 和创建 Pull Request 时运行完整校验，并上传生成的 `.tgz` CI 构件。

推送与 `package.json` 版本一致的 tag 后，会自动创建 GitHub Release 并上传安装包：

```bash
git tag v0.1.6
git push origin v0.1.6
```

如果 tag 版本与 `package.json` 不一致，发布工作流会直接失败。

### 版本策略

正式发布使用 `MAJOR.MINOR.PATCH`，并创建对应 tag 和 GitHub Release，例如
`0.1.13` / `v0.1.13`。本地迭代测试包则使用下一个补丁版本加开发后缀，例如
`0.1.13-dev.1`、`0.1.13-dev.2`。这样每个可安装的本地测试包都有唯一版本，
却不需要为每一个小改动都创建正式 Release。

开发测试包通常只在本地使用、不创建 tag。若确实需要推送预发布 tag，发布工作流
会将它标记为 GitHub 预发布版本；一键安装脚本仍然只会选择最新稳定版。

## 许可证

[MIT](LICENSE)

## 相关链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH plugin Topic](https://github.com/topics/dsh-plugin)
- [DSH 发布文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [English README](README.md)
