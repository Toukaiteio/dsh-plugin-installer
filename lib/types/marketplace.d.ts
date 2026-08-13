export interface DshBundleManifest {
    readonly name: string;
    readonly version: string | null;
    readonly description: string | null;
    readonly patch: string;
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
    readonly validBundle: boolean;
    readonly reason: string | null;
    readonly requiresBuildApproval: boolean;
}
export interface ProfileSummary {
    readonly name: string;
    readonly bundles: readonly string[];
    readonly installedRepositories: readonly string[];
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
//# sourceMappingURL=marketplace.d.ts.map