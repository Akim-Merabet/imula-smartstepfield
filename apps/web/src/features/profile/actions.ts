"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/config";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { checkPassword } from "@/lib/validation/password";
import { profileSchema, type ProfileInput } from "./schema";

/** Met à jour le profil du collaborateur connecté (spec 01 §2.8) ; la langue est aussi posée en cookie. */
export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());

  const supabase = await createClient();
  const { error } = await supabase.from("collaborators").update(parsed.data).eq("id", session.collaborator.id);
  if (error) return fail(dbError(error));

  (await cookies()).set(LOCALE_COOKIE, parsed.data.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/explore", "layout");
  return ok(undefined);
}

/** Changement de mot de passe : vérifie l'ancien mot de passe puis applique la politique ANSSI (spec 01 §2.4). */
export async function changePassword(input: { oldPassword: string; newPassword: string; confirm: string }): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  const parsed = z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(1), confirm: z.string() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { oldPassword, newPassword, confirm } = parsed.data;
  if (newPassword !== confirm) return fail("mismatch");
  if (!Object.values(checkPassword(newPassword)).every(Boolean)) return fail("weak");
  if (newPassword === oldPassword) return fail("same");

  const email = session.collaborator.email;
  if (!email) return fail("invalid_password");
  // Vérification de l'ancien mot de passe sur un client isolé (sans persistance de session).
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await verifier.auth.signInWithPassword({ email, password: oldPassword });
  if (signInError) return fail("invalid_password");
  await verifier.auth.signOut({ scope: "local" });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return fail(error.code === "weak_password" ? "weak" : error.code === "same_password" ? "same" : "unknown");
  return ok(undefined);
}
