# 🎟️ GalaTrace — Présentation du Système
### Système de Billetterie & Traçabilité Financière

---

## 🌐 Accès
**URL :** https://gala-trace.vercel.app
*(Fonctionne sur téléphone et ordinateur)*

---

## 👥 Les Rôles

| Rôle | Qui ? | Ce qu'il fait |
|---|---|---|
| **Admin** | Responsable système | Gère tout — comptes, quotas, bilan financier |
| **Vendeur** | Membres qui vendent | Enregistre les ventes, suit sa caisse |
| **Comité** | Membres du comité | Même accès que Vendeur |
| **Trésorière Générale** | Trésorière | Reçoit l'argent des vendeurs, déclare les dépenses |
| **Comptable** | Comptable | Valide les dépenses, confirme les versements reçus |
| **Direction** | Direction | Vue globale, plan de salle |
| **Observateur** | Invité lecture seule | Voit le tableau de bord uniquement |

---

## 🔐 Étape 1 — Créer son compte

1. Aller sur **gala-trace.vercel.app**
2. Cliquer **"Pas encore de compte ? S'inscrire"**
3. Remplir : Nom complet / Email / Mot de passe
4. ⚠️ Le compte est **en attente** — l'Admin doit l'activer
5. L'Admin assigne le bon rôle
6. Vous recevez une notification → vous pouvez vous connecter

---

## 🎫 Étape 2 — Enregistrer une vente (Vendeur / Comité)

**Onglet : Ventes & Tickets**

1. Cliquer **⚡ Saisie rapide** pour enchaîner plusieurs ventes
2. Choisir le type de ticket (Gold, Platinum, Diamond, Royal)
3. Remplir : Nom acheteur + WhatsApp + N° ticket + Acompte
4. Cliquer **Enregistrer & suivant**

**Types de billets :**
- Gold Interne — 10 000 F
- Platinum Interne — 12 000 F
- Diamond Interne — 15 000 F
- Gold Externe — 15 000 F
- Diamond Externe — 20 000 F
- Royal — 25 000 F

---

## 💰 Étape 3 — Flux de l'argent

```
Acheteur → paie le Vendeur
    ↓
Vendeur → remet physiquement à la Trésorière Générale
    ↓  (TG enregistre dans le système)
Trésorière Générale → remet à la Comptable
    ↓  (Comptable confirme réception)
✅ Argent en banque
```

---

## 📊 Ce que voit chaque rôle

### Vendeur / Comité
- **Ma Caisse** : Total collecté / Total versé / Gardé en main
- **Mes Ventes** : Liste avec statut paiement
- **Podium** : Classement des vendeurs

### Trésorière Générale
- **Caisse des Vendeurs** : Situation de chaque vendeur
- Enregistrer un versement reçu
- Déclarer une dépense (DJ, décoration, traiteur...)
- Remettre des fonds à la Comptable

### Comptable
- Valider ou rejeter les dépenses
- Confirmer les versements reçus de la TG
- Vue globale des flux

### Admin
- **Bilan financier** : Encaissé / Dépenses actées / **Reste en caisse**
- Gérer les comptes et rôles
- Attribuer les carnets/quotas
- Exporter toutes les ventes en Excel (CSV)

---

## 🪑 Plan de Salle

**Onglet : Placement** *(Admin / Direction)*

1. Créer des tables par catégorie (Gold, Diamond, Royal...)
2. Définir le nombre de places par table
3. Assigner les invités à leurs places
   - Un invité Diamond → uniquement tables Diamond
4. Voir les places libres / occupées en temps réel

---

## 📋 Liste des Invités

**Onglet : Liste Invités** *(tous les rôles)*

- Rechercher par nom
- Filtrer par type de ticket / statut / vendeur
- Trier par nom, ticket, statut
- Cliquer sur un invité → voir tous ses détails + historique paiements
- 📱 Contacter directement sur WhatsApp

---

## 🔔 Notifications

- Cloche 🔔 en haut à droite
- Alertes automatiques pour :
  - Nouveau compte à activer
  - Versement reçu
  - Dépense à valider
  - Modifications de profil en attente

---

## 👤 Mon Profil

- Cliquer sur son nom en bas de la sidebar
- Modifier : Nom / WhatsApp / Photo de profil
- Les modifications sont soumises à validation par l'Admin

---

## ❓ Mot de passe oublié

1. Page de connexion → **"Mot de passe oublié ?"**
2. Entrer son email
3. Recevoir un lien par email
4. Cliquer le lien → saisir nouveau mot de passe

---

## ✅ Checklist avant de commencer

- [ ] Tout le monde crée son compte sur gala-trace.vercel.app
- [ ] L'Admin active chaque compte et assigne le rôle
- [ ] L'Admin attribue les quotas/carnets à chaque vendeur
- [ ] Chaque vendeur vérifie son quota dans "Ventes & Tickets"
- [ ] La Trésorière Générale vérifie l'onglet "Trésorerie"
- [ ] La Comptable vérifie l'onglet "Trésorerie"

---

*GalaTrace — Développé pour le Gala 2026*
