/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
'use strict';

import { logger, database, changePanel, t } from '../utils.js';
import { sendEvent, isConsented } from '../utils/telemetry.js';
import { validatePanel } from '../utils/schema-validator.js';
const { getGameDirectory } = require('../utils/gamedir.js');
const { Launch, Status } = require('minecraft-java-core-azbetter');
const { ipcRenderer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const launch = new Launch();
const pkg = require('../package.json');
const settings_url = localStorage.getItem('geoventure_server_url') || (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);

const dataDirectory = process.env.APPDATA || (process.platform == 'darwin' ? `${process.env.HOME}/Library/Application Support` : process.env.HOME);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const CHEAT_PATTERNS = [
    'wurst', 'sigma', 'future', 'inertia', 'liquidbounce',
    'meteor', 'aristois', 'wolfram', 'hacked-client',
    'impact-', 'skillclient', 'salhack', 'vape', 'pepsi'
];

let sessionStart = Date.now();

// Module-level HTML escaper (reused by news/advert/video rendering).
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Validate a value is a safe http(s) URL; returns the URL or null.
function safeHttpUrl(url) {
    try {
        const u = new URL(String(url));
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch {
        return null;
    }
}

// Strip dangerous constructs from RSS/panel-provided HTML content.
function sanitizeHtml(html) {
    return String(html)
        .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
        .replace(/<\s*script[^>]*>/gi, '')
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
        .replace(/javascript:/gi, '');
}

class Home {
    static id = "home";

    async init(config, news) {
        this.database = await new database().init();
        this.config = config;
        this.news = await news;
        this.currentFile = '';
        this.currentSpeed = 0;
        sessionStart = Date.now();

        this.setStaticTexts();
        this.initNews();
        this.initLaunch();
        this.initStatusServer();
        this.initBtn();
        this.initVideo();
        this.initAdvert();
        this.initNotifications();
        this.initMaintenance();
        this.verifyModsBeforeLaunch();
        this.initServerSelector();
        this.initKeyboardShortcuts();
        this.initLogConsole();
        this.validateApiSchema();
        this.initOfflineBadge();

        sendEvent('launch');
    }

    setStaticTexts() {
        document.getElementById('play-btn').title = t('play');
        document.getElementById('text-download').textContent = t('verification');
        document.getElementById('server-name').textContent = t('offline');
        document.getElementById('server-desc').innerHTML = `<span class="red">${t('closed')}</span>`;
        document.getElementById('video-title').textContent = t('community_video');
        document.getElementById('play-video-btn').innerHTML = '&#9658;';
        document.getElementById('view-video-btn').textContent = t('view_video');
    }

    async initNews() {
        const newsContainer = document.querySelector('.news-list');
        if (this.news) {
            if (!this.news.length) {
                this.createNewsBlock(newsContainer, t('no_news_available'), t('news_follow_here'));
            } else {
                for (const newsItem of this.news) {
                    const date = await this.getDate(newsItem.publish_date);
                    this.createNewsBlock(newsContainer, newsItem.title, newsItem.content, newsItem.author, date, newsItem.image);
                }
            }
        } else {
            this.createNewsBlock(newsContainer, t('error_contacting_server'), t('error_contacting_server'));
        }
        this.setServerIcon();
    }

    createNewsBlock(container, title, content, author = '', date = {}, image = null) {
        const blockNews = document.createElement('div');
        blockNews.classList.add('news-block', 'opacity-1');
        const safeImage = image ? safeHttpUrl(image) : null;
        const safeDay = date && date.day ? escapeHtml(date.day) : '';
        const safeMonth = date && date.month ? escapeHtml(date.month) : '';
        blockNews.innerHTML = `
            <div class="news-header">
                <div class="header-text">
                    <div class="title">${escapeHtml(title)}</div>
                </div>
                ${date && date.day ? `<div class="date"><div class="day">${safeDay}</div><div class="month">${safeMonth}</div></div>` : ''}
            </div>
            ${safeImage ? `<div class="news-image" style="background-image: url('${escapeHtml(safeImage)}');"></div>` : ''}
            <div class="news-content">
                <div class="bbWrapper">
                    <p>${sanitizeHtml(content)}</p>
                    ${author ? `<p class="news-author"><span>${escapeHtml(author)}</span></p>` : ''}
                </div>
            </div>`;
        container.appendChild(blockNews);
    }

    setServerIcon() {
        const serverImg = document.querySelector('.server-img');
        if (!this.config.server_icon) {
            serverImg.style.display = "none";
            return;
        }
        serverImg.setAttribute("src", this.config.server_icon);
    }

    async initLaunch() {
        document.querySelector('.play-btn').addEventListener('click', async () => {
            try {
                await this._doLaunch();
            } catch (err) {
                console.error('Launch failed:', err);
                this.handleLaunchError(err);
            }
        });
    }

    handleLaunchError(err) {
        const playBtn = document.querySelector('.play-btn');
        const info = document.querySelector('.text-download');
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) progressBar.style.display = 'none';
        if (info) {
            info.style.display = 'block';
            info.innerHTML = `<span class="red">${t('launch_error') || 'Erreur de lancement : serveur injoignable.'}</span>`;
        }
        if (playBtn) {
            playBtn.style.display = 'block';
            playBtn.disabled = false;
        }
    }

    // Maintenance mode: when the panel reports config.maintenance === true,
    // block the Play button and show the maintenance message prominently.
    initMaintenance() {
        const isMaintenance = this.config.maintenance === true;
        const playBtn = document.querySelector('.play-btn');

        if (!isMaintenance) {
            if (playBtn) {
                playBtn.disabled = false;
                playBtn.style.pointerEvents = '';
                playBtn.style.opacity = '';
                playBtn.style.background = '';
            }
            return;
        }

        if (playBtn) {
            playBtn.disabled = true;
            playBtn.style.pointerEvents = 'none';
            playBtn.style.opacity = '0.6';
            playBtn.style.background = '#b45309';
            playBtn.title = t('maintenance_active') || 'Maintenance en cours';
        }

        this.showMaintenanceBanner();
    }

    showMaintenanceBanner() {
        const container = document.getElementById('notifications-banner');
        if (!container) return;

        const msg = this.config.maintenance_message
            ? sanitizeHtml(String(this.config.maintenance_message))
            : escapeHtml(t('maintenance_active') || 'Maintenance en cours');

        const el = document.createElement('div');
        el.className = 'notification-item notification-maintenance';
        el.innerHTML = `
            <span class="notif-icon">🔧</span>
            <span class="notif-message"><strong>${escapeHtml(t('maintenance_active') || 'Maintenance en cours')}</strong> — ${msg}</span>
        `;
        // Prepend so the maintenance notice is always shown first.
        container.insertBefore(el, container.firstChild);
        container.style.display = 'block';
    }

    async _doLaunch() {
        // Defense in depth: refuse to launch while the server is in maintenance.
        if (this.config.maintenance === true) {
            const info = document.querySelector('.text-download');
            if (info) {
                info.style.display = 'block';
                info.innerHTML = `<span class="red">${escapeHtml(t('maintenance_blocked') || 'Lancement bloqué : maintenance en cours.')}</span>`;
            }
            this.showMaintenanceBanner();
            return;
        }

        const cheats = await this.checkForCheatMods();
        if (cheats.length > 0) {
            const proceed = await this.showCheatModal(cheats);
            if (!proceed) return;
        }

        await this.verifyModsBeforeLaunch();
        const opts = await this.getLaunchOptions();
        const playBtn = document.querySelector('.play-btn');
        const info = document.querySelector(".text-download");
        const progressBar = document.querySelector(".progress-bar");

        playBtn.style.display = "none";
        info.style.display = "block";

        const launcherSettings = (await this.database.get('1234', 'launcher')).value;
        this.setupLaunchListeners(launch, info, progressBar, playBtn, launcherSettings);

        // Awaited so a failed version-manifest fetch (GetInfoVersion) is caught
        // by initLaunch's try/catch instead of becoming an uncaught rejection.
        await launch.Launch(opts);
    }

    async getLaunchOptions() {
        const urlpkg = this.getBaseUrl();
        const uuid = (await this.database.get('1234', 'accounts-selected')).value;
        const account = (await this.database.get(uuid.selected, 'accounts')).value;
        const ram = (await this.database.get('1234', 'ram')).value;
        const javaPath = (await this.database.get('1234', 'java-path')).value;
        const javaArgs = (await this.database.get('1234', 'java-args')).value;
        const resolution = (await this.database.get('1234', 'screen')).value;
        const launcherSettings = (await this.database.get('1234', 'launcher')).value;

        const screen = resolution.screen.width === '<auto>' ? false : { width: resolution.screen.width, height: resolution.screen.height };

        return {
            url: urlpkg,
            authenticator: account,
            timeout: 10000,
            path: this.gameDir(),
            version: this.config.game_version,
            detached: launcherSettings.launcher.close === 'close-all' ? false : true,
            downloadFileMultiple: 30,
            loader: {
                type: this.config.loader.type,
                build: this.config.loader.build,
                enable: this.config.loader.enable,
            },
            verify: this.config.verify,
            ignored: [
                ...(Array.isArray(this.config.ignored) ? this.config.ignored : Object.values(this.config.ignored)),
                "launcher_config",
            ],
            intelEnabledMac: process.platform === 'darwin' && process.arch === 'arm64',
            JVM_ARGS: [],
            GAME_ARGS: [],
            java: this.config.java,
            memory: {
                min: `${ram.ramMin * 1024}M`,
                max: `${ram.ramMax * 1024}M`
            }
        };
    }

    getBaseUrl() {
        const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
        return pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/files` : `${baseUrl}data/`;
    }

    // Per-server game directory (the default server keeps its legacy path).
    gameDir() {
        return getGameDirectory(dataDirectory, this.config);
    }

    setupLaunchListeners(launch, info, progressBar, playBtn, launcherSettings) {
        launch.on('extract', extract => console.log(extract));
        launch.on('progress', (progress, size, file) => {
            if (file) this.currentFile = file;
            this.updateProgressBar(progressBar, info, progress, size, t('download'));
        });
        launch.on('check', (progress, size, file) => {
            if (file) this.currentFile = file;
            this.updateProgressBar(progressBar, info, progress, size, t('verification'));
        });
        launch.on('estimated', time => console.log(this.formatTime(time)));
        launch.on('speed', speed => {
            this.currentSpeed = speed;
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`);
        });
        launch.on('patch', patch => info.innerHTML = t('patch_in_progress'));
        launch.on('data', e => this.handleLaunchData(e, info, progressBar, playBtn, launcherSettings));
        launch.on('close', code => this.handleLaunchClose(code, info, progressBar, playBtn, launcherSettings));
        launch.on('error', err => {
            this.appendLog(err && err.error ? err.error : String(err));
            const logToggle = document.getElementById('log-toggle-btn');
            if (logToggle) logToggle.style.display = '';
            console.log(err);
        });
    }

    updateProgressBar(progressBar, info, progress, size, text) {
        progressBar.style.display = "block";
        const pct = ((progress / size) * 100).toFixed(0);
        const speedMb = this.currentSpeed > 0 ? `${(this.currentSpeed / 1067008).toFixed(1)} MB/s` : '';
        const fileName = this.currentFile ? path.basename(this.currentFile) : '';

        let html = `${text} ${pct}%`;
        if (fileName) html += `<div class="progress-file" title="${fileName}">${fileName}</div>`;
        if (speedMb) html += `<div class="progress-speed">${speedMb}</div>`;
        info.innerHTML = html;

        ipcRenderer.send('main-window-progress', { progress, size });
        progressBar.value = progress;
        progressBar.max = size;
    }

    formatTime(time) {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time - hours * 3600) / 60);
        const seconds = Math.floor(time - hours * 3600 - minutes * 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    handleLaunchData(e, info, progressBar, playBtn, launcherSettings) {
        new logger('Minecraft', '#36b030');
        if (launcherSettings.launcher.close === 'close-launcher') ipcRenderer.send("main-window-hide");
        ipcRenderer.send('main-window-progress-reset');
        progressBar.style.display = "none";
        info.innerHTML = t('starting');
        this.appendLog(String(e));

        const logToggle = document.getElementById('log-toggle-btn');
        if (logToggle) logToggle.style.display = '';

        console.log(e);
    }

    handleLaunchClose(code, info, progressBar, playBtn, launcherSettings) {
        if (launcherSettings.launcher.close === 'close-launcher') ipcRenderer.send("main-window-show");
        progressBar.style.display = "none";
        info.style.display = "none";
        playBtn.style.display = "block";
        info.innerHTML = t('verification');
        new logger('Launcher', '#7289da');

        const logToggle = document.getElementById('log-toggle-btn');
        if (logToggle) logToggle.style.display = '';

        const sessionDuration = Math.round((Date.now() - sessionStart) / 1000);
        sendEvent('close', { sessionDuration });

        console.log('Close');
    }

    async initStatusServer() {
        // Prefer the panel's /utils/servers-status (it already SLP-pings every
        // server server-side, incl. the default) to avoid double-pinging the
        // default server. Fall back to a direct SLP ping if it's unavailable.
        const statuses = await this.fetchServersStatus();
        if (statuses) {
            this.refreshAllServersStatus(statuses);
            const def = statuses.find(s => s.is_default) || statuses[0];
            if (def) {
                this.renderDefaultServerStatus({
                    online: !!def.online,
                    nameServer: def.name,
                    ms: def.latency,
                    players: def.players,
                });
                return;
            }
        }

        await this.pingDefaultServerDirect();
    }

    renderDefaultServerStatus({ online, nameServer, ms, players }) {
        const nameEl = document.querySelector('.server-text .name');
        const serverMs = document.querySelector('.server-text .desc');
        const playersConnected = document.querySelector('.etat-text .text');
        const onlineEl = document.querySelector(".etat-text .online");

        if (online) {
            nameEl.textContent = nameServer || this.config.status?.nameServer || '';
            const msText = ms != null ? ` - ${ms}${t('server_ping')}` : '';
            serverMs.innerHTML = `<span class="green">${t('server_online')}</span>${msText}`;
            onlineEl.classList.toggle("off");
            if (players != null) playersConnected.textContent = players;
        } else {
            nameEl.textContent = t('server_unavailable');
            serverMs.innerHTML = `<span class="red">${t('server_closed')}</span>`;
        }
    }

    async pingDefaultServerDirect() {
        const status = this.config.status || {};
        let ip = status.ip;
        let port = status.port;

        if (!port) {
            try {
                const dns = require('dns');
                const srvRecords = await new Promise((resolve, reject) => {
                    dns.resolveSrv(`_minecraft._tcp.${ip}`, (err, records) => {
                        if (err) reject(err);
                        else resolve(records);
                    });
                });
                if (srvRecords && srvRecords.length > 0) {
                    ip = srvRecords[0].name;
                    port = srvRecords[0].port;
                }
            } catch (e) {
                port = 25565;
            }
        }

        try {
            const serverPing = await new Status(ip, port).getStatus();
            if (!serverPing.error) {
                this.renderDefaultServerStatus({
                    online: true,
                    nameServer: this.config.status.nameServer,
                    ms: serverPing.ms,
                    players: serverPing.playersConnect,
                });
            } else {
                this.renderDefaultServerStatus({ online: false });
            }
        } catch (e) {
            this.renderDefaultServerStatus({ online: false });
        }
    }

    async fetchServersStatus() {
        try {
            const base = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
            const res = await fetch(`${base}utils/servers-status`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return null;
            const statuses = await res.json();
            return Array.isArray(statuses) ? statuses : null;
        } catch {
            return null;
        }
    }

    refreshAllServersStatus(statuses) {
        if (!Array.isArray(statuses)) return;

        const activePill = document.querySelector('.server-pill.active');
        if (activePill) {
            const activeId = activePill.dataset.serverId;
            const active = statuses.find(s => String(s.id) === String(activeId));
            if (active && active.online && active.players != null) {
                activePill.title = `${activePill.title.split('—')[0].trim()} — ${active.players} ${t('players_online') || 'joueurs'}`;
            }
        }

        try {
            for (const status of statuses) {
                const pill = document.querySelector(`.server-pill[data-server-id="${status.id}"]`);
                if (!pill) continue;
                pill.classList.toggle('server-online', !!status.online);
                pill.classList.toggle('server-offline', !status.online);
                if (status.online && status.players != null) {
                    pill.dataset.players = status.players;
                }
            }
        } catch {
            // Non-blocking
        }
    }

    // In-app notifications served by the panel (/utils/notifications)
    async initNotifications() {
        const container = document.getElementById('notifications-banner');
        if (!container) return;

        try {
            const base = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
            const res = await fetch(`${base}utils/notifications`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: AbortSignal.timeout(4000),
            });
            if (!res.ok) return;
            const notifications = await res.json();
            if (!Array.isArray(notifications) || !notifications.length) return;

            container.innerHTML = '';
            for (const notif of notifications) {
                const el = document.createElement('div');
                el.className = `notification-item notification-${notif.type || 'info'}`;
                el.innerHTML = `
                    <span class="notif-icon">${this._notifIcon(notif.type)}</span>
                    <span class="notif-message">${this._escapeHtml(notif.message)}
                        ${notif.url ? ` <a href="#" class="notif-link" data-url="${this._escapeAttr(notif.url)}">${t('notif_learn_more') || 'En savoir plus'}</a>` : ''}
                    </span>
                    <button class="notif-close" aria-label="Fermer">&times;</button>
                `;
                el.querySelector('.notif-close').addEventListener('click', () => {
                    el.remove();
                    if (!container.children.length) container.style.display = 'none';
                });
                if (notif.url) {
                    el.querySelector('.notif-link')?.addEventListener('click', (e) => {
                        e.preventDefault();
                        shell.openExternal(notif.url);
                    });
                }
                container.appendChild(el);
            }
            container.style.display = 'block';
        } catch {
            // Non-blocking
        }
    }

    _notifIcon(type) {
        const icons = { info: 'ℹ️', warning: '⚠️', maintenance: '🔧', event: '🎉' };
        return icons[type] || '📢';
    }

    _escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    _escapeAttr(str) {
        return String(str).replace(/"/g,'&quot;');
    }

    async validateApiSchema() {
        try {
            const { compatible, version } = await validatePanel(settings_url);
            if (!compatible) {
                console.warn(`[schema] Panel API schema v${version} may be incompatible with this Launcher.`);
            }
        } catch {
            // Non-blocking
        }
    }

    async initVideo() {
        const videoContainer = document.querySelector('.ytb');
        if (!this.config.video_activate) {
            videoContainer.style.display = 'none';
            return;
        }

        const youtubeVideoId = this.config.video_url;
        const videoType = this.config.video_type;
        let youtubeEmbedUrl;

        // Only accept a valid 11-char YouTube video id to avoid src injection.
        if (!/^[A-Za-z0-9_-]{11}$/.test(String(youtubeVideoId || ''))) {
            console.error('Invalid YouTube video id specified in the configuration.');
            videoContainer.style.display = 'none';
            return;
        }

        if (videoType === 'short') {
            youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&playsinline=1`;
        } else if (videoType === 'video') {
            youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1`;
        } else {
            console.error('Invalid video type specified in the configuration.');
            return;
        }

        const youtubeThumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
        const videoThumbnail = videoContainer.querySelector('.youtube-thumbnail');
        const thumbnailImg = videoThumbnail.querySelector('.thumbnail-img');
        const playButton = videoThumbnail.querySelector('.ytb-play-btn');
        const btn = videoContainer.querySelector('.ytb-btn');

        btn.addEventListener('click', () => shell.openExternal(`https://youtube.com/watch?v=${youtubeVideoId}`));

        if (thumbnailImg && playButton) {
            thumbnailImg.src = youtubeThumbnailUrl;
            videoThumbnail.addEventListener('click', () => {
                videoThumbnail.innerHTML = `<iframe width="500" height="290" src="${youtubeEmbedUrl}" title="${escapeHtml(t('community_video') || 'Community video')}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
            });
        }
    }

    async initAdvert() {
        const advertBanner = document.querySelector('.advert-banner');
        if (this.config.alert_activate && this.config.alert_msg) {
            const message = this.config.alert_msg;
            const firstParagraph = message.split('</p>')[0] + '</p>';
            const scrollingText = document.createElement('div');
            scrollingText.classList.add('scrolling-text');
            scrollingText.innerHTML = sanitizeHtml(firstParagraph);
            advertBanner.innerHTML = '';
            advertBanner.appendChild(scrollingText);
            scrollingText.classList.toggle('no-scroll', !this.config.alert_scroll);
            advertBanner.style.display = 'block';
        } else {
            advertBanner.style.display = 'none';
        }
    }

    initBtn() {
        document.querySelector('.settings-btn').addEventListener('click', () => {
            changePanel('settings');
        });
        document.querySelector('.profile-btn')?.addEventListener('click', () => {
            changePanel('profile');
        });
    }

    async getDate(e) {
        const date = new Date(e);
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const months = [
            t('january'), t('february'), t('march'), t('april'), t('may'), t('june'),
            t('july'), t('august'), t('september'), t('october'), t('november'), t('december')
        ];
        return { year, month: months[month], day };
    }

    async verifyModsBeforeLaunch() {
        const gameDir = this.gameDir();
        const modsDir = path.join(gameDir, 'mods');
        const launcherConfigDir = path.join(gameDir, 'launcher_config');
        const modsConfigFile = path.join(launcherConfigDir, 'mods_config.json');

        if (!fs.existsSync(modsDir) || !fs.existsSync(modsConfigFile)) {
            console.log("Mods directory or config not found, skipping mod verification (first launch).");
            return;
        }

        let modsConfig;
        try {
            modsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
        } catch (error) {
            console.error("Failed to read mods config file:", error);
            return;
        }

        for (const mod in modsConfig) {
            const modFiles = fs.readdirSync(modsDir).filter(file => file.startsWith(mod) && (file.endsWith('.jar') || file.endsWith('.jar-disable')));
            if (modFiles.length > 0) {
                const modFile = modFiles[0];
                const modFilePath = path.join(modsDir, modFile);
                const newModFilePath = modsConfig[mod] ? modFilePath.replace('.jar-disable', '.jar') : modFilePath.endsWith('.jar-disable') ? modFilePath : `${modFilePath}.disable`;
                if (modFilePath !== newModFilePath) {
                    fs.renameSync(modFilePath, newModFilePath);
                }
            }
        }
    }

    displayEmptyModsMessage(modsListElement) {
        const modElement = document.createElement('div');
        modElement.innerHTML = `
            <div class="mods-container-empty">
              <h2>${t('optional_mods_not_downloaded')}</h2>
            </div>`;
        modsListElement.appendChild(modElement);
    }

    updateRole(account) {
        const tooltipRole = document.querySelector('.player-tooltip-role');
        const sidebarRole = document.querySelector('.player-role');

        if (this.config.role && account.user_info.role) {
            const roleName = account.user_info.role.name;
            tooltipRole.textContent = roleName;
            sidebarRole.textContent = roleName;
        } else {
            tooltipRole.style.display = 'none';
            sidebarRole.style.display = 'none';
        }
    }

    updateWhitelist(account) {
        const playBtn = document.querySelector(".play-btn");
        if (this.config.whitelist_activate &&
            (!this.config.whitelist.includes(account.name) &&
                !this.config.whitelist_roles.includes(account.user_info.role.name))) {
            playBtn.style.background = "#696969";
            playBtn.style.pointerEvents = "none";
            playBtn.style.boxShadow = "none";
            playBtn.style.opacity = "0.6";
            playBtn.title = t('unavailable');
        } else {
            playBtn.style.background = "";
            playBtn.style.pointerEvents = "auto";
            playBtn.style.boxShadow = "";
            playBtn.style.opacity = "1";
            playBtn.title = t('play');
        }
    }

    initServerSelector() {
        const servers = pkg.servers;
        if (!servers || !servers.length) return;

        const container = document.getElementById('server-selector');
        if (!container) return;

        const currentUrl = localStorage.getItem('geoventure_server_url') || settings_url;

        servers.forEach(server => {
            const pill = document.createElement('button');
            pill.classList.add('server-pill');
            pill.title = `${server.name} — ${server.description}`;
            pill.style.setProperty('--server-color', server.color);
            pill.textContent = server.name.charAt(0).toUpperCase();
            pill.dataset.serverId = server.id;

            if (server.settings === currentUrl || server.settings + '/' === currentUrl) {
                pill.classList.add('active');
            }

            pill.addEventListener('click', () => {
                if (pill.classList.contains('active')) return;
                localStorage.setItem('geoventure_server_url', server.settings);
                const info = document.querySelector('.text-download');
                if (info) {
                    info.style.display = 'block';
                    info.textContent = t('server_switching') || 'Changement de serveur...';
                }
                setTimeout(() => ipcRenderer.send('main-window-reload'), 300);
            });

            container.appendChild(pill);
        });
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.querySelector('.panel.home.active')) {
                const playBtn = document.querySelector('.play-btn');
                if (playBtn && playBtn.style.display !== 'none') {
                    playBtn.click();
                }
            }
        });
    }

    async checkForCheatMods() {
        try {
            const modsDir = path.join(this.gameDir(), 'mods');

            if (!fs.existsSync(modsDir)) return [];

            const files = fs.readdirSync(modsDir);
            const detected = [];

            for (const file of files) {
                const fileLower = file.toLowerCase();
                for (const pattern of CHEAT_PATTERNS) {
                    if (fileLower.includes(pattern)) {
                        detected.push(file);
                        break;
                    }
                }
            }

            return detected;
        } catch (err) {
            console.error('Anti-cheat check failed:', err);
            return [];
        }
    }

    showCheatModal(cheats) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('cheat-modal-overlay');
            const title = document.getElementById('cheat-modal-title');
            const desc = document.getElementById('cheat-modal-desc');
            const list = document.getElementById('cheat-list');
            const removeBtn = document.getElementById('cheat-remove-btn');
            const cancelBtn = document.getElementById('cheat-cancel-btn');

            if (!overlay) { resolve(false); return; }

            title.textContent = t('cheat_detected_title') || 'Mods non autorisés détectés';
            desc.textContent = t('cheat_detected_desc') || 'Les mods suivants ont été détectés sur votre client :';
            removeBtn.textContent = t('cheat_remove_launch') || 'Supprimer et lancer';
            cancelBtn.textContent = t('cancel') || 'Annuler';

            list.innerHTML = '';
            cheats.forEach(c => {
                const item = document.createElement('div');
                item.classList.add('cheat-item');
                item.textContent = c;
                list.appendChild(item);
            });

            overlay.style.display = 'flex';

            const cleanup = () => { overlay.style.display = 'none'; };

            removeBtn.onclick = () => {
                try {
                    const modsDir = path.join(this.gameDir(), 'mods');
                    cheats.forEach(file => {
                        const filePath = path.join(modsDir, file);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    });
                } catch (err) {
                    console.error('Failed to remove cheat mods:', err);
                }
                cleanup();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(false);
            };
        });
    }

    initLogConsole() {
        const toggleBtn = document.getElementById('log-toggle-btn');
        const logConsole = document.getElementById('log-console');
        const closeBtn = document.getElementById('log-close-btn');
        const clearBtn = document.getElementById('log-clear-btn');
        const copyBtn = document.getElementById('log-copy-btn');
        const exportBtn = document.getElementById('log-export-btn');
        const autoBtn = document.getElementById('log-autoscroll-btn');

        // In-memory ring buffer of raw log lines (capped to avoid memory bloat).
        this.logBuffer = [];
        this.logAutoScroll = true;

        // Static labels (i18n).
        const title = document.getElementById('log-title');
        if (title) title.textContent = t('logs_console') || 'Console Minecraft';
        if (clearBtn) clearBtn.textContent = t('logs_clear') || 'Effacer';
        if (copyBtn) copyBtn.textContent = t('logs_copy') || 'Copier';
        if (exportBtn) exportBtn.textContent = t('logs_export') || 'Exporter';
        if (autoBtn) autoBtn.textContent = t('logs_autoscroll') || 'Auto';

        if (!logConsole) return;

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                logConsole.classList.toggle('visible');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                logConsole.classList.remove('visible');
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.logBuffer = [];
                const body = document.getElementById('log-body');
                if (body) body.innerHTML = '';
            });
        }

        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                this.logAutoScroll = !this.logAutoScroll;
                autoBtn.classList.toggle('log-btn-active', this.logAutoScroll);
                if (this.logAutoScroll) {
                    const body = document.getElementById('log-body');
                    if (body) body.scrollTop = body.scrollHeight;
                }
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    const { clipboard } = require('electron');
                    clipboard.writeText(this.logBuffer.join('\n'));
                    copyBtn.textContent = t('logs_copied') || 'Copié !';
                    setTimeout(() => { copyBtn.textContent = t('logs_copy') || 'Copier'; }, 1500);
                } catch (err) {
                    console.error('Copy logs failed:', err);
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    // The save dialog is shown by the main process (no remote module).
                    const savePath = await ipcRenderer.invoke('save-logs-dialog');
                    if (savePath) fs.writeFileSync(savePath, this.logBuffer.join('\n'), 'utf8');
                } catch (err) {
                    console.error('Export logs failed:', err);
                }
            });
        }
    }

    initOfflineBadge() {
        const badge = document.getElementById('offline-badge');
        if (!badge) return;

        const update = () => {
            const online = navigator.onLine;
            badge.style.display = online ? 'none' : 'block';
        };

        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
    }

    appendLog(text) {
        const body = document.getElementById('log-body');
        if (!body) return;

        // A single emit may carry several physical lines; split them so the
        // buffer cap and colouring apply per line.
        const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.length > 0);
        if (!lines.length) return;

        if (!Array.isArray(this.logBuffer)) this.logBuffer = [];
        const MAX_LINES = 2000;

        for (const text of lines) {
            this.logBuffer.push(text);

            const line = document.createElement('div');
            line.classList.add('log-line');

            const textLower = text.toLowerCase();
            if (textLower.includes('error') || textLower.includes('exception') || textLower.includes('fatal')) {
                line.classList.add('log-error');
            } else if (textLower.includes('warn')) {
                line.classList.add('log-warn');
            } else {
                line.classList.add('log-info');
            }

            // textContent (no innerHTML) — log lines are never interpreted as HTML.
            line.textContent = text;
            body.appendChild(line);
        }

        // Cap both the in-memory buffer and the DOM node count.
        if (this.logBuffer.length > MAX_LINES) {
            this.logBuffer.splice(0, this.logBuffer.length - MAX_LINES);
        }
        while (body.childElementCount > MAX_LINES) {
            body.removeChild(body.firstChild);
        }

        if (this.logAutoScroll !== false) body.scrollTop = body.scrollHeight;
    }
}

export default Home;
