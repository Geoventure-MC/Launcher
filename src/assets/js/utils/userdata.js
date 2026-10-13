/**
 * userdata — ce que le launcher ne doit JAMAIS écraser ni supprimer dans le dossier de jeu.
 *
 * Avec `verify` actif, la bibliothèque de lancement (a) re-télécharge tout fichier du modpack dont
 * l'empreinte diffère et (b) SUPPRIME tout fichier du dossier de jeu qui n'est ni dans le modpack
 * ni dans la liste `ignored`. Résultat observé : à chaque mise à jour d'un mod, les touches, la
 * langue, l'interface (options.txt, config/…) repartaient à zéro. Cette liste les protège :
 *   - les réglages du joueur (options*.txt, serveurs, packs de ressources, shaders, captures, mondes) ;
 *   - TOUT fichier déjà présent dans config/ (réglages des mods, disposition du HUD…) : un fichier de
 *     config absent est quand même téléchargé, mais un fichier existant n'est plus jamais remplacé.
 * Les chemins sont relatifs au dossier de jeu, avec des « / » (format attendu par la bibliothèque).
 */
const fs = require('fs');
const path = require('path');

const USER_FILES = [
    'options.txt', 'optionsof.txt', 'optionsshaders.txt', 'servers.dat', 'servers.dat_old',
    'usercache.json', 'realms_persistence.json', 'hotbar.nbt',
];
const USER_DIRS = [
    'saves', 'screenshots', 'resourcepacks', 'shaderpacks', 'logs', 'crash-reports', 'schematics',
    'journeymap', 'xaero', 'XaeroWorldMap', 'XaeroWaypoints', 'backups', 'replay_recordings',
];

function walk(dir, base, out, depth = 0) {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, base, out, depth + 1);
        else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
}

/** Liste à passer dans `ignored` au lancement. */
function userKeepList(gameDir) {
    const list = [...USER_FILES, ...USER_DIRS];
    walk(path.join(gameDir, 'config'), gameDir, list);
    return list;
}

/** Ce fichier du manifeste est-il à l'utilisateur (réparation 1 clic : on n'y touche pas) ? */
function isUserPath(rel) {
    const p = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    if (USER_FILES.includes(p)) return true;
    if (p.startsWith('config/')) return true;
    return USER_DIRS.some(d => p === d || p.startsWith(d + '/'));
}

export { userKeepList, isUserPath };
