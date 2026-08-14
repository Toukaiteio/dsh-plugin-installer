import { describe, expect, it } from 'vitest'
import { githubInstallSpec, githubReleaseArchive, githubReleaseArchives, isMarketplacePluginRepository, isPackageEntryPath, isProfileName, isReleaseTag, normalizeCatalogQuery, parseDshBundleManifest, sortCatalog } from '../src/marketplace.js'

describe('DSH bundle manifest validation', () => {
  it('accepts a distributable DSH bundle and reports its install script', () => {
    expect(parseDshBundleManifest({
      name: 'example-plugin',
      version: '1.2.3',
      description: 'Example',
      scripts: { prepare: 'pnpm build' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })).toEqual({
      name: 'example-plugin',
      version: '1.2.3',
      description: 'Example',
      patch: './cordis.patch.yml',
      entry: null,
      prepareScript: 'pnpm build',
    })
  })

  it('rejects topic repositories that do not expose a root bundle', () => {
    expect(parseDshBundleManifest({ name: 'not-a-plugin', dsh: {} })).toBeNull()
    expect(parseDshBundleManifest({ name: 'not-a-plugin', dsh: { bundle: {} } })).toBeNull()
  })
})

describe('input constraints', () => {
  it('uses a safe profile-name subset for filesystem operations', () => {
    expect(isProfileName('work_2026')).toBe(true)
    expect(isProfileName('../outside')).toBe(false)
    expect(isProfileName('')).toBe(false)
  })

  it('accepts only package-relative JavaScript entries for source installs', () => {
    expect(isPackageEntryPath('./lib/index.js')).toBe(true)
    expect(isPackageEntryPath('lib/index.mjs')).toBe(true)
    expect(isPackageEntryPath('../outside.js')).toBe(false)
    expect(isPackageEntryPath('./lib/index.ts')).toBe(false)
  })

  it('pins GitHub installs to a commit', () => {
    expect(githubInstallSpec('deepseek-ai', 'deepseek-harness', '47f9438')).toBe('github:deepseek-ai/deepseek-harness#47f9438')
  })

  it('excludes the DeepSeek Harness host repository from the marketplace', () => {
    expect(isMarketplacePluginRepository('deepseek-ai', 'deepseek-harness')).toBe(false)
    expect(isMarketplacePluginRepository('DeepSeek-AI', 'DeepSeek-Harness')).toBe(false)
    expect(isMarketplacePluginRepository('Toukaiteio', 'dsh-plugin-installer')).toBe(true)
  })

  it('selects only the matching HTTPS release archive', () => {
    expect(githubReleaseArchive('dsh-effort-tweak', {
      tag_name: 'v0.1.0',
      assets: [
        { name: 'dsh-effort-tweak-0.1.0.tgz', browser_download_url: 'https://github.com/example/release.tgz', digest: 'sha256:' + 'a'.repeat(64), size: 1024 },
      ],
    })).toEqual({
      tag: 'v0.1.0',
      version: '0.1.0',
      name: 'dsh-effort-tweak-0.1.0.tgz',
      downloadUrl: 'https://github.com/example/release.tgz',
      sha256: 'a'.repeat(64),
      size: 1024,
      prerelease: false,
    })
    expect(githubReleaseArchive('dsh-effort-tweak', {
      tag_name: 'v0.1.0',
      assets: [{ name: 'dsh-effort-tweak-0.1.0.tgz', browser_download_url: 'http://example/release.tgz' }],
    })).toBeNull()
  })

  it('keeps valid release archives in API order for version selection', () => {
    const releases = githubReleaseArchives('dsh-effort-tweak', [
      { tag_name: 'v0.2.0', assets: [{ name: 'dsh-effort-tweak-0.2.0.tgz', browser_download_url: 'https://example/0.2.0.tgz' }] },
      { tag_name: 'v0.1.0', assets: [{ name: 'dsh-effort-tweak-0.1.0.tgz', browser_download_url: 'https://example/0.1.0.tgz' }] },
      { tag_name: 'draft', assets: [{ name: 'dsh-effort-tweak-draft.tgz', browser_download_url: 'https://example/draft.tgz' }] },
    ])
    expect(releases.map(item => item.tag)).toEqual(['v0.2.0', 'v0.1.0'])
    expect(isReleaseTag('v0.1.0')).toBe(true)
    expect(isReleaseTag('../v0.1.0')).toBe(false)
  })

  it('normalizes catalog queries before using them as cache keys', () => {
    expect(normalizeCatalogQuery('  dsh\n\tplugin  ')).toBe('dsh plugin')
    expect(normalizeCatalogQuery('x'.repeat(121))).toHaveLength(120)
  })
})

describe('catalog sorting', () => {
  const entries = [
    { fullName: 'beta/plugin', stars: 10, updatedAt: '2024-01-01T00:00:00Z' },
    { fullName: 'alpha/plugin', stars: 30, updatedAt: '2024-03-01T00:00:00Z' },
    { fullName: 'gamma/plugin', stars: 20, updatedAt: '2024-02-01T00:00:00Z' },
  ]

  it('sorts by a supported key without mutating the source array', () => {
    expect(sortCatalog(entries, 'updated', 'asc').map(entry => entry.fullName)).toEqual(['beta/plugin', 'gamma/plugin', 'alpha/plugin'])
    expect(entries.map(entry => entry.fullName)).toEqual(['beta/plugin', 'alpha/plugin', 'gamma/plugin'])
  })

  it('sorts by star count in either direction', () => {
    expect(sortCatalog(entries, 'stars', 'desc').map(entry => entry.stars)).toEqual([30, 20, 10])
    expect(sortCatalog(entries, 'stars', 'asc').map(entry => entry.stars)).toEqual([10, 20, 30])
  })

  it('sorts by updated time', () => {
    expect(sortCatalog(entries, 'updated', 'desc').map(entry => entry.updatedAt)).toEqual([
      '2024-03-01T00:00:00Z', '2024-02-01T00:00:00Z', '2024-01-01T00:00:00Z',
    ])
    expect(sortCatalog(entries, 'updated', 'asc').map(entry => entry.updatedAt)).toEqual([
      '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z', '2024-03-01T00:00:00Z',
    ])
  })

  it('uses the repository name as a stable tie-breaker', () => {
    const tied = [
      { fullName: 'zeta/plugin', stars: 10, updatedAt: '2024-01-01T00:00:00Z' },
      { fullName: 'alpha/plugin', stars: 10, updatedAt: '2024-01-01T00:00:00Z' },
    ]
    expect(sortCatalog(tied, 'stars', 'desc').map(entry => entry.fullName)).toEqual(['alpha/plugin', 'zeta/plugin'])
    expect(sortCatalog(tied, 'updated', 'asc').map(entry => entry.fullName)).toEqual(['alpha/plugin', 'zeta/plugin'])
  })
})
