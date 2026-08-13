import { describe, expect, it } from 'vitest'
import { githubInstallSpec, isProfileName, parseDshBundleManifest } from '../src/marketplace.js'

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
})
