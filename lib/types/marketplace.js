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
    const main = manifest.main;
    return {
        name,
        version: typeof manifest.version === 'string' ? manifest.version : null,
        description: typeof manifest.description === 'string' ? manifest.description : null,
        patch,
        entry: typeof main === 'string' && isPackageEntryPath(main) ? main : null,
        prepareScript: typeof prepare === 'string' && prepare.trim().length > 0 ? prepare : null,
    };
}
export function githubInstallSpec(owner, repository, sha) {
    if (!isRepositorySegment(owner) || !isRepositorySegment(repository) || !/^[0-9a-f]{7,64}$/i.test(sha)) {
        throw new UserFacingError('invalid-repository', 'GitHub 仓库或提交标识不合法。');
    }
    return `github:${owner}/${repository}#${sha}`;
}
/**
 * Select the package archive for a bundle from a GitHub Release response.
 * The marketplace installs release archives, never an unbuilt source checkout.
 */
export function githubReleaseArchive(packageName, value) {
    if (!isPackageName(packageName) || value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    const release = value;
    const tag = release.tag_name;
    const assets = release.assets;
    if (typeof tag !== 'string' || !isReleaseTag(tag) || !Array.isArray(assets))
        return null;
    const version = tag.startsWith('v') ? tag.slice(1) : tag;
    const archiveStem = packageName.replace(/^@/, '').replace('/', '-');
    const expectedName = `${archiveStem}-${version}.tgz`;
    const candidates = assets.flatMap((value) => {
        if (value === null || typeof value !== 'object' || Array.isArray(value))
            return [];
        const asset = value;
        const name = asset.name;
        const downloadUrl = asset.browser_download_url;
        if (typeof name !== 'string' || typeof downloadUrl !== 'string' || name !== expectedName || !isHttpsUrl(downloadUrl))
            return [];
        const digest = typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest) ? asset.digest.slice('sha256:'.length).toLowerCase() : null;
        const size = typeof asset.size === 'number' && Number.isSafeInteger(asset.size) && asset.size >= 0 ? asset.size : null;
        return [{ tag, version, name, downloadUrl, sha256: digest, size }];
    });
    return candidates.length === 1 ? candidates[0] ?? null : null;
}
function isReleaseTag(value) {
    return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}
function isHttpsUrl(value) {
    try {
        return new URL(value).protocol === 'https:';
    }
    catch {
        return false;
    }
}
function isPackageName(value) {
    return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value);
}
/** Accept only a package-relative JavaScript entry that can be checked in GitHub Contents. */
export function isPackageEntryPath(value) {
    return /^(?:\.\/)?(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.m?js$/.test(value);
}
/** Normalize a catalog query so clients and the host share the same cache key. */
export function normalizeCatalogQuery(query) {
    return query.trim().replace(/\s+/g, ' ').slice(0, 120);
}
/**
 * Return a new catalog sorted by the chosen key without mutating the source.
 * `updated` orders by the repository update timestamp, `name` by the full
 * repository name, and `stars` by the star count.
 */
export function sortCatalog(entries, key, direction) {
    const factor = direction === 'asc' ? 1 : -1;
    return [...entries].sort((a, b) => {
        const compared = key === 'name'
            ? a.fullName.localeCompare(b.fullName, undefined, { numeric: true, sensitivity: 'base' })
            : key === 'stars'
                ? a.stars - b.stars
                : a.updatedAt.localeCompare(b.updatedAt);
        if (compared !== 0)
            return factor * compared;
        return a.fullName.localeCompare(b.fullName, undefined, { numeric: true, sensitivity: 'variant' });
    });
}
