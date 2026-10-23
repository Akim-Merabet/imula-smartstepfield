import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Carte centrée des écrans du parcours externe. */
export function ShareCard({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center p-6 sm:items-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children && <CardContent className="flex flex-col gap-4">{children}</CardContent>}
      </Card>
    </main>
  );
}
