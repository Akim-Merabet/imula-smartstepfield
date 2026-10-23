import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { API_V2_BASE } from "../meta";
import { ACCOUNT_PARAM, COMMON_LIST_PARAMS, ENDPOINTS, type Endpoint, type ParamDef } from "../rest/catalog";
import { RATE_LIMITS } from "../rest/rate-limit";

const METHOD_CLASS: Record<Endpoint["method"], string> = {
  GET: "bg-primary/10 text-primary",
  POST: "bg-success/15 text-success",
  PUT: "bg-muted text-foreground",
  PATCH: "bg-muted text-foreground",
};

function ParamsTable({ params, requiredLabel }: { params: ParamDef[]; requiredLabel: string }) {
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {params.map((p) => (
          <tr key={`${p.in}-${p.name}`} className="border-t align-top">
            <td className="w-48 py-1.5 pr-3 font-mono">{p.name}</td>
            <td className="w-28 py-1.5 pr-3 text-muted-foreground">{p.in} · {p.type}</td>
            <td className="py-1.5">
              {p.description}
              {p.enum && <span className="text-muted-foreground"> ({p.enum.join(", ")})</span>}
              {(p.required || p.in === "path") && <span className="ml-1 text-destructive">{requiredLabel}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Rendu maison de la documentation (sans dépendance) à partir du catalogue des endpoints. */
export async function ApiDocs({ origin, locale }: { origin: string; locale: "fr" | "en" }) {
  const t = await getTranslations("apiAccess.docs");
  const tags = [...new Set(ENDPOINTS.map((e) => e.tag))];
  return (
    <div className="flex max-w-5xl flex-col gap-6 pb-8">
      <section className="flex flex-col gap-2 rounded-md border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="flex gap-2"><span className="text-muted-foreground">{t("baseUrl")}</span><code className="font-mono">{origin}{API_V2_BASE}</code></span>
          <a className="text-primary underline-offset-4 hover:underline" href={`${API_V2_BASE}/openapi.json`} target="_blank" rel="noreferrer">{t("openapi")}</a>
        </div>
        <h2 className="pt-2 font-medium">{t("general")}</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>{t("auth")}</li>
          <li>{t("scope")}</li>
          <li>{t("classes")}</li>
          <li>{t("lists")}</li>
          <li>{t("embed")}</li>
          <li>{t("errors")}</li>
          <li>{t("rateLimit", { perClient: RATE_LIMITS.perClient, auth: RATE_LIMITS.authPerIp })}</li>
        </ul>
      </section>
      {tags.map((tag) => (
        <section key={tag} className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{tag}</h2>
          {ENDPOINTS.filter((e) => e.tag === tag).map((e) => {
            const params = [...(e.params ?? []), ...(e.paginated ? COMMON_LIST_PARAMS : []), ...(e.level && e.accountScoped !== false ? [ACCOUNT_PARAM] : [])];
            const schema = e.body ? JSON.stringify(z.toJSONSchema(e.body, { io: "input", unrepresentable: "any" }), null, 2) : null;
            return (
              <article key={e.id} id={e.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-2 py-0.5 font-mono text-xs font-semibold", METHOD_CLASS[e.method])}>{e.method}</span>
                  <code className="font-mono text-sm">{e.path}</code>
                  <Badge variant={e.level ? "secondary" : "outline"}>{e.level ? t("class", { level: e.level }) : t("public")}</Badge>
                  {e.paginated && <Badge variant="outline">{t("paginated")}</Badge>}
                </div>
                <p className="text-sm">{e.summary[locale]}</p>
                {e.embed && <p className="flex gap-2 text-xs"><span className="text-muted-foreground">{t("embedKeywords")}</span><code className="font-mono">{e.embed.join(", ")}</code></p>}
                {params.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium">{t("parameters")}</span>
                    <ParamsTable params={params} requiredLabel={t("required")} />
                  </div>
                )}
                {schema && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium">{t("body")}</summary>
                    <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 font-mono">{schema}</pre>
                  </details>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
