import React, { useState, useEffect } from 'react';
import { Profile, ROLE_LABELS } from '../types';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { 
  LayoutDashboard, 
  Ticket, 
  Wallet, 
  Users, 
  LogOut, 
  Menu, 
  X,
  Armchair,
  Eye,
  Trophy,
  Activity
} from 'lucide-react';
import AdminView from './AdminView';
import SellerView from './SellerView';
import TreasurerView from './TreasurerView';
import PlacementView from './PlacementView';
import PublicView from './PublicView';
import ActivityFeed from './ActivityFeed';
import ProfileModal from './ProfileModal';
import NotificationBell from './NotificationBell';
import Directory from './Directory';

interface DashboardProps {
  profile: Profile | null;
  session: any;
}

export default function Dashboard({ profile, session }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ name: string; total: number }[]>([]);
  const [stats, setStats] = useState({ lastSale: '--', totalCaisse: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [overviewStats, setOverviewStats] = useState({ totalTickets: 0, totalRevenue: 0, seatsOccupied: 0, seatsTotal: 0 });
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
    fetchStats();
    if (profile?.role === 'admin') fetchPendingCount();
    fetchOverviewStats();

    // Realtime: refresh leaderboard + stats on new sales/payments
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { fetchLeaderboard(); fetchOverviewStats(); fetchStats(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { fetchStats(); fetchOverviewStats(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { if (profile?.role === 'admin') fetchPendingCount(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchStats() {
    const [salesRes, paymentsRes] = await Promise.all([
      supabase.from('sales').select('buyer_name, ticket_type_id, created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('payments').select('amount')
    ]);
    const last = salesRes.data?.[0];
    const total = (paymentsRes.data || []).reduce((acc: number, p: any) => acc + p.amount, 0);
    setStats({
      lastSale: last ? `${last.buyer_name} (${last.ticket_type_id})` : '--',
      totalCaisse: total
    });
  }

  async function fetchPendingCount() {
    const { data } = await supabase.from('profiles').select('id, pending_changes, is_active');
    const inactive = (data || []).filter((p: any) => !p.is_active).length;
    const pendingMods = (data || []).filter((p: any) => p.pending_changes && Object.keys(p.pending_changes).length > 0).length;
    setPendingCount(inactive + pendingMods);
  }

  async function fetchOverviewStats() {
    const [salesRes, seatsRes] = await Promise.all([
      supabase.from('sales').select('final_price'),
      supabase.from('seats').select('sale_id')
    ]);
    const tickets = (salesRes.data || []).length;
    const revenue = (salesRes.data || []).reduce((a: number, s: any) => a + s.final_price, 0);
    const allSeats = seatsRes.data || [];
    setOverviewStats({
      totalTickets: tickets,
      totalRevenue: revenue,
      seatsOccupied: allSeats.filter((s: any) => s.sale_id).length,
      seatsTotal: allSeats.length
    });
  }

  async function fetchLeaderboard() {
    const { data } = await supabase
      .from('sales')
      .select('final_price, seller:profiles!seller_id(full_name, email)');
    if (!data) return;
    const map: Record<string, { name: string; total: number }> = {};
    data.forEach((s: any) => {
      const key = s.seller?.full_name || s.seller?.email || 'Inconnu';
      if (!map[key]) map[key] = { name: key, total: 0 };
      map[key].total += s.final_price;
    });
    setLeaderboard(Object.values(map).sort((a, b) => b.total - a.total).slice(0, 3));
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!profile) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold mb-2">Profil non trouvé</h2>
        <p className="text-zinc-400 mb-6">Votre profil n'a pas encore été configuré par un administrateur.</p>
        <Button onClick={handleSignOut} variant="outline">Se déconnecter</Button>
      </div>
    );
  }

  const menuItems = [
    { id: 'overview', label: 'Tableau de bord', icon: LayoutDashboard, roles: ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur'] },
    { id: 'sales', label: 'Ventes & Tickets', icon: Ticket, roles: ['admin', 'vendeur', 'comite', 'tresoriere'] },
    { id: 'treasury', label: 'Trésorerie', icon: Wallet, roles: ['admin', 'tresoriere', 'tresoriere_generale', 'direction'] },
    { id: 'admin', label: 'Administration', icon: Users, roles: ['admin'] },
    { id: 'placement', label: 'Placement', icon: Armchair, roles: ['admin', 'direction'] },
    { id: 'public', label: 'Liste Invités', icon: Eye, roles: ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur'] },
    { id: 'activity', label: 'Flux d\'Activité', icon: Activity, roles: ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur'] },
    { id: 'directory', label: 'Annuaire', icon: Users, roles: ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(profile.role));

  const renderContent = () => {
    switch (activeTab) {
      case 'admin':
        return <AdminView profile={profile} />;
      case 'sales':
        return <SellerView profile={profile} />;
      case 'treasury':
        return <TreasurerView profile={profile} />;
      case 'placement':
        return <PlacementView profile={profile} />;
      case 'public':
        return <PublicView profile={profile} />;
      case 'activity':
        return <ActivityFeed profile={profile} />;
      case 'directory':
        return <Directory />;
      default:
        return (
          <div className="space-y-6">
            <header>
              <h1 className="text-3xl font-bold tracking-tight">Bienvenue, {profile.full_name || profile.email}</h1>
              <p className="text-zinc-400">Rôle : <span className="capitalize text-amber-500 font-medium">{ROLE_LABELS[profile.role]}</span></p>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Tickets Vendus</h3>
                <p className="text-2xl font-bold">{overviewStats.totalTickets}</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Chiffre d'Affaires</h3>
                <p className="text-2xl font-bold text-amber-500">{overviewStats.totalRevenue.toLocaleString()} F</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Caisse Encaissée</h3>
                <p className="text-2xl font-bold text-green-500">{stats.totalCaisse.toLocaleString()} F</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Taux de Placement</h3>
                <p className="text-2xl font-bold">
                  {overviewStats.seatsTotal > 0 ? `${overviewStats.seatsOccupied}/${overviewStats.seatsTotal}` : '—'}
                </p>
                {overviewStats.seatsTotal > 0 && (
                  <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(overviewStats.seatsOccupied / overviewStats.seatsTotal) * 100}%` }} />
                  </div>
                )}
              </div>
            </div>

            {/* Podium Vendeurs */}
            {leaderboard.length > 0 && (
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <div className="flex items-center gap-2 mb-6">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold">Podium des Vendeurs</h3>
                </div>
                <div className="flex items-end justify-center gap-4">
                  {leaderboard[1] && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">🥈</span>
                      <div className="bg-zinc-700 rounded-t-lg w-24 h-20 flex flex-col items-center justify-center px-2">
                        <p className="text-xs font-bold text-center truncate w-full text-center">{leaderboard[1].name}</p>
                        <p className="text-xs text-zinc-400">{leaderboard[1].total.toLocaleString()} F</p>
                      </div>
                    </div>
                  )}
                  {leaderboard[0] && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">🥇</span>
                      <div className="bg-amber-500/20 border border-amber-500/30 rounded-t-lg w-24 h-28 flex flex-col items-center justify-center px-2">
                        <p className="text-xs font-bold text-center truncate w-full text-center text-amber-400">{leaderboard[0].name}</p>
                        <p className="text-xs text-amber-500 font-bold">{leaderboard[0].total.toLocaleString()} F</p>
                      </div>
                    </div>
                  )}
                  {leaderboard[2] && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">🥉</span>
                      <div className="bg-zinc-800 rounded-t-lg w-24 h-14 flex flex-col items-center justify-center px-2">
                        <p className="text-xs font-bold text-center truncate w-full text-center">{leaderboard[2].name}</p>
                        <p className="text-xs text-zinc-400">{leaderboard[2].total.toLocaleString()} F</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Sidebar Toggle */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-zinc-900 border border-zinc-800 rounded-md"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64 bg-zinc-950 border-r border-zinc-800 transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2 bg-amber-500 rounded-lg">
              <Ticket className="w-6 h-6 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">GalaTrace</span>
          </div>

          <nav className="flex-1 space-y-1">
            {filteredMenu.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                  ${activeTab === item.id 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}
                `}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                {item.id === 'admin' && pendingCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="pt-6 border-t border-zinc-800">
            <button
              onClick={() => setShowProfile(true)}
              className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-lg hover:bg-zinc-800 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-xs font-bold shrink-0">
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : profile.email[0].toUpperCase()
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.full_name || 'Utilisateur'}</p>
                <p className="text-xs text-zinc-500 truncate">{ROLE_LABELS[profile.role]}</p>
              </div>
              {profile.pending_changes && Object.keys(profile.pending_changes).length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Modifications en attente" />
              )}
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Se déconnecter
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a]">
        <div className="flex justify-end items-center px-6 lg:px-10 pt-4">
          <NotificationBell userId={profile.id} />
        </div>
        <div className="max-w-6xl mx-auto px-6 lg:px-10 pb-10">
          {renderContent()}
        </div>
      </main>

      {showProfile && (
        <ProfileModal
          profile={profile}
          onClose={() => setShowProfile(false)}
          onUpdated={() => {}}
        />
      )}
    </div>
  );
}
