// Vocabulaire « Intervention » (organizations.flow_term) : redéfinit chaque libellé de fr.ts où « flow » apparaît
// (féminin, élision « l'intervention ») ; le type de flow léger devient « Intervention formulaire ».
import type { Messages } from "./fr";

export const frIntervention = {
  common: {
    noOpenFlow: "Aucune intervention ouverte",
  },
  flowTypes: {
    specific: "Intervention spécifique",
    generic: "Intervention générique",
    flow_form: "Intervention formulaire",
    group: "Intervention chapeau",
    referential: "Intervention référentielle",
    group_referential: "Intervention chapeau référentielle",
    referential_intervention: "Intervention formulaire référentielle",
    referential_generic: "Intervention référentielle générique",
    template: "Intervention modèle",
    local_referential: "Intervention référentielle locale",
  },
  execution: {
    validate: "Valider et terminer l'intervention",
    finishOnly: "Terminer l'intervention",
    closeFlow: "Fermer l'intervention",
    signaturesTableEmpty: "Aucune signature attendue sur cette intervention",
    unlockFlow: "Déverrouiller l'intervention",
    unlockTitle: "Déverrouiller l'intervention",
    unlockSubtitle: "En déverrouillant l'intervention vous pourrez compléter toutes les étapes, sans avoir à réaliser les phases et étapes précédentes.",
    unlockConfirm: "Cette action est irréversible, je confirme prendre la décision de déverrouiller l'intervention.",
    unlockConfirmRequired: "Veuillez confirmer le déverrouillage de l'intervention",
    unlockDone: "L'intervention est déverrouillée : toutes les étapes peuvent être complétées.",
    flowUnlocked: "Intervention déverrouillée",
    flowNotDownloaded: "Cette intervention n'est pas disponible sur la tablette. Téléchargez-la depuis la liste des interventions.",
  },
  signature: {
    noCollaborator: "Aucun collaborateur disponible pour cette intervention",
    errors: {
      notInRestrictedList: "Ce collaborateur ne fait pas partie de la liste restreinte de l'intervention.",
    },
  },
  backup: {
    importConfirm: "Les écritures non envoyées de la sauvegarde du {date} seront remises en file d'envoi, avec les interventions sélectionnées hors ligne. Les modifications déjà appliquées sont ignorées ; les autres remplacent les valeurs actuelles. Les photos et signatures dessinées ne font pas partie des sauvegardes.",
    importDownload: "Téléchargement des interventions de la sauvegarde…",
  },
  rejections: {
    tables: {
      flow_status_changes: "Statut de l'intervention",
      flow_fill_unlocks: "Déverrouillage de l'intervention",
    },
    codes: {
      NOT_IN_RESTRICTED_LIST: "Le signataire ne fait pas partie de la liste restreinte de l'intervention.",
      SUPERVISOR_NOT_APPLICABLE: "Ce surveillant n'est plus applicable sur l'intervention.",
      SIMPLIFIED_MODE: "L'intervention est passée en mode de signature simplifié.",
    },
  },
  quickAccess: {
    openFlows: "{count} intervention(s) ouverte(s)",
    noExecutedFlow: "Il semblerait qu’aucune intervention ne soit ouverte",
  },
  projects: {
    flowsCount: "{count} intervention(s)",
    scanFlow: "Scanner le QR code d'une intervention",
    flowQrTitle: "Impossible d'accéder à l'intervention",
  },
  flows: {
    listProjectFlow: "LISTE DES INTERVENTIONS DU PROJET",
    myFlows: "Mes interventions",
    allFlows: "Toutes les interventions",
    unavailable: "Cette intervention n'est pas disponible : son statut ne permet pas de l'ouvrir sur l'application.",
    notDownloaded: "Cette intervention n'a pas été téléchargée sur la tablette.",
    downloadOffline: "Passez en ligne pour télécharger des interventions.",
    downloadStarted: "{count} intervention(s) en cours de téléchargement",
  },
  flowDetails: {
    relatedItems: "ÉLÉMENTS LIÉS À L'INTERVENTION",
    flowType: "Type d'intervention",
    flowStatus: "Statut de l'intervention",
    neverDownloaded: "Intervention non téléchargée",
    reCheckoutFlow: "Re-télécharger intervention",
    downloadFlow: "Télécharger l'intervention",
    deleteBlocked: "Cette intervention contient {count} modification(s) non envoyée(s). Passez en ligne pour les envoyer avant de la supprimer de la tablette.",
    deleted: "L'intervention a été supprimée de la tablette",
    statusChanged: "Le statut de l'intervention a été modifié",
    statusNotDownloadable: "Avec ce statut, l'intervention ne sera plus disponible sur la tablette après l'envoi.",
    downloadToSee: "Téléchargez l'intervention pour consulter ses éléments.",
  },
} satisfies Messages;
