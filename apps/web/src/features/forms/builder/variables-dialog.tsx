"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DYNAMIC_VARIABLES } from "../meta";
import { useBuilder } from "./builder-context";

export type VariableEntry = { token: string; label: string; tab: "project" | "flow" | "form" | "attribute" };

/** Liste complète des variables dynamiques (jetons + libellés traduits). */
export function useVariables(): VariableEntry[] {
  const t = useTranslations("formBuilder.variables");
  const { data } = useBuilder();
  return useMemo(() => [
    ...(["project", "flow", "form"] as const).flatMap((tab) =>
      DYNAMIC_VARIABLES[tab].map((name) => ({ token: `@@${name}`, label: t(`items.${name}`), tab }))),
    ...data.attributeVariables.map((v) => ({ token: v.token, label: t("attribute", { name: v.name }), tab: "attribute" as const })),
  ], [t, data.attributeVariables]);
}

/** Fenêtre « Détails des variables dynamiques » (onglets Projet / Flow / Formulaire / Attribut). */
export function VariablesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("formBuilder.variables");
  const { copy } = useBuilder();
  const all = useVariables();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("info")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="project" className="min-h-0 flex-1">
          <TabsList>
            {(["project", "flow", "form", "attribute"] as const).map((tab) => <TabsTrigger key={tab} value={tab}>{t(`tabs.${tab}`)}</TabsTrigger>)}
          </TabsList>
          {(["project", "flow", "form", "attribute"] as const).map((tab) => {
            const rows = all.filter((v) => v.tab === tab);
            return (
              <TabsContent key={tab} value={tab} className="min-h-0 overflow-y-auto">
                {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-table-head">
                        <th className="py-2 pr-4 font-semibold">{t("columns.name")}</th>
                        <th className="py-2 pr-4 font-semibold">{t("columns.description")}</th>
                        <th className="py-2 text-right font-semibold">{t("columns.action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((v) => (
                        <tr key={v.token} className="border-b border-row-hover">
                          <td className="py-1.5 pr-4 font-mono text-xs">{v.token}</td>
                          <td className="py-1.5 pr-4">{v.label}</td>
                          <td className="py-1.5 text-right">
                            <Button variant="ghost" size="icon-sm" aria-label={t("copy")} onClick={() => copy(v.token)}><CopyIcon /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
