# DSH Plugin Installer

[![CI](https://github.com/Toukaiteio/dsh-plugin-installer/actions/workflows/ci.yml/badge.svg)](https://github.com/Toukaiteio/dsh-plugin-installer/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Toukaiteio/dsh-plugin-installer?display_name=tag)](https://github.com/Toukaiteio/dsh-plugin-installer/releases)
[![License](https://img.shields.io/github/license/Toukaiteio/dsh-plugin-installer)](LICENSE)

English | [简体中文](README.zh-CN.md)

An in-app marketplace and Profile switcher for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

DSH Plugin Installer adds a **Plugin marketplace** tab to the official Web UI under **Settings → Plugins**. It discovers repositories from the GitHub `dsh-plugin` and `dsh` topics, verifies that a repository is a real DSH bundle, installs it at a pinned commit, and helps users open another Web Profile without leaving the UI.

The project intentionally keeps the interface compact and newcomer-friendly. It uses the official Web UI slot and design-token system, with no separate administration page, emoji, or gradient backgrounds.

## Features

- Online discovery from GitHub `dsh-plugin` and `dsh` topics.
- Excludes the DeepSeek Harness host repository from plugin-marketplace results.
- Root `package.json` validation for `dsh.bundle.patch` before installation.
- Verified GitHub Release installs using the published `.tgz` build artifact whenever available; source installs are allowed only when the checked-in JavaScript entry exists.
- Optional Release version selection from the marketplace list; stable releases are preferred by default.
- Release archive SHA-256 verification when GitHub provides a digest.
- Installation into a selected DSH Profile.
- Installed-state detection from both GitHub dependency specs and package repository metadata.
- Automatic update checks for GitHub Release versions, plus in-page update and removal actions.
- Interface copy and date formatting that follow the official DSH language preference.
- Web Profile list, fast Profile opening, and Web Profile creation.
- Restart guidance and a one-click restart action after installing into the active Profile.
- Twelve-minute per-query, per-sort, and per-page caching on both the server and client to reduce GitHub API pressure and speed up revisits.
- Infinite scrolling that fetches the next GitHub search page before reaching the end of the current list.
- The marketplace keeps two GitHub-supported repository search orders: updated time and star count.
- Configure a GitHub API token from the marketplace UI, with an environment-variable fallback.

## Requirements

- Node.js `>=22.19.0`
- pnpm `>=10`
- DeepSeek Harness `0.1.0-rc.6` or a compatible release
- A running DSH Web Profile for the in-app UI

## Install

### Windows one-click installer

On Windows, run the PowerShell installer directly. It downloads the latest stable GitHub Release, verifies its SHA-256 digest when available, keeps the archive under `DSH_HOME/plugin-archives/dsh-plugin-installer/` for future dependency resolution, installs it into the `web` Profile, and starts DSH Web:

```powershell
irm https://raw.githubusercontent.com/Toukaiteio/dsh-plugin-installer/main/scripts/Install-DshPluginInstaller.ps1 | iex
```

### GitHub API token

Open **Settings → Plugins → Plugin marketplace → GitHub request settings** and paste a GitHub token when the anonymous API limit is reached. The token is never returned to the browser after saving. It is stored in:

```text
$DSH_HOME/config/dsh-plugin-installer.json
```

If `DSH_HOME` is not set, DSH's default home directory is used. Saving an empty value clears the token saved by this plugin. For unattended installation, the server-side `GITHUB_TOKEN` environment variable is also supported and is used when no plugin-saved token is present.

For another Profile or to prevent DSH Web from starting, download the script first so its parameters can be passed explicitly:

```powershell
$script = "$env:TEMP\Install-DshPluginInstaller.ps1"
Invoke-WebRequest https://raw.githubusercontent.com/Toukaiteio/dsh-plugin-installer/main/scripts/Install-DshPluginInstaller.ps1 -OutFile $script
& $script -Profile work -NoStart
```

### macOS and Linux installer

On macOS or Linux, download the Bash installer and run it. It follows the same release download, checksum verification, installation, and start flow as the Windows installer:

```bash
curl --fail --location --remote-name https://raw.githubusercontent.com/Toukaiteio/dsh-plugin-installer/main/scripts/install-dsh-plugin-installer.sh
bash ./install-dsh-plugin-installer.sh
```

It requires `bash`, `curl`, and Node.js in addition to DSH. Use `--profile` for another Profile, or `--no-start` to install without starting DSH:

```bash
bash ./install-dsh-plugin-installer.sh --profile work --no-start
```

### Manual installation

Build or download the package archive from the [latest GitHub Release](https://github.com/Toukaiteio/dsh-plugin-installer/releases), then add it to the Web Profile you use:

```bash
dsh plugin --profile web add ./dsh-plugin-installer-<version>.tgz
dsh web
```

For local development only, a source checkout can still be installed directly from a GitHub revision after the repository has been published. The checkout must already contain its built `lib/` directory:

```bash
dsh plugin --profile web add github:Toukaiteio/dsh-plugin-installer#<commit>
dsh web
```

Open **Settings → Plugins → Plugin marketplace** after the Web UI starts.

## How it works

The marketplace treats a GitHub topic as a discovery hint, not as a trust decision. When a user chooses **Install**, the host side:

1. Reads the repository metadata and the latest GitHub Release.
2. Fetches the root `package.json`.
3. Requires a valid `dsh.bundle.patch` declaration.
4. Prefers a version-matching `<package-name>-<version>.tgz` Release asset, verifies its digest when available, and keeps it under `DSH_HOME/plugin-archives/` before installation.
5. If no suitable Release exists, permits a commit-pinned source install only after confirming the package's declared JavaScript entry exists in that exact commit.

The marketplace installs built Release archives when available, so a source repository's `prepare` script is not used in that path. The guarded source fallback remains subject to DSH/pnpm lifecycle-script behavior.

If a repository has neither a usable Release archive nor a verifiable built JavaScript entry, the marketplace refuses the installation and explains why. A source fallback that needs a `prepare` build script requires an explicit per-plugin confirmation.

## Installed plugin management

The marketplace follows the language selected in DSH **Settings → General → Language**. It also formats repository dates in that language.

The **Installed plugins** section is scoped to the selected Profile. On page load, it compares marketplace-installed plugins with the repository's latest Release when one is available, otherwise with the current source commit:

- **Update available** downloads the current verified Release archive.
- **Up to date** means the installed package version matches the latest Release version.
- **Update status unavailable** is shown when neither the Release nor source state can be checked; it never claims an update without a successful comparison.
- **Remove** asks for confirmation, then uses DSH's own `plugin remove` command so the Profile bundle list is reconciled with the package state.

After updating or removing a plugin from the active Web Profile, use **Restart DSH now** to apply the new bundle stack.

## Profile behavior

The Profile controls are designed around DSH's local Web process model:

- **Open Profile** starts the selected Web Profile on a new local port and navigates the browser to it. The current process is left running so a failed switch does not destroy the current session.
- **Create and open** initializes a new Profile with the official Web bundle and this installer, then opens it.
- After installing into the active Web Profile, **Restart DSH now** starts the replacement process first, navigates to its ready URL, and then disposes the old process.

The current DSH preview release has an upstream packaging issue: the npm `@deepseek-ai/dsh-web-app` package may reference `@deepseek-ai/dsh-frontend`, which can be unavailable from the npm registry. When that happens, creating a completely new Web Profile is blocked by the upstream package; existing working Web Profiles are unaffected.

## Development

```bash
pnpm install
pnpm check
pnpm build
pnpm pack
```

Individual commands:

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

The package commits its `lib/` output because DSH can install a plugin directly from a Git repository without running a build step first. Local `.tgz` archives, dependencies, caches, and environment files are excluded by [.gitignore](.gitignore).

## Plugin and Skill authoring

This repository includes [SKILL.md](SKILL.md), a practical workflow skill for using the marketplace and authoring a compatible DSH bundle.

A minimal DSH plugin bundle needs:

1. A root `package.json` with `dsh.bundle.patch`.
2. A `cordis.patch.yml` that inserts the host module.
3. An ESM host module exporting `apply(ctx)`.
4. An optional `dsh.client` declaration and `./client` export for Web UI code.

For a native DSH Skill, create a `SKILL.md` with YAML frontmatter and place it in a directory discovered by DSH, such as `$DSH_HOME/skills/<skill-name>/SKILL.md`. A Skill describes instructions and workflow; a Plugin changes the Harness runtime or UI.

## Security

GitHub topics are not a security review or an endorsement. The installer validates the bundle shape and pins the selected commit, but it cannot audit third-party source code. Review a repository before installing it, especially when it requests an install or build script.

The GitHub API token is read on the server only. It can come from the marketplace settings or the server-side `GITHUB_TOKEN` environment variable; it is never sent back to the browser. The saved token is written under the current `DSH_HOME` and is protected with the current user's profile permissions. Use a token with the minimum permissions needed for public repository metadata.

## Automated builds and releases

GitHub Actions runs the full verification suite on pushes to `main` and on pull requests. It also uploads the generated `.tgz` as a short-lived CI artifact.

Pushing a matching version tag creates a GitHub Release and attaches the package archive:

```bash
git tag v0.1.6
git push origin v0.1.6
```

The release workflow rejects a tag when its version does not match `package.json`.

### Version policy

Stable releases use `MAJOR.MINOR.PATCH` and are tagged and published, for
example `0.1.13` / `v0.1.13`. Iterative local test packages use the next patch
version with a development suffix, such as `0.1.13-dev.1`, then
`0.1.13-dev.2`. This keeps every locally installable package distinct without
creating an unnecessary stable Release for each small change.

Development packages should normally remain local and untagged. If a
pre-release tag is intentionally pushed, the release workflow publishes it as
a GitHub pre-release; the one-click installers still select the latest stable
Release.

## License

[MIT](LICENSE)

## Links

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH plugin topic](https://github.com/topics/dsh-plugin)
- [DSH release documentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [中文文档](README.zh-CN.md)
