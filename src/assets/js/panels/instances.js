'use strict';

import { database, changePanel, t } from '../utils.js';
import { getGameDirectoryFor } from '../utils/gamedir.js';
import { getInstallState, invalidateInstallState } from '../utils/installstate.js';
const { ipcRenderer } = require('electron');
const pkg = require('../package.json');

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
        this.watchPanelOpen();
        window.addEventListener('nexus:install-state-changed', (e) => {
            invalidateInstallState(e.detail && e.detail.slug);
            this.refreshInstallStates();
        });
    }

    // Ré-évalue l'état d'installation à chaque ouverture du panneau.
    watchPanelOpen() {
        const panel = document.querySelector('.instances');
        if (!panel || typeof MutationObserver === 'undefined') return;
        let wasActive = panel.classList.contains('active');
        new MutationObserver(() => {
            const active = panel.classList.contains('active');
            if (active && !wasActive) this.refreshInstallStates();
            wasActive = active;
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
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

            const tags = (theme.tags || []).map(tag =>
                `<span class="instance-tag">${this._esc(tag)}</span>`
            ).join('');

            card.innerHTML = `
                <div class="instance-card-bg" style="background-image: url('../src/assets/images/instances/${server.id}.jpg');"></div>
                <div class="instance-card-overlay"></div>
                <div class="instance-card-content">
                    <img class="instance-logo" src="../src/assets/images/instances/${server.id}_logo.png" alt="${this._esc(server.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="instance-icon" style="display:none;">${this._esc(server.name.charAt(0))}</div>
                    <div class="instance-name">${this._esc(server.name)}</div>
                    <div class="instance-desc">${this._esc(theme.desc || server.description || '')}</div>
                    ${tags ? `<div class="instance-tags">${tags}</div>` : ''}
                    <div class="instance-state checking" data-state="checking" aria-live="polite">
                        <span class="instance-state-icon"></span>
                        <span class="instance-state-label">${this._esc(t('install_state_checking') || 'Vérification…')}</span>
                    </div>
                    <button class="instance-action-btn install" data-server-id="${this._esc(server.id)}">
                        ${this._esc(t('instances_install') || 'INSTALLER')}
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
        this.refreshInstallStates();
    }

    // Détection réelle (asynchrone, jamais bloquante) pour chaque instance.
    async refreshInstallStates(force = false) {
        const servers = pkg.servers || [];
        // Skeleton/shimmer pendant l'analyse.
        servers.forEach(server => this.applyInstallState(server.id, { state: 'checking' }));
        let anyOffline = false;
        await Promise.all(servers.map(async (server) => {
            let result;
            try {
                result = await getInstallState({
                    slug: server.id,
                    gameDir: this.getGameDir(server.id),
                    settingsUrl: server.settings || pkg.settings,
                    env: pkg.env,
                }, { force });
            } catch {
                result = { state: 'not_installed', offline: true };
            }
            if (result.offline) anyOffline = true;
            this.applyInstallState(server.id, result);
        }));
        this.setOfflineNotice(anyOffline);
    }

    applyInstallState(serverId, result) {
        const btn = document.querySelector(`.instance-action-btn[data-server-id="${serverId}"]`);
        const card = btn && btn.closest('.instance-card');
        if (!card) return;
        const state = result.state;
        const chip = card.querySelector('.instance-state');
        const labels = {
            checking: t('install_state_checking') || 'Vérification…',
            installed: t('install_state_installed') || 'Installé',
            not_installed: t('install_state_not_installed') || 'À télécharger',
            incomplete: t('install_state_incomplete') || 'Incomplet',
            update_required: t('install_state_update_required') || 'Mise à jour requise',
        };
        if (chip && chip.dataset.state !== state) {
            chip.dataset.state = state;
            chip.className = `instance-state ${state.replace('_', '-')}`;
            chip.querySelector('.instance-state-label').textContent = labels[state] || '';
            // Rejoue l'animation de transition de la pastille.
            chip.classList.remove('swap');
            void chip.offsetWidth;
            chip.classList.add('swap');
        }
        card.dataset.installState = state;
        if (state === 'checking') return;
        const ready = state === 'installed' || state === 'update_required';
        btn.classList.toggle('play', ready);
        btn.classList.toggle('install', !ready);
        btn.textContent = state === 'installed' ? (t('instances_play') || 'JOUER')
            : state === 'update_required' ? (t('instances_update') || 'METTRE À JOUR')
            : (t('instances_install') || 'INSTALLER');
    }

    setOfflineNotice(offline) {
        const sub = document.getElementById('instances-subtitle');
        if (!sub) return;
        let el = document.getElementById('instances-offline');
        if (!offline) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('span');
            el.id = 'instances-offline';
            el.className = 'instances-offline';
            sub.insertAdjacentElement('afterend', el);
        }
        el.textContent = t('install_state_offline') || 'Hors ligne';
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

    getGameDir(serverId) {
        return getGameDirectoryFor(serverId, dataDirectory, this.config || {});
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
