import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, X, Check } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  created_at: string;
}

interface Props {
  userId: string;
}

export default function NotificationBell({ userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const channel = supabase.channel(`notifs-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications(data || []);
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  const unread = notifications.filter(n => !n.read).length;

  const colors = {
    info: 'border-blue-500/20 bg-blue-500/5',
    success: 'border-green-500/20 bg-green-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
  };

  const icons = { info: '💬', success: '✅', warning: '⚠️' };

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return new Date(d).toLocaleDateString('fr-FR');
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed top-4 right-4 z-50 w-80 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
              <p className="font-bold text-sm">Notifications</p>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-zinc-500 hover:text-amber-500 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Tout lire
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">Aucune notification</p>
              ) : notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`flex gap-3 p-4 border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-900 transition-colors ${!n.read ? 'bg-zinc-900/50' : ''}`}
                >
                  <span className="text-lg shrink-0">{icons[n.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${!n.read ? 'text-white' : 'text-zinc-400'}`}>{n.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-zinc-600 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
