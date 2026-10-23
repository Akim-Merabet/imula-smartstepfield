"use client";

import { toast } from "sonner";

/** Toasts applicatifs (haut-droite, 5 s) — spec 00 §5.3. */
export const notify = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  error: (title: string, description?: string) => toast.error(title, { description }),
  info: (title: string, description?: string) => toast.info(title, { description }),
  warning: (title: string, description?: string) => toast.warning(title, { description }),
};
