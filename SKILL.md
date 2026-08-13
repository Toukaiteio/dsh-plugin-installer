---
name: dsh-plugin-marketplace
description: Use the DSH Plugin Marketplace tab to discover, inspect, install, and switch DeepSeek Harness plugin profiles safely.
---

# DSH Plugin Marketplace

Use this workflow when a user wants to add a DeepSeek Harness plugin or work in
another DSH Profile.

1. Open **Settings → Plugins → Plugin marketplace** in a running Web Profile.
2. Search the online GitHub list, then select **Review and install** for the
   intended repository.
3. Install only repositories the review panel identifies as a DSH bundle.
   The marketplace verifies a root `package.json` with `dsh.bundle.patch` and
   installs the repository at the resolved commit, rather than an unpinned
   branch.
4. If the review says that a `prepare` script exists, explain that it runs
   third-party code during package installation. Do not enable its build
   permission without the user's explicit confirmation.
5. Choose the destination Profile before installing. To work in another Web
   Profile, choose it in the same tab and select **Open profile**. To start
   clean, enter a name in **New Web profile** and select **Create and open**.

## Authoring a discoverable DSH plugin

For a package to be installable, publish a prebuilt JavaScript bundle and put a
bundle declaration in the root `package.json`:

```json
{
  "type": "module",
  "main": "./lib/index.js",
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }
  }
}
```

Then have `cordis.patch.yml` insert the host module and export `apply(ctx)` in
that module. Add the `dsh-plugin` GitHub topic (and optionally `dsh`) to make
the repository discoverable. Keep generated `lib/` files in a Git-installed
repository so installation does not need a build script.
