# DSH Plugin Installer

将 GitHub 上的 DeepSeek Harness 插件发现、校验、安装和 Profile 切换整合进官方 Web UI 的 **设置 → 插件 → 插件市场** 标签页。

界面刻意保持单页、少控件：一个 Profile 工具条、一个搜索框、一列仓库，以及只在点击安装时展开的校验面板。它沿用官方设置页的布局和设计令牌，不使用 emoji、渐变或独立管理后台。

## 功能

- 在线合并 GitHub 的 `dsh-plugin` 与 `dsh` Topics；搜索结果在服务端缓存五分钟，降低匿名 GitHub Search API 的频率限制影响。
- 点击安装前读取仓库根目录 `package.json`。只有声明 `dsh.bundle.patch` 的包才会显示安装操作。
- 将默认分支解析成固定 commit，再用 `dsh plugin --profile <profile> add github:owner/repo#commit` 安装，避免之后默认分支变动导致配置漂移。
- 有 `prepare` 安装脚本的仓库必须在 UI 显式勾选授权；确认后才为该包写入目标 Profile 的 `allowBuilds`。
- 列出本机 `$DSH_HOME/profiles` 下的 Profile；可启动已有 Web Profile，或一键创建含官方 Web UI 和本插件的新 Profile。

## 安装与开发

先构建并生成可发布文件：

```bash
pnpm install
pnpm build
pnpm pack
```

将生成的 `.tgz` 添加到默认 Web Profile：

```bash
dsh plugin --profile web add ./dsh-plugin-installer-0.1.1.tgz
dsh web
```

开发时也可从发布到 GitHub 的仓库安装。Git 安装不会替你生成构建产物，因此提交中必须包含 `lib/`，并且不要依赖 `prepare` 来构建本插件。

## Profile 行为

“打开 Profile”不会终止当前 DSH Web 进程。它会为目标 Profile 启动一个新的本地端口，确认启动地址后跳转浏览器。这样切换失败不会让用户丢失当前会话；不再需要的旧进程可由用户自行关闭。

新建 Profile 会依次安装 `@deepseek-ai/dsh-web-app` 和当前插件使用的同一安装来源，因此新页面仍然有插件市场。

> 当前上游预览版注意事项：测试时，npm 上的 `@deepseek-ai/dsh-web-app` 依赖的 `@deepseek-ai/dsh-frontend` 返回 404，因而在完全空白的环境中创建 Web Profile 会被这一上游发布问题阻断。已有可运行的 Web Profile 不受影响；待上游修复该包后，“新建 Web Profile”无需改动即可恢复。

## 编写 DSH skill 与 plugin

这个项目的 [SKILL.md](SKILL.md) 是随插件发布的操作 skill 范例。DSH 的原生 skill 是一个带 YAML frontmatter 的 `SKILL.md`，放在 DSH 可发现的 skills 目录中；它描述工作流和安全边界，不负责加载 Node 代码。若希望它被 agent 自动发现，请复制为 `$DSH_HOME/skills/dsh-plugin-marketplace/SKILL.md`。

真正改变 Harness 行为或 Web UI 的扩展是 plugin bundle。最小 bundle 要有：

1. 根 `package.json` 的 `dsh.bundle.patch`。
2. `cordis.patch.yml` 中插入的模块行。
3. 导出 `apply(ctx)` 的 ESM host 模块；如需 Web UI，再用 `dsh.client` 与 `./client` 导出 browser 模块。

本项目是完整的 Web plugin 样例：host 模块注册本地 API，client 模块通过 `settings.plugins.tab` 注入现有的官方插件设置页，不另起页面。

## 安全边界

GitHub Topic 只是发现信号，不代表官方审核或安全背书。市场会验证 bundle 形状和固定安装提交，但不能审计第三方代码。对包含安装脚本的仓库，必须先查看仓库内容并得到用户确认。
