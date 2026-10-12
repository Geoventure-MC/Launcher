/**
 * startup-guard — évite la FENÊTRE NOIRE au lancement (pilote graphique / cache GPU corrompu).
 *
 * Un launcher dont le rendu GPU échoue ouvre une fenêtre vide, sans erreur visible. Ici :
 *  - à chaque démarrage on supprime les caches GPU (reconstruits tout seuls, sans risque) ;
 *  - on compte les démarrages qui n'ont PAS atteint l'écran du launcher (`fails`) ; à 2 échecs de suite
 *    on coupe l'accélération matérielle (`gpuOff`) : plus lent mais toujours affiché ;
 *  - un crash du processus GPU ou du rendu coupe aussi l'accélération et relance le launcher une fois.
 * Le compteur retombe à 0 dès que launcher.html a fini de charger. `gpuOff` reste jusqu'à suppression
 * du fichier `startup-guard.json` (dans le dossier de données de l'application).
 * Tout est dans un try/catch : ce garde-fou ne doit jamais empêcher de démarrer.
 */
const fs = require('fs');
const path = require('path');

function stateFile(app) {
    return path.join(app.getPath('userData'), 'startup-guard.json');
}

function read(app) {
    try { return Object.assign({ fails: 0, gpuOff: false }, JSON.parse(fs.readFileSync(stateFile(app), 'utf8'))); }
    catch (e) { return { fails: 0, gpuOff: false }; }
}

function write(app, state) {
    try {
        fs.mkdirSync(app.getPath('userData'), { recursive: true });
        fs.writeFileSync(stateFile(app), JSON.stringify(state));
    } catch (e) { /* jamais bloquant */ }
}

/** À appeler AVANT app.whenReady(). */
function install(app) {
    try {
        const dir = app.getPath('userData');
        for (const name of ['GPUCache', 'DawnCache', 'GrShaderCache', 'ShaderCache']) {
            try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch (e) { /* en cours d'usage : tant pis */ }
        }

        const state = read(app);
        if (state.fails >= 2 && !state.gpuOff) state.gpuOff = true;
        state.fails += 1; // remis à 0 quand l'écran du launcher a chargé
        write(app, state);
        if (state.gpuOff || process.argv.includes('--no-gpu')) {
            app.disableHardwareAcceleration();
            console.warn('[startup-guard] accélération matérielle désactivée');
        }

        let relaunched = false;
        const recover = (why) => {
            console.error('[startup-guard]', why);
            if (relaunched) return;
            const s = read(app);
            if (s.gpuOff) return; // déjà sans GPU : rien de plus à tenter
            relaunched = true;
            write(app, { fails: 0, gpuOff: true });
            app.relaunch();
            app.exit(0);
        };
        app.on('child-process-gone', (e, details) => {
            if (details && details.type === 'GPU' && details.reason !== 'clean-exit') recover('processus GPU arrêté : ' + details.reason);
        });
        app.on('render-process-gone', (e, wc, details) => {
            if (details && details.reason !== 'clean-exit') recover('rendu arrêté : ' + details.reason);
        });
        app.on('web-contents-created', (e, wc) => {
            wc.on('did-finish-load', () => {
                try {
                    if (String(wc.getURL()).includes('launcher.html')) write(app, Object.assign(read(app), { fails: 0 }));
                } catch (err) { /* ignoré */ }
            });
        });
    } catch (e) {
        console.error('[startup-guard]', e && e.message ? e.message : e);
    }
}

module.exports = { install };
