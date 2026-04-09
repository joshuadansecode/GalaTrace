import React, { useState } from 'react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { 
  LayoutDashboard, 
  Ticket, 
  Wallet, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Armchair,
  Eye
} from 'lucide-react';
import AdminView from './AdminView';
import SellerView from './SellerView';
import TreasurerView from './TreasurerView';
import PlacementView from './PlacementView';
import PublicView from './PublicView';

interface DashboardProps {
  profile: Profile | null;
  session: any;
}

export default function Dashboard({ profile, session }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
    { id: 'treasury', label: 'Trésorerie', icon: Wallet, roles: ['admin', 'tresoriere', 'tresoriere_generale', 'vendeur', 'comite'] },
    { id: 'admin', label: 'Administration', icon: Users, roles: ['admin'] },
    { id: 'placement', label: 'Placement', icon: Armchair, roles: ['admin', 'direction'] },
    { id: 'public', label: 'Liste Invités', icon: Eye, roles: ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur'] },
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
        return <PublicView />;
      default:
        return (
          <div className="space-y-6">
            <header>
              <h1 className="text-3xl font-bold tracking-tight">Bienvenue, {profile.full_name || profile.email}</h1>
              <p className="text-zinc-400">Rôle : <span className="capitalize text-amber-500 font-medium">{profile.role}</span></p>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Quick Stats or Welcome Cards */}
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Statut Global</h3>
                <p className="text-2xl font-bold">En cours</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Dernière Vente</h3>
                <p className="text-2xl font-bold">--</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Caisse</h3>
                <p className="text-2xl font-bold">0 FCFA</p>
              </div>
            </div>
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
              </button>
            ))}
          </nav>

          <div className="pt-6 border-t border-zinc-800">
            <div className="flex items-center gap-3 px-4 py-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold">
                {profile.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.full_name || 'Utilisateur'}</p>
                <p className="text-xs text-zinc-500 truncate">{profile.email}</p>
              </div>
            </div>
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
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-6 lg:p-10">
        <div className="max-w-6xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
