/**
 * diagnostic — rapport de diagnostic en 1 clic (Réglages > Avancé).
 *
 * Les fonctions du haut (redact, tailLines, formatReport) sont PURES et testables depuis Node ;
 * collectDiagnostic() (renderer uniquement) lit le disque et teste le réseau.
 * Tout le rapport passe par redact() AVANT d'être affiché, copié, enregistré ou envoyé :
 * jetons, mots de passe, e-mails, UUID passés en argument, dossier personnel (remplacé par ~).
 */
'use strict';

export const MASK = '[MASQUÉ]';
export const LOG_LINES = 300;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Masque les données sensibles d'un texte.
 * @param {string} text
 * @param {{homes?: string[], secrets?: string[]}} opts  homes : dossiers personnels à remplacer par ~ ; secrets : valeurs exactes à masquer.
 */
export function redact(text, { homes = [], secrets = [] } = {}) {
    let out = String(text == null ? '' : text);

    // 1) Valeurs secrètes connues (jetons des comptes enregistrés), les plus longues d'abord.
    for (const s of [...new Set(secrets.filter(x => typeof x === 'string' && x.length >= 6))].sort((a, b) => b.length - a.length)) {
        out = out.split(s).join(MASK);
    }

    // 2) Dossier personnel -> ~ (formes / et \, insensible à la casse pour Windows).
    const variants = new Set();
    for (const h of homes) {
        if (!h || h.length < 3) continue;
        const clean = h.replace(/[\\/]+$/, '');
        variants.add(clean);
        variants.add(clean.replace(/\\/g, '/'));
        variants.add(clean.replace(/\//g, '\\'));
    }
    for (const v of [...variants].sort((a, b) => b.length - a.length)) {
        out = out.replace(new RegExp(escapeRe(v), 'gi'), '~');
    }
    // Chemins personnels d'un autre utilisateur ou d'une forme non détectée.
    out = out
        .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, '$1<user>')
        .replace(/(\/home\/)[^/\s"']+/g, '$1<user>')
        .replace(/(\/Users\/)[^/\s"']+/g, '$1<user>');

    // 3) Jetons / mots de passe.
    out = out
        .replace(/(--(?:accessToken|session|password|uuid|xuid|clientId|userProperties)\s+)\S+/gi, `$1${MASK}`)
        .replace(/(["']?(?:access[_-]?token|client[_-]?token|refresh[_-]?token|id[_-]?token|token|password|passwd|pwd|mot[_ ]de[_ ]passe|secret|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)(?:Bearer\s+|Basic\s+)?(?:"[^"]*"|'[^']*'|[^\s"',;&}]+)/gi, `$1${MASK}`)
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/g, `$1 ${MASK}`)
        .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, MASK)
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail masqué]')
        .replace(/\b[A-Fa-f0-9]{32,}\b/g, MASK);
    return out;
}

/** Dernières `n` lignes d'un texte. */
export function tailLines(text, n = LOG_LINES) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.slice(-n).join('\n');
}

/** Assemble les sections en un rapport texte. sections : [{title, body}] */
export function formatReport(sections) {
    return sections.map(s => `=== ${s.title} ===\n${s.body}`).join('\n\n') + '\n';
}

/** Dernières lignes d'un fichier (lecture des derniers 256 Ko seulement). null si absent. */
function readTail(file, n = LOG_LINES) {
    const fs = require('fs');
    let fd;
    try {
        const st = fs.statSync(file);
        if (!st.isFile()) return null;
        const size = Math.min(st.size, 262144);
        const buf = Buffer.alloc(size);
        fd = fs.openSync(file, 'r');
        fs.readSync(fd, buf, 0, size, st.size - size);
        return tailLines(buf.toString('utf8'), n);
    } catch { return null; }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* */ } }
}

async function probe(fetch, name, url, method = 'HEAD') {
    const t0 = Date.now();
    try {
        const res = await fetch(url, { method, timeout: 6000, redirect: 'follow' });
        return `${name}: ${res.status < 500 ? 'joignable' : 'ERREUR SERVEUR'} (HTTP ${res.status}, ${Date.now() - t0} ms) ${url}`;
    } catch (e) {
        return `${name}: INJOIGNABLE (${String(e && e.code || e && e.message || e).slice(0, 80)}, ${Date.now() - t0} ms) ${url}`;
    }
}

function detectJava(gameDir, javaPath) {
    const fs = require('fs'), path = require('path'), cp = require('child_process');
    const lines = [];
    if (javaPath) {
        try {
            const r = cp.spawnSync(javaPath, ['-version'], { encoding: 'utf8', timeout: 5000 });
            const txt = String((r.stderr || r.stdout || '')).split('\n')[0] || (r.error ? r.error.message : 'sortie vide');
            lines.push(`Java personnalisé: ${javaPath} -> ${txt.trim()}`);
        } catch (e) { lines.push(`Java personnalisé: ${javaPath} -> illisible (${e.message})`); }
    } else {
        lines.push('Java personnalisé: aucun (le launcher télécharge le sien)');
    }
    try {
        const rt = path.join(gameDir, 'runtime');
        const found = fs.existsSync(rt) ? fs.readdirSync(rt) : [];
        if (!found.length) lines.push('Java téléchargé par le launcher: aucun (pas encore téléchargé)');
        for (const d of found) {
            let ver = '?';
            const cands = [path.join(rt, d, 'release')];
            try { for (const sub of fs.readdirSync(path.join(rt, d))) cands.push(path.join(rt, d, sub, 'release')); } catch { /* */ }
            for (const f of cands) {
                try {
                    const m = /JAVA_VERSION="?([^"\n]+)/.exec(fs.readFileSync(f, 'utf8'));
                    if (m) { ver = m[1]; break; }
                } catch { /* */ }
            }
            lines.push(`Java téléchargé par le launcher: runtime/${d} (version ${ver})`);
        }
    } catch { lines.push('Java téléchargé par le launcher: illisible'); }
    return lines.join('\n');
}

/**
 * Collecte et assemble le rapport (renderer uniquement).
 * @param {object} c { pkg, config, gameDir, settingsUrl, azauthUrl, instance, hw, javaPath, ram, jvmArgs, profile, secrets }
 */
export async function collectDiagnostic(c) {
    const os = require('os'), path = require('path'), fetch = require('node-fetch');
    const hw = c.hw;
    const now = new Date();
    const linux = process.platform === 'linux';
    const sys = [
        `Launcher: ${c.pkg.productName || c.pkg.name} ${c.pkg.version} (env ${c.pkg.env})`,
        `Electron ${process.versions.electron} / Chrome ${process.versions.chrome} / Node ${process.versions.node}`,
        `OS: ${os.type()} ${os.release()} (${process.platform}) ${os.arch()}`,
    ];
    if (linux) {
        const e = process.env;
        sys.push(`Session: ${e.XDG_SESSION_TYPE || 'inconnue'} (WAYLAND_DISPLAY=${e.WAYLAND_DISPLAY ? 'oui' : 'non'}, DISPLAY=${e.DISPLAY ? 'oui' : 'non'}, bureau=${e.XDG_CURRENT_DESKTOP || '?'})`);
    }
    const hardware = [
        `RAM: ${hw.totalGb} Go au total, ${hw.freeGb} Go libres`,
        `CPU: ${hw.cores} coeurs - ${hw.cpuModel}`,
        `GPU: ${hw.gpu || 'inconnu'}`,
    ];
    const config = [
        `Instance active: ${c.instance || '(globale)'}`,
        `Dossier de jeu: ${c.gameDir}`,
        `Loader: ${c.config && c.config.loader ? `${c.config.loader.type} ${c.config.loader.build}` : '?'} / Minecraft ${c.config && c.config.game_version || '?'}`,
        `RAM allouée: ${c.ram ? `${c.ram.ramMin}-${c.ram.ramMax} Go` : 'défaut'}`,
        `Profil de performance: ${c.profile || 'manuel'}`,
        `Arguments JVM: ${(c.jvmArgs || []).join(' ') || '(aucun)'}`,
    ];

    const base = c.settingsUrl.endsWith('/') ? c.settingsUrl : `${c.settingsUrl}/`;
    const net = await Promise.all([
        probe(fetch, 'Panel', `${base}api-schema.json`, 'GET'),
        probe(fetch, 'Azuriom', c.azauthUrl),
        probe(fetch, 'Mojang', 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'),
        probe(fetch, 'Forge', 'https://maven.minecraftforge.net/'),
    ]);

    const logs = path.join(c.gameDir, 'logs');
    const launcherLog = readTail(path.join(logs, 'launcher.log'));
    const latestLog = readTail(path.join(logs, 'latest.log'));

    const raw = formatReport([
        { title: 'Nexus - rapport de diagnostic', body: `Généré le ${now.toISOString()}` },
        { title: 'Système', body: sys.join('\n') },
        { title: 'Matériel', body: hardware.join('\n') },
        { title: 'Java', body: detectJava(c.gameDir, c.javaPath) },
        { title: 'Configuration', body: config.join('\n') },
        { title: 'Réseau', body: net.join('\n') },
        { title: `launcher.log (${LOG_LINES} dernières lignes)`, body: launcherLog || '(absent)' },
        { title: `latest.log (${LOG_LINES} dernières lignes)`, body: latestLog || '(absent)' },
    ]);
    return redact(raw, { homes: [os.homedir(), process.env.HOME, process.env.USERPROFILE].filter(Boolean), secrets: c.secrets || [] });
}
