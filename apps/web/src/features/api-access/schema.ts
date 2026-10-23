import { z } from "zod";
import { API_KEY_TYPES, SERVICE_CLASSES } from "./meta";

/** Création / édition d'une clé API (modale). L'expiration est une date (fin de journée, fuseau du serveur). */
export const apiClientSchema = z.object({
  name: z.string().trim().min(3).max(100),
  key_type: z.enum(API_KEY_TYPES),
  account_id: z.guid().nullable(),
  service_class: z.enum(SERVICE_CLASSES),
  expires_at: z.iso.date().nullable(),
  active: z.boolean(),
}).refine((v) => v.key_type === "organization" || !!v.account_id, { path: ["account_id"], message: "required" });

export type ApiClientInput = z.input<typeof apiClientSchema>;
