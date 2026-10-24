// Libellés français de l'app terrain (clés alignées sur l'outil d'origine, spec 05).
export const fr = {
  common: {
    close: "Fermer",
    ok: "J'ai compris",
    version: "Version {version}",
  },
  login: {
    welcomeTo: "Bienvenue sur",
    signToAccount: "Connectez-vous à votre compte",
    knownProfiles: "Profils déjà connectés sur cet appareil",
    lastConnection: "Dernière connexion : {date}",
    orUseYourLoginCredentials: "ou utilisez vos identifiants",
    email: "Adresse email",
    password: "Mot de passe",
    company: "Entreprise",
    login: "Me connecter",
    loggingIn: "Connexion…",
    deviceIdentifier: "Identifiant appareil",
    deviceIdentifierTitle: "Identifiant de l'appareil",
    deviceIdentifierNumber: "Numéro d'identifiant : {id}",
    emailAddressIsRequired: "L'adresse email est obligatoire",
    emailAddressIsInvalid: "L'adresse email n'est pas valide",
    passwordIsRequired: "Le mot de passe est obligatoire",
    passwordMustBeAtLeast6CharactersLong: "Le mot de passe doit contenir au moins 6 caractères",
    companyIsRequired: "L'entreprise est obligatoire",
    sessionExpired: "La session de ce profil a expiré : reconnectez-vous avec vos identifiants.",
    errors: {
      INVALID_REQUEST: "Un ou plusieurs champs ne sont pas valides. Veuillez vérifier vos informations.",
      INVALID_CREDENTIALS: "Un ou plusieurs champs ne sont pas valides. Veuillez vérifier vos informations.",
      INVALID_DOMAIN: "Un ou plusieurs champs ne sont pas valides. Veuillez vérifier le nom de votre entreprise.",
      PROFILE_BLOCKED: "Votre compte est bloqué. Contactez votre administrateur.",
      DEVICE_UNAUTHORIZED: "Cet appareil ne fait pas partie des équipements autorisés sur votre environnement",
      ANOTHER_DEVICE: "Un autre appareil est déjà connecté avec ce compte.",
      NO_INTERNET: "Impossible de se connecter. Vérifier votre connexion internet",
      UNKNOWN: "Une erreur est survenue. Veuillez réessayer.",
    },
  },
  deviceUnsecure: {
    title: "Blocage de sécurité",
    message:
      "Votre appareil n'est pas protégé par un mot de passe. Veuillez paramétrer un mode de déverrouillage (code, schéma ou biométrie) pour utiliser l'application.",
    closeApp: "Fermer l'application",
  },
  home: {
    projects: "Projets",
    noProject: "Aucun projet disponible",
    online: "En ligne",
    offline: "Hors ligne",
    syncing: "Synchronisation…",
    synced: "Synchronisé {date}",
    neverSynced: "Jamais synchronisé",
    pendingChanges: "{count} modification(s) en attente d'envoi",
    rejectedChanges: "{count} modification(s) refusée(s) par le serveur",
    signOut: "Se déconnecter",
    signOutOffline: "Impossible de se déconnecter lorsque vous êtes hors ligne",
  },
  push: {
    forbiddenTitle: "Envoi des données impossible",
    forbiddenMessage:
      "Votre envoi de données contient des données d'un projet auquel vous n'avez pas accès. Ce problème survient lorsque votre profil a été supprimé du projet.",
    forbiddenHint: "Une fois votre tablette assignée au projet, repassez en ligne pour procéder à l'envoi de vos données.",
  },
};

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof fr>;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], fr) as string;
  return params ? value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? "")) : value;
}
