/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
const pkg = require('../package.json');
const fetch = require("node-fetch");
const convert = require("xml-js");

const settings_url = pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings;

function getConfigUrl() {
    const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
    return pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/options` : `${baseUrl}utils/api`;
}

function getAzAuthUrl(config) {
    const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
    if (pkg.env === 'azuriom') return baseUrl;
    // Guard against a null/undefined azauth (panel auth not configured yet).
    const az = (config && config.azauth) ? String(config.azauth) : baseUrl;
    return az.endsWith('/') ? az : `${az}/`;
}

class Config {
    async GetConfig() {
        try {
            const response = await fetch(getConfigUrl());
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} sur ${getConfigUrl()}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch config:", error);
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
