# CLAUDE.md — Écosystème Geoventure-MC (Panel · Launcher · Installer)

> Fichier de mémoire pour Claude Code. À placer à la racine du repo `panel`
> (et idéalement une copie dans `installer` et `launcher`).
> Dernière mise à jour : 2026-06-18.

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
- `POST /utils/telemetry` → `api/TelemetryController@store` : télémétrie opt-in (CSRF exempté)
- `GET /data` → `api/FileController@getFiles` : liste des fichiers du modpack (hash/size/url)
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
