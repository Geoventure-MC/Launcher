'use strict';

import { changePanel, t } from '../utils.js';
import BasePanel from '../utils/BasePanel.js';
import { getGameDirectory } from '../utils/gamedir.js';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const dataDirectory = process.env.APPDATA || (process.platform == 'darwin'
    ? process.env.HOME + '/Library/Application Support'
    : process.env.HOME);

const PAGE_SIZE = 30;

/**
 * Galerie des captures d'écran de l'instance active : lit le dossier
 * `screenshots/` du .minecraft de l'instance (dossier isolé par instance via
 * utils/gamedir.js), vignettes triées par date, visionneuse plein écran,
 * suppression et ouverture du dossier. 100 % local, aucun réseau.
 */
class Screenshots extends BasePanel {
    static id = "screenshots";

    async _init(config) {
        this.config = config;
        this.files = [];
        this.shown = 0;
        this.current = null;

        document.getElementById('screenshots-back-btn')?.addEventListener('click', () => changePanel('home'));
        document.getElementById('screenshots-folder-btn')?.addEventListener('click', () => {
            const dir = this.screenshotsDir();
            try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch { /* non bloquant */ }
            shell.openPath(dir);
        });
        document.getElementById('screenshots-more-btn')?.addEventListener('click', () => this.renderMore());

        // Visionneuse plein écran.
        document.getElementById('screenshots-viewer-close')?.addEventListener('click', () => this.closeViewer());
        document.getElementById('screenshots-viewer')?.addEventListener('click', (e) => {
            if (e.target.id === 'screenshots-viewer') this.closeViewer();
        });
        document.getElementById('screenshots-viewer-delete')?.addEventListener('click', () => this.deleteCurrent());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeViewer();
        });

        this.setTexts();

        // Re-scan à chaque ouverture du panneau (déclenché par le bouton du home).
        document.addEventListener('screenshots:open', () => this.refresh());
        this.refresh();
    }

    setTexts() {
        const title = document.getElementById('screenshots-title');
        if (title) title.textContent = `📷 ${t('screenshots_title') || "Captures d'écran"}`;
        const folderBtn = document.getElementById('screenshots-folder-btn');
        if (folderBtn) folderBtn.textContent = t('screenshots_open_folder') || 'Ouvrir le dossier';
        const moreBtn = document.getElementById('screenshots-more-btn');
        if (moreBtn) moreBtn.textContent = t('screenshots_more') || 'Afficher plus';
        const delBtn = document.getElementById('screenshots-viewer-delete');
        if (delBtn) delBtn.textContent = `🗑 ${t('screenshots_delete') || 'Supprimer'}`;
    }

    screenshotsDir() {
        return path.join(getGameDirectory(dataDirectory, this.config), 'screenshots');
    }

    refresh() {
        const grid = document.getElementById('screenshots-grid');
        const empty = document.getElementById('screenshots-empty');
        if (!grid || !empty) return;

        // Purge les anciennes vignettes (hors message vide).
        grid.querySelectorAll('.screenshot-thumb').forEach(el => el.remove());
        this.files = [];
        this.shown = 0;

        const dir = this.screenshotsDir();
        try {
            if (fs.existsSync(dir)) {
                this.files = fs.readdirSync(dir)
                    .filter(f => f.toLowerCase().endsWith('.png'))
                    .map(f => {
                        const full = path.join(dir, f);
                        let mtime = 0;
                        try { mtime = fs.statSync(full).mtimeMs; } catch { /* ignore */ }
                        return { name: f, full, mtime };
                    })
                    .sort((a, b) => b.mtime - a.mtime);
            }
        } catch (err) {
            console.warn('[Screenshots] scan failed:', err);
        }

        const subtitle = document.getElementById('screenshots-subtitle');
        if (subtitle) {
            subtitle.textContent = (t('screenshots_count') || '{n} capture(s)')
                .replace('{n}', String(this.files.length));
        }

        if (!this.files.length) {
            empty.textContent = t('screenshots_empty') || 'Aucune capture pour cette instance. F2 en jeu !';
            empty.style.display = 'block';
            document.getElementById('screenshots-more-btn').style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        this.renderMore();
    }

    renderMore() {
        const grid = document.getElementById('screenshots-grid');
        if (!grid) return;
        const next = this.files.slice(this.shown, this.shown + PAGE_SIZE);
        for (const file of next) {
            const el = document.createElement('div');
            el.className = 'screenshot-thumb';
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.src = `file://${file.full.replace(/\\/g, '/')}`;
            img.alt = file.name;
            const label = document.createElement('span');
            label.textContent = new Date(file.mtime).toLocaleDateString();
            el.appendChild(img);
            el.appendChild(label);
            el.addEventListener('click', () => this.openViewer(file));
            grid.appendChild(el);
        }
        this.shown += next.length;
        const moreBtn = document.getElementById('screenshots-more-btn');
        if (moreBtn) moreBtn.style.display = this.shown < this.files.length ? 'inline-block' : 'none';
    }

    openViewer(file) {
        this.current = file;
        const viewer = document.getElementById('screenshots-viewer');
        const img = document.getElementById('screenshots-viewer-img');
        const name = document.getElementById('screenshots-viewer-name');
        if (!viewer || !img) return;
        img.src = `file://${file.full.replace(/\\/g, '/')}`;
        if (name) name.textContent = file.name;
        viewer.style.display = 'flex';
    }

    closeViewer() {
        const viewer = document.getElementById('screenshots-viewer');
        if (viewer) viewer.style.display = 'none';
        this.current = null;
    }

    deleteCurrent() {
        if (!this.current) return;
        const msg = (t('screenshots_confirm_delete') || 'Supprimer {name} ?')
            .replace('{name}', this.current.name);
        if (!confirm(msg)) return;
        try {
            fs.unlinkSync(this.current.full);
        } catch (err) {
            console.warn('[Screenshots] delete failed:', err);
        }
        this.closeViewer();
        this.refresh();
    }
}

export default Screenshots;
