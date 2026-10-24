/**
 * Contenus des QR lus par l'app terrain (spec 05 §2.2, §7.4) :
 * - QR imprimable d'un flow : ouvre le flow sur la tablette, en ligne comme hors ligne ;
 * - « QR Code ID » d'un collaborateur : authentification forte d'un signataire.
 */
export const flowQrPayload = (flowId: string, projectId: string) => JSON.stringify({ v: 1, flow_id: flowId, project_id: projectId });
export const collaboratorQrPayload = (collaboratorId: string) => JSON.stringify({ v: 1, collaborator_id: collaboratorId });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Page imprimable (une étiquette par QR) ouverte dans un nouvel onglet ; l'impression permet aussi l'export PDF. */
export function printQrSheet(title: string, items: { label: string; sublabel?: string | null; image: string }[]) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .card { border: 1px solid #ccc; border-radius: 8px; padding: 12px; text-align: center; break-inside: avoid; }
  .card img { width: 180px; height: 180px; }
  .label { font-weight: 600; margin-top: 8px; }
  .sub { color: #555; font-size: 12px; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1 style="font-size:18px">${escapeHtml(title)}</h1>
<div class="grid">${items.map((i) => `<div class="card"><img src="${i.image}" alt=""><div class="label">${escapeHtml(i.label)}</div>${i.sublabel ? `<div class="sub">${escapeHtml(i.sublabel)}</div>` : ""}</div>`).join("")}</div>
<script>window.onload = () => window.print();</script>
</body></html>`);
  win.document.close();
  return true;
}
