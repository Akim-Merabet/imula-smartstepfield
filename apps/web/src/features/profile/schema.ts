import { z } from "zod";

export const profileSchema = z.object({
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  trigram: z.string().trim().min(3).max(10).transform((v) => v.toUpperCase()),
  function_id: z.uuid().nullable(),
  complement: z.string().trim().max(255).transform((v) => v || null),
  profession: z.string().trim().max(255).transform((v) => v || null),
  language: z.enum(["fr", "en"]),
  signature_path: z.string().startsWith("data:image/").max(2_000_000),
});

export type ProfileInput = z.input<typeof profileSchema>;
