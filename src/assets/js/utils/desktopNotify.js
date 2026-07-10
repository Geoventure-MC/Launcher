'use strict';

/**
 * Notifications de bureau (opt-in, désactivées par défaut) : petites alertes
 * système via l'API HTML5 Notification (supportée nativement par Electron).
 * Throttle : au plus 1 notification par type toutes les 5 minutes, pour ne
 * jamais spammer le bureau. Tout est best-effort — aucune erreur ne remonte.
 */

const ENABLED_KEY = 'desktop_notifications';
const THROTTLE_KEY_PREFIX = 'desktop_notif_last_';
const THROTTLE_MS = 5 * 60 * 1000;
const SEEN_KEY = 'desktop_notif_seen_ids';

export function isEnabled() {
    try {
        return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
        return false;
    }
}

export function setEnabled(on) {
    try {
        localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
        // Demande la permission système au moment de l'activation.
        if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { });
        }
    } catch { /* stockage indisponible : non bloquant */ }
}

/**
 * Émet une notification système si la feature est activée et que le type
 * n'a pas déjà notifié dans les 5 dernières minutes.
 * @param {string} type  canal de throttle (ex. 'announce', 'server-online')
 */
export function notify(type, title, body) {
    try {
        if (!isEnabled() || typeof Notification === 'undefined') return;
        if (Notification.permission === 'denied') return;

        const key = THROTTLE_KEY_PREFIX + type;
        const last = Number(localStorage.getItem(key) || 0);
        if (Date.now() - last < THROTTLE_MS) return;
        localStorage.setItem(key, String(Date.now()));

        const fire = () => new Notification(title, { body: body || '', silent: false });
        if (Notification.permission === 'granted') fire();
        else Notification.requestPermission().then(p => { if (p === 'granted') fire(); }).catch(() => { });
    } catch { /* jamais bloquant */ }
}

/** True si cet id d'annonce n'a jamais été vu (et le marque comme vu). */
export function markSeen(id) {
    try {
        const raw = localStorage.getItem(SEEN_KEY);
        const seen = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(seen)) return true;
        if (seen.includes(id)) return false;
        seen.push(id);
        // Garde une fenêtre raisonnable (200 dernières annonces).
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-200)));
        return true;
    } catch {
        return false;
    }
}
