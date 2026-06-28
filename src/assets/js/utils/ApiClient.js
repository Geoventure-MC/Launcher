/**
 * ApiClient — centralizes all panel API calls to the Geoventure panel.
 * All methods return the parsed JSON payload or throw on non-2xx responses.
 */
import { withInstance } from './instance.js';
const pkg = require('../package.json');
const fetch = require('node-fetch');

const settings_url = localStorage.getItem('geoventure_server_url') ||
    (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);

function base() {
    return settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
}

async function _get(path) {
    const url = withInstance(`${base()}${path}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
}

/**
 * Conditional GET that exposes ETag/304 to the caller (used by the live
 * leaderboard poller). Sends If-None-Match when an etag is provided.
 * Returns { status, notModified, etag, data } — `data` is null on 304/error.
 */
async function _getConditional(path, etag) {
    const url = withInstance(`${base()}${path}`);
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (etag) headers['If-None-Match'] = etag;
    const res = await fetch(url, { headers });
    const newEtag = res.headers.get('etag') || etag || null;
    if (res.status === 304) {
        return { status: 304, notModified: true, etag: newEtag, data: null };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return { status: res.status, notModified: false, etag: newEtag, data: await res.json() };
}

async function _post(path, body) {
    const url = withInstance(`${base()}${path}`);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
}

export const ApiClient = {
    getConfig:        ()       => _get('utils/api'),
    getMods:          ()       => _get('utils/mods'),
    getNotifications: ()       => _get('utils/notifications'),
    getServersStatus: ()       => _get('utils/servers-status'),
    getLeaderboards:  ()       => _get('utils/leaderboards'),
    getLeaderboardsConditional: (etag) => _getConditional('utils/leaderboards', etag),
    getSeasons:       ()       => _get('utils/seasons'),
    getFactions:      ()       => _get('utils/factions'),
    getFiles:         ()       => _get('data'),
    postTelemetry:    (body)   => _post('utils/telemetry', body).catch(() => null),
};

export default ApiClient;
