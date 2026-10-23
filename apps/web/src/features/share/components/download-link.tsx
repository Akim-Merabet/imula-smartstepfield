import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadLink({ href, label, variant = "default" }: { href: string; label: string; variant?: "default" | "outline" }) {
  return (
    <Button asChild variant={variant} className="self-start">
      {/* Téléchargement direct (route handler sans cache, contrôlé par la session de partage). */}
      <a href={href} download><DownloadIcon data-icon="inline-start" />{label}</a>
    </Button>
  );
}
