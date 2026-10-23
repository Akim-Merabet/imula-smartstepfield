"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: "credentials" | "blocked" } | undefined;

function safeReturnUrl(value: FormDataEntryValue | null): string {
  const url = typeof value === "string" ? value : "";
  return url.startsWith("/") && !url.startsWith("//") ? url : "/explore/projects";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "credentials" };

  const { data: collaborator } = await supabase
    .from("collaborators")
    .select("status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!collaborator || collaborator.status === "blocked" || collaborator.status === "deleted" || collaborator.status === "inactive") {
    await supabase.auth.signOut();
    return { error: collaborator?.status === "blocked" ? "blocked" : "credentials" };
  }

  await supabase.from("collaborators").update({ last_sign_in_at: new Date().toISOString() }).eq("auth_user_id", data.user.id);
  redirect(safeReturnUrl(formData.get("returnUrl")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth");
}
