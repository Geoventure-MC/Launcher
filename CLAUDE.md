# CLAUDE.md — Écosystème Geoventure-MC (Panel · Launcher · Installer)

> Fichier de mémoire pour Claude Code. À placer à la racine du repo `panel`
> (et idéalement une copie dans `installer` et `launcher`).
> Dernière mise à jour : 2026-05-29.

## 🎯 Vue d'ensemble

Trois dépôts qui **travaillent ensemble** :

| Repo | Stack | Rôle |
|------|-------|------|
| `geoventure-mc/panel` | **Laravel 11 + PHP 8.2** (Blade, Bootstrap) | Panel d'admin web : crée les users, gère serveurs/mods/loader/whitelist/RPC/UI, **expose la config au launcher** via `/utils/*` et `/data` |
| `geoventure-mc/launcher` | **Electron 37 + JS vanilla** | App de jeu. Lit la config du panel. `env: "panel"` (NE JAMAIS CHANGER). `settings: https://launcher.bmeouchi.fr/` |
| `geoventure-mc/installer` | **Vue 3 + TS + Vite + PHP** | Installe le panel sur le serveur web (télécharge `panel-*.zip` depuis `CentralCorp/centralpanel-v2`) |

3 serveurs gérés : **Geoventure** (#4ade80), **Elandor** (#a78bfa), **Pokeland** (#fb923c). Forge 1.20.1-47.4.20.

## 🔗 Contrat Panel ↔ Launcher (CLÉ)

Le launcher lit le panel via ces routes (définies dans `panel/routes/web.php`) :
- `GET /utils/api`  → `api/ApiController@getOptions` : toute la config (maintenance, loader, serveur, RPC, UI, whitelist…)
- `GET /utils/mods` → `api/ModController@getMods` : mods optionnels
- `GET /utils/notifications` → `api/NotificationController@getNotifications` : **annonces in-app** (feature ajoutée, voir plus bas)
- `GET /data` → `api/FileController@getFiles` : liste des fichiers du modpack (hash/size/url)

Le launcher construit l'URL via `settings_url` (= `pkg.settings` ou `localStorage.geoventure_server_url`) + le chemin. Réponses JSON `JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES`.

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

## 📋 Features PANEL à faire (proposées, pas encore codées)

1. **Mode maintenance amélioré** — existe déjà (`options_security.maintenance` + `maintenance_message` exposés dans `/utils/api`). À enrichir : toggle rapide + le launcher bloque le lancement.
2. **Dashboard stats** — graphiques connexions/joueurs/version launcher (via télémétrie installer).
3. **Journal d'audit** — log des actions admin (migration + observer + vue).
4. **`GET /utils/servers-status`** — le launcher l'appelle déjà (pills serveurs) mais l'endpoint n'existe pas encore côté panel → à créer (ping des 3 serveurs).

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
