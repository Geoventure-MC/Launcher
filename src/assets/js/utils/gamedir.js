/**
 * gamedir — resolves the per-server and per-channel ('stable' | 'test') game data directory.
 *
 * Backward-compatibility contract:
 *   The DEFAULT server on the 'stable' channel MUST keep using the
 *   historical directory:  <appdata>/.<dataDirectory>  (or <dataDirectory> on
 *   macOS). Existing worlds/mods are never orphaned.
 *
 *   Other servers — or any server on the 'test' channel — get an isolated
 *   sub-directory under:
 *       <baseDir>/instances/<slug>          (stable)
 *       <baseDir>/instances/<slug>-test     (test)
 *   so their mods/saves/config never collide with the stable default server.
 */
const path = require('path');
const pkg = require('../package.json');

// Slugify an arbitrary server id / name / url into a safe folder name.
function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'server';
}

// The historical base directory shared by the default server.
function getBaseDirectory(dataDirectory, config) {
    const folder = process.platform === 'darwin'
        ? config.dataDirectory
        : `.${config.dataDirectory}`;
    return path.join(dataDirectory, folder);
}

// The id of the first/default instance (its modpack keeps the legacy path).
function getDefaultInstanceId() {
    if (Array.isArray(pkg.servers) && pkg.servers.length) {
        return pkg.servers[0].id || null;
    }
    return null;
}

// The currently-selected instance id (from the instance picker), or null.
function getSelectedInstanceId() {
    return localStorage.getItem('geoventure_selected_instance') || null;
}

function getSelectedChannel() {
    try {
        return localStorage.getItem('geoventure_selected_channel') === 'test' ? 'test' : 'stable';
    } catch {
        return 'stable';
    }
}

// Is the active instance the default one on the stable channel? (legacy path applies)
function isDefaultServer() {
    if (getSelectedChannel() === 'test') return false;
    const selected = getSelectedInstanceId();
    if (!selected) return true;
    const def = getDefaultInstanceId();
    return def ? selected === def : false;
}

/**
 * The active instance's game directory.
 *  - default instance (stable) -> <baseDir>                       (backward compatible)
 *  - other instance (stable)   -> <baseDir>/instances/<slug>
 *  - any instance (test)       -> <baseDir>/instances/<slug>-test
 */
function getGameDirectory(dataDirectory, config) {
    const base = getBaseDirectory(dataDirectory, config);
    if (isDefaultServer()) return base;

    const rawId = getSelectedInstanceId() || getDefaultInstanceId() || 'geoventure';
    const slug = slugify(rawId);
    const folder = getSelectedChannel() === 'test' ? `${slug}-test` : slug;
    return path.join(base, 'instances', folder);
}

/**
 * Game directory of a GIVEN instance slug (not necessarily the selected one).
 * Same rules as getGameDirectory: default instance on stable -> legacy base dir.
 */
function getGameDirectoryFor(slug, dataDirectory, config, channel = null) {
    const base = getBaseDirectory(dataDirectory, config);
    const def = getDefaultInstanceId();
    const activeChannel = channel || getSelectedChannel();
    if (activeChannel !== 'test' && (!slug || (def && slug === def))) return base;
    const clean = slugify(slug || def || 'geoventure');
    const folder = activeChannel === 'test' ? `${clean}-test` : clean;
    return path.join(base, 'instances', folder);
}

export { getGameDirectoryFor, getGameDirectory, getBaseDirectory, isDefaultServer, slugify };
