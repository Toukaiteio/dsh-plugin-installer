export interface DshBundleManifest {
  readonly name: string
  readonly version: string | null
  readonly description: string | null
  readonly patch: string
  readonly prepareScript: string | null
}

export interface GitHubRepository {
  readonly id: number
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly description: string | null
  readonly url: string
  readonly defaultBranch: string
  readonly stars: number
  readonly updatedAt: string
  readonly pushedAt: string | null
  readonly topics: readonly string[]
  readonly language: string | null
}

export interface PluginCandidate {
  readonly repository: GitHubRepository
  readonly packageName: string | null
  readonly version: string | null
  readonly description: string | null
  readonly installSpec: string | null
  readonly validBundle: boolean
  readonly reason: string | null
  readonly requiresBuildApproval: boolean
}

export type PluginUpdateStatus = 'available' | 'up-to-date' | 'unknown'

/** A direct, GitHub-backed DSH bundle installed in one Profile. */
export interface InstalledPlugin {
  readonly packageName: string
  readonly repository: string
  readonly owner: string
  readonly repositoryName: string
  readonly installedVersion: string | null
  readonly installedCommit: string | null
  readonly updateStatus: PluginUpdateStatus
}

export interface ProfileSummary {
  readonly name: string
  readonly bundles: readonly string[]
  readonly installedRepositories: readonly string[]
  readonly installedPlugins: readonly InstalledPlugin[]
  readonly webCapable: boolean
}

export class UserFacingError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message)
  }
}

export function isProfileName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)
}

export function isRepositorySegment(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]+$/.test(value)
}

/** Extract only the fields that make a root package a DSH bundle. */
export function parseDshBundleManifest(value: unknown): DshBundleManifest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const manifest = value as Record<string, unknown>
  const name = manifest.name
  const dsh = manifest.dsh
  if (typeof name !== 'string' || name.length === 0 || dsh === null || typeof dsh !== 'object') return null
  const bundle = (dsh as Record<string, unknown>).bundle
  const patch = bundle !== null && typeof bundle === 'object' ? (bundle as Record<string, unknown>).patch : undefined
  if (typeof patch !== 'string' || patch.length === 0) return null
  const scripts = manifest.scripts
  const prepare = scripts !== null && typeof scripts === 'object'
    ? (scripts as Record<string, unknown>).prepare
    : undefined
  return {
    name,
    version: typeof manifest.version === 'string' ? manifest.version : null,
    description: typeof manifest.description === 'string' ? manifest.description : null,
    patch,
    prepareScript: typeof prepare === 'string' && prepare.trim().length > 0 ? prepare : null,
  }
}

export function githubInstallSpec(owner: string, repository: string, sha: string): string {
  if (!isRepositorySegment(owner) || !isRepositorySegment(repository) || !/^[0-9a-f]{7,64}$/i.test(sha)) {
    throw new UserFacingError('invalid-repository', 'GitHub 仓库或提交标识不合法。')
  }
  return `github:${owner}/${repository}#${sha}`
}
