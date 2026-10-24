"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { DownloadIcon, PrinterIcon, QrCodeIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { collaboratorQrPayload, flowQrPayload, printQrSheet } from "./payloads";

type Loaded = { title: string; subtitle: string | null; payload: string } | { error: "disabled" | "not_found" };

/** ?dialog=qr-code/flow/<flowId> · qr-code/collaborator/<collaboratorId> — QR lus par l'app terrain. */
export default function QrCodeDialog({ segments, close }: DialogProps) {
  const t = useTranslations("mobileQr");
  const tg = useTranslations("global");
  const [kind, id] = segments;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async (): Promise<Loaded> => {
      if (kind === "flow") {
        const { data } = await supabase.from("flows").select("name, ref_int, project_id").eq("id", id).maybeSingle();
        return data ? { title: data.name, subtitle: data.ref_int, payload: flowQrPayload(id, data.project_id) } : { error: "not_found" as const };
      }
      const { data } = await supabase.from("collaborators").select("first_name, last_name, trigram, status").eq("id", id).maybeSingle();
      if (!data) return { error: "not_found" as const };
      // Le QR Code ID d'un collaborateur désactivé n'est pas généré (spec 01 §2.9).
      if (data.status !== "active") return { error: "disabled" as const };
      return { title: `${data.first_name} ${data.last_name}`, subtitle: data.trigram, payload: collaboratorQrPayload(id) };
    })().then(async (res) => {
      setLoaded(res);
      if ("payload" in res) setImage(await QRCode.toDataURL(res.payload, { width: 480, margin: 1 }));
    });
  }, [kind, id]);

  const fileName = loaded && "title" in loaded ? `QR - ${loaded.title}`.replace(/[^\w\- ]+/g, "_") : "QR";
  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = `${fileName}.png`;
    a.click();
    notify.success(t("generated"));
  };
  const print = () => {
    if (!image || !loaded || !("title" in loaded)) return;
    if (!printQrSheet(loaded.title, [{ label: loaded.title, sublabel: loaded.subtitle, image }])) notify.error(t("popupBlocked"));
  };

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={QrCodeIcon} size="md" />}
      title={kind === "flow" ? t("flowTitle") : t("collaboratorTitle")} subtitle={loaded && "title" in loaded ? loaded.title : undefined}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.close")}</Button>
        <Button variant="secondary" onClick={print} disabled={!image}><PrinterIcon data-icon="inline-start" />{t("print")}</Button>
        <Button onClick={download} disabled={!image}><DownloadIcon data-icon="inline-start" />{t("download")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-12"><Spinner /></div>
        : "error" in loaded ? <p className="py-12 text-center text-destructive">{t(`errors.${loaded.error}`)}</p>
        : (
          <div className="flex flex-col items-center gap-3">
            {image && (
              <img src={image} alt={loaded.title} width={320} height={320} className="rounded border" />
            )}
            {loaded.subtitle && <p className="text-sm text-muted-foreground">{loaded.subtitle}</p>}
            <p className="text-center text-sm text-muted-foreground">{kind === "flow" ? t("flowHint") : t("collaboratorHint")}</p>
          </div>
        )}
    </ModalShell>
  );
}
