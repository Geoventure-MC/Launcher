/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
'use strict';

import { database, changePanel, accountSelect, Slider, showLoadingOverlay, hideLoadingOverlay, t } from '../utils.js';
import { isConsented, setConsent } from '../utils/telemetry.js';
import * as desktopNotify from '../utils/desktopNotify.js';
import { getGameDirectory } from '../utils/gamedir.js';
import { withInstance } from '../utils/instance.js';
import { getAzAuthUrl } from '../utils/config.js';
import { toGb, recommendProfile, buildProfile, sanitizeJvmArgs, PROFILE_IDS } from '../utils/perf.js';
import { collectDiagnostic } from '../utils/diagnostic.js';
const dataDirectory = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME);

const os = require('os');
const crypto = require('crypto');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');
const { ipcRenderer, shell } = require('electron');
const settings_url = localStorage.getItem('geoventure_server_url') || (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);

class Settings {
    static id = "settings";

    // Per-server game directory (default server keeps its legacy path).
    gameDir() {
        return getGameDirectory(dataDirectory, this.config);
    }

    async init(config) {
        this.config = config;
        this.database = await new database().init();
        this.initSettingsDefault();
        this.hw = await this.detectHardware();
        this.initTab();
        this.initAccount();
        this.initRam();
        this.initLauncherSettings();
        // Panel en 502/JSON invalide : ne doit jamais produire de rejet de promesse non géré.
        this.updateModsConfig().catch(err => console.warn('[settings] updateModsConfig:', err.message || err));
        this.initOptionalMods();
        this.headplayer();
        this.initSkinDropzone();
        this.initAdvanced();
        this.initPerformance();
        this.initDiagnostic();
        this.initRepair();
        this.initCommunityMods();
    }

    // ----- Matériel (profils de performance + diagnostic) -----
    // NEXUS_SIM_RAM_GB / NEXUS_SIM_FREE_GB / NEXUS_SIM_CORES : simulation pour les tests E2E uniquement.
    async detectHardware() {
        const env = process.env;
        const simRam = Number(env.NEXUS_SIM_RAM_GB);
        const cpus = os.cpus() || [];
        const cores = Number(env.NEXUS_SIM_CORES) > 0 ? Number(env.NEXUS_SIM_CORES) : (cpus.length || 1);
        let gpu = env.NEXUS_SIM_GPU || null;
        if (!gpu) {
            try {
                const info = await Promise.race([
                    ipcRenderer.invoke('get-gpu-info'),
                    new Promise(resolve => setTimeout(() => resolve(null), 4000)),
                ]);
                gpu = info && info.name ? info.name : null;
            } catch { /* GPU facultatif */ }
        }
        return {
            totalGb: simRam > 0 ? simRam : toGb(os.totalmem()),
            freeGb: Number(env.NEXUS_SIM_FREE_GB) > 0 ? Number(env.NEXUS_SIM_FREE_GB) : toGb(os.freemem()),
            cores,
            cpuModel: (cpus[0] && cpus[0].model ? cpus[0].model : 'CPU').replace(/\s+/g, ' ').trim(),
            gpu,
        };
    }

    initSkinDropzone() {
        const dropzone = document.getElementById('skinDropzone');
        const fileInput = document.getElementById('fileInput');

        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.handleSkinFile(file);
            }
        });

        dropzone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                await this.handleSkinFile(files[0]);
            }
        });
    }

    async handleSkinFile(file) {
        if (!file) return;

        if (file.type !== 'image/png') {
            alert(t('error_png_required'));
            return;
        }

        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
            if (img.width !== 64 || img.height !== 64) {
                alert(t('error_skin_size'));
                return;
            }

            const dropzone = document.getElementById('skinDropzone');
            dropzone.classList.add('upload-success');

            await this.processSkinChange(file);

            setTimeout(() => {
                dropzone.classList.remove('upload-success');
            }, 2000);
        };
    }

    async refreshData() {
        document.querySelector('.player-role').innerHTML = '';
        document.querySelector('.player-monnaie').innerHTML = '';
        await this.initOthers();
        await this.initPreviewSkin();
        await this.updateAccountImage();
        hideLoadingOverlay();
    }

    async headplayer() {
        const uuidRecord = await this.database.get('1234', 'accounts-selected');
        if (!uuidRecord?.value?.selected) return;
        const accountRecord = await this.database.get(uuidRecord.value.selected, 'accounts');
        if (!accountRecord?.value?.name) return;
        const pseudo = accountRecord.value.name;
        const azauth = this.getAzAuthUrl();
        const timestamp = new Date().getTime();
        const skin_url = `${azauth}api/skin-api/avatars/face/${pseudo}/?t=${timestamp}`;
        document.querySelector(".player-head").style.backgroundImage = `url(${skin_url})`;
    }

    async updateAccountImage() {
        const uuidRecord = await this.database.get('1234', 'accounts-selected');
        if (!uuidRecord?.value?.selected) return;
        const accountRecord = await this.database.get(uuidRecord.value.selected, 'accounts');
        if (!accountRecord?.value) return;
        const account = accountRecord.value;
        const azauth = this.getAzAuthUrl();
        const timestamp = new Date().getTime();

        const accountDiv = document.getElementById(account.uuid);
        if (accountDiv) {
            const accountImage = accountDiv.querySelector('.account-image');
            if (accountImage) {
                accountImage.src = `${azauth}api/skin-api/avatars/face/${account.name}/?t=${timestamp}`;
            } else {
                console.error('Image not found in the selected account div.');
            }
        } else {
            console.error(`No div found with UUID: ${account.uuid}`);
        }
    }

    async initOthers() {
        const uuidRecord = await this.database.get('1234', 'accounts-selected');
        if (!uuidRecord?.value?.selected) return;
        const accountRecord = await this.database.get(uuidRecord.value.selected, 'accounts');
        if (!accountRecord?.value) return;
        const account = accountRecord.value;

        this.updateRole(account);
        this.updateMoney(account);
        this.updateWhitelist(account);
        await this.updateBackground(account);
    }

    updateRole(account) {
        if (this.config.role && account.user_info.role) {
            const blockRole = document.createElement("div");
            blockRole.innerHTML = `<div>${t('grade')}: ${account.user_info.role.name}</div>`;
            document.querySelector('.player-role').appendChild(blockRole);
        } else {
            document.querySelector(".player-role").style.display = "none";
        }
    }

    updateMoney(account) {
        if (this.config.money) {
            const blockMonnaie = document.createElement("div");
            blockMonnaie.innerHTML = `<div>${account.user_info.monnaie} pts</div>`;
            document.querySelector('.player-monnaie').appendChild(blockMonnaie);
        } else {
            document.querySelector(".player-monnaie").style.display = "none";
        }
    }

    updateWhitelist(account) {
        const playBtn = document.querySelector(".play-btn");

        const roleName = account.user_info?.role?.name || null;
        if (this.config.whitelist_activate &&
            (!this.config.whitelist.includes(account.name) &&
                (!roleName || !this.config.whitelist_roles.includes(roleName)))) {
            playBtn.style.background = "#696969";
            playBtn.style.pointerEvents = "none";
            playBtn.style.boxShadow = "none";
            playBtn.textContent = t('unavailable');
        } else {
            playBtn.style.background = "";
            playBtn.style.pointerEvents = "auto";
            playBtn.style.boxShadow = "";
            playBtn.style.opacity = "1";
            playBtn.textContent = t('play');
        }
    }

    updateBackground(account) {
        return new Promise((resolve) => {
            const defaultBg = '../src/assets/images/background/light.jpg';
            let backgroundUrl = null;

            if (this.config.role_data && account.user_info && account.user_info.role) {
                for (const roleKey in this.config.role_data) {
                    if (this.config.role_data.hasOwnProperty(roleKey)) {
                        const role = this.config.role_data[roleKey];
                        if (account.user_info.role.name === role.name && role.background) {
                            const urlPattern = /^(https?:\/\/)/;
                            if (urlPattern.test(role.background)) {
                                backgroundUrl = role.background;
                            }
                            break;
                        }
                    }
                }
            }

            const finalBgUrl = backgroundUrl || defaultBg;

            const img = new Image();
            img.onload = () => {
                document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${finalBgUrl}) black no-repeat center center scroll`;
                document.body.style.backgroundSize = 'cover';
                resolve();
            };

            img.onerror = () => {
                document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${defaultBg}) black no-repeat center center scroll`;
                document.body.style.backgroundSize = 'cover';
                resolve();
            };

            img.src = finalBgUrl;
        });
    }

    initAccount() {
        document.querySelector('.accounts').addEventListener('click', async (e) => {
            const path = e.composedPath();
            const uuid = e.target.id;
            const selectedaccount = await this.database.get('1234', 'accounts-selected');

            if (path[0].classList.contains('account')) {
                showLoadingOverlay();
                accountSelect(uuid);
                await this.database.update({ uuid: "1234", selected: uuid }, 'accounts-selected');
                await this.refreshData();
            }

            if (e.target.classList.contains("account-delete")) {
                const accountElement = path[1];
                this.database.delete(accountElement.id, 'accounts');
                document.querySelector('.accounts').removeChild(accountElement);

                if (!document.querySelector('.accounts').children.length) {
                    changePanel("login");
                    return;
                }

                if (accountElement.id === selectedaccount?.value?.selected) {
                    const allAccounts = await this.database.getAll('accounts');
                    if (Array.isArray(allAccounts) && allAccounts.length > 0) {
                        const newUuid = allAccounts[0]?.value?.uuid;
                        if (newUuid) {
                            this.database.update({ uuid: "1234", selected: newUuid }, 'accounts-selected');
                            accountSelect(newUuid);
                        }
                    } else {
                        changePanel("login");
                    }
                }
            }
        });


        document.querySelector('.add-account').addEventListener('click', () => {
            document.querySelector(".cancel-login").style.display = "contents";
            changePanel("login");
        });
    }

    async initRam() {
        const ramDatabase = (await this.database.get('1234', 'ram'))?.value;
        const totalMem = this.hw ? this.hw.totalGb : Math.trunc(os.totalmem() / 1073741824 * 10) / 10;
        const freeMem = this.hw ? this.hw.freeGb : Math.trunc(os.freemem() / 1073741824 * 10) / 10;

        document.getElementById("total-ram").textContent = `${totalMem} Go RAM`;
        document.getElementById("free-ram").textContent = `${freeMem} Go RAM disponible`;

        const sliderDiv = document.querySelector(".memory-slider");
        sliderDiv.setAttribute("max", Math.trunc((80 * totalMem) / 100));

        const ram = ramDatabase ? ramDatabase : { ramMin: this.config.ram_min, ramMax: this.config.ram_max };
        const slider = new Slider(".memory-slider", parseFloat(ram.ramMin), parseFloat(ram.ramMax));
        this.ramSlider = slider;

        const minSpan = document.querySelector(".slider-touch-left span");
        const maxSpan = document.querySelector(".slider-touch-right span");

        minSpan.setAttribute("value", `${ram.ramMin} Go`);
        maxSpan.setAttribute("value", `${ram.ramMax} Go`);

        slider.on("change", (min, max) => {
            minSpan.setAttribute("value", `${min} Go`);
            maxSpan.setAttribute("value", `${max} Go`);
            this.database.update({ uuid: "1234", ramMin: `${min}`, ramMax: `${max}` }, 'ram');
            this.markProfileModified();
        });
    }

    async updateModsConfig() {
        const gameDir = this.gameDir();
        const modsDir = path.join(gameDir, 'mods');
        const launcherConfigDir = path.join(gameDir, 'launcher_config');
        const modsConfigFile = path.join(launcherConfigDir, 'mods_config.json');

        const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
        const response = await fetch(withInstance(pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/mods` : `${baseUrl}utils/mods`));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const apiMods = await response.json();
        const apiModsSet = new Set(apiMods.optionalMods);

        let localModsConfig;
        try {
            localModsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
        } catch (error) {
            await this.createModsConfig(modsConfigFile);
            localModsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
        }

        for (const localMod in localModsConfig) {
            if (!apiModsSet.has(localMod)) {
                if (!localModsConfig[localMod]) {
                    const modFiles = fs.readdirSync(modsDir).filter(file => file.startsWith(localMod) && file.endsWith('.jar-disable'));
                    if (modFiles.length > 0) {
                        const modFile = modFiles[0];
                        const modFilePath = path.join(modsDir, modFile);
                        const newModFilePath = modFilePath.replace('.jar-disable', '.jar');
                        fs.renameSync(modFilePath, newModFilePath);
                    }
                }
                delete localModsConfig[localMod];
            }
        }

        apiMods.optionalMods.forEach(apiMod => {
            if (!(apiMod in localModsConfig)) {
                localModsConfig[apiMod] = true;
            }
        });

        fs.writeFileSync(modsConfigFile, JSON.stringify(localModsConfig, null, 2));
    }

    async initOptionalMods() {
        const gameDir = this.gameDir();
        const modsDir = path.join(gameDir, 'mods');
        const launcherConfigDir = path.join(gameDir, 'launcher_config');
        const modsConfigFile = path.join(launcherConfigDir, 'mods_config.json');
        const modsListElement = document.getElementById('mods-list');

        if (!fs.existsSync(launcherConfigDir)) {
            fs.mkdirSync(launcherConfigDir, { recursive: true });
        }

        if (!fs.existsSync(modsDir) || fs.readdirSync(modsDir).length === 0) {
            this.displayEmptyModsMessage(modsListElement);
            if (!fs.existsSync(modsConfigFile)) {
                await this.createModsConfig(modsConfigFile);
            }
        } else {
            await this.displayMods(modsConfigFile, modsDir, modsListElement);
        }
    }

    displayEmptyModsMessage(modsListElement) {
        const modElement = document.createElement('div');
        modElement.innerHTML = `
            <div class="mods-container-empty">
              <h2>⚠️ Les mods optionnels n'ont pas encore étés téléchargés. Veuillez lancer une première fois le jeu pour pouvoir les configurer, puis redémarrez le launcher. ⚠️<h2>
            </div>`;
        modsListElement.appendChild(modElement);
    }

    async createModsConfig(modsConfigFile) {
        const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
        const response = await fetch(withInstance(pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/mods` : `${baseUrl}utils/mods`));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const modsConfig = {};

        data.optionalMods.forEach(mod => {
            modsConfig[mod] = true;
        });

        fs.writeFileSync(modsConfigFile, JSON.stringify(modsConfig, null, 2));
    }

    async displayMods(modsConfigFile, modsDir, modsListElement) {
        let modsConfig;

        try {
            modsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
        } catch (error) {
            await this.createModsConfig(modsConfigFile);
            modsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
        }

        const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
        const response = await fetch(withInstance(pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/mods` : `${baseUrl}utils/mods`));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!data.optionalMods || !data.mods) {
            console.error('La réponse API ne contient pas "optionalMods" ou "mods".');
            return;
        }

        data.optionalMods.forEach(mod => {
            const modElement = document.createElement('div');
            const modInfo = data.mods[mod];
            if (!modInfo) {
                console.error(`Les informations pour le mod "${mod}" sont manquantes dans "mods".`);
                modElement.innerHTML = `
                <div class="mods-container">
                  <h2>${t('mod_info_missing_admin').replace('${mod}', mod)}<h2>
                   <div class="switch">
                      <label class="switch-label">
                        <input type="checkbox" id="${mod}" name="mod" value="${mod}" ${modsConfig[mod] ? 'checked' : ''}>
                        <span class="slider round"></span>
                      </label>
                  </div>
                </div>
                <hr>`;
                modsListElement.appendChild(modElement); // sans cet ajout, le message d'erreur admin n'apparaissait jamais
                return;
            }

            const modName = modInfo.name;
            const modDescription = modInfo.description || t('no_mod_description');
            const modLink = modInfo.icon;
            const modRecommanded = modInfo.recommanded;

            modElement.innerHTML = `
                <div class="mods-container">
                  ${modLink ? `<img src="${modLink}" class="mods-icon" alt="${modName} logo">` : ''}
                  <div class="mods-container-text">
                    <div class="mods-container-name">                    
                        <h2>${modName}</h2>
                        <div class="mods-recommanded" style="display: none;">${t('recommended')}</div>
                    </div>
                    <div class="mod-description">${modDescription}</div>
                  </div>
                  <div class="switch">
                    <label class="switch-label">
                      <input type="checkbox" id="${mod}" name="mod" value="${mod}" ${modsConfig[mod] ? 'checked' : ''}>
                      <span class="slider round"></span>
                    </label>
                  </div>
                </div>
                <hr>
            `;

            if (modRecommanded) {
                modElement.querySelector('.mods-recommanded').style.display = 'block';
            }

            modElement.querySelector('input').addEventListener('change', (e) => {
                this.toggleMod(mod, e.target.checked, modsConfig, modsDir, modsConfigFile);
            });

            modsListElement.appendChild(modElement);
        });
    }

    async toggleMod(mod, enabled, modsConfig, modsDir, modsConfigFile) {
        const modFiles = fs.readdirSync(modsDir).filter(file => file.startsWith(mod) && (file.endsWith('.jar') || file.endsWith('.jar-disable')));

        if (modFiles.length > 0) {
            const modFile = modFiles[0];
            const modFilePath = path.join(modsDir, modFile);
            const newModFilePath = enabled ? modFilePath.replace('.jar-disable', '.jar') : modFilePath.replace('.jar', '.jar-disable');

            fs.renameSync(modFilePath, newModFilePath);

            modsConfig[mod] = enabled;
            fs.writeFileSync(modsConfigFile, JSON.stringify(modsConfig, null, 2));
        }
    }

    async selectFile() {
        const input = document.getElementById('fileInput');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            if (file.type !== 'image/png') {
                alert(t('error_png_required'));
                return;
            }
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = async () => {
                if (img.width !== 64 || img.height !== 64) {
                    alert(t('error_skin_size'));
                    return;
                }

                await this.processSkinChange.bind(this)(file);
            };
        };
    }

    async processSkinChange(file) {
        if (!file) {
            console.error('No file provided');
            return;
        }
        const azauth = this.getAzAuthUrl();
        const uuidRec = await this.database.get('1234', 'accounts-selected');
        if (!uuidRec?.value?.selected) return;
        const accountRec = await this.database.get(uuidRec.value.selected, 'accounts');
        if (!accountRec?.value) return;
        let account = accountRec.value;
        const access_token = account.access_token;
        const formData = new FormData();
        formData.append('access_token', access_token);
        formData.append('skin', file);
        const xhr = new XMLHttpRequest();

        xhr.open('POST', `${azauth}api/skin-api/skins/update`, true);

        xhr.onload = async () => {
            console.log(`XHR Response: ${xhr.response}`);
            if (xhr.status === 200) {
                console.log('Skin updated successfully!');
                await this.initPreviewSkin();
                await this.headplayer();
            } else {
                console.error(`Failed to update skin. Status code: ${xhr.status}`);
            }
        };

        xhr.onerror = () => {
            console.error('Request failed');
        };

        xhr.send(formData);
    }

    async initPreviewSkin() {
        const azauth = this.getAzAuthUrl();
        const uuidRec = await this.database.get('1234', 'accounts-selected');
        if (!uuidRec?.value?.selected) return;
        const accountRec = await this.database.get(uuidRec.value.selected, 'accounts');
        if (!accountRec?.value?.name) return;
        let account = accountRec.value;

        let title = document.querySelector('.player-skin-title');
        if (title) title.innerHTML = `Skin de ${account.name}`;

        const skin = document.querySelector('.skin-renderer-settings');
        if (!skin) return;
        const url = `${azauth}skin3d/3d-api/skin-api/${account.name}`;
        skin.src = url;
    }

    async initResolution() {
        let resolutionDatabase = (await this.database.get('1234', 'screen'))?.value?.screen;
        let resolution = resolutionDatabase ? resolutionDatabase : { width: "1280", height: "720" };

        let width = document.querySelector(".width-size");
        width.value = resolution.width;

        let height = document.querySelector(".height-size");
        height.value = resolution.height;

        let select = document.getElementById("select");
        select.addEventListener("change", (event) => {
            let resolution = select.options[select.options.selectedIndex].value.split(" x ");
            select.options.selectedIndex = 0;

            width.value = resolution[0];
            height.value = resolution[1];
            this.database.update({ uuid: "1234", screen: { width: resolution[0], height: resolution[1] } }, 'screen');
        });
    }

    async initLauncherSettings() {
        let launcherDatabase = (await this.database.get('1234', 'launcher'))?.value;
        let settingsLauncher = {
            uuid: "1234",
            launcher: {
                close: launcherDatabase?.launcher?.close || 'close-launcher'
            }
        }

        let closeLauncher = document.getElementById("launcher-close");
        let closeAll = document.getElementById("launcher-close-all");
        let openLauncher = document.getElementById("launcher-open");

        if (settingsLauncher.launcher.close === 'close-launcher') {
            closeLauncher.checked = true;
        } else if (settingsLauncher.launcher.close === 'close-all') {
            closeAll.checked = true;
        } else if (settingsLauncher.launcher.close === 'open-launcher') {
            openLauncher.checked = true;
        }

        closeLauncher.addEventListener("change", () => {
            if (closeLauncher.checked) {
                openLauncher.checked = false;
                closeAll.checked = false;
            }
            if (!closeLauncher.checked) closeLauncher.checked = true;
            settingsLauncher.launcher.close = 'close-launcher';
            this.database.update(settingsLauncher, 'launcher');
        })

        closeAll.addEventListener("change", () => {
            if (closeAll.checked) {
                closeLauncher.checked = false;
                openLauncher.checked = false;
            }
            if (!closeAll.checked) closeAll.checked = true;
            settingsLauncher.launcher.close = 'close-all';
            this.database.update(settingsLauncher, 'launcher');
        })

        openLauncher.addEventListener("change", () => {
            if (openLauncher.checked) {
                closeLauncher.checked = false;
                closeAll.checked = false;
            }
            if (!openLauncher.checked) openLauncher.checked = true;
            settingsLauncher.launcher.close = 'open-launcher';
            this.database.update(settingsLauncher, 'launcher');
        })
    }

    initTab() {
        let TabBtn = document.querySelectorAll('.tab-btn');
        let TabContent = document.querySelectorAll('.tabs-settings-content');

        for (let i = 0; i < TabBtn.length; i++) {
            TabBtn[i].addEventListener('click', () => {
                if (TabBtn[i].classList.contains('save-tabs-btn')) return;
                for (let j = 0; j < TabBtn.length; j++) {
                    TabContent[j].classList.remove('active-tab-content');
                    TabBtn[j].classList.remove('active-tab-btn');
                }
                TabContent[i].classList.add('active-tab-content');
                TabBtn[i].classList.add('active-tab-btn');
            });
        }

        document.querySelector('.save-tabs-btn').addEventListener('click', async () => {
            document.querySelector('.default-tab-btn').click();
            showLoadingOverlay();
            changePanel("home");
            await this.refreshData();
        });

        document.getElementById('accounts-tab').innerHTML = `<i class="fas fa-user"></i><span>${t('accounts')}</span>`;
        document.getElementById('ram-tab').innerHTML = `<i class="fab fa-java"></i><span>${t('ram_settings')}</span>`;
        document.getElementById('launch-tab').innerHTML = `<i class="fas fa-rocket"></i><span>${t('launcher_loading')}</span>`;
        document.getElementById('mods-tab').innerHTML = `<i class="fas fa-puzzle-piece"></i><span>${t('optional_mods')}</span>`;
        document.getElementById('skin-tab').innerHTML = `<i class="fas fa-tshirt"></i><span>${t('skin')}</span>`;
        if (document.getElementById('advanced-tab')) document.getElementById('advanced-tab').innerHTML = `<i class="fas fa-cog"></i><span>${t('advanced') || 'Avancé'}</span>`;
        if (document.getElementById('community-tab')) document.getElementById('community-tab').innerHTML = `<i class="fas fa-cubes"></i><span>${t('community_mods') || 'Communauté'}</span>`;
        document.getElementById('save-tab').innerHTML = `<i class="fas fa-save"></i><span>${t('save')}</span>`;

        document.getElementById('add-account-btn').innerHTML = `<i class="fas fa-plus"></i> <span>${t('add_account')}</span>`;
        document.getElementById('ram-title').textContent = t('ram_settings');
        document.getElementById('ram-info').innerHTML = t('ram_detailed_info');
        document.getElementById('total-ram').textContent = t('total_ram');
        document.getElementById('free-ram').textContent = t('free_ram');
        document.getElementById('launch-title').textContent = t('launcher_loading');
        document.getElementById('close-launcher-text').textContent = t('close_launcher');
        document.getElementById('close-all-text').textContent = t('close_all');
        document.getElementById('open-launcher-text').textContent = t('open_launcher');
        document.getElementById('mods-title').textContent = t('optional_mods');
        document.getElementById('mods-info').innerHTML = t('mods_detailed_info');
        document.getElementById('skin-title').textContent = t('skin');

        const privacyTitle = document.getElementById('privacy-title');
        if (privacyTitle) privacyTitle.textContent = t('privacy_title') || 'Confidentialité';
        const telemetryLabel = document.getElementById('telemetry-consent-label');
        if (telemetryLabel) telemetryLabel.textContent = t('telemetry_consent') || "Partager des statistiques anonymes d'utilisation";
        const desktopNotifLabel = document.getElementById('desktop-notifications-label');
        if (desktopNotifLabel) desktopNotifLabel.textContent = t('desktop_notifications') || 'Notifications de bureau (annonces, serveurs)';

        const dropzoneText = document.getElementById('dropzone-text');
        if (dropzoneText) dropzoneText.textContent = t('dropzone_drag');
        const dropzoneSubtext = document.querySelector('.dropzone-subtext');
        if (dropzoneSubtext) dropzoneSubtext.textContent = t('dropzone_click');
        const dropzoneReq = document.querySelector('.dropzone-requirements');
        if (dropzoneReq) dropzoneReq.textContent = t('dropzone_requirements');
        const dropzoneHoverSpan = document.querySelector('.dropzone-hover-state span');
        if (dropzoneHoverSpan) dropzoneHoverSpan.textContent = t('dropzone_drop');
    }

    async initSettingsDefault() {
        if (!(await this.database.getAll('accounts-selected')).length) {
            this.database.add({ uuid: "1234" }, 'accounts-selected')
        }

        if (!(await this.database.getAll('java-path')).length) {
            this.database.add({ uuid: "1234", path: false }, 'java-path')
        }

        if (!(await this.database.getAll('java-args')).length) {
            this.database.add({ uuid: "1234", args: [] }, 'java-args')
        }

        if (!(await this.database.getAll('launcher')).length) {
            this.database.add({
                uuid: "1234",
                launcher: {
                    close: 'close-launcher'
                }
            }, 'launcher')
        }

        if (!(await this.database.getAll('ram')).length) {
            this.database.add({ uuid: "1234", ramMin: "2", ramMax: "4" }, 'ram')
        }

        if (!(await this.database.getAll('screen')).length) {
            this.database.add({ uuid: "1234", screen: { width: "1280", height: "720" } }, 'screen')
        }
    }

    getAzAuthUrl() {
        // Garde-fou azauth null/absent partagé avec les autres panneaux (utils/config.js).
        return getAzAuthUrl(this.config);
    }

    initAdvanced() {
        const openFolderBtn = document.getElementById('open-folder-btn');
        if (openFolderBtn) {
            const gameDir = this.gameDir();
            openFolderBtn.addEventListener('click', () => {
                // Ensure the active server's directory exists before opening it.
                try { if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true }); } catch (e) { /* non-blocking */ }
                shell.openPath(gameDir);
            });
        }
        this.initResolution();
        this.initTelemetryConsent();
        this.initDesktopNotifications();
    }

    initDesktopNotifications() {
        const checkbox = document.getElementById('desktop-notifications');
        if (!checkbox) return;
        checkbox.checked = desktopNotify.isEnabled();
        checkbox.addEventListener('change', () => {
            desktopNotify.setEnabled(checkbox.checked);
        });
    }

    initTelemetryConsent() {
        const checkbox = document.getElementById('telemetry-consent');
        if (!checkbox) return;
        checkbox.checked = isConsented();
        checkbox.addEventListener('change', () => {
            setConsent(checkbox.checked);
        });
    }

    // ----- Profils de performance -----
    static PERF_KEY = 'nexus_perf_profile';

    _perfStored() {
        try { return JSON.parse(localStorage.getItem(Settings.PERF_KEY) || 'null'); } catch { return null; }
    }

    _profileName(id) { return t(`perf_profile_${id}`); }

    markProfileModified() {
        const st = this._perfStored();
        if (!st || st.modified) return;
        st.modified = true;
        try { localStorage.setItem(Settings.PERF_KEY, JSON.stringify(st)); } catch { /* */ }
        this.renderCurrentProfile();
    }

    renderCurrentProfile() {
        const el = document.getElementById('perf-current');
        if (!el) return;
        const st = this._perfStored();
        el.textContent = !st ? t('perf_current_none')
            : t(st.modified ? 'perf_current_modified' : 'perf_current').replace('{profile}', this._profileName(st.id));
    }

    renderProfileDetails() {
        const hw = this.hw;
        const select = document.getElementById('perf-profile-select');
        const plan = buildProfile(select.value, hw);
        this.perfPlan = plan;
        const details = document.getElementById('perf-details');
        const warnings = document.getElementById('perf-warnings');
        const btn = document.getElementById('perf-optimize-btn');
        if (plan.insufficient) {
            details.textContent = t('perf_details_insufficient');
        } else {
            const zgc = plan.jvmArgs.includes('-XX:+UseZGC');
            details.innerHTML = t('perf_details')
                .replace('{min}', plan.ramMin).replace('{max}', plan.ramMax)
                .replace('{gc}', this._escapeHtml(t(zgc ? 'perf_gc_zgc' : 'perf_gc_g1')))
                .replace('{rd}', plan.renderDistance);
        }
        warnings.innerHTML = plan.warnings
            .map(k => `<div class="${k === 'perf_warn_insufficient' ? 'perf-warn-bad' : ''}">${this._escapeHtml(t(k))}</div>`).join('');
        btn.disabled = plan.insufficient;
    }

    initPerformance() {
        const btn = document.getElementById('perf-optimize-btn');
        const select = document.getElementById('perf-profile-select');
        const jvmInput = document.getElementById('jvm-args-input');
        if (!btn || !select || !this.hw) return;
        const hw = this.hw;
        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        set('perf-title', t('perf_title'));
        set('perf-info', t('perf_info'));
        set('perf-profile-label', t('perf_profile_label'));
        set('perf-optimize-text', t('perf_optimize_btn'));
        set('jvm-args-label', t('jvm_args_label'));
        jvmInput.title = t('jvm_args_help');
        jvmInput.placeholder = t('jvm_args_help');
        set('perf-hw', t('perf_hw').replace('{ram}', hw.totalGb).replace('{free}', hw.freeGb)
            .replace('{cores}', hw.cores).replace('{cpu}', hw.cpuModel).replace('{gpu}', hw.gpu || t('perf_gpu_unknown')));

        const recommended = recommendProfile(hw.totalGb, hw.cores);
        for (const opt of select.options) {
            opt.textContent = this._profileName(opt.value) + (opt.value === recommended ? ` (${t('perf_recommended')})` : '');
        }
        select.value = recommended;
        select.addEventListener('change', () => this.renderProfileDetails());
        this.renderProfileDetails();

        // Ligne « profil actuel » sous le bouton.
        const status = document.getElementById('perf-status');
        let cur = document.getElementById('perf-current');
        if (!cur) {
            cur = document.createElement('div');
            cur.id = 'perf-current';
            cur.className = 'repair-info';
            status.parentNode.insertBefore(cur, status);
        }
        this.renderCurrentProfile();

        // Arguments JVM : lecture de la base, édition à la main.
        this.database.get('1234', 'java-args').then(r => {
            const args = r && r.value && Array.isArray(r.value.args) ? r.value.args : [];
            jvmInput.value = args.join(' ');
        }).catch(() => { /* champ vide */ });
        jvmInput.addEventListener('change', async () => {
            const args = sanitizeJvmArgs(jvmInput.value);
            jvmInput.value = args.join(' ');
            await this.database.update({ uuid: '1234', args }, 'java-args');
            this.markProfileModified();
        });

        // La sync du curseur RAM se fait à l'ouverture de l'onglet (le curseur est mesuré visible).
        const ramTab = document.getElementById('ram-tab');
        if (ramTab) ramTab.addEventListener('click', () => {
            if (!this.pendingSlider || !this.ramSlider) return;
            const { min, max } = this.pendingSlider;
            this.pendingSlider = null;
            requestAnimationFrame(() => { this.ramSlider.setMinValue(min); this.ramSlider.setMaxValue(max); });
        });

        btn.addEventListener('click', async () => {
            const plan = this.perfPlan;
            if (!plan || plan.insufficient) return;
            const name = this._profileName(plan.id);
            const ok = confirm(t('perf_confirm').replace('{profile}', name).replace('{min}', plan.ramMin)
                .replace('{max}', plan.ramMax).replace('{args}', plan.jvmArgs.join(' ')));
            if (!ok) return;
            await this.database.update({ uuid: '1234', ramMin: `${plan.ramMin}`, ramMax: `${plan.ramMax}` }, 'ram');
            await this.database.update({ uuid: '1234', args: plan.jvmArgs }, 'java-args');
            try {
                localStorage.setItem(Settings.PERF_KEY, JSON.stringify({ id: plan.id, ramMin: plan.ramMin, ramMax: plan.ramMax, appliedAt: Date.now(), modified: false }));
            } catch { /* */ }
            jvmInput.value = plan.jvmArgs.join(' ');
            const minSpan = document.querySelector('.slider-touch-left span');
            const maxSpan = document.querySelector('.slider-touch-right span');
            if (minSpan) minSpan.setAttribute('value', `${plan.ramMin} Go`);
            if (maxSpan) maxSpan.setAttribute('value', `${plan.ramMax} Go`);
            this.pendingSlider = { min: plan.ramMin, max: plan.ramMax };
            this.renderCurrentProfile();
            status.style.display = 'flex';
            status.className = 'repair-status repair-status-ok';
            status.innerHTML = `<i class="fas fa-check-circle"></i><span>${this._escapeHtml(t('perf_applied').replace('{profile}', name).replace('{min}', plan.ramMin).replace('{max}', plan.ramMax))}</span>`;
        });
    }

    // ----- Diagnostic en 1 clic -----
    async _secretsToMask() {
        const out = [];
        try {
            const all = await this.database.getAll('accounts');
            for (const a of all || []) {
                const v = a && (a.value || a);
                for (const k of ['access_token', 'client_token', 'refresh_token']) if (v && typeof v[k] === 'string') out.push(v[k]);
                if (v && v.meta && typeof v.meta.refresh_token === 'string') out.push(v.meta.refresh_token);
            }
        } catch { /* */ }
        return out;
    }

    initDiagnostic() {
        const runBtn = document.getElementById('diag-run-btn');
        if (!runBtn) return;
        const $ = id => document.getElementById(id);
        const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
        set('diag-title', t('diag_title'));
        set('diag-info', t('diag_info'));
        set('diag-run-text', t('diag_run_btn'));
        set('diag-copy-text', t('diag_copy'));
        set('diag-save-text', t('diag_save'));
        set('diag-logs-text', t('diag_logs'));
        set('diag-send-text', t('diag_send'));
        set('diag-send-note', t('diag_send_note'));

        const status = $('diag-status');
        const say = (kind, msg, spinner = false) => {
            status.style.display = 'flex';
            status.className = `repair-status${kind ? ` repair-status-${kind}` : ''}`;
            const icon = spinner ? '<span class="community-spinner"></span>'
                : `<i class="fas ${kind === 'ok' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>`;
            status.innerHTML = `${icon}<span>${this._escapeHtml(msg)}</span>`;
        };
        const output = $('diag-output');
        const gameDir = () => this.gameDir();

        runBtn.addEventListener('click', async () => {
            runBtn.disabled = true;
            say('', t('diag_running'), true);
            try {
                const ram = (await this.database.get('1234', 'ram'))?.value;
                const javaPath = (await this.database.get('1234', 'java-path'))?.value?.path;
                const jvm = (await this.database.get('1234', 'java-args'))?.value?.args;
                const st = this._perfStored();
                const report = await collectDiagnostic({
                    pkg, config: this.config, gameDir: gameDir(), settingsUrl: settings_url,
                    azauthUrl: this.getAzAuthUrl(), instance: localStorage.getItem('geoventure_selected_instance'),
                    hw: this.hw, javaPath: javaPath || null, ram, jvmArgs: jvm,
                    profile: st ? `${st.id}${st.modified ? ' (modifié à la main)' : ''}` : null,
                    secrets: await this._secretsToMask(),
                });
                output.value = report;
                $('diag-result').style.display = 'block';
                say('ok', t('diag_ready'));
            } catch (err) {
                console.error('Diagnostic failed:', err);
                say('error', t('diag_error'));
            }
            runBtn.disabled = false;
        });

        $('diag-copy-btn').addEventListener('click', () => {
            try { require('electron').clipboard.writeText(output.value); say('ok', t('diag_copied')); }
            catch { say('error', t('diag_error')); }
        });

        $('diag-save-btn').addEventListener('click', async () => {
            try {
                const file = await ipcRenderer.invoke('save-logs-dialog', `nexus-diagnostic-${Date.now()}.txt`);
                if (!file) return;
                fs.writeFileSync(file, output.value, 'utf8');
                say('ok', t('diag_saved').replace('{file}', path.basename(file)));
            } catch { say('error', t('diag_error')); }
        });

        $('diag-logs-btn').addEventListener('click', () => {
            const dir = path.join(gameDir(), 'logs');
            try { fs.mkdirSync(dir, { recursive: true }); } catch { /* */ }
            shell.openPath(dir);
        });

        // Envoi : UNIQUEMENT sur clic. Un 404/405/501 (panel sans la route) est toléré.
        $('diag-send-btn').addEventListener('click', async () => {
            const btn = $('diag-send-btn');
            btn.disabled = true;
            try {
                const base = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
                const res = await fetch(`${base}utils/diagnostic`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000,
                    body: JSON.stringify({
                        launcherVersion: pkg.version,
                        instance: localStorage.getItem('geoventure_selected_instance') || null,
                        os: process.platform,
                        report: output.value,
                    }),
                });
                if ([404, 405, 501].includes(res.status)) say('error', t('diag_send_unsupported'));
                else if (!res.ok) say('error', t('diag_send_error'));
                else say('ok', t('diag_sent'));
            } catch { say('error', t('diag_send_error')); }
            btn.disabled = false;
        });
    }

    // ----- Réparation 1 clic -----
    // (a) purge les caches de config localStorage, (b) vérifie les fichiers du
    // modpack de l'instance active contre le manifeste {settings_url}data
    // (path/size/hash sha1 — mêmes champs que ceux vérifiés au lancement par
    // minecraft-java-core) et supprime les fichiers corrompus : ils seront
    // re-téléchargés au prochain lancement.
    initRepair() {
        const btn = document.getElementById('repair-btn');
        if (!btn) return;

        const title = document.getElementById('repair-title');
        if (title) title.textContent = `🔧 ${t('repair_title')}`;
        const info = document.getElementById('repair-info');
        if (info) info.textContent = t('repair_info');
        const btnText = document.getElementById('repair-btn-text');
        if (btnText) btnText.textContent = t('repair_btn');

        btn.addEventListener('click', async () => {
            if (!confirm(t('repair_confirm'))) return;

            const status = document.getElementById('repair-status');
            btn.disabled = true;
            if (status) {
                status.style.display = 'flex';
                status.className = 'repair-status';
                status.innerHTML = `<span class="community-spinner"></span><span>${t('repair_scanning')}</span>`;
            }

            try {
                const report = await this.repairInstallation();
                if (status) {
                    status.className = 'repair-status repair-status-ok';
                    const msg = report.deleted > 0
                        ? t('repair_done').replace('{count}', report.deleted)
                        : t('repair_done_clean');
                    status.innerHTML = `<i class="fas fa-check-circle"></i><span>${this._escapeHtml(msg)}</span>`;
                }
            } catch (err) {
                console.error('Repair failed:', err);
                if (status) {
                    status.className = 'repair-status repair-status-error';
                    status.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${this._escapeHtml(t('repair_error'))}</span>`;
                }
            }

            btn.disabled = false;
        });
    }

    async repairInstallation() {
        // (a) Purge des caches de config (mode hors-ligne), toutes instances.
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('geoventure_config_cache_')) localStorage.removeItem(key);
        }

        // (b) Manifeste du modpack de l'instance active.
        const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
        const manifestUrl = withInstance(pkg.env === 'azuriom' ? `${baseUrl}api/centralcorp/files` : `${baseUrl}data`);
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = await response.json();
        if (!Array.isArray(manifest)) throw new Error('Invalid manifest');

        const gameDir = this.gameDir();
        let deleted = 0;

        for (const entry of manifest) {
            if (!entry || typeof entry.path !== 'string' || !entry.path) continue;

            const filePath = path.join(gameDir, entry.path);
            // Anti path-traversal : on reste dans le dossier de jeu.
            if (filePath !== gameDir && !filePath.startsWith(gameDir + path.sep)) continue;

            let stat;
            try {
                stat = fs.statSync(filePath);
            } catch {
                continue; // fichier absent → re-téléchargé au prochain lancement
            }
            if (!stat.isFile()) continue;

            let corrupted = false;
            if (entry.size != null && stat.size !== Number(entry.size)) {
                corrupted = true;
            } else if (entry.hash) {
                const localHash = await this._sha1File(filePath);
                corrupted = localHash.toLowerCase() !== String(entry.hash).toLowerCase();
            }

            if (corrupted) {
                try {
                    fs.unlinkSync(filePath);
                    deleted++;
                } catch (err) {
                    console.error(`Failed to delete corrupted file ${filePath}:`, err);
                }
            }
        }

        try {
            window.dispatchEvent(new CustomEvent('nexus:install-state-changed', {
                detail: { slug: localStorage.getItem('geoventure_selected_instance') || null },
            }));
        } catch { /* cosmétique */ }
        return { deleted };
    }

    // sha1 en streaming (les .jar peuvent faire >100 MB, pas de readFileSync).
    _sha1File(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            stream.on('error', reject);
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }

    async initCommunityMods() {
        const infoEl = document.getElementById('community-info');
        const listEl = document.getElementById('community-mods-list');
        const toolbarEl = document.getElementById('community-toolbar');
        const searchInput = document.getElementById('community-search-input');
        const filtersEl = document.getElementById('community-filters');
        if (!listEl) return;

        const baseUrl = settings_url.endsWith('/') ? settings_url : `${settings_url}/`;

        if (infoEl) {
            infoEl.textContent = t('community_mods_info');
        }
        if (searchInput) {
            searchInput.placeholder = t('community_search_placeholder');
        }

        // Loading state.
        if (toolbarEl) toolbarEl.style.display = 'none';
        listEl.innerHTML = `<div class="mods-container-empty community-loading"><span class="community-spinner"></span>${t('community_loading')}</div>`;

        let mods;
        try {
            let response = await fetch(withInstance(`${baseUrl}utils/community-mods`));
            if (!response.ok) response = await fetch(withInstance(`${baseUrl}api/centralcorp/community-mods`));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            mods = await response.json();
        } catch (err) {
            console.error('Failed to fetch community mods:', err);
            listEl.innerHTML = `<div class="mods-container-empty"><h2>${t('community_load_error')}</h2></div>`;
            return;
        }

        if (!Array.isArray(mods) || !mods.length) {
            listEl.innerHTML = `<div class="mods-container-empty"><h2>${t('community_empty')}</h2></div>`;
            return;
        }

        const modsDir = path.join(this.gameDir(), 'mods');

        // Categories are optional in the API payload; only build the filter when present.
        const categories = [...new Set(
            mods.map(m => (m.category || '').trim()).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));

        let activeCategory = 'all';
        let searchTerm = '';

        const render = () => {
            const term = searchTerm.toLowerCase();
            const visible = mods.filter(mod => {
                if (activeCategory !== 'all' && (mod.category || '').trim() !== activeCategory) return false;
                if (!term) return true;
                const haystack = `${mod.name || ''} ${mod.description || ''} ${mod.author || ''}`.toLowerCase();
                return haystack.includes(term);
            });

            listEl.innerHTML = '';

            if (!visible.length) {
                listEl.innerHTML = `<div class="mods-container-empty">${t('community_no_results')}</div>`;
                return;
            }

            for (const mod of visible) {
                const modFileName = mod.filename || path.basename(mod.url || '');
                const modFilePath = modFileName ? path.join(modsDir, modFileName) : '';
                const isInstalled = !!modFilePath && fs.existsSync(modFilePath);
                const canInstall = !!(mod.url && modFileName);

                const el = document.createElement('div');
                el.classList.add('mods-container');

                const safeName = this._escapeHtml(mod.name || '');
                const metaParts = [];
                if (mod.author) metaParts.push(`<span class="community-meta-author">${this._escapeHtml(mod.author)}</span>`);
                if (mod.version) metaParts.push(`<span class="community-meta-version">v${this._escapeHtml(mod.version)}</span>`);

                el.innerHTML = `
                    ${mod.icon ? `<img src="${this._escapeHtml(mod.icon)}" class="mods-icon" alt="${safeName}" onerror="this.style.display='none'">` : ''}
                    <div class="mods-container-text">
                        <div class="mods-container-name">
                            <h2>${safeName}</h2>
                            ${mod.category ? `<span class="community-badge">${this._escapeHtml(mod.category)}</span>` : ''}
                        </div>
                        ${metaParts.length ? `<div class="community-meta">${metaParts.join('')}</div>` : ''}
                        <div class="mod-description">${this._escapeHtml(mod.description || t('no_mod_description'))}</div>
                    </div>
                    <div class="community-actions">
                        ${mod.url ? `<button class="community-link-btn" type="button">${t('community_open_link')}</button>` : ''}
                        ${canInstall ? `<button class="community-mod-btn ${isInstalled ? 'uninstall' : 'install'}">${isInstalled ? t('uninstall_mod') : t('install_mod')}</button>` : ''}
                    </div>
                `;

                const linkBtn = el.querySelector('.community-link-btn');
                if (linkBtn) {
                    linkBtn.addEventListener('click', () => {
                        if (mod.url) shell.openExternal(mod.url);
                    });
                }

                const btn = el.querySelector('.community-mod-btn');
                if (btn) {
                    btn.addEventListener('click', async () => {
                        if (btn.classList.contains('install')) {
                            btn.disabled = true;
                            btn.textContent = '...';
                            try {
                                if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
                                const nodeFetch = require('node-fetch');
                                const fileRes = await nodeFetch(mod.url);
                                if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
                                const buffer = await fileRes.buffer();
                                fs.writeFileSync(modFilePath, buffer);
                                btn.classList.remove('install');
                                btn.classList.add('uninstall');
                                btn.textContent = t('uninstall_mod');
                            } catch (err) {
                                console.error('Failed to install mod:', err);
                                btn.textContent = t('community_error');
                            }
                            btn.disabled = false;
                        } else {
                            try {
                                if (fs.existsSync(modFilePath)) fs.unlinkSync(modFilePath);
                                btn.classList.remove('uninstall');
                                btn.classList.add('install');
                                btn.textContent = t('install_mod');
                            } catch (err) {
                                console.error('Failed to uninstall mod:', err);
                            }
                        }
                    });
                }

                listEl.appendChild(el);
            }
        };

        // Build the category filter chips only when the data actually carries categories.
        if (filtersEl) {
            filtersEl.innerHTML = '';
            if (categories.length) {
                const makeChip = (value, label) => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'community-filter-chip' + (value === activeCategory ? ' active' : '');
                    chip.textContent = label;
                    chip.addEventListener('click', () => {
                        activeCategory = value;
                        filtersEl.querySelectorAll('.community-filter-chip').forEach(c => c.classList.remove('active'));
                        chip.classList.add('active');
                        render();
                    });
                    return chip;
                };
                filtersEl.appendChild(makeChip('all', t('community_all_categories')));
                categories.forEach(cat => filtersEl.appendChild(makeChip(cat, cat)));
            }
        }

        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = () => {
                searchTerm = searchInput.value.trim();
                render();
            };
        }

        if (toolbarEl) toolbarEl.style.display = '';
        render();
    }

    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
export default Settings;