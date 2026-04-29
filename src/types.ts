export type UserRole = 'admin' | 'vendeur' | 'comite' | 'tresoriere' | 'tresoriere_generale' | 'direction' | 'observateur';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  vendeur: 'Vendeur',
  comite: 'Comité',
  tresoriere: 'Trésorière Générale',
  tresoriere_generale: 'Comptable',
  direction: 'Direction',
  observateur: 'Observateur',
};

export interface Expense {
  id: string;
  title: string;
  author: string;
  amount: number;
  submission_token: string;
  payment_status: 'reglee' | 'non_reglee';
  payment_status_pending: 'reglee' | 'non_reglee' | null;
  payment_status_requested_by: string | null;
  payment_status_requested_at: string | null;
  payment_status_confirmed_by: string | null;
  payment_status_confirmed_at: string | null;
  validation_status: 'en_attente' | 'validee' | 'rejetee';
  created_by: string;
  validated_by: string | null;
  validated_at: string | null;
  deletion_status: 'en_attente_counterpart' | 'en_attente_admin' | null;
  deletion_requested_by: string | null;
  deletion_requested_at: string | null;
  deletion_counterpart_approved_by: string | null;
  deletion_counterpart_approved_at: string | null;
  deletion_admin_approved_by: string | null;
  deletion_admin_approved_at: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  phone: string | null;
  avatar_url: string | null;
  pending_changes: { full_name?: string; phone?: string; avatar_url?: string } | null;
  created_at: string;
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  public_type: string;
}

export interface Quota {
  id: string;
  seller_id: string;
  ticket_type_id: string;
  quantity_given: number;
  created_at: string;
}

export interface Sale {
  id: string;
  buyer_name: string;
  ticket_type_id: string;
  base_price: number;
  discount_amount: number;
  discount_source: string | null;
  final_price: number;
  seller_id: string;
  notes: string | null;
  created_at: string;
  // Computed fields
  total_paid?: number;
  remaining_balance?: number;
}

export interface Payment {
  id: string;
  sale_id: string;
  amount: number;
  collector_id: string;
  created_at: string;
}

export interface CashTransfer {
  id: string;
  from_id: string;
  to_id: string;
  amount: number;
  status: 'en_attente' | 'valide' | 'rejete';
  created_at: string;
}

export interface Table {
  id: string;
  name: string;
  capacity: number;
  created_at: string;
}

export interface Seat {
  id: string;
  table_id: string;
  sale_id: string | null;
  seat_number: number;
}
