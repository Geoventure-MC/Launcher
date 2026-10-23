/**
 * instance — resolves the currently-selected launcher instance (server) and
 * channel ('stable' | 'test'), checks Azuriom role/grade permissions, and
 * builds instance-aware panel URLs (?instance=<id>[&channel=test]).
 *
 * Backward-compatibility contract:
 *   When no instance is selected (legacy single-server launchers), URLs are
 *   returned unchanged and the panel keeps its historical global behaviour.
 *   When an instance IS selected on the default 'stable' channel, every panel
 *   call carries ?instance=<id>. When the 'test' channel is active, calls carry
 *   channel=test as well so the panel serves the test modpack and test server.
 */

export const DEFAULT_TEST_ROLES = [
    'Admin',
    'Administrateur',
    'Fondateur',
    'Développeur',
    'Dev',
    'Modérateur',
    'Modo',
    'Staff',
    'Testeur',
    'Beta',
    'Bêta-Testeur',
];

// The slug of the currently-selected instance, or null if none.
export function getSelectedInstance() {
    try {
        return localStorage.getItem('geoventure_selected_instance') || null;
    } catch {
        return null;
    }
}

// The active channel ('stable' or 'test'). Defaults to 'stable'.
export function getSelectedChannel() {
    try {
        const ch = localStorage.getItem('geoventure_selected_channel');
        return ch === 'test' ? 'test' : 'stable';
    } catch {
        return 'stable';
    }
}

// Persist the active channel ('stable' or 'test').
export function setSelectedChannel(channel) {
    try {
        const normalized = channel === 'test' ? 'test' : 'stable';
        localStorage.setItem('geoventure_selected_channel', normalized);
        return normalized;
    } catch {
        return 'stable';
    }
}

// Extract the Azuriom role/grade name from a stored launcher account.
export function getAccountRoleName(account) {
    if (!account || !account.user_info || !account.user_info.role) return null;
    const role = account.user_info.role;
    if (typeof role === 'string') return role.trim() || null;
    if (typeof role.name === 'string') return role.name.trim() || null;
    return null;
}

export function isAccountAdmin(account) {
    return !!(account && account.user_info && account.user_info.role && account.user_info.role.is_admin === true);
}

// Return the list of Azuriom grades allowed for a given channel ('stable' | 'test').
export function getChannelRoles(channel, config, serverId = null) {
    const targetId = serverId || getSelectedInstance();
    const cfgServers = Array.isArray(config?.servers) ? config.servers : [];
    const srv = targetId ? cfgServers.find(s => String(s.id) === String(targetId)) : null;

    if (channel === 'test') {
        if (Array.isArray(srv?.test_roles) && srv.test_roles.length) return srv.test_roles;
        if (Array.isArray(config?.test_roles) && config.test_roles.length) return config.test_roles;
        return DEFAULT_TEST_ROLES;
    }

    if (Array.isArray(srv?.allowed_roles) && srv.allowed_roles.length) return srv.allowed_roles;
    if (Array.isArray(config?.allowed_roles) && config.allowed_roles.length) return config.allowed_roles;
    return [];
}

function roleMatchesList(roleName, list) {
    if (!roleName || !Array.isArray(list) || !list.length) return false;
    const norm = String(roleName).trim().toLowerCase();
    return list.some(r => String(r || '').trim().toLowerCase() === norm);
}

/**
 * Determine whether a player account (with its Azuriom grade) can access the
 * requested channel ('stable' or 'test') on a given instance.
 */
export function canAccessChannel(channel, account, config = {}, serverId = null) {
    const ch = channel === 'test' ? 'test' : 'stable';
    const roles = getChannelRoles(ch, config, serverId);

    // Without an authenticated account:
    // - 'stable' is selectable so the user can reach the login panel (unless restricted later at launch)
    // - 'test' requires an authenticated Azuriom account with an allowed grade
    if (!account) {
        return ch === 'stable';
    }

    // Explicit Azuriom admin flag or username whitelist always grants access
    if (isAccountAdmin(account)) return true;
    if (Array.isArray(config?.whitelist) && account.name && config.whitelist.includes(account.name)) {
        return true;
    }

    const roleName = getAccountRoleName(account);

    if (ch === 'stable') {
        if (config?.whitelist_activate) {
            const wlRoles = Array.isArray(config.whitelist_roles) ? config.whitelist_roles : [];
            if (!roleMatchesList(roleName, wlRoles)) return false;
        }
        // Empty allowed_roles on stable = open to all Azuriom grades
        if (!roles.length) return true;
        return roleMatchesList(roleName, roles);
    }

    // 'test' channel: requires the player's Azuriom grade to be in test_roles
    if (!roles.length) return true;
    return roleMatchesList(roleName, roles);
}

// Append ?instance=<id> (and &channel=test when on the test channel) to a panel URL.
export function withInstance(url) {
    const id = getSelectedInstance();
    const ch = getSelectedChannel();
    let result = String(url);
    if (id) {
        const sep = result.includes('?') ? '&' : '?';
        result = `${result}${sep}instance=${encodeURIComponent(id)}`;
    }
    if (ch === 'test') {
        const sep = result.includes('?') ? '&' : '?';
        result = `${result}${sep}channel=test`;
    }
    return result;
}

export default {
    DEFAULT_TEST_ROLES,
    getSelectedInstance,
    getSelectedChannel,
    setSelectedChannel,
    getAccountRoleName,
    isAccountAdmin,
    getChannelRoles,
    canAccessChannel,
    withInstance,
};
