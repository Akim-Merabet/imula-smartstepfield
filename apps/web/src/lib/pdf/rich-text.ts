/**
 * Texte riche (Tiptap JSON ou HTML produit par l'éditeur) → arbre de blocs neutre, rendu ensuite en
 * éléments @react-pdf (rich-text-pdf.tsx). Logique pure (aucune dépendance DOM) : testable et partagée
 * par le worker et les route handlers.
 */

export type CalloutVariant = "info" | "warning" | "error" | "note" | "success";

export type RichRun =
  | { kind: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean; href?: string }
  | { kind: "break" };

export type RichBlock =
  | { type: "paragraph"; runs: RichRun[]; align?: "left" | "center" | "right" | "justify" }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: RichRun[] }
  | { type: "list"; ordered: boolean; start: number; items: RichBlock[][] }
  | { type: "blockquote"; children: RichBlock[] }
  | { type: "callout"; variant: CalloutVariant; children: RichBlock[] }
  | { type: "code"; text: string }
  | { type: "image"; src: string; alt?: string; width?: number }
  | { type: "hr" }
  | { type: "table"; rows: { cells: { header: boolean; blocks: RichBlock[] }[] }[] };

const CALLOUTS: CalloutVariant[] = ["info", "warning", "error", "note", "success"];
const asVariant = (v: unknown): CalloutVariant => (CALLOUTS.includes(v as CalloutVariant) ? (v as CalloutVariant) : "info");

// ===== Tiptap JSON =================================================================
type PMMark = { type: string; attrs?: Record<string, unknown> };
type PMNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: PMMark[]; content?: PMNode[] };

function pmRuns(nodes: PMNode[] | undefined): RichRun[] {
  const out: RichRun[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") { out.push({ kind: "break" }); continue; }
    if (n.type === "text" && n.text) {
      const run: RichRun = { kind: "text", text: n.text };
      for (const m of n.marks ?? []) {
        if (m.type === "bold") run.bold = true;
        else if (m.type === "italic") run.italic = true;
        else if (m.type === "underline") run.underline = true;
        else if (m.type === "strike") run.strike = true;
        else if (m.type === "code") run.code = true;
        else if (m.type === "link" && typeof m.attrs?.href === "string") run.href = m.attrs.href;
      }
      out.push(run);
      continue;
    }
    // Nœud inline inconnu : on récupère son texte.
    if (n.content) out.push(...pmRuns(n.content));
  }
  return out;
}

function pmBlocks(nodes: PMNode[] | undefined): RichBlock[] {
  const out: RichBlock[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "paragraph": {
        const align = n.attrs?.textAlign as "left" | "center" | "right" | "justify" | undefined;
        out.push({ type: "paragraph", runs: pmRuns(n.content), ...(align && align !== "left" ? { align } : {}) });
        break;
      }
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 2))) as 1 | 2 | 3 | 4 | 5 | 6;
        out.push({ type: "heading", level, runs: pmRuns(n.content) });
        break;
      }
      case "bulletList": case "orderedList": case "taskList":
        out.push({
          type: "list", ordered: n.type === "orderedList", start: Number(n.attrs?.start ?? 1) || 1,
          items: (n.content ?? []).map((li) => pmBlocks(li.content)),
        });
        break;
      case "blockquote": out.push({ type: "blockquote", children: pmBlocks(n.content) }); break;
      case "callout": out.push({ type: "callout", variant: asVariant(n.attrs?.variant), children: pmBlocks(n.content) }); break;
      case "codeBlock": out.push({ type: "code", text: (n.content ?? []).map((c) => c.text ?? "").join("") }); break;
      case "horizontalRule": out.push({ type: "hr" }); break;
      case "image":
        if (typeof n.attrs?.src === "string") {
          out.push({ type: "image", src: n.attrs.src, alt: (n.attrs.alt as string) ?? undefined, width: Number(n.attrs.width) || undefined });
        }
        break;
      case "table":
        out.push({
          type: "table",
          rows: (n.content ?? []).map((row) => ({
            cells: (row.content ?? []).map((cell) => ({ header: cell.type === "tableHeader", blocks: pmBlocks(cell.content) })),
          })),
        });
        break;
      case "text": case "hardBreak":
        out.push({ type: "paragraph", runs: pmRuns([n]) });
        break;
      default:
        if (n.content) out.push(...pmBlocks(n.content));
    }
  }
  return out;
}

// ===== HTML (sous-ensemble produit par Tiptap / Froala) ===========================
type HNode = { tag: string; attrs: Record<string, string>; children: HNode[] } | { text: string };
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "col", "source", "wbr"]);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", ndash: "–", mdash: "—", euro: "€", laquo: "«", raquo: "»", deg: "°", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", ucirc: "û", icirc: "î" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Mini-parseur HTML tolérant (balises non fermées closes à la fermeture du parent). */
export function parseHtml(html: string): HNode[] {
  const root: { tag: string; attrs: Record<string, string>; children: HNode[] } = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [full, tagName, rawAttrs, selfClose, text] = m;
    if (full.startsWith("<!--")) continue;
    if (text !== undefined) { stack[stack.length - 1].children.push({ text: decodeEntities(text) }); continue; }
    const tag = tagName.toLowerCase();
    if (full.startsWith("</")) {
      const idx = stack.map((s) => s.tag).lastIndexOf(tag);
      if (idx > 0) stack.length = idx;
      continue;
    }
    const attrs: Record<string, string> = {};
    const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(rawAttrs ?? ""))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    const node = { tag, attrs, children: [] as HNode[] };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !selfClose) stack.push(node);
  }
  return root.children;
}

type Marks = Omit<Extract<RichRun, { kind: "text" }>, "kind" | "text">;
const INLINE = new Set(["span", "strong", "b", "em", "i", "u", "s", "strike", "del", "code", "a", "br", "mark", "sub", "sup", "small", "font", "label"]);

function styleMarks(attrs: Record<string, string>): Marks {
  const st = (attrs.style ?? "").toLowerCase();
  const m: Marks = {};
  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(st)) m.bold = true;
  if (/font-style\s*:\s*italic/.test(st)) m.italic = true;
  if (/text-decoration[^;]*underline/.test(st)) m.underline = true;
  if (/text-decoration[^;]*line-through/.test(st)) m.strike = true;
  return m;
}

function htmlRuns(nodes: HNode[], marks: Marks = {}): RichRun[] {
  const out: RichRun[] = [];
  for (const n of nodes) {
    if ("text" in n) {
      const text = n.text.replace(/[\t\r\n ]+/g, " ");
      if (text) out.push({ kind: "text", text, ...marks });
      continue;
    }
    if (n.tag === "br") { out.push({ kind: "break" }); continue; }
    const next: Marks = { ...marks, ...styleMarks(n.attrs) };
    if (n.tag === "strong" || n.tag === "b") next.bold = true;
    if (n.tag === "em" || n.tag === "i") next.italic = true;
    if (n.tag === "u") next.underline = true;
    if (n.tag === "s" || n.tag === "strike" || n.tag === "del") next.strike = true;
    if (n.tag === "code") next.code = true;
    if (n.tag === "a" && n.attrs.href) next.href = n.attrs.href;
    out.push(...htmlRuns(n.children, next));
  }
  return out;
}

/** Supprime les espaces de bord d'une suite de runs (comme le rendu HTML). */
function trimRuns(runs: RichRun[]): RichRun[] {
  const r = runs.map((x) => ({ ...x }));
  const first = r.find((x) => x.kind === "text") as Extract<RichRun, { kind: "text" }> | undefined;
  if (first) first.text = first.text.replace(/^\s+/, "");
  const last = [...r].reverse().find((x) => x.kind === "text") as Extract<RichRun, { kind: "text" }> | undefined;
  if (last) last.text = last.text.replace(/\s+$/, "");
  return r.filter((x) => x.kind === "break" || x.text !== "");
}

function htmlBlocks(nodes: HNode[]): RichBlock[] {
  const out: RichBlock[] = [];
  let pending: HNode[] = [];
  const flush = () => {
    const runs = trimRuns(htmlRuns(pending));
    if (runs.length) out.push({ type: "paragraph", runs });
    pending = [];
  };
  for (const n of nodes) {
    if ("text" in n || INLINE.has(n.tag)) { pending.push(n); continue; }
    flush();
    const align = /text-align\s*:\s*(center|right|justify)/i.exec(n.attrs.style ?? "")?.[1]?.toLowerCase() as "center" | "right" | "justify" | undefined;
    switch (n.tag) {
      case "p": {
        // Un <p> peut contenir une image (Froala).
        const imgs = n.children.filter((c) => !("text" in c) && c.tag === "img");
        const runs = trimRuns(htmlRuns(n.children.filter((c) => "text" in c || c.tag !== "img")));
        if (runs.length || !imgs.length) out.push({ type: "paragraph", runs, ...(align ? { align } : {}) });
        out.push(...htmlBlocks(imgs));
        break;
      }
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        out.push({ type: "heading", level: Number(n.tag[1]) as 1, runs: trimRuns(htmlRuns(n.children)) });
        break;
      case "ul": case "ol":
        out.push({
          type: "list", ordered: n.tag === "ol", start: Number(n.attrs.start ?? 1) || 1,
          items: n.children.filter((c): c is Extract<HNode, { tag: string }> => !("text" in c) && c.tag === "li").map((li) => htmlBlocks(li.children)),
        });
        break;
      case "blockquote": out.push({ type: "blockquote", children: htmlBlocks(n.children) }); break;
      case "pre": out.push({ type: "code", text: textOf(n) }); break;
      case "hr": out.push({ type: "hr" }); break;
      case "img": if (n.attrs.src) out.push({ type: "image", src: n.attrs.src, alt: n.attrs.alt, width: Number(n.attrs.width) || undefined }); break;
      case "table": {
        const rows: Extract<RichBlock, { type: "table" }>["rows"] = [];
        const walk = (list: HNode[]) => {
          for (const c of list) {
            if ("text" in c) continue;
            if (c.tag === "tr") {
              rows.push({
                cells: c.children.filter((x): x is Extract<HNode, { tag: string }> => !("text" in x) && (x.tag === "td" || x.tag === "th"))
                  .map((cell) => ({ header: cell.tag === "th", blocks: htmlBlocks(cell.children) })),
              });
            } else walk(c.children);
          }
        };
        walk(n.children);
        out.push({ type: "table", rows });
        break;
      }
      case "div":
        if ("data-callout" in n.attrs || /\brich-callout\b/.test(n.attrs.class ?? "")) {
          out.push({ type: "callout", variant: asVariant(n.attrs["data-variant"]), children: htmlBlocks(n.children) });
        } else out.push(...htmlBlocks(n.children));
        break;
      case "script": case "style": break;
      default: out.push(...htmlBlocks(n.children));
    }
  }
  flush();
  return out;
}

function textOf(n: HNode): string {
  return "text" in n ? n.text : n.children.map(textOf).join("");
}

/** Point d'entrée : JSON Tiptap (`{type:'doc'}`), chaîne JSON, HTML ou texte brut. */
export function parseRichContent(input: unknown): RichBlock[] {
  if (input === null || input === undefined || input === "") return [];
  if (typeof input === "object") {
    const doc = input as PMNode;
    return doc.type === "doc" ? pmBlocks(doc.content) : pmBlocks([doc]);
  }
  const s = String(input);
  const trimmed = s.trim();
  if (trimmed.startsWith("{")) {
    try { return parseRichContent(JSON.parse(trimmed)); } catch { /* HTML/texte */ }
  }
  if (!/<[a-z!/]/i.test(trimmed)) {
    return trimmed.split(/\n{2,}/).map((p) => ({
      type: "paragraph" as const,
      runs: p.split("\n").flatMap((line, i) => (i ? [{ kind: "break" as const }, { kind: "text" as const, text: line }] : [{ kind: "text" as const, text: line }])),
    }));
  }
  return htmlBlocks(parseHtml(s));
}

/** Vrai si le contenu ne produit aucun texte ni image. */
export function isRichEmpty(blocks: RichBlock[]): boolean {
  const has = (b: RichBlock): boolean => {
    switch (b.type) {
      case "paragraph": case "heading": return b.runs.some((r) => r.kind === "text" && r.text.trim() !== "");
      case "list": return b.items.some((i) => i.some(has));
      case "blockquote": case "callout": return b.children.some(has);
      case "code": return b.text.trim() !== "";
      case "image": case "table": return true;
      case "hr": return false;
    }
  };
  return !blocks.some(has);
}

/** Texte brut (sommaires, tests). */
export function richToPlainText(blocks: RichBlock[]): string {
  const runs = (rs: RichRun[]) => rs.map((r) => (r.kind === "break" ? "\n" : r.text)).join("");
  return blocks.map((b): string => {
    switch (b.type) {
      case "paragraph": case "heading": return runs(b.runs);
      case "list": return b.items.map((i, k) => `${b.ordered ? `${b.start + k}.` : "•"} ${richToPlainText(i)}`).join("\n");
      case "blockquote": case "callout": return richToPlainText(b.children);
      case "code": return b.text;
      case "image": return b.alt ?? "";
      case "hr": return "";
      case "table": return b.rows.map((r) => r.cells.map((c) => richToPlainText(c.blocks)).join(" | ")).join("\n");
    }
  }).filter(Boolean).join("\n");
}

/** Sources d'images référencées (pour préchargement asynchrone avant rendu). */
export function collectImageSources(blocks: RichBlock[]): string[] {
  const out: string[] = [];
  const walk = (list: RichBlock[]) => {
    for (const b of list) {
      if (b.type === "image") out.push(b.src);
      else if (b.type === "list") b.items.forEach(walk);
      else if (b.type === "blockquote" || b.type === "callout") walk(b.children);
      else if (b.type === "table") b.rows.forEach((r) => r.cells.forEach((c) => walk(c.blocks)));
    }
  };
  walk(blocks);
  return out;
}
