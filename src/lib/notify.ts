import { supabase } from './supabase';

export async function notify(userId: string, title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') {
  await supabase.from('notifications').insert([{ user_id: userId, title, message, type }]);
}

// Notify all users with a given role
export async function notifyRole(role: string, title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') {
  const { data } = await supabase.from('profiles').select('id').eq('role', role).eq('is_active', true);
  if (!data || data.length === 0) return;
  await supabase.from('notifications').insert(data.map(p => ({ user_id: p.id, title, message, type })));
}
