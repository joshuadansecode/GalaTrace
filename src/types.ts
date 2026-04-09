export type UserRole = 'admin' | 'vendeur' | 'comite' | 'tresoriere' | 'tresoriere_generale' | 'direction' | 'observateur';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
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
