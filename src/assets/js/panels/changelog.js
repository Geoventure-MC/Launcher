'use strict';

import { changePanel, t } from '../utils.js';
import BasePanel from '../utils/BasePanel.js';
const { shell } = require('electron');
const pkg = require('../package.json');

const RELEASES_URL = 'https://api.github.com/repos/Geoventure-MC/Launcher/releases';
const REPO_URL = 'https://github.com/Geoventure-MC/Launcher/releases';

// Session-level cache so re-opening the panel doesn't refetch.
let releasesCache = null;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeHttpUrl(url) {
    try {
        const u = new URL(String(url));
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch {
        return null;
    }
}

// Lightweight markdown → HTML. Operates ONLY on already-escaped text, so any
// HTML produced here comes from our own templates, never from GitHub content.
function renderMarkdown(rawMd) {
    const escaped = escapeHtml(rawMd || '').replace(/\r\n/g, '\n');
    const lines = escaped.split('\n');
    const out = [];
    let inList = false;
    let inCode = false;

    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

    const inline = (text) => {
        // Links: [label](url) — only http(s) urls survive safeHttpUrl.
        text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
            const safe = safeHttpUrl(url.replace(/&amp;/g, '&'));
            if (!safe) return label;
            return `<a href="#" class="cl-link" data-url="${escapeHtml(safe)}">${label}</a>`;
        });
        // Bold then italic, then inline code.
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        return text;
    };

    for (const line of lines) {
        if (/^```/.test(line)) {
            if (inCode) { out.push('</pre>'); inCode = false; }
            else { closeList(); out.push('<pre class="cl-code">'); inCode = true; }
            continue;
        }
        if (inCode) { out.push(line); continue; }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            closeList();
            const level = Math.min(heading[1].length + 2, 6);
            out.push(`<h${level} class="cl-h">${inline(heading[2])}</h${level}>`);
            continue;
        }

        const li = line.match(/^\s*[-*+]\s+(.*)$/);
        if (li) {
            if (!inList) { out.push('<ul class="cl-ul">'); inList = true; }
            out.push(`<li>${inline(li[1])}</li>`);
            continue;
        }

        if (line.trim() === '') { closeList(); continue; }
        closeList();
        out.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    if (inCode) out.push('</pre>');
    return out.join('\n');
}

// Compare semver-ish strings; returns true if `tag` is strictly newer than `current`.
function isNewer(tag, current) {
    const norm = (v) => String(v || '').replace(/^v/i, '').split(/[.\-+]/).map(n => parseInt(n, 10));
    const a = norm(tag);
    const b = norm(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (isNaN(x) || isNaN(y)) return false;
        if (x > y) return true;
        if (x < y) return false;
    }
    return false;
}

class Changelog extends BasePanel {
    static id = "changelog";

    async _init() {
        this.setTexts();

        document.getElementById('changelog-back-btn')?.addEventListener('click', () => changePanel('home'));
        document.getElementById('changelog-github-btn')?.addEventListener('click', () => {
            shell.openExternal(REPO_URL);
        });

        await this.loadReleases();
    }

    setTexts() {
        const title = document.getElementById('changelog-title');
        if (title) title.textContent = t('changelog_title') || 'Nouveautés';
        const ghBtn = document.getElementById('changelog-github-btn');
        if (ghBtn) ghBtn.textContent = t('changelog_view_github') || 'Voir sur GitHub';
        const subtitle = document.getElementById('changelog-subtitle');
        if (subtitle) subtitle.textContent = `v${pkg.version || ''}`;
    }

    async loadReleases() {
        const list = document.getElementById('changelog-list');
        if (!list) return;

        if (Array.isArray(releasesCache)) {
            this.renderReleases(releasesCache);
            return;
        }

        list.innerHTML = `<div class="changelog-empty">${escapeHtml(t('changelog_loading') || 'Chargement…')}</div>`;

        try {
            const res = await fetch(RELEASES_URL, {
                headers: { 'Accept': 'application/vnd.github+json' },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('bad payload');
            releasesCache = data;
            this.renderReleases(data);
        } catch (err) {
            console.warn('[changelog] fetch failed:', err);
            this.renderError();
        }
    }

    renderError() {
        const list = document.getElementById('changelog-list');
        if (!list) return;
        list.innerHTML = `<div class="changelog-empty">${escapeHtml(t('changelog_error') || 'Impossible de charger les nouveautés (hors ligne ou limite GitHub atteinte).')}</div>`;
    }

    renderReleases(releases) {
        const list = document.getElementById('changelog-list');
        if (!list) return;

        const visible = releases.filter(r => !r.draft);
        if (!visible.length) {
            list.innerHTML = `<div class="changelog-empty">${escapeHtml(t('changelog_empty') || 'Aucune version publiée.')}</div>`;
            return;
        }

        list.innerHTML = '';
        const current = pkg.version;

        for (const rel of visible) {
            const tag = rel.tag_name || rel.name || '';
            const dateStr = rel.published_at ? this.formatDate(rel.published_at) : '';
            const newBadge = (tag && current && isNewer(tag, current))
                ? `<span class="cl-new-badge">${escapeHtml(t('changelog_new') || 'NOUVEAU')}</span>`
                : '';

            const card = document.createElement('div');
            card.className = 'changelog-card';
            card.innerHTML = `
                <div class="cl-card-head">
                    <span class="cl-version">${escapeHtml(tag)}</span>
                    ${newBadge}
                    <span style="flex:1;"></span>
                    <span class="cl-date">${escapeHtml(dateStr)}</span>
                </div>
                <div class="cl-body">
                    ${rel.body ? renderMarkdown(rel.body) : `<p class="changelog-empty">${escapeHtml(t('changelog_no_notes') || 'Pas de notes de version.')}</p>`}
                </div>`;

            // Wire markdown links to the external browser (no in-app navigation).
            card.querySelectorAll('.cl-link').forEach(a => {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    const url = a.dataset.url;
                    if (url) shell.openExternal(url);
                });
            });

            list.appendChild(card);
        }
    }

    formatDate(iso) {
        try {
            const d = new Date(iso);
            const months = [
                t('january'), t('february'), t('march'), t('april'), t('may'), t('june'),
                t('july'), t('august'), t('september'), t('october'), t('november'), t('december')
            ];
            return `${d.getDate()} ${months[d.getMonth()] || ''} ${d.getFullYear()}`;
        } catch {
            return '';
        }
    }
}

export default Changelog;
