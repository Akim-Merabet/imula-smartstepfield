# Feuille de route

## Lot 1 — livré (cœur métier)
Socle (auth, shell, permissions, RLS), Entités, Paramètres, Collaborateurs et tablettes, Profil,
Flows (liste, modale 6 onglets, éditeur phases/étapes, 9 blocs, validation interne, signatures),
Formulaires (bibliothèque, éditeur 17 natures, formules math.js, import dans l'entité, moteur de réponse, bloc Formulaire, remontées terrain).

## Lot 2 — livré (vues, référentiels, documents, PDF)
- Vues flows : kanban (glisser-déposer = changement de statut), carte (react-leaflet, géométries, couches GeoJSON), plan Gantt maison (dépendances, jalons, glisser/redimensionner), diagramme (@xyflow/react, décomposition flow → phases → étapes).
- Séquencement éditable + logigramme, règle R-SEQ-1 appliquée à la validation d'étape, déverrouillage tracé.
- Référentiels : import (≤ 10), exécution en n copies, mise à jour depuis la source, déblocage (traitement synchrone tracé dans async_jobs).
- Documents : externes et générés, bibliothèque, suivi des versions (T0–T15, déverrouillage U1–U11, libellés issus de la configuration de suivi), retour client, liens bloc ↔ document, gel des indices à la signature, dossier de clôture, panneau d'imports.
- Moteur PDF : @react-pdf + pdf-lib (trames, champs, filigrane, numérotation, sommaire), worker `pnpm worker:documents` + déclenchement `after()`, aperçus PDF de formulaire et de réponse, écran des trames.

## Lot 3 — livré (duplication, dossiers, bibliothèque, partage externe, API)
- Duplication d'entité (copie profonde, circuits remis à zéro) et dossiers référentiels (conversion, sous-dossiers, préparation en projet), jobs asynchrones (`async_jobs` → cloche), historique des 5 dernières entités dans le rail.
- Bibliothèque : risques + parades (pictogrammes), moyens (vérification, validité), objets techniques (arbre, attributs, historique, certificats), étiquettes ; attributs d'objet dans les formulaires (pré-remplissage + réécriture sur l'objet).
- Partage externe de formulaires, réponses et documents : lien signé, code secret par e-mail, contributeur externe, envoi « continuer plus tard », PDF récapitulatif ; e-mails journalisés (`outbound_emails`) + SMTP optionnel (`SMTP_URL`).
- API externe v2 : clés compte/organisation, classes L1-L3, jeton 24 h, ~40 endpoints (entités, flows, phases/étapes, formulaires/réponses, documents, dictionnaires, KPI), OpenAPI 3.1, journal des appels.

## Écarts connus du lot 3
- Jobs `after()` sans reprise automatique s'ils s'interrompent ; fichiers Storage non recopiés lors d'une duplication (chemins partagés) ; plans et couches GeoJSON non dupliqués.
- Bibliothèque : pas de glisser-déposer dans les arbres, références d'objet non générées, pictogrammes génériques numérotés.
- Partage : pas de visa client par partage ; page des e-mails absente du menu Paramètres ; définir `APP_URL` en production.
- API : pas de build-form, de saisie de réponses, d'upload ni d'écriture de documents ; limitation de débit en mémoire (une seule instance).

## Écarts connus du lot 2
- Référentiels : pas d'Edge Function (synchrone), chapeaux référentiels sans flows liés, vue diagramme référentiel vide.
- Plan : pas d'ordonnancement des ressources ; carte : pas de recherche d'adresse.
- Documents : partage par e-mail, corbeille, « Mettre à jour document » au niveau du flow, écran des modèles de dossier de clôture ; upload limité à 50 Mo en local (pas d'upload résumable) ; un seul document par formulaire (index unique).
- PDF : pas de mise en évidence des changements entre indices, documents des flows enfants d'un chapeau, libellés de/it en anglais.

## Écarts connus du lot 1
**Transverse**
- Recherche avancée : sous-ensemble de champs uniquement (flows).
- Pas d'upload de fichiers hors formulaires (logos, PDF de compétences, page de garde client, signatures stockées en data URL).
- Navigation précédent/suivant et garde « modifications non sauvegardées » absentes de certaines modales collaborateurs.

**Entités / paramètres / collaborateurs**
- Duplication d'entité, dossiers référentiels (conversion, préparation), PGAC.
- Import Excel des utilisateurs, QR codes / connexion rapide, accès API.
- Trames, modèles et cellules de fichiers, modèles de dossiers de clôture, backups, logs push : écrans « bientôt disponible ».
- Usage/KPI : compteurs simples (pas d'export XLS ni de filtres client/famille).
- Grammaire des nomenclatures de références : choix maison (`{counter}`), non spécifiée par la source.

**Flows**
- Vue temporelle des signatures : « bientôt disponible ».
- Révisions, import de contenu depuis un modèle, rappels.
- Copier/coller de blocs.
- Historiques MULTI_PR et DSI enregistrés mais non affichés ; signature « en attente » et conflits.

**Formulaires**
- Partage externe (code secret, contributeur externe), Résumé statistique, attributs d'objet, import XLS de tableau.
- Références de formulaire sans règle chrono ; formules non réécrites lors d'un réordonnancement.

## Lots suivants proposés
1. **Mode terrain (MobileApp)** : l'original a une application Android hors ligne pour les opérateurs ; proposition : PWA hors ligne (téléchargement de flows, saisie, signatures, synchronisation).
2. **Tâches planifiées et rappels**, révisions de flow, import de contenu depuis un modèle.
3. **Résumé statistique des formulaires**, import XLS de tableaux, copier/coller de blocs, vue temporelle des signatures.
4. **PGAC** (spécifique métier nucléaire) si utile pour vos clients.
