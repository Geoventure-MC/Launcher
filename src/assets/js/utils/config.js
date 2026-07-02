/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
import { withInstance } from './instance.js';
const pkg = require('../package.json');
const fetch = require("node-fetch");
const convert = require("xml-js");

// Honour a per-server override (instance picker) before falling back to pkg.
const settings_url = (typeof localStorage !== 'undefined' && localStorage.getItem('geoventure_server_url'))
    || (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);

function getConfigUrl() {
    const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
    const url = pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/options` : `${baseUrl}utils/api`;
    return withInstance(url);
}

export function getAzAuthUrl(config) {
    const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
    if (pkg.env === 'azuriom') return baseUrl;
    // Guard against a null/undefined azauth (panel auth not configured yet).
    const az = (config && config.azauth) ? String(config.azauth) : baseUrl;
    return az.endsWith('/') ? az : `${az}/`;
}

// Mode hors-ligne : la dernière config valide est mise en cache par instance ;
// si le panel est injoignable, on la resssert au lieu de bloquer le launcher.
const CONFIG_CACHE_PREFIX = 'geoventure_config_cache_';
let offlineMode = false;
let offlineSince = null;

export function isOfflineMode() { return offlineMode; }
export function offlineCacheDate() { return offlineSince; }

function configCacheKey() {
    const slug = (typeof localStorage !== 'undefined' && localStorage.getItem('geoventure_selected_instance')) || 'default';
    return CONFIG_CACHE_PREFIX + slug;
}

function saveConfigCache(config) {
    try {
        localStorage.setItem(configCacheKey(), JSON.stringify({ savedAt: Date.now(), config }));
    } catch { /* stockage plein/indisponible : non bloquant */ }
}

function loadConfigCache() {
    try {
        const raw = localStorage.getItem(configCacheKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.config !== 'object' || parsed.config === null) return null;
        return parsed;
    } catch {
        return null;
    }
}

class Config {
    async GetConfig() {
        try {
            const response = await fetch(getConfigUrl());
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} sur ${getConfigUrl()}`);
            }
            const config = await response.json();
            offlineMode = false;
            offlineSince = null;
            saveConfigCache(config);
            return config;
        } catch (error) {
            console.error("Failed to fetch config:", error);
            const cached = loadConfigCache();
            if (cached) {
                console.warn('Panel injoignable : utilisation de la config en cache (mode hors-ligne).');
                offlineMode = true;
                offlineSince = cached.savedAt || null;
                return cached.config;
            }
            throw error;
        }
    }

    async GetNews() {
        try {
            this.config = await this.GetConfig();
            const newsUrl = new URL('/api/rss', getAzAuthUrl(this.config));

            const rss = await fetch(newsUrl).then(res => res.text());
            const rssParsed = JSON.parse(convert.xml2json(rss, { compact: true }));
            const items = rssParsed.rss.channel.item;

            if (!items) {
                return [{
                    title: "Aucun article disponible",
                    content: "Aucun article n'a été trouvé.",
                    author: "",
                    publish_date: "2024"
                }];
            }

            return Array.isArray(items) ? items.map(this.parseNewsItem) : [this.parseNewsItem(items)];
        } catch (error) {
            // Non-fatal: a missing/broken RSS feed must not block the launcher init.
            console.error("Failed to fetch news:", error);
            return [{
                title: "Actualités indisponibles",
                content: "Impossible de récupérer les actualités pour le moment.",
                author: "",
                publish_date: ""
            }];
        }
    }

    parseNewsItem(item) {
        return {
            title: item.title._text,
            content: item['content:encoded']._text,
            author: item['dc:creator']._text,
            publish_date: item.pubDate._text,
            image: item.enclosure && item.enclosure._attributes ? item.enclosure._attributes.url : null
        };
    }
}

export default new Config();
