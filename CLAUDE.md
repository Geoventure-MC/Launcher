# Launcher Geoventure (Nexus)

Application de jeu (Electron, JavaScript sans framework). Elle lit sa configuration sur le panel (dépôt `panel`). `env: "panel"` ne se change JAMAIS ; `settings: https://launcher.geoventure.fr/`. Forge 1.20.1.

## Règles

- **100 % en français** (commits, releases, PR) : `Ajout :`, `Correction :`, `Amélioration :`, `Documentation :`, `Maintenance :`.
- Branche unique `main`, le hook `post-commit` pousse tout seul. Un push déclenche le workflow : version, build, GitHub Release.
- Aucun secret dans le dépôt.

## Contrat avec le panel : à ne pas casser

L'URL se construit avec `settings_url` (`pkg.settings` ou `localStorage.geoventure_server_url`) + le chemin : `/utils/api`, `/utils/mods`, `/utils/notifications`, `/utils/servers-status`, `/utils/community-mods`, `/utils/leaderboards`, `/utils/factions`, `/utils/achievements`, `/utils/seasons`, `/utils/wonder`, `/utils/telemetry`, `/data`. Détail : `docs/claude/reference.md`, « Contrat Panel ↔ Launcher ».

Piège connu : `config.js getAzAuthUrl` plante si `azauth` ou `authUrl` vaut `null` côté panel.

## Avant de toucher X, lire la section de `docs/claude/reference.md`

Trouver le titre avec `grep -n "^## " docs/claude/reference.md`.

| Sujet | Section |
|---|---|
| Multi-instance, canaux Stable / Test | « Multi-instance », « Sélecteur de canal d'instance » |
| Succès et classements en direct | « Succès & Leaderboards live » |
| Annonces | « Annonces / Notifications » |
| Réseau, stabilité | « Stabilité / correctifs réseau » |
| Installation Forge qui bloque, fenêtre de chargement | « Installation / patch Forge », « Fenêtre de chargement » |
| Profils de performance, diagnostic | « Profils de performance » |
| Réglages conservés à la mise à jour | « Réglages du joueur » |
| Sécurité | « Audit sécurité » |
| Tests E2E (Playwright, Electron) | « Tests E2E » |
