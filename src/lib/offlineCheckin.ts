/**
 * GalaTrace — Offline Check-in Cache
 *
 * Au démarrage du mode contrôle QR :
 *   - On télécharge tous les tokens valides (payés, pas encore utilisés)
 *   - On les stocke en mémoire + IndexedDB
 *
 * Si le réseau coupe pendant le scan :
 *   - On valide localement (le token est marqué used dans le cache)
 *   - L'entrée est mise en file d'attente (pending queue)
 *   - Dès que le réseau revient → sync automatique vers Supabase
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CachedTicket = {
  qr_token: string;
  buyer_name: string;
  ticket_type_id: string;
  ticket_number: string;
};

export type PendingCheckin = {
  qr_token: string;
  scanned_at: string; // ISO string
};

type OfflineCheckinResult =
  | { status: 'valid';        buyer_name: string; ticket_type_id: string; ticket_number: string; checked_in_at: string; offline: true }
  | { status: 'already_used'; buyer_name: string; ticket_type_id: string; ticket_number: string; used_at: string;       offline: true }
  | { status: 'invalid';      offline: true }
  | { status: 'not_in_cache'; offline: true };

// ─── Stockage IndexedDB (persistance entre rechargements) ─────────────────────

const DB_NAME    = 'galatrace-offline';
const DB_VERSION = 1;
const STORE_TICKETS  = 'tickets';
const STORE_PENDING  = 'pending';
const STORE_USED     = 'used';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TICKETS))
        db.createObjectStore(STORE_TICKETS, { keyPath: 'qr_token' });
      if (!db.objectStoreNames.contains(STORE_PENDING))
        db.createObjectStore(STORE_PENDING, { keyPath: 'qr_token' });
      if (!db.objectStoreNames.contains(STORE_USED))
        db.createObjectStore(STORE_USED, { keyPath: 'qr_token' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPutAll(storeName: string, items: object[]) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach((item) => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const req   = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(storeName: string, item: object) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function dbDelete(storeName: string, key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Cache en mémoire (pour les lookups rapides pendant le scan) ──────────────

let memTickets: Map<string, CachedTicket>  = new Map();
let memUsed:    Map<string, string>        = new Map(); // token → scanned_at
let memPending: Map<string, PendingCheckin> = new Map();

// ─── Chargement initial ───────────────────────────────────────────────────────

/**
 * À appeler une fois au montage de TicketCheckInView.
 * Retourne le nombre de tickets chargés.
 */
export async function loadOfflineCache(): Promise<{ count: number; fromNetwork: boolean }> {
  try {
    // Essayer de récupérer depuis Supabase
    const { data, error } = await supabase
      .from('sales')
      .select('qr_token, buyer_name, ticket_type_id, ticket_number, qr_used_at')
      .not('qr_token', 'is', null);

    if (error) throw error;

    const tickets: CachedTicket[] = [];
    const usedEntries: { qr_token: string; used_at: string }[] = [];

    (data || []).forEach((s: any) => {
      tickets.push({
        qr_token:       s.qr_token,
        buyer_name:     s.buyer_name,
        ticket_type_id: s.ticket_type_id,
        ticket_number:  s.ticket_number,
      });
      if (s.qr_used_at) {
        usedEntries.push({ qr_token: s.qr_token, used_at: s.qr_used_at });
      }
    });

    // Mettre à jour mémoire
    memTickets = new Map(tickets.map((t) => [t.qr_token, t]));
    memUsed    = new Map(usedEntries.map((u) => [u.qr_token, u.used_at]));

    // Persister en IndexedDB
    await dbPutAll(STORE_TICKETS, tickets);
    await dbPutAll(STORE_USED,    usedEntries);

    return { count: tickets.length, fromNetwork: true };
  } catch {
    // Réseau indisponible → charger depuis IndexedDB
    const tickets      = await dbGetAll<CachedTicket>(STORE_TICKETS);
    const usedEntries  = await dbGetAll<{ qr_token: string; used_at: string }>(STORE_USED);
    const pending      = await dbGetAll<PendingCheckin>(STORE_PENDING);

    memTickets = new Map(tickets.map((t) => [t.qr_token, t]));
    memUsed    = new Map(usedEntries.map((u) => [u.qr_token, u.used_at]));
    memPending = new Map(pending.map((p) => [p.qr_token, p]));

    return { count: tickets.length, fromNetwork: false };
  }
}

// ─── Validation locale (hors ligne) ──────────────────────────────────────────

export function checkinOffline(rawPayload: string): OfflineCheckinResult {
  // Extraire le token du payload GALATRACE:<uuid>
  let token = rawPayload.trim();
  if (token.toUpperCase().startsWith('GALATRACE:')) {
    token = token.slice('GALATRACE:'.length).trim();
  }

  if (!token) return { status: 'invalid', offline: true };

  const ticket = memTickets.get(token);
  if (!ticket) return { status: 'not_in_cache', offline: true };

  const existingUsedAt = memUsed.get(token);
  if (existingUsedAt) {
    return {
      status: 'already_used',
      buyer_name:     ticket.buyer_name,
      ticket_type_id: ticket.ticket_type_id,
      ticket_number:  ticket.ticket_number,
      used_at:        existingUsedAt,
      offline:        true,
    };
  }

  // Marquer comme utilisé localement
  const scannedAt = new Date().toISOString();
  memUsed.set(token, scannedAt);

  const pending: PendingCheckin = { qr_token: token, scanned_at: scannedAt };
  memPending.set(token, pending);

  // Persister en IndexedDB (non bloquant)
  dbPut(STORE_USED,    { qr_token: token, used_at: scannedAt }).catch(() => {});
  dbPut(STORE_PENDING, pending).catch(() => {});

  return {
    status:         'valid',
    buyer_name:     ticket.buyer_name,
    ticket_type_id: ticket.ticket_type_id,
    ticket_number:  ticket.ticket_number,
    checked_in_at:  scannedAt,
    offline:        true,
  };
}

// ─── Synchronisation des entrées en attente ───────────────────────────────────

export async function syncPendingCheckins(): Promise<{ synced: number; failed: number }> {
  const pending = await dbGetAll<PendingCheckin>(STORE_PENDING);
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const { data, error } = await supabase.rpc('checkin_ticket_qr', {
        p_qr_payload: `GALATRACE:${entry.qr_token}`,
      });

      if (error) throw error;

      const result = data as { status: string } | null;
      // 'valid' ou 'already_used' sont tous les deux des états acceptables après sync
      if (result?.status === 'valid' || result?.status === 'already_used') {
        await dbDelete(STORE_PENDING, entry.qr_token);
        memPending.delete(entry.qr_token);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

// ─── Getters utilitaires ──────────────────────────────────────────────────────

export function getPendingCount(): number {
  return memPending.size;
}

export function getCacheSize(): number {
  return memTickets.size;
}
