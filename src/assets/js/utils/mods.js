/**
 * Règles partagées sur les fichiers de mods (mods optionnels et mods communauté).
 *
 * - Un nom de fichier venu du panel n'est JAMAIS un chemin : pas de / \ .. ni de caractère de contrôle,
 *   et il doit finir en .jar. Sinon `path.join(modsDir, nom)` pourrait écrire ou supprimer un fichier
 *   n'importe où sur le disque (dossier Démarrage de Windows…).
 * - Un mod optionnel désactivé porte le suffixe `-disable` (`foo.jar-disable`), seul suffixe que la
 *   bibliothèque de lancement reconnaît : avec un autre suffixe, la vérification du modpack supprimait
 *   le fichier puis retéléchargeait le mod ACTIF.
 * - La correspondance clé → fichier est EXACTE (clé = nom de fichier, ou nom sans .jar) : un préfixe
 *   (`create`) visait aussi `createaddition-….jar`.
 */
export const DISABLED_SUFFIX = '-disable';

export function safeModFileName(name) {
    if (typeof name !== 'string') return null;
    const n = name.trim();
    if (!n || n.length > 200) return null;
    if (/[\/\\:*?"<>|\x00-\x1f]/.test(n)) return null;
    if (n.includes('..') || n.startsWith('.')) return null;
    if (!/\.jar$/i.test(n)) return null;
    return n;
}

/** Fichier (actif ou désactivé) correspondant à la clé de mod optionnel `mod`, ou null. */
export function findModFile(files, mod) {
    if (typeof mod !== 'string' || !mod) return null;
    const list = Array.isArray(files) ? files : [];
    const base = /\.jar$/i.test(mod) ? mod : `${mod}.jar`;
    const candidates = [base, base + DISABLED_SUFFIX];
    for (const c of candidates) if (list.includes(c)) return c;
    // Ancienne clé sans version (« minimap » pour « minimap-1.2.jar ») : préfixe suivi d'un séparateur
    // seulement, jamais d'une lettre ou d'un chiffre (« create » ne vise pas « createaddition »).
    if (!/\.jar$/i.test(mod)) {
        const re = new RegExp('^' + mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[-_ .][^/\\\\]*\\.jar(' + DISABLED_SUFFIX + ')?$');
        const hit = list.find(f => re.test(f));
        if (hit) return hit;
    }
    return null;
}

/** Chemin cible d'un mod optionnel selon qu'il est activé ou non. */
export function modTargetName(file, enabled) {
    const active = file.endsWith(DISABLED_SUFFIX) ? file.slice(0, -DISABLED_SUFFIX.length) : file;
    return enabled ? active : active + DISABLED_SUFFIX;
}

// Mods communauté installés par le joueur, notés dans launcher_config/ (dossier jamais vérifié) pour être
// ajoutés à la liste `ignored` au lancement : sans cela, la vérification du modpack les supprimait.
// require() paresseux : les règles pures ci-dessus restent chargeables hors Electron (tests Node).
const fs = { get m() { return require('fs'); } };
const path = { get m() { return require('path'); } };
function communityFile(gameDir) {
    return path.m.join(gameDir, 'launcher_config', 'community_mods.json');
}

export function readCommunityMods(gameDir) {
    try {
        const list = JSON.parse(fs.m.readFileSync(communityFile(gameDir), 'utf8'));
        return Array.isArray(list) ? list.map(safeModFileName).filter(Boolean) : [];
    } catch {
        return [];
    }
}

export function recordCommunityMod(gameDir, name, installed) {
    const n = safeModFileName(name);
    if (!n) return;
    const set = new Set(readCommunityMods(gameDir));
    if (installed) set.add(n); else set.delete(n);
    try {
        fs.m.mkdirSync(path.m.dirname(communityFile(gameDir)), { recursive: true });
        fs.m.writeFileSync(communityFile(gameDir), JSON.stringify([...set].sort(), null, 2));
    } catch (e) {
        console.warn('[mods] liste des mods communauté non enregistrée :', e && e.message);
    }
}

/** Chemins relatifs (`mods/<nom>`) des mods communauté installés, pour la liste `ignored`. */
export function communityModPaths(gameDir) {
    return readCommunityMods(gameDir)
        .filter(n => { try { return fs.m.existsSync(path.m.join(gameDir, 'mods', n)); } catch { return false; } })
        .map(n => `mods/${n}`);
}
