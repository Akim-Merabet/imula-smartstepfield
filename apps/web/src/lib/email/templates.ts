/**
 * Gabarit HTML sobre des e-mails transactionnels (sans marque tierce : nom = APP_NAME).
 * Pur : prend des textes déjà traduits, renvoie HTML + texte brut.
 */

export type EmailBlock =
  | { type: "paragraph"; text: string }
  | { type: "quote"; label?: string; text: string }
  | { type: "code"; text: string }
  | { type: "button"; label: string; href: string }
  | { type: "facts"; items: { label: string; value: string }[] };

export type EmailContent = {
  appName: string;
  /** Langue du document HTML. */
  lang: string;
  title: string;
  blocks: EmailBlock[];
  footer: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case "paragraph":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#1f2933">${nl2br(b.text)}</p>`;
    case "quote":
      return `<div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #9aa5b1;background:#f5f7fa;font-size:14px;line-height:20px;color:#3e4c59">`
        + (b.label ? `<div style="font-weight:600;margin-bottom:4px">${esc(b.label)}</div>` : "")
        + `${nl2br(b.text)}</div>`;
    case "code":
      return `<p style="margin:8px 0 24px;text-align:center"><span style="display:inline-block;padding:12px 24px;border:1px solid #cbd2d9;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:28px;letter-spacing:8px;font-weight:700;color:#1f2933">${esc(b.text)}</span></p>`;
    case "button":
      return `<p style="margin:8px 0 24px"><a href="${esc(b.href)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#1f4e79;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">${esc(b.label)}</a></p>`
        + `<p style="margin:0 0 16px;font-size:12px;line-height:18px;color:#7b8794;word-break:break-all">${esc(b.href)}</p>`;
    case "facts":
      return `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;font-size:14px;color:#3e4c59">`
        + b.items.map((i) => `<tr><td style="padding:2px 12px 2px 0;color:#7b8794">${esc(i.label)}</td><td style="padding:2px 0">${esc(i.value)}</td></tr>`).join("")
        + `</table>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "paragraph": return b.text;
    case "quote": return (b.label ? `${b.label}\n` : "") + b.text.split(/\r?\n/).map((l) => `> ${l}`).join("\n");
    case "code": return `    ${b.text}`;
    case "button": return `${b.label} : ${b.href}`;
    case "facts": return b.items.map((i) => `${i.label} : ${i.value}`).join("\n");
  }
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const html = `<!doctype html>
<html lang="${esc(c.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:Roboto,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="border-collapse:collapse;background:#eef1f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;border-collapse:collapse;background:#ffffff;border-radius:8px">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e4e7eb;font-size:16px;font-weight:700;color:#1f2933">${esc(c.appName)}</td></tr>
<tr><td style="padding:24px 28px 8px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:600;color:#1f2933">${esc(c.title)}</h1>
${c.blocks.map(blockHtml).join("\n")}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e4e7eb;font-size:12px;line-height:18px;color:#7b8794">${nl2br(c.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.appName, "", c.title, "", ...c.blocks.map(blockText).flatMap((t) => [t, ""]), "--", c.footer].join("\n");
  return { html, text };
}
