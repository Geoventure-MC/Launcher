/**
 * forgeconfig — réglages Forge posés par le launcher avant chaque lancement.
 *
 * Forge ouvre, avant même Minecraft, une « fenêtre de chargement précoce » (logo
 * Mojang Studios + barres de chargement des mods). Elle ne se personnalise pas :
 * on la désactive (`earlyWindowControl = false` dans config/fml.toml), ce qui laisse
 * la main à l'écran de chargement Geoventure du mod GeoMods, dessiné dès le premier
 * instant. Si le fichier existe déjà, seules les lignes concernées sont modifiées.
 */
const fs = require('fs');
const path = require('path');

const WANTED = { earlyWindowControl: 'false' };

function applyForgeWindowSettings(gameDir) {
    try {
        const dir = path.join(gameDir, 'config');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'fml.toml');
        let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        let changed = false;
        for (const [key, value] of Object.entries(WANTED)) {
            const re = new RegExp(`^(\\s*${key}\\s*=\\s*).*$`, 'm');
            if (re.test(text)) {
                const next = text.replace(re, `$1${value}`);
                if (next !== text) { text = next; changed = true; }
            } else {
                text += (text && !text.endsWith('\n') ? '\n' : '') + `${key} = ${value}\n`;
                changed = true;
            }
        }
        if (changed) fs.writeFileSync(file, text);
    } catch (e) {
        // Jamais bloquant : au pire la fenêtre Forge s'affiche comme avant.
        console.warn('[forgeconfig]', e && e.message ? e.message : e);
    }
}

export { applyForgeWindowSettings };
