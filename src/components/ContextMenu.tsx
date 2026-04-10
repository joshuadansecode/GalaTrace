import { useEffect, useRef, useState } from 'react';

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  items: ContextMenuItem[];
  children: React.ReactNode;
}

export default function ContextMenu({ items, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function show(x: number, y: number) {
    // Adjust so menu doesn't go off screen
    const menuW = 160;
    const menuH = items.length * 44;
    const adjX = x + menuW > window.innerWidth ? x - menuW : x;
    const adjY = y + menuH > window.innerHeight ? y - menuH : y;
    setPos({ x: adjX, y: adjY });
    setVisible(true);
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    show(e.clientX, e.clientY);
  }

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      show(touch.clientX, touch.clientY);
    }, 500);
  }

  function onTouchEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} onContextMenu={onContextMenu} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}>
      {children}
      {visible && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
          style={{ top: pos.y, left: pos.x }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors
                ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-200 hover:bg-zinc-800'}`}
              onClick={() => { item.onClick(); setVisible(false); }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
