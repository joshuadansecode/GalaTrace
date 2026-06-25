import { useState, useMemo } from 'react';
import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSort<T>(
  data: T[],
  defaultKey: keyof T,
  defaultDir: SortDir = 'desc'
) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function toggle(key: keyof T) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggle };
}

// ─── Composant tête de colonne cliquable ──────────────────────────────────────
interface SortHeaderProps {
  label:      string;
  colKey:     string;
  currentKey: string;
  currentDir: SortDir;
  onToggle:   (key: string) => void;
  className?: string;
}

export function SortHeader({ label, colKey, currentKey, currentDir, onToggle, className = '' }: SortHeaderProps) {
  const active = colKey === currentKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(colKey)}
      className={`flex items-center gap-1 text-left transition-colors whitespace-nowrap
        ${active ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'} ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      {active
        ? currentDir === 'asc'
          ? <ChevronUp className="h-3 w-3 shrink-0" />
          : <ChevronDown className="h-3 w-3 shrink-0" />
        : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />
      }
    </button>
  );
}
