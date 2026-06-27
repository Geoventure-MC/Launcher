/**
 * achievements.js — local achievement/badge counters + unlock engine.
 *
 * Counters live in localStorage (the launcher IndexedDB uses fixed object
 * stores; localStorage avoids a schema migration and is plenty for a few
 * integers). The server catalog is fetched separately and evaluated against
 * these local counters.
 *
 * Everything here is defensive: a corrupt/absent store never throws, it just
 * resets to sane defaults. Hooking these into the launch flow must never block
 * a launch.
 */
'use strict';

import { withInstance } from './instance.js';
const pkg = require('../package.json');

const COUNTERS_KEY = 'geoventure_achievements_counters';
const UNLOCKED_KEY = 'geoventure_achievements_unlocked';

const settings_url = localStorage.getItem('geoventure_server_url') ||
    (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);

function defaultCounters() {
    return {
        launch_count: 0,
        playtime_minutes: 0,
        instances_tried: [],   // distinct instance slugs ever launched
        first_launch: false,
    };
}

// Read the local counters, tolerating any corruption.
export function getCounters() {
    try {
        const raw = localStorage.getItem(COUNTERS_KEY);
        if (!raw) return defaultCounters();
        const parsed = JSON.parse(raw);
        const def = defaultCounters();
        return {
            launch_count: Number.isFinite(parsed.launch_count) ? parsed.launch_count : def.launch_count,
            playtime_minutes: Number.isFinite(parsed.playtime_minutes) ? parsed.playtime_minutes : def.playtime_minutes,
            instances_tried: Array.isArray(parsed.instances_tried) ? parsed.instances_tried : def.instances_tried,
            first_launch: parsed.first_launch === true,
        };
    } catch {
        return defaultCounters();
    }
}

function saveCounters(counters) {
    try {
        localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));
    } catch {
        // Non-blocking
    }
}

/**
 * Record a successful game launch: bumps launch_count, flags first_launch and
 * tracks the distinct instance slug. Returns the updated counters.
 */
export function recordLaunch(instanceSlug) {
    const c = getCounters();
    c.launch_count += 1;
    c.first_launch = true;
    if (instanceSlug && !c.instances_tried.includes(instanceSlug)) {
        c.instances_tried.push(instanceSlug);
    }
    saveCounters(c);
    return c;
}

/**
 * Accumulate playtime once a session ends. `minutes` is rounded and clamped to
 * a sane range so a bogus clock change can't poison the counter.
 */
export function addPlaytime(minutes) {
    const m = Math.round(Number(minutes));
    if (!Number.isFinite(m) || m <= 0 || m > 1440) return getCounters();
    const c = getCounters();
    c.playtime_minutes += m;
    saveCounters(c);
    return c;
}

// Previously-unlocked achievement codes (so we can detect NEW unlocks).
export function getUnlockedCodes() {
    try {
        const raw = localStorage.getItem(UNLOCKED_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveUnlockedCodes(codes) {
    try {
        localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...new Set(codes)]));
    } catch {
        // Non-blocking
    }
}

/**
 * Fetch the server achievement catalog. Defensive: returns [] on any failure
 * so callers fall back to local-only behaviour.
 */
export async function fetchCatalog() {
    try {
        const base = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
        const res = await fetch(withInstance(`${base}utils/achievements`), {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/**
 * Evaluate one catalog achievement against the local counters.
 * Returns { unlocked, progress, target } — progress/target are null for
 * non-threshold types.
 */
export function evaluate(achievement, counters) {
    const c = counters || getCounters();
    const type = achievement && achievement.condition_type;
    const target = Number(achievement && achievement.condition_value) || 0;

    switch (type) {
        case 'first_launch':
            return { unlocked: c.first_launch === true, progress: null, target: null };
        case 'launch_count':
            return { unlocked: c.launch_count >= target, progress: Math.min(c.launch_count, target), target };
        case 'playtime_hours': {
            const hours = c.playtime_minutes / 60;
            return { unlocked: hours >= target, progress: Math.min(hours, target), target };
        }
        case 'instances_tried': {
            const tried = c.instances_tried.length;
            return { unlocked: tried >= target, progress: Math.min(tried, target), target };
        }
        case 'manual':
        default:
            // Display-only: always shown locked locally (unlocked on the website).
            return { unlocked: false, progress: null, target: null, manual: true };
    }
}

/**
 * Evaluate the whole catalog. Returns:
 *   { items: [{ achievement, unlocked, progress, target, manual }],
 *     totalPoints, newlyUnlocked: [achievement,...] }
 * Persists the unlocked set and reports codes unlocked since last evaluation
 * (manual achievements are never auto-detected as "new").
 */
export function evaluateCatalog(catalog, counters) {
    const c = counters || getCounters();
    const prev = new Set(getUnlockedCodes());
    const items = [];
    const nowUnlocked = [];
    let totalPoints = 0;
    const newlyUnlocked = [];

    for (const a of (Array.isArray(catalog) ? catalog : [])) {
        if (!a || !a.code) continue;
        const ev = evaluate(a, c);
        items.push({ achievement: a, ...ev });
        if (ev.unlocked) {
            nowUnlocked.push(a.code);
            totalPoints += Number(a.points) || 0;
            if (!prev.has(a.code)) newlyUnlocked.push(a);
        }
    }

    saveUnlockedCodes(nowUnlocked);
    return { items, totalPoints, newlyUnlocked };
}

export default {
    getCounters,
    recordLaunch,
    addPlaytime,
    getUnlockedCodes,
    fetchCatalog,
    evaluate,
    evaluateCatalog,
};
