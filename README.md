<div align="center">

<img src="https://raw.githubusercontent.com/Geoventure-MC/Launcher/master/src/assets/images/icon.png" alt="Conflictura Launcher" width="120"/>

# Conflictura Launcher

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

Le **Conflictura Launcher** te permet de rejoindre les serveurs Geoventure MC sans rien configurer manuellement.

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
| **Windows** | `Conflictura Launcher Setup x.x.x.exe` |
| **macOS (Apple Silicon)** | `Conflictura Launcher-x.x.x-arm64.dmg` |
| **macOS (Intel)** | `Conflictura Launcher-x.x.x.dmg` |
| **Linux** | `Conflictura Launcher-x.x.x.AppImage` |

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
2. Rends-le exécutable : `chmod +x Conflictura*.AppImage`
3. Lance-le : `./Conflictura*.AppImage`

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
| **Statut serveur** | Joueurs en ligne en temps réel |
| **News** | Actualités du serveur intégrées |
| **RAM** | Configuration MIN/MAX RAM dans les réglages |
| **Discord** | Rich Presence automatique pendant le jeu |
| **Langues** | Français & English |

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
