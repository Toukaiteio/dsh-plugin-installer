export interface DshBundleManifest {
    readonly name: string;
    readonly version: string | null;
    readonly description: string | null;
    readonly patch: string;
    readonly entry: string | null;
    readonly prepareScript: string | null;
}
export interface GitHubRepository {
    readonly id: number;
    readonly fullName: string;
    readonly name: string;
    readonly owner: string;
    readonly description: string | null;
    readonly url: string;
    readonly defaultBranch: string;
    readonly stars: number;
    readonly updatedAt: string;
    readonly pushedAt: string | null;
    readonly topics: readonly string[];
    readonly language: string | null;
}
export interface PluginCandidate {
    readonly repository: GitHubRepository;
    readonly packageName: string | null;
    readonly version: string | null;
    readonly description: string | null;
    readonly installSpec: string | null;
    readonly release: GitHubReleaseArchive | null;
    readonly releases: readonly GitHubReleaseArchive[];
    readonly installSource: PluginInstallSource | null;
    readonly validBundle: boolean;
    readonly reason: string | null;
    readonly requiresBuildApproval: boolean;
}
export type PluginInstallSource = 'release' | 'source';
/** A verified package archive attached to the repository's latest GitHub Release. */
export interface GitHubReleaseArchive {
    readonly tag: string;
    readonly version: string | null;
    readonly name: string;
    readonly downloadUrl: string;
    readonly sha256: string | null;
    readonly size: number | null;
    readonly prerelease: boolean;
}
export type PluginUpdateStatus = 'available' | 'up-to-date' | 'unknown';
/** A direct, GitHub-backed DSH bundle installed in one Profile. */
export interface InstalledPlugin {
    readonly packageName: string;
    readonly repository: string;
    readonly owner: string;
    readonly repositoryName: string;
    readonly installedVersion: string | null;
    readonly installedCommit: string | null;
    readonly updateStatus: PluginUpdateStatus;
}
export interface ProfileSummary {
    readonly name: string;
    readonly bundles: readonly string[];
    readonly installedRepositories: readonly string[];
    readonly installedPlugins: readonly InstalledPlugin[];
    readonly webCapable: boolean;
}
export declare class UserFacingError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status?: number);
}
export declare function isProfileName(value: unknown): value is string;
export declare function isRepositorySegment(value: unknown): value is string;
/** Extract only the fields that make a root package a DSH bundle. */
export declare function parseDshBundleManifest(value: unknown): DshBundleManifest | null;
export declare function githubInstallSpec(owner: string, repository: string, sha: string): string;
/**
 * Select the package archive for a bundle from a GitHub Release response.
 * The marketplace installs release archives, never an unbuilt source checkout.
 */
export declare function githubReleaseArchive(packageName: string, value: unknown): GitHubReleaseArchive | null;
/** Preserve GitHub's release order while retaining only installable package archives. */
export declare function githubReleaseArchives(packageName: string, value: unknown): GitHubReleaseArchive[];
export declare function isReleaseTag(value: string): boolean;
/** Accept only a package-relative JavaScript entry that can be checked in GitHub Contents. */
export declare function isPackageEntryPath(value: string): boolean;
/** Normalize a catalog query so clients and the host share the same cache key. */
export declare function normalizeCatalogQuery(query: string): string;
/** Catalog sort keys offered by the marketplace UI. */
export type CatalogSortKey = 'updated' | 'name' | 'stars';
/** Catalog sort direction offered by the marketplace UI. */
export type CatalogSortDirection = 'asc' | 'desc';
/** Structural shape required to sort a marketplace catalog entry. */
export interface CatalogSortEntry {
    readonly fullName: string;
    readonly stars: number;
    readonly updatedAt: string;
}
/**
 * Return a new catalog sorted by the chosen key without mutating the source.
 * `updated` orders by the repository update timestamp, `name` by the full
 * repository name, and `stars` by the star count.
 */
export declare function sortCatalog<T extends CatalogSortEntry>(entries: readonly T[], key: CatalogSortKey, direction: CatalogSortDirection): T[];
//# sourceMappingURL=marketplace.d.ts.map