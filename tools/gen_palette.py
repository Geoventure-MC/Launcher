#!/usr/bin/env python3
"""Génère la palette Geoventure depuis `design/palette.json`.

Ce script est VOLONTAIREMENT identique dans les cinq dépôts (mod, site,
launcher, panel, installer) : il détecte ce qui existe autour de lui et
n'écrit que les sorties pertinentes. Le recopier tel quel suffit ; il n'y a
pas de variante par dépôt à maintenir.

Sorties possibles :
  design/palette.css          variables CSS `--geo-*` (référence du dépôt)
  src/assets/css/palette.css      la même, là où le launcher l'empaquette
  public/assets/css/palette.css   la même, là où le panel la sert
  design/palette.md    tableau lisible, pour la charte
  GeoStyle.java        bloc de constantes, entre les marqueurs palette (mod)

Usage :
  python3 tools/gen_palette.py            régénère
  python3 tools/gen_palette.py --check     échoue si une sortie est périmée

Le mode --check est ce qui rend la source unique réelle : sans lui, rien
n'empêche d'éditer une constante générée à la main, et la palette redevient
cinq palettes en quelques semaines.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

PALETTE = os.path.join(ROOT, "design", "palette.json")
CSS_OUT = os.path.join(ROOT, "design", "palette.css")
MD_OUT = os.path.join(ROOT, "design", "palette.md")

BEGIN = "// <palette:begin> — généré par tools/gen_palette.py, NE PAS ÉDITER"
END = "// <palette:end>"

def load():
    with open(PALETTE, encoding="utf-8") as f:
        return json.load(f)


def tokens(data):
    for group in data["groups"]:
        for token in group["tokens"]:
            yield group, token


def argb(value):
    """'#AARRGGBB' -> (a, r, g, b)."""
    raw = value.lstrip("#")
    if len(raw) != 8:
        raise SystemExit(f"palette.json : « {value} » n'est pas un ARGB #AARRGGBB")
    return tuple(int(raw[i:i + 2], 16) for i in (0, 2, 4, 6))


def css_value(value):
    a, r, g, b = argb(value)
    if a == 255:
        return "#%02x%02x%02x" % (r, g, b)
    # Alpha en centièmes : trois décimales suffisent et évitent
    # « 0.8313725490196079 » dans une feuille de style lue par des humains.
    return "rgba(%d, %d, %d, %s)" % (r, g, b, ("%.3f" % (a / 255)).rstrip("0").rstrip("."))


def css_name(token_id):
    return "--geo-" + token_id.replace("_", "-")


def java_name(token_id):
    return token_id.upper()


# ── Sorties ───────────────────────────────────────────────────────────────


def render_css(data):
    lines = ["/*", " * Palette Geoventure — variables CSS.", " *"]
    lines.append(" * Généré par tools/gen_palette.py depuis design/palette.json.")
    lines.append(" * NE PAS ÉDITER : toute modification faite ici sera écrasée, et le")
    lines.append(" * contrôle de fraîcheur (--check) fera échouer la CI.")
    lines.append(" */")
    lines.append(":root {")

    for group in data["groups"]:
        lines.append("    /* %s */" % group["name"])
        # Alignement APRÈS le deux-points : « --x : v » se lit mal, la
        # propriété et son signe doivent rester collés.
        width = max(len(css_name(t["id"])) for t in group["tokens"]) + 1
        for token in group["tokens"]:
            decl = "%s %s;" % ((css_name(token["id"]) + ":").ljust(width), css_value(token["argb"]))
            doc = token.get("doc", "")
            lines.append("    %s%s" % (decl, ("  /* %s */" % doc) if doc else ""))
        lines.append("")

    if lines[-1] == "":
        lines.pop()
    lines.append("}")
    return "\n".join(lines) + "\n"


def render_md(data):
    lines = [
        "# Palette Geoventure",
        "",
        "<!-- Généré par tools/gen_palette.py depuis design/palette.json — NE PAS ÉDITER. -->",
        "",
        "Source unique : `design/palette.json` (autorité : %s)." % data["authority"],
        "",
        "Une teinte se change **là-bas**, puis `python3 tools/gen_palette.py`.",
        "Les constantes Java, les variables CSS et ce tableau en découlent.",
        "",
    ]
    for group in data["groups"]:
        lines.append("## %s" % group["name"])
        lines.append("")
        if group.get("doc"):
            lines.append(group["doc"])
            lines.append("")
        lines.append("| Jeton | ARGB | CSS | Java | Rôle |")
        lines.append("|-------|------|-----|------|------|")
        for token in group["tokens"]:
            lines.append("| `%s` | `%s` | `%s` | `%s` | %s |" % (
                token["id"], token["argb"].upper(), css_name(token["id"]),
                java_name(token["id"]), token.get("doc", ""),
            ))
        lines.append("")
    return "\n".join(lines)


def render_java_block(data):
    """Le bloc de constantes, tel qu'il doit apparaître entre les marqueurs."""
    lines = ["    " + BEGIN]
    for group in data["groups"]:
        lines.append("")
        lines.append("    // ── %s ─%s" % (group["name"], "─" * max(0, 60 - len(group["name"]))))
        if group.get("doc"):
            lines.append("    // %s" % group["doc"])
        width = max(len(java_name(t["id"])) for t in group["tokens"])
        for token in group["tokens"]:
            a, r, g, b = argb(token["argb"])
            decl = "    public static final int %s = 0x%02X%02X%02X%02X;" % (
                java_name(token["id"]).ljust(width), a, r, g, b,
            )
            doc = token.get("doc", "")
            lines.append(decl + (" // %s" % doc if doc else ""))
    lines.append("")
    lines.append("    " + END)
    return "\n".join(lines)


def find_geostyle():
    for base, _dirs, files in os.walk(os.path.join(ROOT, "src")):
        if "GeoStyle.java" in files:
            return os.path.join(base, "GeoStyle.java")
    return None


def splice_java(path, block):
    with open(path, encoding="utf-8") as f:
        src = f.read()

    start = src.find(BEGIN)
    stop = src.find(END)
    if start < 0 or stop < 0:
        raise SystemExit(
            "%s : marqueurs de palette absents. Attendus :\n  %s\n  %s"
            % (path, BEGIN, END)
        )
    # On remplace depuis le début de la ligne du marqueur ouvrant jusqu'à la
    # fin de la ligne du marqueur fermant, indentation comprise.
    start = src.rfind("\n", 0, start) + 1
    stop = src.find("\n", stop)
    return src[:start] + block + src[stop:]


# ── Pilotage ──────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="ne rien écrire ; sortir en erreur si une sortie est périmée")
    args = parser.parse_args()

    if not os.path.exists(PALETTE):
        raise SystemExit("design/palette.json est absent de ce dépôt.")

    data = load()

    # Deux jetons peuvent partager une valeur (GREEN et GEOVENTURE), mais pas
    # un identifiant : ce serait deux constantes du même nom.
    seen = {}
    for group, token in tokens(data):
        if token["id"] in seen:
            raise SystemExit("palette.json : jeton « %s » déclaré deux fois (%s et %s)"
                             % (token["id"], seen[token["id"]], group["id"]))
        seen[token["id"]] = group["id"]
        argb(token["argb"])  # valide le format

    outputs = [(CSS_OUT, render_css(data)), (MD_OUT, render_md(data))]

    # Le launcher empaquette src/ : la feuille doit y être pour être servie.
    # Même script partout, qui écrit ce qui a un sens dans le dépôt où il
    # tourne — c'est ce qui évite une variante de générateur par dépôt.
    for served in (os.path.join(ROOT, "src", "assets", "css"),
                   os.path.join(ROOT, "public", "assets", "css")):
        if os.path.isdir(served):
            outputs.append((os.path.join(served, "palette.css"), render_css(data)))

    geostyle = find_geostyle()
    if geostyle is not None:
        outputs.append((geostyle, splice_java(geostyle, render_java_block(data))))

    stale = []
    for path, content in outputs:
        current = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                current = f.read()
        if current == content:
            continue
        stale.append(path)
        if not args.check:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

    rel = lambda p: os.path.relpath(p, ROOT)

    if args.check:
        if stale:
            print("Sorties périmées par rapport à design/palette.json :")
            for path in stale:
                print("  - %s" % rel(path))
            print("\nRégénérer avec : python3 tools/gen_palette.py")
            return 1
        print("Palette à jour (%d jetons, %d sorties)." % (len(seen), len(outputs)))
        return 0

    print("%d jetons." % len(seen))
    for path, _ in outputs:
        print("  %s %s" % ("écrit  " if path in stale else "inchangé", rel(path)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
