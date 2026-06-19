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

// Is the currently-active server the default one? (legacy path applies)
function isDefaultServer() {
    const active = localStorage.getItem('geoventure_server_url');
    if (!active) return true;
    const norm = (u) => String(u || '').replace(/\/+$/, '');
    return norm(active) === norm(pkg.settings);
}

// Find the active server entry in pkg.servers (by its settings url).
function getActiveServer() {
    const active = localStorage.getItem('geoventure_server_url');
    if (!active || !Array.isArray(pkg.servers)) return null;
    const norm = (u) => String(u || '').replace(/\/+$/, '');
    return pkg.servers.find(s => norm(s.settings) === norm(active)) || null;
}

/**
 * The active server's game directory.
 *  - default server  -> <baseDir>            (unchanged, backward compatible)
 *  - other server     -> <baseDir>/instances/<slug>
 */
function getGameDirectory(dataDirectory, config) {
    const base = getBaseDirectory(dataDirectory, config);
    if (isDefaultServer()) return base;

    const server = getActiveServer();
    const slug = slugify(server ? (server.id || server.name || server.settings)
                                : localStorage.getItem('geoventure_server_url'));
    return path.join(base, 'instances', slug);
}

export { getGameDirectory, getBaseDirectory, isDefaultServer, slugify };
