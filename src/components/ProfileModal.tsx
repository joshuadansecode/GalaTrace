import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, ROLE_LABELS } from '../types';
import { toast } from 'sonner';
import { X, Camera, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { notifyRole } from '../lib/notify';

interface Props {
  profile: Profile;
  onClose: () => void;
  onUpdated: () => void;
}

export default function ProfileModal({ profile, onClose, onUpdated }: Props) {
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let avatarUrl = profile.avatar_url;

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const path = `${profile.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }

      const pending: any = {};
      if (fullName !== profile.full_name) pending.full_name = fullName;
      if (phone !== profile.phone) pending.phone = phone;
      if (avatarUrl !== profile.avatar_url) pending.avatar_url = avatarUrl;

      if (Object.keys(pending).length === 0) {
        toast.info('Aucune modification détectée');
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ pending_changes: pending })
        .eq('id', profile.id);

      if (error) throw error;
      // Notifier l'admin
      await notifyRole('admin', 'Modification de profil en attente', `${profile.full_name || profile.email} a soumis des modifications à valider`, 'warning');
      toast.success('Modifications envoyées — en attente de validation par l\'admin');
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-zinc-800">
          <div>
            <p className="font-bold">Mon Profil</p>
            <p className="text-xs text-amber-500">{ROLE_LABELS[profile.role]}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center cursor-pointer relative group"
              onClick={() => fileRef.current?.click()}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-zinc-400">
                  {(profile.full_name || profile.email)[0].toUpperCase()}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="text-xs text-zinc-500">Cliquer pour changer la photo</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase">Nom complet</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="bg-zinc-800 border-zinc-700" placeholder="Votre nom" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase">WhatsApp</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="bg-zinc-800 border-zinc-700" placeholder="+229, +44, +225..." />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase">Email</label>
            <p className="text-sm text-zinc-500 px-1">{profile.email}</p>
          </div>

          {profile.pending_changes && Object.keys(profile.pending_changes).length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
              ⏳ Modifications en attente de validation par l'admin
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1 border-zinc-700" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-600 hover:bg-amber-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Envoyer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
