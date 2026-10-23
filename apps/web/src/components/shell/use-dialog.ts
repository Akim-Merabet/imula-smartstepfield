"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const DIALOG_PARAM = "dialog";

/** Ouvre / ferme une modale-route en préservant les autres paramètres d'URL. */
export function useDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const build = useCallback((path: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (path) params.set(DIALOG_PARAM, path);
    else params.delete(DIALOG_PARAM);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const current = searchParams.get(DIALOG_PARAM);
  return useMemo(() => ({
    current,
    open: (path: string) => router.push(build(path), { scroll: false }),
    replace: (path: string) => router.replace(build(path), { scroll: false }),
    close: () => router.replace(build(null), { scroll: false }),
    href: build,
  }), [current, router, build]);
}
