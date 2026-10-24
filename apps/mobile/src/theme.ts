// Palette de l'app terrain : bleu de marque (icône / écran de démarrage) et états de synchro.
export const colors = {
  primary: "#0D4E8A",
  primaryPressed: "#0A3D6C",
  onPrimary: "#FFFFFF",
  background: "#F4F6F9",
  surface: "#FFFFFF",
  border: "#D5DBE3",
  text: "#14202E",
  textSecondary: "#5B6776",
  danger: "#C62828",
  dangerSurface: "#FDECEA",
  success: "#2E7D5B",
  warning: "#B26A00",
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16 } as const;

export const font = { small: 13, body: 15, title: 22, hero: 28 } as const;
