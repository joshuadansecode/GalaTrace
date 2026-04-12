import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TICKET_LABELS: Record<string, string> = {
  gold_interne: 'Gold Interne',
  gold_externe: 'Gold Externe',
  platinum_interne: 'Platinum Interne',
  diamond_interne: 'Diamond Interne',
  diamond_externe: 'Diamond Externe',
  royal: 'Royal',
};

export function formatTicketType(id: string): string {
  return TICKET_LABELS[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
