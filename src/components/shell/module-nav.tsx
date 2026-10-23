"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { readStorage, writeStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";

export type ModuleNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Préfixe d'URL considéré comme actif (défaut : href). */
  match?: string;
  children?: ModuleNavItem[];
};
export type ModuleNavGroup = { label?: string; items: ModuleNavItem[] };

function isActive(pathname: string, item: ModuleNavItem) {
  return pathname.startsWith(item.match ?? item.href);
}

function NavItem({ item, pathname }: { item: ModuleNavItem; pathname: string }) {
  const active = isActive(pathname, item);
  const base = "flex items-center gap-4 rounded px-2 py-2 text-sm transition-colors hover:bg-accent";
  if (!item.children?.length) {
    return (
      <Link href={item.href} className={cn(base, active && "bg-accent font-medium")}>
        <item.icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }
  return (
    <Collapsible defaultOpen={active}>
      <div className={cn(base, "pr-1", active && "font-medium")}>
        <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-4">
          <item.icon className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <CollapsibleTrigger className="rounded p-0.5 hover:bg-white/60 [&[data-state=open]>svg]:rotate-180">
          <ChevronDownIcon className="size-4 transition-transform" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="relative ml-4 flex flex-col gap-0.5 border-l border-foreground/70 pl-4">
          {item.children.map((child) => (
            <Link key={child.href} href={child.href}
              className={cn("flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent", isActive(pathname, child) && "bg-accent font-medium")}>
              <child.icon className="size-4 shrink-0" />
              <span className="truncate">{child.label}</span>
            </Link>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const COLLAPSED_KEY = "main_menu_collapsed";

/** Menu latéral de module (250px, repliable, état persistant) — spec 00 §3.2. */
export function ModuleNav({ header, groups }: { header: ReactNode; groups: ModuleNavGroup[] }) {
  const t = useTranslations("nav.menu");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(readStorage(COLLAPSED_KEY) === "1"); }, []);
  const toggle = () => { setCollapsed((c) => { writeStorage(COLLAPSED_KEY, c ? "0" : "1"); return !c; }); };

  if (collapsed) {
    return (
      <aside className="flex w-[1.85rem] shrink-0 flex-col items-center border-r bg-sidebar py-3">
        <button type="button" onClick={toggle} aria-label={t("expand")} className="rounded p-1 hover:bg-accent">
          <PanelLeftOpenIcon className="size-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[250px] shrink-0 flex-col overflow-y-auto border-r bg-sidebar px-3 py-4">
      <div className="mb-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        <button type="button" onClick={toggle} aria-label={t("collapse")} className="rounded p-1 text-muted-foreground hover:bg-accent">
          <PanelLeftCloseIcon className="size-4" />
        </button>
      </div>
      {groups.map((group, i) => (
        <div key={group.label ?? i} className="flex flex-col gap-0.5 pt-4">
          {group.label && <div className="mx-2 mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</div>}
          {group.items.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
        </div>
      ))}
    </aside>
  );
}

export function ModuleNavHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0">
        <div className="truncate text-base font-medium">{title}</div>
        {subtitle && <div className="truncate text-sm text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}
