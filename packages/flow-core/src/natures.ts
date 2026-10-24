import { type DsiConfig, on, type SignatureNature, type SupervisionFlow } from "./types";

export const SIGNATURE_NATURES: SignatureNature[] = [
  "realisation", "tech_control",
  "breakpoint_int_1", "breakpoint_int_2", "breakpoint_int_3",
  "convocation_int_1", "convocation_int_2", "convocation_int_3",
  "breakpoint_ext_1", "breakpoint_ext_2", "breakpoint_ext_3",
  "convocation_ext_1", "convocation_ext_2", "convocation_ext_3",
];

/** Trigramme de nature (R / CT / PA / PC). */
export function natureCode(n: SignatureNature): "R" | "CT" | "PA" | "PC" {
  if (n === "realisation") return "R";
  if (n === "tech_control") return "CT";
  return n.startsWith("breakpoint") ? "PA" : "PC";
}

/** Colonne du tableau récapitulatif (spec 02 §6.4). */
export function natureGroup(n: SignatureNature): "execution" | "supervision" {
  return n === "realisation" || n === "tech_control" ? "execution" : "supervision";
}

/** Surveillants applicables : index 1..3 ; sans surveillant défini → mode « mono » (index 1 seul). */
export function applicableSupervisors(flow: SupervisionFlow, kind: "int" | "ext"): { n: 1 | 2 | 3; name: string | null; mono: boolean }[] {
  const flags = kind === "int"
    ? [flow.supervision_intern_1, flow.supervision_intern_2, flow.supervision_intern_3]
    : [flow.supervision_extern_1, flow.supervision_extern_2, flow.supervision_extern_3];
  const names = kind === "int"
    ? [flow.internal_supervisor_name_1, flow.internal_supervisor_name_2, flow.internal_supervisor_name_3]
    : [flow.external_supervisor_name_1, flow.external_supervisor_name_2, flow.external_supervisor_name_3];
  if (!flags.some(on)) return [{ n: 1, name: null, mono: true }];
  return ([1, 2, 3] as const).filter((n) => on(flags[n - 1])).map((n) => ({ n, name: names[n - 1], mono: false }));
}

/** Natures de signature attendues pour un bloc Contrôle (miroir de private.dsi_expected_natures). */
export function expectedNatures(config: DsiConfig | null | undefined, flow: SupervisionFlow): SignatureNature[] {
  if (!config || config.signatories_status === "disabled") return [];
  const out: SignatureNature[] = ["realisation"];
  if (on(config.technical_control)) out.push("tech_control");
  if (on(flow.simplified_signature_mode)) return out;
  const c = config as unknown as Record<string, boolean | number | null>;
  for (const kind of ["int", "ext"] as const) {
    for (const { n } of applicableSupervisors(flow, kind)) {
      if (on(c[`breakpoint_${kind}_${n}`])) out.push(`breakpoint_${kind}_${n}` as SignatureNature);
      if (on(c[`convocation_${kind}_${n}`])) out.push(`convocation_${kind}_${n}` as SignatureNature);
    }
  }
  return out;
}

export function supervisorName(n: SignatureNature, flow: SupervisionFlow): string | null {
  const m = /^(breakpoint|convocation)_(int|ext)_(\d)$/.exec(n);
  if (!m) return null;
  const key = `${m[2] === "int" ? "internal" : "external"}_supervisor_name_${m[3]}` as keyof SupervisionFlow;
  return (flow[key] as string | null) ?? null;
}
