'use strict';

import { database, changePanel, t } from '../utils.js';
const { ipcRenderer } = require('electron');
const pkg = require('../package.json');
const fs = require('fs');
const path = require('path');

const dataDirectory = process.env.APPDATA || (process.platform == 'darwin' ? `${process.env.HOME}/Library/Application Support` : process.env.HOME);

const SERVER_THEMES = {
    geoventure: {
        color: '#4ade80',
        tags: ['Forge 1.20.1', 'Survie', 'Factions', 'Mods'],
        desc: 'Plonge dans un monde industriel avec des machines, des factions et une économie riche. Forge ton empire.',
    },
    elandor: {
        color: '#a78bfa',
        tags: ['RPG', 'Quêtes', 'Donjons', 'Magie'],
        desc: 'Un univers fantastique peuplé de créatures, de quêtes épiques et de magie ancienne.',
    },
    pokeland: {
        color: '#fb923c',
        tags: ['Pokémon', 'Combat', 'Arènes', 'Aventure'],
        desc: 'Capture, entraîne et combats dans un monde Pokémon immersif avec des arènes et des tournois.',
    },
};

class Instances {
    static id = "instances";

    async init(config) {
        this.config = config;
        this.database = await new database().init();
        this.renderGrid();
        this.initFooter();
    }

    renderGrid() {
        const grid = document.getElementById('instances-grid');
        if (!grid) return;

        const servers = pkg.servers || [];
        const subtitle = document.getElementById('instances-subtitle');
        if (subtitle) subtitle.textContent = t('instances_subtitle') || 'Choisis ton aventure';

        servers.forEach(server => {
            const theme = SERVER_THEMES[server.id] || {};
            const card = document.createElement('div');
            card.className = 'instance-card';
            card.style.setProperty('--card-color', server.color || theme.color || '#fff');

            const installed = this.isInstalled(server.id);
            const tags = (theme.tags || []).map(tag =>
                `<span class="instance-tag">${this._esc(tag)}</span>`
            ).join('');

            card.innerHTML = `
                <div class="instance-card-bg" style="background-image: url('../src/assets/images/instances/${server.id}.jpg');"></div>
                <div class="instance-card-overlay"></div>
                <div class="instance-card-content">
                    <div class="instance-icon">${this._esc(server.name.charAt(0))}</div>
                    <div class="instance-name">${this._esc(server.name)}</div>
                    <div class="instance-desc">${this._esc(theme.desc || server.description || '')}</div>
                    ${tags ? `<div class="instance-tags">${tags}</div>` : ''}
                    <button class="instance-action-btn ${installed ? 'play' : 'install'}" data-server-id="${this._esc(server.id)}">
                        ${installed ? (t('play') || 'JOUER') : (t('install') || 'INSTALLER')}
                    </button>
                </div>
            `;

            const btn = card.querySelector('.instance-action-btn');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectServer(server);
            });

            card.addEventListener('click', () => {
                this.selectServer(server);
            });

            grid.appendChild(card);
        });

        this.fetchStatuses(servers);
    }

    async fetchStatuses(servers) {
        try {
            const settings_url = localStorage.getItem('geoventure_server_url') || pkg.settings;
            const base = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
            const res = await fetch(`${base}utils/servers-status`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return;
            const statuses = await res.json();
            if (!Array.isArray(statuses)) return;

            for (const status of statuses) {
                const card = document.querySelector(`.instance-action-btn[data-server-id="${status.id}"]`);
                if (!card) continue;
                const cardEl = card.closest('.instance-card');
                if (!cardEl) continue;

                const existing = cardEl.querySelector('.instance-badge');
                if (existing) existing.remove();

                if (status.online) {
                    const badge = document.createElement('div');
                    badge.className = 'instance-badge online';
                    badge.textContent = status.players != null
                        ? `${status.players} ${t('players_online') || 'joueurs'}`
                        : (t('server_online') || 'En ligne');
                    cardEl.querySelector('.instance-card-content').prepend(badge);
                }
            }
        } catch {
            // Non-blocking
        }
    }

    isInstalled(serverId) {
        const gameDir = this.getGameDir(serverId);
        return fs.existsSync(path.join(gameDir, 'mods')) || fs.existsSync(path.join(gameDir, 'versions'));
    }

    getGameDir(serverId) {
        const folderName = this.config?.dataDirectory || 'geoventure';
        if (serverId === 'geoventure' || !serverId) {
            return path.join(dataDirectory, `.${folderName}`);
        }
        return path.join(dataDirectory, `.${folderName}`, 'instances', serverId);
    }

    selectServer(server) {
        localStorage.setItem('geoventure_server_url', server.settings);
        localStorage.setItem('geoventure_selected_instance', server.id);
        ipcRenderer.send('main-window-reload');
    }

    initFooter() {
        const version = document.getElementById('instances-version');
        if (version) version.textContent = `v${pkg.version}`;

        const settingsBtn = document.getElementById('instances-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => changePanel('settings'));
        }
    }

    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

export default Instances;
