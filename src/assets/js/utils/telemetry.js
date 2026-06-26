/**
 * Opt-in telemetry module.
 * Never sends anything unless the player explicitly consented.
 * Consent stored in localStorage under key 'telemetry_consent'.
 */
'use strict';

import { withInstance } from './instance.js';
const pkg = require('../package.json');
const { version } = pkg;

const CONSENT_KEY = 'telemetry_consent';

function isConsented() {
    return localStorage.getItem(CONSENT_KEY) === 'true';
}

function setConsent(value) {
    localStorage.setItem(CONSENT_KEY, value ? 'true' : 'false');
}

function getPanelUrl() {
    const stored = localStorage.getItem('geoventure_server_url');
    const base = stored || (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);
    return base.endsWith('/') ? base : `${base}/`;
}

async function sendEvent(event, extra = {}) {
    if (!isConsented()) return;

    const panelUrl = getPanelUrl();
    const serverId = localStorage.getItem('geoventure_selected_instance') || 'default';

    const payload = {
        event,
        serverId,
        launcherVersion: version,
        os: `${process.platform}-${process.arch}`,
        ...extra,
    };

    try {
        // Endpoint dédié côté panel : POST {panel}/utils/telemetry
        await fetch(withInstance(`${panelUrl}utils/telemetry`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(payload),
        });
    } catch {
        // Non-blocking — telemetry must never break the app
    }
}

export { isConsented, setConsent, sendEvent };
