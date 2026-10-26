// Vocabulaire « Procédure » (organizations.flow_term) : redéfinit chaque libellé de fr.ts où « flow » apparaît
// (accords au féminin). Les autres libellés restent ceux de fr.ts ; un test vérifie la couverture.
import type { Messages } from "./fr";

export const frProcedure = {
  common: {
    noOpenFlow: "Aucune procédure ouverte",
  },
  flowTypes: {
    specific: "Procédure spécifique",
    generic: "Procédure générique",
    flow_form: "Procédure intervention",
    group: "Procédure chapeau",
    referential: "Procédure référentielle",
    group_referential: "Procédure chapeau référentielle",
    referential_intervention: "Procédure référentielle intervention",
    referential_generic: "Procédure référentielle générique",
    template: "Procédure modèle",
    local_referential: "Procédure référentielle locale",
  },
  execution: {
    validate: "Valider et terminer la procédure",
    finishOnly: "Terminer la procédure",
    closeFlow: "Fermer la procédure",
    signaturesTableEmpty: "Aucune signature attendue sur cette procédure",
    unlockFlow: "Déverrouiller la procédure",
    unlockTitle: "Déverrouiller la procédure",
    unlockSubtitle: "En déverrouillant la procédure vous pourrez compléter toutes les étapes, sans avoir à réaliser les phases et étapes précédentes.",
    unlockConfirm: "Cette action est irréversible, je confirme prendre la décision de déverrouiller la procédure.",
    unlockConfirmRequired: "Veuillez confirmer le déverrouillage de la procédure",
    unlockDone: "La procédure est déverrouillée : toutes les étapes peuvent être complétées.",
    flowUnlocked: "Procédure déverrouillée",
    flowNotDownloaded: "Cette procédure n'est pas disponible sur la tablette. Téléchargez-la depuis la liste des procédures.",
  },
  signature: {
    noCollaborator: "Aucun collaborateur disponible pour cette procédure",
    errors: {
      notInRestrictedList: "Ce collaborateur ne fait pas partie de la liste restreinte de la procédure.",
    },
  },
  backup: {
    importConfirm: "Les écritures non envoyées de la sauvegarde du {date} seront remises en file d'envoi, avec les procédures sélectionnées hors ligne. Les modifications déjà appliquées sont ignorées ; les autres remplacent les valeurs actuelles. Les photos et signatures dessinées ne font pas partie des sauvegardes.",
    importDownload: "Téléchargement des procédures de la sauvegarde…",
  },
  rejections: {
    tables: {
      flow_status_changes: "Statut de la procédure",
      flow_fill_unlocks: "Déverrouillage de la procédure",
    },
    codes: {
      NOT_IN_RESTRICTED_LIST: "Le signataire ne fait pas partie de la liste restreinte de la procédure.",
      SUPERVISOR_NOT_APPLICABLE: "Ce surveillant n'est plus applicable sur la procédure.",
      SIMPLIFIED_MODE: "La procédure est passée en mode de signature simplifié.",
    },
  },
  quickAccess: {
    openFlows: "{count} procédure(s) ouverte(s)",
    noExecutedFlow: "Il semblerait qu’aucune procédure ne soit ouverte",
  },
  projects: {
    flowsCount: "{count} procédure(s)",
    scanFlow: "Scanner le QR code d'une procédure",
    flowQrTitle: "Impossible d'accéder à la procédure",
  },
  flows: {
    listProjectFlow: "LISTE DES PROCÉDURES DU PROJET",
    myFlows: "Mes procédures",
    allFlows: "Toutes les procédures",
    unavailable: "Cette procédure n'est pas disponible : son statut ne permet pas de l'ouvrir sur l'application.",
    notDownloaded: "Cette procédure n'a pas été téléchargée sur la tablette.",
    downloadOffline: "Passez en ligne pour télécharger des procédures.",
    downloadStarted: "{count} procédure(s) en cours de téléchargement",
  },
  flowDetails: {
    relatedItems: "ÉLÉMENTS LIÉS À LA PROCÉDURE",
    flowType: "Type de procédure",
    flowStatus: "Statut de la procédure",
    neverDownloaded: "Procédure non téléchargée",
    reCheckoutFlow: "Re-télécharger procédure",
    downloadFlow: "Télécharger la procédure",
    deleteBlocked: "Cette procédure contient {count} modification(s) non envoyée(s). Passez en ligne pour les envoyer avant de la supprimer de la tablette.",
    deleted: "La procédure a été supprimée de la tablette",
    statusChanged: "Le statut de la procédure a été modifié",
    statusNotDownloadable: "Avec ce statut, la procédure ne sera plus disponible sur la tablette après l'envoi.",
    downloadToSee: "Téléchargez la procédure pour consulter ses éléments.",
  },
} satisfies Messages;
