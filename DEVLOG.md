# GalaTrace — Journal de Développement

## Stack
- React + TypeScript + Vite
- Supabase (DB + Auth + Storage + Realtime)
- Tailwind CSS + shadcn/ui
- Recharts (graphiques)
- Vercel (déploiement)

## URLs
- Production : https://gala-trace.vercel.app
- GitHub : https://github.com/joshuadansecode/GalaTrace
- Supabase projet : krmfdmonqabkcglwbxro

## Rôles (valeurs en base → labels affichés)
| Valeur DB | Affiché |
|---|---|
| admin | Admin |
| vendeur | Vendeur |
| comite | Comité |
| tresoriere | Trésorière Générale |
| tresoriere_generale | Comptable |
| direction | Direction |
| observateur | Observateur |

## Flux Financier
1. Acheteur → Vendeur (paiement enregistré dans `payments`)
2. Vendeur → TG (versement enregistré par la TG dans `cash_transfers`, validé direct)
3. TG → Comptable (demande de versement, Comptable confirme = argent en banque)

## Tables Supabase
- `profiles` — utilisateurs (id, email, full_name, role, is_active, phone, avatar_url, pending_changes)
- `ticket_types` — types de billets (gold_interne 10000, platinum_interne 12000, diamond_interne 15000, gold_externe 15000, diamond_externe 20000, royal 25000)
- `quotas` — carnets attribués par vendeur
- `sales` — ventes (buyer_name, buyer_phone, ticket_type_id, base_price, discount_amount, discount_source, final_price, seller_id, notes, ticket_number)
- `payments` — paiements/acomptes des acheteurs
- `cash_transfers` — versements entre membres (vendeur→TG, TG→Comptable)
- `expenses` — dépenses déclarées par TG, validées par Comptable
- `tables` — tables du plan de salle (avec category: gold/platinum/diamond/royal)
- `seats` — places par table
- `notifications` — notifications in-app

## Catégories de tables / tickets
- gold → gold_interne + gold_externe
- platinum → platinum_interne
- diamond → diamond_interne + diamond_externe
- royal → royal

## Fonctionnalités implémentées
- [x] Auth (inscription, connexion, mot de passe oublié)
- [x] Validation compte par admin (is_active)
- [x] Profil modifiable (photo, nom, WhatsApp) avec validation admin
- [x] Ventes de tickets avec quotas, réductions, acomptes
- [x] Mode saisie rapide (⚡) pour enregistrement en série
- [x] WhatsApp acheteur dans les ventes
- [x] Paiements échelonnés
- [x] Panneau "Ma Caisse" par vendeur
- [x] Caisse des vendeurs (vue TG)
- [x] Flux TG → Comptable avec validation
- [x] Dépenses (déclaration TG, validation Comptable)
- [x] Plan de salle par catégorie
- [x] Attribution des places (filtrée par catégorie ticket)
- [x] Liste invités avec détail modal + WhatsApp
- [x] Podium vendeurs (gamification)
- [x] Flux d'activité temps réel avec filtre date
- [x] Notifications in-app temps réel
- [x] Annuaire des membres
- [x] Export CSV complet
- [x] Mode impression plan de salle
- [x] RLS Supabase
- [x] Realtime sur toutes les vues
- [x] Pagination (ventes + invités)
- [x] Recherche dans les ventes
- [x] Clic droit / appui long → Modifier / Supprimer

## En cours / À faire
- [ ] Script d'import CSV (pour données du cahier)
  - Format : buyer_name,buyer_phone,ticket_type_id,base_price,discount_amount,discount_source,final_price,initial_payment,notes
  - Workflow : photo cahier → Claude extrait CSV → script insère en base
- [ ] Amélioration carnets & quotas (vendus/restants/progression) — codé, pas encore pushé
- [ ] Vue mobile optimisée (tableaux → cartes)

## SQL exécutés dans Supabase
Voir fichiers :
- `supabase_schema.sql` — schéma initial
- `supabase_schema_update.sql` — ajouts (expenses, ticket_number, is_active, phone, avatar_url, pending_changes, buyer_phone, category sur tables)
- `supabase_rls_policies.sql` — politiques de sécurité

## Trigger Supabase (à vérifier si exécuté)
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'observateur', false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Notes importantes
- La clé anon Supabase est publique par design — la sécurité repose sur les RLS
- Vercel redéploie automatiquement à chaque push sur main
- Le bucket `avatars` dans Supabase Storage doit être public
