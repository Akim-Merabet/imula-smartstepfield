"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { requestShareCode } from "../public-actions";
import { publicErrorKey } from "./errors";

export function RequestCodeButton({ token, label }: { token: string; label: string }) {
  const t = useTranslations("share.public.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button className="self-start" disabled={pending} onClick={() => start(async () => {
      const res = await requestShareCode(token);
      // Un code encore valide (anti-rebond) n'empêche pas de passer à la saisie.
      if (!res.ok && res.error !== "cooldown") { notify.error(t(publicErrorKey(res.error))); return; }
      router.push(`/share/${token}/login`);
    })}>
      {pending ? <Spinner data-icon="inline-start" /> : null}{label}<ArrowRightIcon data-icon="inline-end" />
    </Button>
  );
}
