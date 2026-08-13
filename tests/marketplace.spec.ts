import { describe, expect, it } from 'vitest'
import { githubInstallSpec, isProfileName, normalizeCatalogQuery, parseDshBundleManifest, sortCatalog } from '../src/marketplace.js'

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

  it('pins GitHub installs to a commit', () => {
    expect(githubInstallSpec('deepseek-ai', 'deepseek-harness', '47f9438')).toBe('github:deepseek-ai/deepseek-harness#47f9438')
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

  it('sorts by name without mutating the source array', () => {
    expect(sortCatalog(entries, 'name', 'asc').map(entry => entry.fullName)).toEqual(['alpha/plugin', 'beta/plugin', 'gamma/plugin'])
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
