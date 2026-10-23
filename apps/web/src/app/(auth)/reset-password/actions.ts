"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { sent?: boolean } | undefined;

export async function requestReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  // Réponse identique que l'adresse existe ou non (pas d'énumération de comptes).
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/callback?next=/reset/finish` });
  return { sent: true };
}

export type NewPasswordState = { error?: "invalid" | "mismatch" | "failed"; done?: boolean } | undefined;

export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const { isPasswordValid } = await import("@/lib/validation/password");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!isPasswordValid(password)) return { error: "invalid" };
  if (password !== confirm) return { error: "mismatch" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "failed" };
  return { done: true };
}
