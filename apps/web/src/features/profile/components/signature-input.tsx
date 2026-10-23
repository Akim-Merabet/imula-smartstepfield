"use client";

import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";
import { EraserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Signature dessinée (signature_pad) exportée en data URL PNG. */
export function SignatureInput({ value, onChange, clearLabel, invalid }: {
  value: string | null; onChange: (dataUrl: string | null) => void; clearLabel: string; invalid?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const initial = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { backgroundColor: "rgba(0,0,0,0)", penColor: "#17224d" });
    padRef.current = pad;
    if (initial.current) void pad.fromDataURL(initial.current, { ratio, width: canvas.offsetWidth, height: canvas.offsetHeight });
    const end = () => onChangeRef.current(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    pad.addEventListener("endStroke", end);
    return () => { pad.removeEventListener("endStroke", end); pad.off(); };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <canvas ref={canvasRef} aria-invalid={invalid}
        className="h-40 w-full max-w-md touch-none rounded-md border bg-white aria-invalid:border-destructive" />
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => { padRef.current?.clear(); onChange(null); }}>
          <EraserIcon data-icon="inline-start" />{clearLabel}
        </Button>
      </div>
    </div>
  );
}
