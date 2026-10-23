"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { EyeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type EmailLogRow = {
  id: string; created_at: string; to_email: string; subject: string; kind: string; status: string; transport: string;
  error: string | null; redacted: boolean; html: string; text_body: string;
};

/** Journal des e-mails sortants (outil de développement, Admin Siteflow). */
export function EmailsLog({ rows }: { rows: EmailLogRow[] }) {
  const t = useTranslations("share.emails");
  const format = useFormatter();
  const [open, setOpen] = useState<EmailLogRow | null>(null);
  const statusVariant = (s: string) => (s === "failed" ? "destructive" : s === "sent" ? "default" : "secondary") as "destructive" | "default" | "secondary";
  if (!rows.length) return <p className="py-6 text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("to")}</TableHead>
            <TableHead>{t("subject")}</TableHead>
            <TableHead>{t("kind")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
              <TableCell className="whitespace-nowrap">{format.dateTime(new Date(r.created_at), { dateStyle: "short", timeStyle: "medium" })}</TableCell>
              <TableCell>{r.to_email}</TableCell>
              <TableCell className="max-w-96 truncate">{r.subject}</TableCell>
              <TableCell><code className="text-xs">{r.kind}</code></TableCell>
              <TableCell>
                <Badge variant={statusVariant(r.status)} title={r.error ?? undefined}>{t(`statuses.${r.status as "logged"}`)} · {r.transport}</Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" aria-label={t("view")} onClick={(e) => { e.stopPropagation(); setOpen(r); }}><EyeIcon /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{open?.subject}</DialogTitle>
            <DialogDescription>{open?.to_email}{open?.redacted ? ` · ${t("redacted")}` : ""}</DialogDescription>
          </DialogHeader>
          {open && (
            <Tabs defaultValue="html" className="min-h-0 flex-1">
              <TabsList>
                <TabsTrigger value="html">{t("html")}</TabsTrigger>
                <TabsTrigger value="text">{t("text")}</TabsTrigger>
              </TabsList>
              <TabsContent value="html" className="min-h-0">
                {/* Rendu isolé (sandbox sans scripts) du HTML généré par l'application. */}
                <iframe title={open.subject} sandbox="" srcDoc={open.html} className="h-[60vh] w-full rounded-md border bg-white" />
              </TabsContent>
              <TabsContent value="text">
                <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{open.text_body}</pre>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
