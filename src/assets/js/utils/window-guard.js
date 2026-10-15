/**
 * window-guard — garde de navigation pour TOUTES les fenêtres du launcher (processus principal).
 *
 * Les fenêtres du launcher tournent avec nodeIntegration (le rendu utilise require/ipcRenderer partout,
 * passer à contextIsolation + preload demanderait de réécrire tout le rendu). Le risque principal est
 * donc qu'une page étrangère se charge DANS une fenêtre qui a accès à Node. Ici :
 *  - la fenêtre principale ne peut naviguer que vers les pages locales du launcher (file:// dans le
 *    dossier de l'application) ; un lien http(s) part dans le navigateur, tout le reste est refusé ;
 *  - aucune nouvelle fenêtre n'est jamais ouverte par le rendu (window.open, target=_blank) : les liens
 *    http(s) partent dans le navigateur ;
 *  - les <webview> sont interdites ;
 *  - toute fenêtre créée par un autre chemin (iframe, popup) n'a ni Node ni accès privilégié.
 * shell.openExternal n'est appelé QUE pour http: et https: (jamais file:, smb:, ms-…: ou un chemin UNC).
 */
const path = require('path');
const { pathToFileURL } = require('url');

/** Vrai si `url` est une adresse http(s) valide (seul cas où on l'ouvre dans le navigateur). */
function isSafeExternalUrl(url) {
    try {
        const u = new URL(String(url));
        return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
    } catch (e) {
        return false;
    }
}

/** Ouvre une URL http(s) dans le navigateur ; refuse silencieusement tout autre schéma. */
function openExternalSafe(shell, url) {
    if (!isSafeExternalUrl(url)) {
        console.warn('[window-guard] ouverture externe refusée :', String(url).slice(0, 200));
        return false;
    }
    shell.openExternal(new URL(String(url)).href).catch(() => {});
    return true;
}

/** Vrai si `url` désigne une page locale du launcher (dans le dossier de l'application). */
function isAppPage(url, appPath) {
    try {
        const u = new URL(String(url));
        if (u.protocol !== 'file:') return false;
        const root = pathToFileURL(path.resolve(appPath)).href.replace(/\/?$/, '/');
        const target = u.href.split('#')[0].split('?')[0];
        return target.startsWith(root) && /\.html$/i.test(target);
    } catch (e) {
        return false;
    }
}

function install(app) {
    const { shell } = require('electron');
    app.on('web-contents-created', (_event, contents) => {
        // Aucune <webview> : elle aurait ses propres préférences et pourrait réactiver Node.
        contents.on('will-attach-webview', (e) => e.preventDefault());

        // Jamais de nouvelle fenêtre : un lien externe part dans le navigateur.
        contents.setWindowOpenHandler(({ url }) => {
            openExternalSafe(shell, url);
            return { action: 'deny' };
        });

        // Le cadre principal ne quitte jamais les pages du launcher (lien cliqué dans une annonce,
        // fichier .html glissé sur la fenêtre, redirection depuis une iframe…).
        const guard = (e, url) => {
            if (isAppPage(url, app.getAppPath())) return;
            e.preventDefault();
            if (isSafeExternalUrl(url)) openExternalSafe(shell, url);
            else console.warn('[window-guard] navigation refusée :', String(url).slice(0, 200));
        };
        contents.on('will-navigate', guard);
        contents.on('will-redirect', (e, url, _inPlace, isMainFrame) => { if (isMainFrame !== false) guard(e, url); });

        // Filet : certaines navigations (about:blank…) ne passent pas par will-navigate. Si le cadre
        // principal a quand même quitté les pages du launcher, on recharge la dernière page connue.
        let lastAppUrl = null;
        contents.on('did-navigate', (_e, url) => {
            if (isAppPage(url, app.getAppPath())) { lastAppUrl = url; return; }
            console.warn('[window-guard] page étrangère dans la fenêtre, retour au launcher :', String(url).slice(0, 200));
            if (lastAppUrl) contents.loadURL(lastAppUrl).catch(() => {});
            else contents.stop();
        });
    });
}

module.exports = { install, isSafeExternalUrl, isAppPage, openExternalSafe };
