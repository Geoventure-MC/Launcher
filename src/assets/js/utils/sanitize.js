/**
 * Assainisseur HTML à LISTE BLANCHE pour le texte riche venu du panel ou d'Azuriom (bandeau d'alerte,
 * message de maintenance, contenu des actualités RSS).
 *
 * L'ancien assainisseur était une liste noire par expressions régulières : `<img src=x/onerror=…>` ou
 * `href="java&#x73;cript:"` passaient, et le rendu du launcher a accès à Node. Ici le HTML est analysé
 * par DOMParser (document inerte : rien ne s'exécute, aucune image ne se charge) puis RECONSTRUIT :
 * seules les balises de mise en forme connues sont gardées, sans aucun attribut sauf `href` (http/https)
 * sur les liens et `src` (https) sur les images. Tout le reste devient du texte.
 */
const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'SPAN', 'DIV', 'UL', 'OL', 'LI',
    'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'CODE', 'PRE', 'HR', 'IMG', 'MARK', 'SUB', 'SUP']);
// Supprimés AVEC leur contenu (le reste est « déballé » : on garde le texte).
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'SVG', 'MATH',
    'TEMPLATE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'BASE', 'TITLE', 'HEAD',
    'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'PORTAL', 'WEBVIEW']);

function safeUrl(value, protocols) {
    try {
        const u = new URL(String(value).trim());
        return protocols.includes(u.protocol) ? u.href : null;
    } catch {
        return null;
    }
}

function copyClean(src, dst, doc, depth) {
    if (depth > 40) return;
    for (const node of Array.from(src.childNodes)) {
        if (node.nodeType === 3) { dst.appendChild(doc.createTextNode(node.nodeValue)); continue; }
        if (node.nodeType !== 1) continue;
        const tag = node.tagName.toUpperCase();
        if (DROP.has(tag)) continue;
        if (!ALLOWED.has(tag)) { copyClean(node, dst, doc, depth + 1); continue; }
        const el = doc.createElement(tag.toLowerCase());
        if (tag === 'A') {
            const href = safeUrl(node.getAttribute('href'), ['https:', 'http:']);
            if (href) {
                el.setAttribute('href', href);
                el.setAttribute('rel', 'noopener noreferrer');
            }
        } else if (tag === 'IMG') {
            const imgSrc = safeUrl(node.getAttribute('src'), ['https:']);
            if (!imgSrc) continue;
            el.setAttribute('src', imgSrc);
            const alt = node.getAttribute('alt');
            if (alt) el.setAttribute('alt', alt);
        }
        copyClean(node, el, doc, depth + 1);
        dst.appendChild(el);
    }
}

/** Renvoie une chaîne HTML sûre (balises de mise en forme seulement, liens http(s), images https). */
export function sanitizeHtml(html) {
    if (html == null) return '';
    const parsed = new DOMParser().parseFromString(`<body>${String(html)}</body>`, 'text/html');
    const out = document.implementation.createHTMLDocument('');
    const root = out.createElement('div');
    copyClean(parsed.body, root, out, 0);
    return root.innerHTML;
}
