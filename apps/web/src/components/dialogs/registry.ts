import dynamic from "next/dynamic";
import type { DialogComponent } from "./types";

/** Registre des modales-routes. Une entrée par préfixe d'URL (spec 00 §2.4). */
export const DIALOG_REGISTRY: Record<string, DialogComponent> = {
  project: dynamic(() => import("@/features/projects/dialogs")),

  // Flows (liste, modale flow, contenu)
  flow: dynamic(() => import("@/features/flows/dialogs")),
  "flow-content": dynamic(() => import("@/features/flows/content/dialogs")),

  // Paramètres
  client: dynamic(() => import("@/features/settings/dialogs/client")),
  company: dynamic(() => import("@/features/settings/dialogs/company")),
  family: dynamic(() => import("@/features/settings/dialogs/family")),
  status: dynamic(() => import("@/features/settings/dialogs/status")),
  "custom-field": dynamic(() => import("@/features/settings/dialogs/custom-field")),
  reference: dynamic(() => import("@/features/settings/dialogs/reference")),
  "background-task": dynamic(() => import("@/features/settings/dialogs/background-task")),
  wording: dynamic(() => import("@/features/settings/dialogs/wording")),
  tram: dynamic(() => import("@/features/documents/pdf/trams/tram-dialog")),

  // Collaborateurs et tablettes
  user: dynamic(() => import("@/features/collaborators/dialogs/user")),
  operator: dynamic(() => import("@/features/collaborators/dialogs/operator")),
  skills: dynamic(() => import("@/features/collaborators/dialogs/skills")),
  "external-user": dynamic(() => import("@/features/collaborators/dialogs/external-user")),
  tablet: dynamic(() => import("@/features/collaborators/dialogs/tablet")),
  "authorized-device": dynamic(() => import("@/features/collaborators/dialogs/authorized-device")),
  "quick-connection": dynamic(() => import("@/features/collaborators/dialogs/quick-connection")),
  "qr-code": dynamic(() => import("@/features/mobile-qr/qr-dialog")),
  "api-key": dynamic(() => import("@/features/api-access/dialogs/api-key")),

  // Formulaires (bibliothèque, entité, bloc de flow, réponse)
  "form-lib": dynamic(() => import("@/features/forms/dialogs")),

  // Documents (module d'entité, bibliothèque, dossier de clôture)
  "dashboard-documents": dynamic(() => import("@/features/documents/dialogs/project")),
  "library-documents": dynamic(() => import("@/features/documents/dialogs/library")),
  "closing-folder": dynamic(() => import("@/features/documents/dialogs/folder")),
  "closing-section": dynamic(() => import("@/features/documents/closing/section-dialog")),

  // Bibliothèque : risques, moyens, objets techniques, étiquettes
  "library-risk": dynamic(() => import("@/features/library/risks/risk-dialog")),
  "library-equipment": dynamic(() => import("@/features/library/equipments/equipment-dialog")),
  "library-object": dynamic(() => import("@/features/library/objects/object-dialog")),
  "library-tag": dynamic(() => import("@/features/library/tags/tag-dialog")),

  // Partage externe (formulaire, réponse, document)
  share: dynamic(() => import("@/features/share/dialogs")),

  // Tableau de bord d'entité
  "project-member": dynamic(() => import("@/features/project-dashboard/dialogs/member")),
  "project-tablet": dynamic(() => import("@/features/project-dashboard/dialogs/project-tablet")),
};
