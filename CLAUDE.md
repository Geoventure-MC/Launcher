# CLAUDE.md — Écosystème Geoventure-MC (Panel · Launcher · Installer)

> Fichier de mémoire pour Claude Code. À placer à la racine du repo `panel`
> (et idéalement une copie dans `installer` et `launcher`).
> Dernière mise à jour : 2026-07-07.

## 🎯 Vue d'ensemble

Trois dépôts qui **travaillent ensemble** :

| Repo | Stack | Rôle |
|------|-------|------|
| `geoventure-mc/panel` | **Laravel 11 + PHP 8.2** (Blade, Bootstrap) | Panel d'admin web : crée les users, gère serveurs/mods/loader/whitelist/RPC/UI, **expose la config au launcher** via `/utils/*` et `/data` |
| `geoventure-mc/launcher` | **Electron 37 + JS vanilla** | App de jeu. Lit la config du panel. `env: "panel"` (NE JAMAIS CHANGER). `settings: https://launcher.geoventure.fr/` |
| `geoventure-mc/installer` | **Vue 3 + TS + Vite + PHP** | Installe le panel sur le serveur web (télécharge `panel-*.zip` depuis `CentralCorp/centralpanel-v2`) |

3 serveurs gérés : **Geoventure** (#4ade80), **Elandor** (#a78bfa), **Pokeland** (#fb923c). Forge 1.20.1-47.4.20.

## 🔗 Contrat Panel ↔ Launcher (CLÉ)

Le launcher lit le panel via ces routes (définies dans `panel/routes/web.php`) :
- `GET /utils/api`  → `api/ApiController@getOptions` : toute la config (maintenance, loader, serveur, RPC, UI, whitelist…)
- `GET /utils/mods` → `api/ModController@getMods` : mods optionnels
- `GET /utils/notifications` → `api/NotificationController@getNotifications` : annonces in-app
- `GET /utils/servers-status` → `api/ServerStatusController@getServersStatus` : statut en ligne (SLP, cache 30s)
- `GET /utils/community-mods` → `api/CommunityModController@getCommunityMods` : mods communauté approuvés
- `GET /utils/leaderboards` → `api/LeaderboardController@getLeaderboards` : classement joueurs
- `GET /utils/factions` → `api/FactionController@getFactions` : liste des factions
- `GET /utils/achievements` → `api/AchievementController@getAchievements` : catalogue des succès (`code`, `name`, `description`, `icon`, `points`, `category`, `condition_type`, `condition_value`). `condition_type ∈ first_launch|launch_count|playtime_hours|instances_tried|manual`.
- `POST /utils/telemetry` → `api/TelemetryController@store` : télémétrie opt-in (CSRF exempté)
- `GET /data` → `api/FileController@getFiles` : liste des fichiers du modpack (hash/size/url)
- `POST /utils/diagnostic` → (OPTIONNEL, pas encore côté panel) reçoit `{launcherVersion, instance, os, report}` quand le joueur clique « Envoyer au panel » ; le launcher tolère 404/405/501.
- `GET /api-schema.json` → version du schéma API

Le launcher construit l'URL via `settings_url` (= `pkg.settings` ou `localStorage.geoventure_server_url`) + le chemin. Réponses JSON `JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES`.

## 🧩 Multi-instance (Nexus)

Le launcher s'appelle **Nexus** et propose plusieurs serveurs/instances
(Geoventure, Elandor, Pokeland) via le sélecteur (`panels/instances`). Chaque
instance a son propre modpack/loader/mods côté panel. Routing : **`?instance=<slug>`**
ajouté à tous les appels panel via `utils/instance.js → withInstance()` :
- `utils/config.js` → `/utils/api?instance=<slug>`
- `panels/home.js getBaseUrl()` → `/data?instance=<slug>` (modpack séparé)
- `panels/settings.js` → `/utils/mods?instance=<slug>`
- `localStorage.geoventure_selected_instance` = le slug actif (set par le picker
  ET par les pills serveur du home). `utils/gamedir.js` isole le dossier de jeu
  par instance (`instances/<slug>`), l'instance par défaut (1ʳᵉ de `pkg.servers`)
  gardant le chemin legacy. Sans instance → comportement global rétrocompatible.

## 🏆 Succès & Leaderboards live (launcher)

- **Succès in-app** : compteurs locaux (`launch_count`, `playtime_minutes`,
  `instances_tried`, `first_launch`) stockés dans `localStorage` via
  `utils/achievements.js`, fusionnés avec le catalogue serveur de
  `/utils/achievements`. Badges rendus dans le panneau profil avec toasts de
  déblocage.
- **Leaderboards live** : `profile.js` poll `utils/leaderboards` toutes les 30s
  tant que le panneau profil est actif, avec `ETag`/`If-None-Match`
  (`304` → pas de re-render) et animations de changement de rang.

## ✅ Features LAUNCHER livrées (session 2026-07-07)

- **Réparation 1 clic** (`panels/settings.js` + `panels/settings.html`, onglet
  Avancé) : section « 🔧 Réparer l'installation » — purge les caches de config
  `localStorage` (`geoventure_config_cache_*`), vérifie chaque fichier du
  modpack de l'instance active contre le manifeste `{settings_url}data?instance=<slug>`
  (taille puis hash **sha1** en streaming, dossier de jeu via `utils/gamedir.js`,
  anti path-traversal) et supprime les fichiers corrompus (re-téléchargés au
  prochain lancement). Confirmation avant action, spinner pendant l'analyse,
  rapport final, erreur réseau gérée. i18n `repair_*` (fr/en).
- **Skin 3D dans le profil** (`panels/profile.js` + `profile.html`/`profile.css`) :
  carte « 🧍 Mon skin » — preview 3D du joueur connecté (iframe
  `{azauth}skin3d/3d-api/skin-api/{pseudo}`) + bouton « Changer de skin »
  (PNG 64x64 ou 64x32 validé via `Image.onload`, POST multipart
  `{azauth}api/skin-api/skins/update` avec `access_token` du compte + header
  Bearer). Succès → preview + tête du header rafraîchies. Skin-API absente
  (probe avatar → 404) → message discret `profile_skin_api_missing`, pas de
  crash. i18n `profile_skin_*` (fr/en).

## ✅ Feature LIVRÉE : Annonces / Notifications

Page admin **📢 Annonces** qui alimente le bandeau de notifications du launcher.

**Panel** (appliqué via zip sur la branche — à committer/migrer) :
- `database/migrations/2026_05_29_120000_create_options_notifications_table.php` — table `options_notifications` (id, type, message, url, active, expires_at, timestamps)
- `app/Models/OptionsNotification.php`
- `app/Http/Controllers/AdminNotificationController.php` — index/store/toggle/destroy
- `app/Http/Controllers/api/NotificationController.php` — `getNotifications()` (actives + non expirées)
- `resources/views/admin/notifications.blade.php`
- `routes/web.php` — routes `admin.notifications.*` + `GET /utils/notifications`
- `resources/views/layouts/admin.blade.php` — entrée sidebar (icône `bi-megaphone`)
- `lang/fr/messages.php` + `lang/en/messages.php` — bloc `notifications.*`, `sidebar.notifications`, `flash.notification_*`
- ⚠️ Après merge : `php artisan migrate`

**Launcher** (déjà poussé sur `master`) :
- `src/assets/js/panels/home.js` → `initNotifications()` lit `{settings_url}utils/notifications` (et `refreshAllServersStatus` lit `{settings_url}utils/servers-status`).
- Bandeau déjà en place : `#notifications-banner` dans `src/panels/home.html`, styles + i18n (`notif_learn_more`).
- Format attendu par le launcher : `[{ id, type, message, url, expiresAt, createdAt }]`, `type ∈ info|warning|maintenance|event`.

## 🩹 Stabilité / correctifs réseau (session 2026-06-09)

Correctifs livrés suite aux erreurs d'une session launcher live (502/404/double-slash/JSON-parse).

**Launcher** (poussé sur `master`) :
- `utils/config.js` — `getAzAuthUrl()` garde-fou si `azauth` null ; `GetConfig()` vérifie `response.ok` (sinon throw) ; `GetNews()` non-fatal (renvoie un placeholder au lieu de throw).
- `launcher.js` + `panels/login.js` — `getAzAuthUrl()` garde-fou null ; suppression du `console.log('initPreviewSkin called')` (debug) ; null-guards sur les lookups DB `accounts-selected → accounts` dans `initPreviewSkin()`/`initOthers()` (plus de crash au 1er lancement / compte absent).
- `utils.js` — `getAzAuthUrl()` garde-fou `config.config.azauth` null ; `headplayer(pseudo)` ignore la requête skin si pseudo vide (évite `.../avatars/face//` 404).
- `panels/settings.js` — les 3 fetch de mods (`updateModsConfig`, `createModsConfig`, `displayMods`) vérifient `response.ok` avant `.json()` (évite `SyntaxError: Unexpected token '<'` sur page HTML 502).
- `panels/home.js` — `_doLaunch()` : `await launch.Launch()` dans un `try/catch` ; en cas d'échec (ex. `GetInfoVersion: Failed to fetch`), le bouton play réapparaît + message `launch_error` au lieu d'une promesse rejetée non gérée + bouton bloqué.
- `index.js` — `os.platform()` (au lieu de `os ==`) ; garde sur `releases_url` avant accès `assets`.
- i18n `launch_error` ajoutée (fr/en).

**Panel** (poussé sur `main`) :
- `api/ApiController.php` — `azauth` jamais null (fallback `azuriom_url` puis `""`) ; defaults loader alignés sur le serveur réel : `game_version` → `1.20.1`, `loader.build` → `1.20.1-47.4.20`, robustes aussi si le champ existe mais est vide (évite un `game_version` vide qui casse `GetInfoVersion`).
- `api/FileController.php` — `GET /data` renvoie `[]` (200) si `storage/app/public/data` absent + garde sur `scandir()` (sinon `foreach(false)` → TypeError → 500 HTML → launcher plante au téléchargement du jeu).
- `AdminServerController.php` + `routes/web.php` — suppression de la route/méthode `server/update` morte et risquée (mass-assignment sur `OptionsServer::first()`).

**Skin API (Azuriom)** : le launcher utilise déjà les bons endpoints du plugin Skin-API (`/api/skin-api/avatars/face/{name}`, `/skin3d/3d-api/skin-api/{name}`, `POST /api/skin-api/skins/update`). Les 404 observés = plugin Skin-API non installé/actif sur le domaine Azuriom, **pas** un bug launcher.

**À faire côté serveur (infra, pas du code)** :
- Uploader le modpack Forge 1.20.1 dans `storage/app/public/data/` du panel.
- Vérifier Admin → Loader (`1.20.1`, forge `1.20.1-47.4.20`, activé) et Admin → Général (`azuriom_url`).
- Installer/activer le plugin Skin-API sur l'Azuriom pour les avatars.

## 📋 Features PANEL à faire (proposées, pas encore codées)

1. **Mode maintenance amélioré** — existe déjà (`options_security.maintenance` + `maintenance_message` exposés dans `/utils/api`). À enrichir : toggle rapide + le launcher bloque le lancement.
2. **Dashboard stats** — graphiques connexions/joueurs/version launcher (via télémétrie installer).
3. **Journal d'audit** — log des actions admin (migration + observer + vue).
4. ~~`GET /utils/servers-status`~~ — ✅ **Livré** (SLP Minecraft, cache 30s).

## 🧩 Conventions PANEL (Laravel) — à respecter

- Contrôleurs admin : `App\Http\Controllers\Admin*` ou `AdminXController`. API : `App\Http\Controllers\api\*`.
- Modèles d'options : `App\Models\Options*` (table `options_*`, `$fillable`, `$casts`).
- Vues : `resources/views/admin/*.blade.php`, `@extends('layouts.admin')`, sections `title`/`page-title`/`content`.
- Flash : `->with('success', __('messages.flash.xxx'))`. Erreurs : `__('messages.common.errors_occurred')`.
- i18n : `lang/fr/messages.php` & `lang/en/messages.php` (tableaux PHP). Apostrophes FR → chaînes en `"..."`.
- Sidebar : `resources/views/layouts/admin.blade.php`, items `bi-*` (Bootstrap Icons).
- Routes admin dans le groupe `Route::prefix('admin')->middleware('auth')` (indentation **4 espaces**).
- Toujours valider `php -l` après modif (PHP dispo dans l'env).

## ⚙️ CI / Release (IMPORTANT)

- **Installer** & **Launcher** : push sur `master` → workflow bump auto la version (`[skip ci]`), build, et crée une **GitHub Release** (avec `installer.zip` / binaires launcher). Release notes user-friendly déjà en place côté installer.
- Installer : le ZIP est **autonome** (chemins `/assets/...` locaux, PAS de CDN). Ne pas réintroduire le double-build CDN (causait écran bleu).
- YAML i18n (installer, `src/locales/*.yml`) : apostrophes FR → **double-quotes** sinon build cassé.

## 🔐 Accès / Limitations connues

- Le panel se télécharge en HTTP direct : `https://github.com/CentralCorp/centralpanel-v2/releases/latest` (public). Dernière base : **v1.0.8** (`panel-1.0.8.zip`).
- Bug connu launcher : `config.js getAzAuthUrl` plante si `azauth`/`authUrl` est `null` côté panel → bien configurer l'auth (Admin → Général → `azuriom_url`). Le health-check de l'installer le détecte.

## 🌿 Branches de dev

- Installer & Launcher : `claude/friendly-tesla-7kNM4` (mais le user pousse souvent le launcher direct sur `master`).
- Panel : nouveau repo — créer une branche dédiée (ex: `claude/...`) et ouvrir une **PR draft**.

## Tests E2E (Playwright + vrai Electron, 2026-10-07)

`npm ci && npm run test:e2e` (lance `xvfb-run -a playwright test` si pas de `DISPLAY` ; l'Electron 37 du `node_modules` est utilisé via `_electron.launch` avec `--no-sandbox`). Tout est local, aucun workflow GitHub Actions. Si le binaire Electron manque : `node node_modules/electron/install.js`.
- `tests/e2e/mock-panel.mjs` = faux panel HTTP (port 8790) : `/utils/*`, `/data`, AZauth (`/api/auth/*`), skins, RSS. Modes commutables à chaud : `ok`, `html502`, `empty`, `azauthnull`, `down`. Les formes viennent du vrai panel (ex. `/utils/leaderboards` DOIT porter `rank`, `/utils/mods.mods` est indexé par nom de fichier).
- `helpers.mjs` : un Electron par test dans un dossier jetable (`HOME` isolé = dossier de jeu, `AppData` dans le cwd), `localStorage`/IndexedDB amorcés (instance + compte AZauth), et le domaine `https://launcher.geoventure.fr/` des `pkg.servers[].settings` est redirigé vers le mock depuis le processus principal. `prepare(home)` crée un dossier de jeu AVANT l'init des panneaux (la liste des mods est décidée à l'init).
- `launcher.spec.mjs` : démarrage/instances/connexion, home (pastilles, états Installé/À télécharger/Incomplet/Mise à jour requise, bandeau d'annonces échappé, `?instance=`), résilience (502 HTML avec/sans cache, socket coupé, JSON vide, azauth null), réglages (mods, réparation 1 clic, path traversal), profil (classement, saison, factions, succès secrets, skin 3D, upload de skin). Captures dans `tests/e2e/screenshots/` (gitignorées).
- Limites : les ressources externes https (cdnjs, Google Fonts, api.github.com) échouent en CI sandbox (proxy MITM, `ERR_CERT_AUTHORITY_INVALID`) : sans effet sur les assertions. Lancement du jeu (Minecraft/Java) et connexion Microsoft non testés.

## Installation / patch Forge qui « reste à l'infini » (2026-10-07)

Cause : dans `minecraft-java-core-azbetter` (4.1.4), l'événement `error` du patcher Forge n'était relayé par personne (`Minecraft-Loader/index.js forge()`) → `ERR_UNHANDLED_ERROR` dans une promesse jamais attendue → `GetLoader` ne se résolvait plus → écran figé sur « Patch ». Une erreur de loader arrivait aussi comme CHAÎNE et était prise pour le JSON du loader (`Launch.js`).
- Correctif = `patches/minecraft-java-core-azbetter+4.1.4.patch` (appliqué par `patch-package` au `postinstall`) : relais de l'erreur, filet `try/catch` dans `install()`, contrôle du retour du loader dans `Launch.js`, délai d'inactivité de 180 s sur chaque processeur Forge (JVM tuée + erreur claire), erreur de lancement du processus gérée. **Si la lib est mise à jour, régénérer le patch** (`npx patch-package minecraft-java-core-azbetter`).
- `panels/home.js` : l'erreur d'installation s'affiche et le bouton Jouer revient ; la tâche Forge en cours (« Task: MERGE_MAPPING ») est affichée pendant le patch ; journal sur disque `<dossier de jeu>/logs/launcher.log` (Linux : `~/.Nexus/logs/launcher.log`).

## Profils de performance & diagnostic (Réglages > Avancé, 2026-10-08)

- `utils/perf.js` (module PUR, testable depuis Node) : `buildProfile(id, {totalGb, cores})`, `recommendProfile`, `sanitizeJvmArgs`. Garde-fous : jamais > 60 % de la RAM (`floor(0.6 × total)`), minimum 3 Go pour le modpack ; si le plafond < 3 Go → `insufficient` : avertissement, bouton désactivé, RIEN d'appliqué. Cibles max/min : eco 4/2, équilibré 6/3, performant 8/4 (plafonnées). Arguments **Java 17 uniquement** : G1 (base/Aikar allégé) ou `-XX:+UseZGC` (performant avec ≥ 8 cœurs et ≥ 6 Go) — **jamais `-XX:+ZGenerational`** (Java 21). `-Xms/-Xmx` jamais dans les arguments (curseurs RAM). La distance de rendu n'est qu'affichée.
- Stockage : RAM dans la base `ram`, arguments JVM dans `java-args` (`{uuid:'1234', args:[]}`), profil dans `localStorage.nexus_perf_profile` (`{id, ramMin, ramMax, appliedAt, modified}` ; `modified` passe à true si l'utilisateur touche aux curseurs ou aux arguments). `home.js getLaunchOptions()` passe désormais `JVM_ARGS` (sanitisés) à la lib et écrit une ligne `lancement RAM…, JVM…` dans `launcher.log`.
- Matériel : `settings.js detectHardware()` (os.totalmem/freemem/cpus, synchrone) ; GPU via IPC `get-gpu-info` (`app.js`, `app.getGPUInfo('basic')`, délai 3 s) récupéré EN ARRIÈRE-PLAN (`detectGpu()`) : ne jamais l'attendre dans `init()` (ça a ralenti tout le launcher et fait échouer des tests E2E). Simulation pour les tests : variables d'environnement `NEXUS_SIM_RAM_GB`, `NEXUS_SIM_FREE_GB`, `NEXUS_SIM_CORES`, `NEXUS_SIM_GPU`.
- `utils/diagnostic.js` : `redact()` (jetons des comptes enregistrés, `--accessToken`, `password=`, Bearer/JWT, e-mails, hex ≥ 32, home → `~`, `/home/<x>` → `/home/<user>`), `tailLines`, `collectDiagnostic()` (300 lignes de `launcher.log`/`latest.log`, sondes panel `api-schema.json` / Azuriom / Mojang `piston-meta` / Forge maven, 6 s). TOUT le rapport passe par `redact()` avant affichage. Envoi `POST {settings_url}utils/diagnostic` UNIQUEMENT sur clic ; 404/405/501 tolérés. `save-logs-dialog` accepte un nom de fichier par défaut.
- Tests : `tests/e2e/perf.spec.mjs` (règles pures chargées par data: URL, profils selon RAM simulée, masquage, rapport sans panel, 404 puis succès). `helpers.launchLauncher` accepte `env`, le mock expose `setDiagnosticAccept()`. Les tests doivent rester indépendants de la langue (le système de test est en anglais).
- À vérifier sur machines réelles : GPU renvoyé par `getGPUInfo('basic')` (Windows/Linux, parfois seulement vendorId/deviceId), ZGC sur Java 17 Windows/Linux, détection du Java téléchargé (`runtime/*/release`), session Wayland/X11, enregistrement .txt (dialogue natif), copie presse-papiers.
