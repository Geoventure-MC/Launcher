<div align="center">

<img src="https://raw.githubusercontent.com/Geoventure-MC/Launcher/master/src/assets/images/icon.png" alt="Nexus Launcher" width="120"/>

# Nexus Launcher

**Joue sur Geoventure MC en un clic — Minecraft 1.20.1**

[![Dernière version](https://img.shields.io/github/v/release/Geoventure-MC/Launcher?style=flat-square&label=version&color=4ade80)](https://github.com/Geoventure-MC/Launcher/releases/latest)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.20.1-brightgreen?style=flat-square)](https://minecraft.net)
[![Build](https://img.shields.io/github/actions/workflow/status/Geoventure-MC/Launcher/ci.yml?branch=master&style=flat-square&label=build)](https://github.com/Geoventure-MC/Launcher/actions)
[![Licence](https://img.shields.io/badge/Licence-CC%20BY--NC%204.0-lightgrey?style=flat-square)](LICENSE.md)
[![Discord](https://img.shields.io/discord/VCmNXHvf77?style=flat-square&label=Discord&logo=discord&color=5865f2)](https://discord.gg/VCmNXHvf77)

[**Télécharger**](https://github.com/Geoventure-MC/Launcher/releases/latest) · [Discord](https://discord.gg/VCmNXHvf77) · [Signaler un bug](https://github.com/Geoventure-MC/Launcher/issues)

</div>

---

## Présentation

Le **Nexus Launcher** te permet de rejoindre les serveurs Geoventure MC sans rien configurer manuellement.

Il télécharge automatiquement Java, les mods et les mises à jour. Tu lances, tu joues.

### Serveurs disponibles

| Serveur | Ambiance | Statut |
|---|---|---|
| **Geoventure** | Aventure & Exploration | En ligne |
| **Elandor** | RPG & Fantäsie | Bientôt |
| **Pokeland** | Pokémon & Combat | Bientôt |

---

## Téléchargement

> **[Dernière version →](https://github.com/Geoventure-MC/Launcher/releases/latest)**

| Plateforme | Fichier |
|---|---|
| **Windows** | `Nexus-win-x64.exe` |
| **macOS (Apple Silicon)** | `Nexus-mac-arm64.dmg` |
| **Linux (x86_64)** | `Nexus-linux-x86_64.AppImage` |

### Installation

**Windows**
1. Télécharge le fichier `.exe`
2. Lance-le — si Windows Defender affiche un avertissement, clique **« Informations complémentaires »** puis **« Exécuter quand même »**
3. Suis l’installeur

**macOS**
1. Télécharge `Nexus-mac-arm64.dmg` (Mac Apple Silicon ; il n’y a pas de build Intel pour l’instant)
2. Monte le disque, glisse l’app dans le dossier **Applications**
3. Au premier lancement : clic droit → **Ouvrir** (pour ignorer Gatekeeper)

**Linux**
1. Télécharge `Nexus-linux-x86_64.AppImage`
2. Rends-le exécutable : `chmod +x Nexus-linux-x86_64.AppImage`
3. Lance-le : `./Nexus-linux-x86_64.AppImage`

### Mise à jour automatique

Le launcher cherche les nouvelles versions à chaque démarrage.

| Système | Comportement |
|---|---|
| **Windows** | Téléchargement et installation automatiques, avec barre de progression |
| **Linux (AppImage)** | Idem : l'AppImage est remplacé et le launcher redémarre tout seul |
| **macOS, Linux hors AppImage** (`.deb`, dossier extrait) | Boutons **Télécharger** (ouvre la page de la release) ou **Continuer** sans mettre à jour |

Si la vérification échoue (réseau, GitHub injoignable), le launcher **démarre quand même** — il ne reste jamais bloqué sur l'écran de mise à jour.

> Une ancienne version bloquée sur « Mise à jour disponible » ne peut pas se réparer seule : télécharge une fois la dernière version à la main, les suivantes seront automatiques.

### Où sont les fichiers et les logs ?

| Quoi | Windows | Linux | macOS |
|---|---|---|---|
| Dossier de jeu | `%APPDATA%\.Nexus` | `~/.Nexus` | `~/Library/Application Support/Nexus` |
| Log du jeu | `logs\latest.log` | `~/.Nexus/logs/latest.log` | `…/Nexus/logs/latest.log` |
| Plantages du jeu | `crash-reports\` | `~/.Nexus/crash-reports/` | `…/Nexus/crash-reports/` |
| **Log du launcher** (installation, patch Forge) | `logs\launcher.log` | `~/.Nexus/logs/launcher.log` | `…/Nexus/logs/launcher.log` |
| Autres instances (Elandor, Pokeland) | `.Nexus\instances\<nom>\` | `~/.Nexus/instances/<nom>/` | idem |

Pour voir les messages du launcher lui-même sous Linux, lance-le depuis un terminal :
`./Nexus-linux-x86_64.AppImage 2>&1 | tee ~/nexus-launcher.log`
(dans la fenêtre : `F12` ou `Ctrl+Maj+I` ouvre la console de développement). L'écran d'accueil a aussi une console intégrée avec les boutons **Effacer / Copier / Exporter**.

### Dépannage : l'installation reste sur « Patch »

Le patch Forge prépare le jeu (quelques secondes à quelques minutes la première fois). S'il échoue ou ne répond plus pendant 3 minutes, le launcher affiche maintenant l'erreur en rouge et rend le bouton **Jouer**. Envoie-nous le contenu de `logs/launcher.log` (ou le bouton **Exporter** de la console) sur le [Discord](https://discord.gg/VCmNXHvf77) ou dans une [issue](https://github.com/Geoventure-MC/Launcher/issues). Vérifie aussi ta connexion : le patch télécharge des fichiers chez Mojang.

### Dépannage : le jeu rame ou plante (profils de performance)

**Réglages → Avancé → Performances → « Optimiser pour ma machine »** détecte ta RAM, ton CPU et ton GPU, puis propose un profil **Économique / Équilibré / Performant** (RAM min/max et arguments Java 17 G1GC ou ZGC). Rien n'est appliqué sans confirmation, le launcher n'alloue **jamais plus de 60 % de ta RAM**, et le modpack demande **au moins 3 Go** : en dessous (moins de 5 Go de RAM au total), un avertissement s'affiche et aucun profil n'est appliqué. La distance de rendu conseillée est affichée à titre indicatif (à régler en jeu). Tout reste modifiable à la main : curseurs RAM et champ « Arguments JVM » (`-Xms`/`-Xmx` y sont ignorés).

### Dépannage : rapport de diagnostic en 1 clic

**Réglages → Avancé → Diagnostic → « Générer le rapport »** produit un texte avec : version du launcher, OS/architecture (et session Wayland/X11 sous Linux), RAM/CPU/GPU, Java détecté ou téléchargé, instance active, 300 dernières lignes de `logs/launcher.log` et `logs/latest.log`, et un test de joignabilité (avec latence) du panel, de Mojang, de Forge et d'Azuriom. Les jetons, mots de passe, e-mails et chemins personnels (ton dossier utilisateur devient `~`) sont **masqués**. Boutons : **Copier**, **Enregistrer en .txt**, **Ouvrir le dossier de logs**, et **Envoyer au panel** (uniquement si tu cliques ; si le panel ne gère pas encore les rapports, le launcher l'indique et rien n'est perdu). Relis toujours le rapport avant de le partager.

---

## Fonctionnalités

| Catégorie | Détails |
|---|---|
| **Authentification** | Connexion via le site Geoventure — pas de compte Microsoft requis |
| **Mods** | Téléchargement automatique, mods optionnels activables |
| **Java** | Java 17 inclus — rien à installer |
| **Multi-serveur** | Bascule entre Geoventure, Elandor et Pokeland depuis le launcher |
| **Profil joueur** | Skin 3D, grade, monnaie boutique |
| **Profile Hub** | Classement joueurs et panneau factions accessible depuis le launcher |
| **Statut serveur** | Pills en temps réel (en ligne/hors ligne + nombre de joueurs) pour chaque serveur |
| **Notifications** | Bandeau d'annonces in-app depuis le panel (info, warning, maintenance, event) + notifications de bureau opt-in (nouvelles annonces, serveur de retour en ligne) |
| **News** | Actualités du serveur intégrées |
| **Résilience réseau** | Gestion robuste des erreurs : garde-fous auth, vérification `response.ok`, fallbacks 502/404, récupération d'erreur au lancement, **mode hors-ligne intelligent** (dernière config en cache si le panel est injoignable) |
| **Télémétrie (opt-in)** | Statistiques anonymes (lancements, OS, version) envoyées au panel pour le tableau de bord admin |
| **RAM & performances** | Configuration MIN/MAX RAM, profils Économique/Équilibré/Performant (« Optimiser pour ma machine ») et arguments JVM éditables |
| **Diagnostic** | Rapport 1 clic (système, matériel, logs, joignabilité) avec secrets masqués, copie/export/envoi optionnel au panel |
| **Discord** | Rich Presence automatique pendant le jeu |
| **Stats perso** | 📈 Temps de jeu total et par instance, graphe des 30 derniers jours, records (session la plus longue, jours consécutifs) dans le profil |
| **Joueurs en ligne** | 👥 Tooltip avec pseudos et avatars au survol des pastilles serveurs |
| **Thèmes par instance** | 🎨 Couleur d'accent pilotée par le panel (vert Geoventure, violet Elandor, orange Pokeland) |
| **Captures d'écran** | 📷 Galerie intégrée par instance (vignettes, plein écran, suppression, ouverture du dossier) |
| **Langues** | Français & English |

---

## Nouveautés récentes

- **Installation fiabilisée** — Une erreur pendant le patch Forge ne laisse plus l'écran figé : le message s'affiche, le bouton Jouer revient, la tâche de patch en cours est visible et un journal `logs/launcher.log` est écrit. Un patch silencieux depuis 3 minutes est interrompu avec une erreur claire.
- **Mise à jour Linux** — L'AppImage se met à jour automatiquement comme sous Windows ; une erreur de l'outil de mise à jour ne ferme plus le launcher.
- **Tests de bout en bout** — Suite Playwright sur le vrai Electron (`npm run test:e2e`) : démarrage, instances, accueil, résilience aux pannes du panel, réglages, profil.
- **Notifications de bureau (opt-in)** — Nouvelle annonce maintenance/événement ou serveur de retour en ligne : une notification système s'affiche même quand le launcher est en arrière-plan. Activable dans les paramètres, throttlée à 1 par type toutes les 5 minutes.
- **Galerie de captures d'écran** — Panneau dédié par instance : vignettes, plein écran, suppression, ouverture directe du dossier.
- **Mode hors-ligne intelligent** — Si le panel est injoignable au démarrage, le launcher réutilise la dernière configuration connue (avec bandeau d'information) au lieu de bloquer — le jeu reste lançable si les fichiers sont déjà téléchargés.
- **Stats perso & joueurs en ligne** — Le profil affiche ton temps de jeu (total + par instance, graphe 30 jours, records) ; un survol des pastilles serveurs liste les joueurs en ligne avec leur avatar.
- **Thèmes par instance** — L'interface adapte sa couleur d'accent selon le serveur sélectionné (couleur pilotée depuis le panel).
- **Bandeau de notifications** — Les annonces du panel (info, warning, maintenance, event) s'affichent en bannière sur l'écran d'accueil. Gestion automatique de l'expiration.
- **Profile Hub** — Panneau classement & factions : consulte les rankings serveur et les infos de ta faction directement depuis le launcher.
- **Résilience réseau** — Gestion robuste des erreurs HTTP : garde-fous sur les URLs d'authentification, vérification `response.ok` avant parsing JSON, fallbacks gracieux pour les erreurs 502/404, et récupération au lancement (le bouton play réapparaît avec un message d'erreur au lieu de rester bloqué).
- **Pills statut serveur** — Indicateurs en temps réel sur l'écran d'accueil : état en ligne/hors ligne et nombre de joueurs pour chaque serveur.
- **Télémétrie opt-in** — Envoi anonyme d'événements (lancement, OS, version du launcher) vers le panel pour alimenter les statistiques admin. Activable dans les paramètres.

---

## Développement

### Prérequis

- Node.js 22+
- npm 10+
- Python 3.x

### Installation

```bash
git clone https://github.com/Geoventure-MC/Launcher.git
cd Launcher
npm install
```

> `npm install` applique automatiquement le correctif de la bibliothèque de lancement (`patches/minecraft-java-core-azbetter+*.patch`, via `patch-package`). Si tu mets cette bibliothèque à jour, régénère-le : `npx patch-package minecraft-java-core-azbetter`.

### Lancer en développement

```bash
npm start        # Démarrage simple
npm run dev      # Avec rechargement automatique
```

### Build

```bash
npm run build    # Build + obfuscation pour ta plateforme
```

Les artefacts sont générés dans le dossier `dist/`.

### Tests

```bash
npm run test:e2e   # Playwright + vrai Electron (xvfb lancé automatiquement sous Linux), faux panel local
```

Aucun workflow GitHub Actions n'est nécessaire : tout tourne en local. Détails dans [CLAUDE.md](CLAUDE.md).

### Déployer une mise à jour

Il suffit de pusher sur `master` — le CI bumpe la version et crée la release automatiquement.

---

## Pour les développeurs

| Fichier | Rôle |
|---|---|
| [primer.md](primer.md) | Architecture & guide de démarrage rapide |
| [hindsight.md](hindsight.md) | Décisions techniques & retrospective |
| [coffre.md](coffre.md) | Index Obsidian du projet |
| [memory.sh](memory.sh) | Snapshot contexte projet pour debugging/IA |

---

## Licence

Ce projet est sous licence [CC BY-NC 4.0](LICENSE.md). Usage commercial interdit sans autorisation.

---

<div align="center">
Fait avec ❤️ pour <strong>Geoventure MC</strong>
</div>
