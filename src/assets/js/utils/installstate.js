/**
 * installstate — VRAIE détection de l'état d'installation de chaque instance.
 *
 * États : 'not_installed' | 'incomplete' | 'update_required' | 'installed'
 *
 * Règles (lecture seule, aucun hash — présence + taille suffisent) :
 *  - "moteur" du jeu (ce que minecraft-java-core écrit) =
 *      versions/<mc>/<mc>.json  (ou n'importe quel versions/*\/*.json si la
 *      version attendue est inconnue)
 *      + libraries/ non vide
 *      + si un loader est activé : un dossier versions/* dont le nom contient le
 *        type (forge/neoforge/fabric/quilt) avec son .json, ou loader/<type>/ non vide.
 *  - "modpack" = fichiers du manifeste {settings}/data?instance=<slug>
 *      (présence + taille identique à `size`).
 *  Décision (manifeste disponible) :
 *    rien sur le disque                                  -> not_installed
 *    moteur incomplet (mais quelque chose existe)        -> incomplete
 *    moteur ok, AUCUN fichier du modpack                 -> incomplete
 *    moteur ok, fichiers manquants/de taille différente
 *      ou build du loader différent de l'attendu         -> update_required
 *    sinon                                               -> installed
 *  Hors-ligne (manifeste injoignable) : disque seul, `offline: true` :
 *    rien -> not_installed ; moteur ok + mods/ non vide -> installed ; sinon incomplete.
 */
'use strict';

const fs = typeof require === 'function' ? require('fs') : null;
const path = typeof require === 'function' ? require('path') : null;

const LOADER_TYPES = ['neoforge', 'forge', 'fabric', 'quilt'];
const CACHE_TTL = 30000;
const cache = new Map(); // slug -> { at, result }
const inflight = new Map();

async function dirEntries(dir) {
    try { return await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return null; }
}

async function exists(p) {
    try { await fs.promises.access(p); return true; } catch { return false; }
}

async function nonEmptyDir(dir) {
    const e = await dirEntries(dir);
    return !!(e && e.length);
}

// Inspecte versions/, libraries/, loader/ et renvoie ce qui est présent.
async function inspectEngine(gameDir, expected) {
    const exp = expected || {};
    const mc = exp.version ? String(exp.version) : null;
    const loader = exp.loader && exp.loader.enable && exp.loader.type ? exp.loader : null;
    const loaderType = loader ? String(loader.type).toLowerCase() : null;

    const versionDirs = [];
    const vEntries = await dirEntries(path.join(gameDir, 'versions'));
    if (vEntries) {
        for (const d of vEntries) {
            if (!d.isDirectory()) continue;
            if (await exists(path.join(gameDir, 'versions', d.name, `${d.name}.json`))) versionDirs.push(d.name);
        }
    }

    const versionOk = mc ? versionDirs.includes(mc) : versionDirs.length > 0;
    const librariesOk = await nonEmptyDir(path.join(gameDir, 'libraries'));

    let loaderOk = true;
    let loaderOutdated = false;
    if (loaderType) {
        const names = versionDirs.filter(n => n.toLowerCase().includes(loaderType));
        const loaderDirOk = await nonEmptyDir(path.join(gameDir, 'loader', loaderType));
        loaderOk = names.length > 0 || loaderDirOk;
        // Build attendu (ex. "1.20.1-47.4.20" -> "47.4.20") absent des versions présentes ?
        const build = loader.build ? String(loader.build).split('-').pop() : '';
        if (loaderOk && names.length > 0 && build && !names.some(n => n.includes(build))) {
            loaderOutdated = true;
        }
    }

    const any = versionDirs.length > 0 || librariesOk;
    return { versionOk, librariesOk, loaderOk, loaderOutdated, any, ok: versionOk && librariesOk && loaderOk };
}

// Compare le manifeste au disque (présence + taille), concurrence limitée.
async function checkModpack(gameDir, manifest) {
    const entries = manifest.filter(e => e && typeof e.path === 'string' && e.path);
    let present = 0, missing = 0, mismatched = 0;
    let i = 0;
    const worker = async () => {
        while (i < entries.length) {
            const entry = entries[i++];
            const filePath = path.join(gameDir, entry.path);
            if (filePath !== gameDir && !filePath.startsWith(gameDir + path.sep)) continue; // anti path-traversal
            try {
                const st = await fs.promises.stat(filePath);
                if (!st.isFile()) { missing++; continue; }
                if (entry.size != null && st.size !== Number(entry.size)) mismatched++;
                else present++;
            } catch {
                missing++;
            }
        }
    };
    await Promise.all(Array.from({ length: 48 }, worker));
    return { total: present + missing + mismatched, present, missing, mismatched };
}

/**
 * @param {string} gameDir  dossier de jeu de l'instance
 * @param {Array|null} manifest  manifeste /data (null = injoignable)
 * @param {object|null} expected { version, loader:{type,build,enable} } (optionnel)
 */
export async function detectInstallState(gameDir, manifest, expected) {
    const base = { state: 'not_installed', offline: !Array.isArray(manifest), total: 0, present: 0, missing: 0, mismatched: 0 };
    if (!gameDir || !(await exists(gameDir))) return base;

    const engine = await inspectEngine(gameDir, expected);
    base.engine = engine;

    if (Array.isArray(manifest)) {
        const mp = manifest.length ? await checkModpack(gameDir, manifest) : { total: 0, present: 0, missing: 0, mismatched: 0 };
        Object.assign(base, mp);
        const touched = mp.present + mp.mismatched;
        if (!engine.any && touched === 0) return base;
        if (!engine.ok) { base.state = 'incomplete'; return base; }
        if (mp.total > 0 && touched === 0) { base.state = 'incomplete'; return base; }
        base.state = (mp.missing + mp.mismatched > 0 || engine.loaderOutdated) ? 'update_required' : 'installed';
        return base;
    }

    // Hors-ligne : disque seul.
    const modsDir = await dirEntries(path.join(gameDir, 'mods'));
    const hasMods = !!(modsDir && modsDir.some(d => d.isFile()));
    if (!engine.any && !hasMods) return base;
    base.state = (engine.ok && hasMods) ? 'installed' : 'incomplete';
    return base;
}

async function fetchJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/**
 * Détection complète d'une instance (réseau + disque), avec cache mémoire court.
 * Ne lève jamais : toute erreur réseau => état déduit du disque (offline: true).
 * @param {{slug:string, gameDir:string, settingsUrl:string, env?:string}} p
 */
export function getInstallState(p, { force = false } = {}) {
    const hit = cache.get(p.slug);
    if (!force && hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.result);
    if (inflight.has(p.slug)) return inflight.get(p.slug);

    const run = (async () => {
        const base = String(p.settingsUrl || '').endsWith('/') ? p.settingsUrl : `${p.settingsUrl}/`;
        const q = `instance=${encodeURIComponent(p.slug)}`;
        const manifestUrl = p.env === 'azuriom' ? `${base}api/centralcorp/files?${q}` : `${base}data?${q}`;
        const cfgUrl = p.env === 'azuriom' ? `${base}api/centralcorp/options?${q}` : `${base}utils/api?${q}`;

        let manifest = null;
        let expected = null;
        try {
            const m = await fetchJson(manifestUrl);
            if (Array.isArray(m)) manifest = m;
        } catch { /* hors-ligne */ }
        if (manifest) {
            try {
                const c = await fetchJson(cfgUrl);
                expected = { version: c.game_version, loader: c.loader };
            } catch { /* config inconnue : règles génériques */ }
        }

        let result;
        try {
            result = await detectInstallState(p.gameDir, manifest, expected);
        } catch (err) {
            result = { state: 'not_installed', offline: manifest === null, error: String(err) };
        }
        cache.set(p.slug, { at: Date.now(), result });
        return result;
    })().finally(() => inflight.delete(p.slug));

    inflight.set(p.slug, run);
    return run;
}

export function invalidateInstallState(slug) {
    if (slug) cache.delete(slug); else cache.clear();
}

export default { detectInstallState, getInstallState, invalidateInstallState };
