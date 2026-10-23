"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import SignaturePad from "signature_pad";

export type SignatureCanvasHandle = { isEmpty: () => boolean; clear: () => void; toDataURL: () => string };

/** Zone de signature (signature_pad), redimensionnée à la largeur du conteneur. */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, { height?: number; onChange?: () => void }>(
  function SignatureCanvas({ height = 180, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pad = new SignaturePad(canvas, { penColor: "#17224d", backgroundColor: "rgba(255,255,255,0)" });
      padRef.current = pad;
      const resize = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d")?.scale(ratio, ratio);
        pad.clear();
      };
      resize();
      const end = () => onChange?.();
      pad.addEventListener("endStroke", end);
      window.addEventListener("resize", resize);
      return () => { pad.removeEventListener("endStroke", end); window.removeEventListener("resize", resize); pad.off(); };
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      clear: () => { padRef.current?.clear(); onChange?.(); },
      toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
    }), [onChange]);

    return <canvas ref={canvasRef} style={{ height }} className="w-full touch-none rounded-md border bg-white" />;
  },
);
