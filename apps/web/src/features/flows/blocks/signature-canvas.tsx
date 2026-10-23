"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import SignaturePad from "signature_pad";
import { EraserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Zone de tracé de signature (signature_pad) ; renvoie une image PNG en data URL (null si vide). */
export function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const t = useTranslations("signatures.pad");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)" });
    pad.addEventListener("endStroke", () => cb.current(pad.isEmpty() ? null : pad.toDataURL("image/png")));
    padRef.current = pad;
    return () => pad.off();
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <canvas ref={canvasRef} aria-label={t("area")} className="h-40 w-full touch-none rounded-md border bg-white" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("hint")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => { padRef.current?.clear(); onChange(null); }}>
          <EraserIcon data-icon="inline-start" />{t("clear")}
        </Button>
      </div>
    </div>
  );
}
