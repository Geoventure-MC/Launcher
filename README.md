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
| **Windows** | `Nexus Launcher Setup x.x.x.exe` |
| **macOS (Apple Silicon)** | `Nexus Launcher-x.x.x-arm64.dmg` |
| **macOS (Intel)** | `Nexus Launcher-x.x.x.dmg` |
| **Linux** | `Nexus Launcher-x.x.x.AppImage` |

### Installation

**Windows**
1. Télécharge le fichier `.exe`
2. Lance-le — si Windows Defender affiche un avertissement, clique **« Informations complémentaires »** puis **« Exécuter quand même »**
3. Suis l’installeur

**macOS**
1. Télécharge le `.dmg` correspondant à ton Mac (Apple Silicon ou Intel)
2. Monte le disque, glisse l’app dans le dossier **Applications**
3. Au premier lancement : clic droit → **Ouvrir** (pour ignorer Gatekeeper)

**Linux**
1. Télécharge l’`.AppImage`
2. Rends-le exécutable : `chmod +x Nexus*.AppImage`
3. Lance-le : `./Nexus*.AppImage`

### Mise à jour automatique

Si tu as déjà le launcher, il détecte les nouvelles versions au démarrage et se met à jour tout seul.

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
| **RAM** | Configuration MIN/MAX RAM dans les réglages |
| **Discord** | Rich Presence automatique pendant le jeu |
| **Stats perso** | 📈 Temps de jeu total et par instance, graphe des 30 derniers jours, records (session la plus longue, jours consécutifs) dans le profil |
| **Joueurs en ligne** | 👥 Tooltip avec pseudos et avatars au survol des pastilles serveurs |
| **Thèmes par instance** | 🎨 Couleur d'accent pilotée par le panel (vert Geoventure, violet Elandor, orange Pokeland) |
| **Captures d'écran** | 📷 Galerie intégrée par instance (vignettes, plein écran, suppression, ouverture du dossier) |
| **Langues** | Français & English |

---

## Nouveautés récentes

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
