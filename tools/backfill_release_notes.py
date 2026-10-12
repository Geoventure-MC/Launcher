#!/usr/bin/env python3
"""Rattrape les notes et le titre des releases GitHub du launcher.

Pourquoi : les releases de la v4.0.1 à la v1.5.19 ont été publiées SANS notes
(le panneau « Nouveautés » du launcher affichait « Pas de notes de version »),
sous un simple numéro, et les suivantes sous l'ancien nom « Conflictura
Launcher ». Les notes sont reconstruites depuis `git log` entre deux tags, avec
les mêmes sections que le workflow de release.

Usage (depuis la racine du dépôt, `gh` authentifié, historique complet) :
    python3 tools/backfill_release_notes.py            # simulation (n'écrit rien)
    python3 tools/backfill_release_notes.py --apply    # met les releases à jour

Idempotent : relancer donne le même résultat.
"""
import json
import re
import subprocess
import sys

REPO = 'Geoventure-MC/Launcher'
APPLY = '--apply' in sys.argv

TECH = re.compile(r'^(Correction build|Correction des? workflow|CI( |:)|Workflow|Refactor|Suppression|Nettoyage|Documentation|README|CLAUDE|docs|ci|test|build)')
FIX = re.compile(r'^(Correction|Corrige|Fix|Hotfix|Bugfix|Répar|fix)')
PERF = re.compile(r'^(Optimisation|Amélioration|Perf|Robustesse|Stabilité)')


def run(*cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def commits(prev, tag):
    rng = f'{prev}..{tag}' if prev else tag
    lines = run('git', 'log', rng, '--no-merges', '--pretty=format:%s').stdout.splitlines()
    seen, out = set(), []
    for s in lines:
        if s in seen or '[skip ci]' in s or re.match(r'^(chore|Merge )', s):
            continue
        seen.add(s)
        out.append(s)
    return out


def section(title, items):
    return f"### {title}\n\n" + "\n".join('- ' + i for i in items) + "\n\n" if items else ''


def notes(version, date, cs):
    tech = [c for c in cs if TECH.match(c)]
    rest = [c for c in cs if not TECH.match(c)]
    fixes = [c for c in rest if FIX.match(c)]
    perfs = [c for c in rest if PERF.match(c)]
    feats = [c for c in rest if c not in fixes and c not in perfs]
    body = (f"# 🚀 Nexus v{version}\n\n"
            "> Le launcher officiel de **Geoventure-MC** — multi-instances, mods et thèmes automatiques.\n\n"
            f"📅 {date}\n\n---\n\n")
    body += section('✨ Nouveautés', feats) + section('⚡ Améliorations', perfs)
    body += section('🐛 Corrections', fixes) + section('🔧 Technique', tech)
    if not (feats or perfs or fixes or tech):
        body += "_Mise à jour de maintenance._\n\n"
    body += ("---\n\n### 📥 Téléchargement\n\n| Plateforme | Fichier |\n|---|---|\n"
             "| **Windows** | `Nexus-win-x64.exe` |\n"
             "| **macOS (Apple Silicon)** | `Nexus-mac-arm64.dmg` |\n"
             "| **Linux (x86_64)** | `Nexus-linux-x86_64.AppImage` |\n\n"
             "### 🔄 Mise à jour automatique\n\nSi tu as déjà le launcher installé, il se met à jour "
             "tout seul au prochain démarrage — pas besoin de réinstaller.\n")
    return body


def main():
    releases = []
    page = 1
    while True:
        r = run('gh', 'api', f'repos/{REPO}/releases?per_page=100&page={page}')
        chunk = json.loads(r.stdout or '[]')
        if not chunk:
            break
        releases += chunk
        page += 1
    by_tag = {}
    for rel in releases:
        by_tag.setdefault(rel['tag_name'], []).append(rel)

    tags = run('git', 'tag', '--sort=creatordate').stdout.split()
    prev, done, skipped = None, 0, 0
    for tag in tags:
        if tag in by_tag:
            version = tag.lstrip('v')
            for rel in by_tag[tag]:
                d = rel['published_at'][:10].split('-')
                body = notes(version, f'{d[2]}/{d[1]}/{d[0]}', commits(prev, tag))
                name = f'Nexus v{version}'
                if rel.get('name') == name and (rel.get('body') or '').strip() == body.strip():
                    skipped += 1
                    continue
                print(('MAJ ' if APPLY else 'SIMU ') + f'{tag} (release {rel["id"]}) -> « {name} », notes {len(body)} car.')
                if APPLY:
                    payload = json.dumps({'name': name, 'body': body})
                    res = subprocess.run(['gh', 'api', '-X', 'PATCH', f'repos/{REPO}/releases/{rel["id"]}', '--input', '-'],
                                         input=payload, capture_output=True, text=True)
                    if res.returncode != 0:
                        print('  ERREUR', res.stderr[:200])
                        sys.exit(1)
                done += 1
        prev = tag
    print(f'{done} release(s) {"mises à jour" if APPLY else "à mettre à jour"}, {skipped} déjà conformes.')


if __name__ == '__main__':
    main()
