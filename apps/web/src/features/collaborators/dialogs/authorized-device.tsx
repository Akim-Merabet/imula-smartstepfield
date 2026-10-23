"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleCheckIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { saveAuthorizedDevice } from "../actions";
import { useErrorMessage } from "../components/action-runner";

/** ?dialog=authorized-device/add · authorized-device/edit/<id> (spec 01 §4.9). */
export default function AuthorizedDeviceDialog({ segments, close }: DialogProps) {
  const t = useTranslations("collaborators.device");
  const tg = useTranslations("global");
  const router = useRouter();
  const message = useErrorMessage();
  const [action, id] = segments;
  const isEdit = action === "edit" && !!id;
  const [form, setForm] = useState({ designation: "", device_id: "" });
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!isEdit) return;
    createClient().from("authorized_devices").select("designation, device_id").eq("id", id).single().then(({ data }) => {
      if (data) setForm(data);
      setLoaded(true);
    });
  }, [isEdit, id]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.designation.trim().length < 3) e.designation = tg("validators.minLength", { min: 3 });
    if (form.device_id.trim().length < 3) e.device_id = tg("validators.minLength", { min: 3 });
    setErrors(e);
    if (Object.keys(e).length) return;
    start(async () => {
      const res = await saveAuthorizedDevice(isEdit ? id : null, form);
      if (!res.ok) {
        if (res.error === "device_conflict") setErrors({ device_id: message(res.error) });
        notify.error(message(res.error));
        return;
      }
      notify.success(isEdit ? tg("toast.saved") : tg("toast.created"));
      router.refresh();
      close();
    });
  };

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={CircleCheckIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: form.designation }) : t("createTitle")}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          <Field data-invalid={!!errors.designation}>
            <FieldLabel htmlFor="d-designation">{t("designation")} *</FieldLabel>
            <Input id="d-designation" value={form.designation} aria-invalid={!!errors.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
            {errors.designation && <FieldError>{errors.designation}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.device_id}>
            <FieldLabel htmlFor="d-device">{t("deviceId")} *</FieldLabel>
            <Input id="d-device" value={form.device_id} aria-invalid={!!errors.device_id}
              onChange={(e) => setForm((f) => ({ ...f, device_id: e.target.value }))} />
            <FieldDescription>{t("deviceIdHelp")}</FieldDescription>
            {errors.device_id && <FieldError>{errors.device_id}</FieldError>}
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
