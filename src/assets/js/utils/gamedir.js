/**
 * gamedir — resolves the per-server game data directory.
 *
 * Backward-compatibility contract:
 *   The DEFAULT server (no `geoventure_server_url` override, or an override
 *   equal to the launcher's default `pkg.settings`) MUST keep using the
 *   historical directory:  <appdata>/.<dataDirectory>  (or <dataDirectory> on
 *   macOS). Existing worlds/mods are never orphaned.
 *
 *   Only OTHER servers get an isolated sub-directory under:
 *       <baseDir>/instances/<slug>
 *   so their mods/saves/config don't collide with the default server.
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

// Is the active instance the default one? (legacy path applies)
//
// Instances now share a single panel URL and are distinguished by their slug
// (geoventure/elandor/pokeland), so isolation keys off the SELECTED INSTANCE,
// not the server URL. The default instance keeps the historical directory so
// existing worlds/mods are never orphaned; every other instance gets its own
// isolated sub-directory with a fully separate modpack.
function isDefaultServer() {
    const selected = getSelectedInstanceId();
    if (!selected) return true;
    const def = getDefaultInstanceId();
    return def ? selected === def : false;
}

/**
 * The active instance's game directory.
 *  - default instance -> <baseDir>                       (backward compatible)
 *  - other instance    -> <baseDir>/instances/<slug>
 */
function getGameDirectory(dataDirectory, config) {
    const base = getBaseDirectory(dataDirectory, config);
    if (isDefaultServer()) return base;

    const slug = slugify(getSelectedInstanceId());
    return path.join(base, 'instances', slug);
}

export { getGameDirectory, getBaseDirectory, isDefaultServer, slugify };
