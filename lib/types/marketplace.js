export class UserFacingError extends Error {
    code;
    status;
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
export function isProfileName(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}
export function isRepositorySegment(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_.-]+$/.test(value);
}
/** Extract only the fields that make a root package a DSH bundle. */
export function parseDshBundleManifest(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    const manifest = value;
    const name = manifest.name;
    const dsh = manifest.dsh;
    if (typeof name !== 'string' || name.length === 0 || dsh === null || typeof dsh !== 'object')
        return null;
    const bundle = dsh.bundle;
    const patch = bundle !== null && typeof bundle === 'object' ? bundle.patch : undefined;
    if (typeof patch !== 'string' || patch.length === 0)
        return null;
    const scripts = manifest.scripts;
    const prepare = scripts !== null && typeof scripts === 'object'
        ? scripts.prepare
        : undefined;
    return {
        name,
        version: typeof manifest.version === 'string' ? manifest.version : null,
        description: typeof manifest.description === 'string' ? manifest.description : null,
        patch,
        prepareScript: typeof prepare === 'string' && prepare.trim().length > 0 ? prepare : null,
    };
}
export function githubInstallSpec(owner, repository, sha) {
    if (!isRepositorySegment(owner) || !isRepositorySegment(repository) || !/^[0-9a-f]{7,64}$/i.test(sha)) {
        throw new UserFacingError('invalid-repository', 'GitHub 仓库或提交标识不合法。');
    }
    return `github:${owner}/${repository}#${sha}`;
}
