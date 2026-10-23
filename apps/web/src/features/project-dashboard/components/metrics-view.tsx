import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { ProjectMetrics } from "../queries";

const CATEGORY_COLORS: Record<string, string> = {
  todo: "#9e9e9e", in_preparation: "#ffb141", in_operation: "#1f5086", in_progress: "#0e4f8a", done: "#57b09d", none: "#dadde0",
};
const STATE_COLORS: Record<string, string> = { redaction: "#9e9e9e", verification: "#ffb141", approbation: "#1f5086", validated: "#57b09d" };
const BLOCK_TYPES = ["pr", "emm", "adr", "dsi", "form", "txt", "rhp", "multi_pr", "object"] as const;
const BLOCK_STATES = ["redaction", "verification", "approbation", "validated"] as const;
const CATEGORIES = ["todo", "in_preparation", "in_operation", "in_progress", "done", "none"] as const;

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-md border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-table-head uppercase">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Bar({ label, value, total, color, hint }: { label: string; value: number; total: number; color: string; hint?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1" title={hint}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} /><span className="truncate">{label}</span></span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}{hint ? ` · ${hint}` : ""}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/60 p-3">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** Module « Avancement » (spec 01 §5.10). */
export async function MetricsView({ m }: { m: ProjectMetrics }) {
  const t = await getTranslations("dashboard.metrics");
  const s = m.signatures;
  const pct = s.total ? Math.round((s.signed / s.total) * 100) : 0;
  const knownTypes = ["specific", "generic", "referential"] as const;
  const otherFlows = m.flowsTotal - knownTypes.reduce((n, k) => n + (m.flowsByType[k] ?? 0), 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-4 xl:grid-cols-2">
      <Card title={t("flows.title")} subtitle={t("flows.total", { count: m.flowsTotal })}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("flows.byStatus")}</h3>
            {m.flowsByStatus.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> :
              m.flowsByStatus.map((x) => <Bar key={x.id} label={x.name || t("flows.noStatus")} value={x.count} total={m.flowsTotal} color={x.color} />)}
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("flows.byCategory")}</h3>
            {m.flowsTotal === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> :
              CATEGORIES.filter((c) => m.flowsByCategory[c]).map((c) => (
                <Bar key={c} label={t(`categories.${c}`)} value={m.flowsByCategory[c] ?? 0} total={m.flowsTotal} color={CATEGORY_COLORS[c]} />
              ))}
          </div>
        </div>
      </Card>
      <Card title={t("project.title")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("project.members")} value={m.membersCount} />
          {knownTypes.map((k) => <Stat key={k} label={t(`project.flowTypes.${k}`)} value={m.flowsByType[k] ?? 0} />)}
          {otherFlows > 0 && <Stat label={t("project.other")} value={otherFlows} />}
        </div>
      </Card>
      <Card title={t("blocks.stateTitle")}>
        {m.blocksTotal === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : (
          <div className="flex flex-col gap-3">
            {BLOCK_STATES.map((st) => <Bar key={st} label={t(`blocks.states.${st}`)} value={m.blockStates[st] ?? 0} total={m.blocksTotal} color={STATE_COLORS[st]} />)}
          </div>
        )}
      </Card>
      <Card title={t("blocks.typeTitle")}>
        {m.blocksTotal === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : (
          <div className="flex flex-col gap-3">
            {BLOCK_TYPES.filter((ty) => m.blockTypes[ty]).map((ty) => (
              <Bar key={ty} label={t(`blocks.types.${ty}`)} value={m.blockTypes[ty].blocks} total={m.blocksTotal} color="#0e4f8a"
                hint={t("blocks.usage", { blocks: m.blockTypes[ty].blocks, flows: m.blockTypes[ty].flows })} />
            ))}
          </div>
        )}
      </Card>
      <Card title={t("signatures.title")} subtitle={t("signatures.done", { signed: s.signed, total: s.total })}>
        <Bar label={t("signatures.percent", { value: pct })} value={s.signed} total={s.total} color="#57b09d" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label={t("signatures.mobile")} value={s.mobile} />
          <Stat label={t("signatures.web")} value={s.web} />
          <Stat label={t("signatures.intern")} value={s.intern} />
          <Stat label={t("signatures.extern")} value={s.extern} />
          <Stat label={t("signatures.notListed")} value={s.notListed} />
        </div>
      </Card>
    </div>
  );
}
