import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type Crumb = { label: string; href?: string };

/** Fil d'Ariane + titre + actions de page (spec 00 §4). */
export function PageHeader({ crumbs, title, subtitle, actions }: {
  crumbs: Crumb[]; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pt-4 pb-3">
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="max-w-80 truncate">
                {crumb.href && i < crumbs.length - 1 ? (
                  <BreadcrumbLink asChild><Link href={crumb.href}>{crumb.label}</Link></BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h1 className="truncate text-xl font-medium">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
