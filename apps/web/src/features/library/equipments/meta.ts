/** « Date de validité dépassée » : propriété de bibliothèque, validity_date < aujourd'hui (spec 02 §5.4). */
export const isExpired = (e: { validity_date: string | null }, today = new Date().toISOString().slice(0, 10)) =>
  !!e.validity_date && e.validity_date < today;
