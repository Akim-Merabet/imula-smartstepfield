// Journal d'actions de l'appareil (spec 05 §6.5, « Logs push » de la WebApp) : écrit localement, envoyé après chaque
// envoi réussi. Sans dépendance native : la base du profil ouvert est liée par la session.
type LogDb = { execute(sql: string, params?: unknown[]): Promise<unknown> };

export type LogAction =
  | "SWITCH_TO_ONLINE" | "SWITCH_TO_OFFLINE" | "PUSH_SUCCESS" | "PUSH_REJECTED" | "PUSH_FORBIDDEN"
  | "START_CHECKOUT" | "DELETE_FLOW_DATA" | "SCAN_QRCODE_FLOW_SUCCESS" | "SCAN_QRCODE_FLOW_FAIL"
  | "CLICK_TO_SAVE_SIGNATURE" | "BACKUP_LOCAL" | "BACKUP_SUPPORT" | "BACKUP_FAIL" | "RESET_LOCAL_DATA" | "RESTORE_BACKUP" | "SIGN_IN" | "SIGN_OUT";

let bound: LogDb | null = null;

export function bindLogger(db: LogDb | null) {
  bound = db;
}

export function logEvent(action: LogAction, detail?: Record<string, unknown>) {
  if (!bound) return;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  void bound.execute("insert into app_logs (id, action, detail, occurred_at) values (?, ?, ?, ?)",
    [id, action, detail ? JSON.stringify(detail) : null, new Date().toISOString()]).catch(() => {});
}
