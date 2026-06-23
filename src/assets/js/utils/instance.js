/**
 * instance — resolves the currently-selected launcher instance (server) and
 * builds instance-aware panel URLs (?instance=<id>).
 *
 * Backward-compatibility contract:
 *   When no instance is selected (legacy single-server launchers), URLs are
 *   returned unchanged and the panel keeps its historical global behaviour.
 *   When an instance IS selected, every panel call carries ?instance=<id> so
 *   the panel can serve a fully separate modpack / loader / mods per server.
 */

// The slug of the currently-selected instance, or null if none.
export function getSelectedInstance() {
    try {
        return localStorage.getItem('geoventure_selected_instance') || null;
    } catch {
        return null;
    }
}

// Append ?instance=<id> (or &instance=<id>) to a panel URL when an instance is
// selected. No-op otherwise.
export function withInstance(url) {
    const id = getSelectedInstance();
    if (!id) return url;
    const sep = String(url).includes('?') ? '&' : '?';
    return `${url}${sep}instance=${encodeURIComponent(id)}`;
}

export default { getSelectedInstance, withInstance };
