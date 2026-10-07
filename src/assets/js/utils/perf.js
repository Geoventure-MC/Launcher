/**
 * perf — profils de performance (Économique / Équilibré / Performant).
 *
 * Module PUR (aucun accès à Electron, au disque ni au DOM) : testable depuis Node.
 *
 * Garde-fous :
 *  - jamais plus de 60 % de la RAM totale pour le jeu ;
 *  - le modpack a besoin d'au moins 3 Go : si 60 % de la RAM n'atteint pas 3 Go,
 *    AUCUN profil n'est appliqué (`insufficient`), on avertit l'utilisateur ;
 *  - arguments JVM pour Java 17 uniquement (pas de -XX:+ZGenerational, qui n'existe qu'en Java 21 et
 *    empêcherait la JVM de démarrer). -Xms/-Xmx ne sont JAMAIS dans les arguments : ils viennent des curseurs RAM.
 */
'use strict';

const GIB = 1073741824;
export const MAX_RAM_SHARE = 0.6;
export const MODPACK_MIN_GB = 3;
export const PROFILE_IDS = ['eco', 'balanced', 'performance'];

const G1_BASE = ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+DisableExplicitGC'];
const G1_TUNED = [
    '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=130', '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15', '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:SurvivorRatio=32',
    '-XX:MaxTenuringThreshold=1',
];
const ZGC = ['-XX:+UseZGC', '-XX:+DisableExplicitGC'];

// Cibles de RAM (Go) et distance de rendu conseillée (information seulement : jamais écrite dans options.txt).
const PROFILES = {
    eco:         { targetMax: 4, targetMin: 2, renderDistance: 8 },
    balanced:    { targetMax: 6, targetMin: 3, renderDistance: 12 },
    performance: { targetMax: 8, targetMin: 4, renderDistance: 16 },
};

export function toGb(bytes) { return Math.trunc(bytes / GIB * 10) / 10; }

/** Plafond de RAM autorisé (Go entiers, 60 % de la RAM totale). */
export function ramCapGb(totalGb) { return Math.floor(Number(totalGb) * MAX_RAM_SHARE); }

/** Profil recommandé selon la machine (RAM totale en Go, nombre de cœurs). */
export function recommendProfile(totalGb, cores) {
    const c = Number(cores) || 1;
    if (totalGb >= 16 && c >= 6) return 'performance';
    if (totalGb >= 8 && c >= 4) return 'balanced';
    return 'eco';
}

/** Arguments JVM (Java 17) d'un profil. ZGC seulement avec assez de cœurs et de mémoire. */
export function jvmArgsFor(id, { cores = 4, maxGb = 4 } = {}) {
    if (id === 'performance') return (cores >= 8 && maxGb >= 6 ? ZGC : G1_TUNED).slice();
    if (id === 'balanced') return G1_TUNED.slice();
    return G1_BASE.slice();
}

/**
 * Construit le plan d'un profil pour une machine.
 * @returns {{id, ramMin, ramMax, jvmArgs, renderDistance, capped, insufficient, capGb, warnings:string[]}}
 *  warnings : clés i18n (perf_warn_*).
 */
export function buildProfile(id, { totalGb, cores = 4 }) {
    const base = PROFILES[id] || PROFILES.eco;
    const capGb = ramCapGb(totalGb);
    const warnings = [];
    if (capGb < MODPACK_MIN_GB) {
        warnings.push('perf_warn_insufficient');
        return { id, ramMin: null, ramMax: null, jvmArgs: [], renderDistance: base.renderDistance, capped: false, insufficient: true, capGb, warnings };
    }
    const ramMax = Math.min(base.targetMax, capGb);
    const ramMin = Math.min(base.targetMin, ramMax);
    const capped = ramMax < base.targetMax;
    if (capped) warnings.push('perf_warn_capped');
    if (totalGb < 8) warnings.push('perf_warn_low_ram');
    return {
        id, ramMin, ramMax, jvmArgs: jvmArgsFor(id, { cores, maxGb: ramMax }),
        renderDistance: base.renderDistance, capped, insufficient: false, capGb, warnings,
    };
}

/** Nettoie une saisie d'arguments JVM : jetons commençant par « - », sans -Xms/-Xmx (gérés par les curseurs RAM). */
export function sanitizeJvmArgs(input) {
    const tokens = Array.isArray(input) ? input : String(input || '').split(/\s+/);
    return tokens
        .map(s => String(s).trim())
        .filter(s => s.startsWith('-') && !/^-Xm[sx]/i.test(s) && !/[\r\n\0]/.test(s));
}
