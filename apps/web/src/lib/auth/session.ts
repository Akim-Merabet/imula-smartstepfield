import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Collaborator = Tables<"collaborators">;
export type Organization = Tables<"organizations">;
export type Account = Tables<"accounts">;

export type Session = {
  userId: string;
  collaborator: Collaborator;
  organization: Organization;
  account: Account;
};

/** Session de la requête courante (mémoïsée par requête). Null si non connecté ou sans collaborateur actif. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: collaborator } = await supabase
    .from("collaborators")
    .select("*")
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!collaborator || collaborator.status !== "active") return null;

  const [{ data: organization }, { data: account }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", collaborator.organization_id).single(),
    supabase.from("accounts").select("*").eq("id", collaborator.account_id).single(),
  ]);
  if (!organization || !account) return null;

  return { userId, collaborator, organization, account };
});

/** Exige une session ; redirige vers la connexion sinon. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/auth");
  return session;
}
