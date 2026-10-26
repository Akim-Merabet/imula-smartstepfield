export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Terme affiché pour désigner les flows (organizations.flow_term) ; « flow » = libellés de base. */
export const flowTerms = ["flow", "procedure", "intervention"] as const;
export type FlowTerm = (typeof flowTerms)[number];
