/**
 * Ouverture de liens dans le navigateur, côté rendu.
 * Seules les URL http(s) sont transmises à shell.openExternal : jamais file:, smb:, un chemin UNC ou
 * un schéma d'application (ms-…:, steam:…), qui sous Windows passeraient par ShellExecute.
 * Même règle que le garde du processus principal (utils/window-guard.js).
 */
const { shell } = require('electron');

export function isSafeExternalUrl(url) {
    try {
        const u = new URL(String(url));
        return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
    } catch {
        return false;
    }
}

export function openExternal(url) {
    if (!isSafeExternalUrl(url)) {
        console.warn('[external] lien refusé (seuls http et https sont ouverts) :', String(url).slice(0, 200));
        return false;
    }
    shell.openExternal(new URL(String(url)).href).catch(() => {});
    return true;
}
