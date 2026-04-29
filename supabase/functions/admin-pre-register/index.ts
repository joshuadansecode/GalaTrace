import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowedRoles = ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur'] as const;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Configuration Supabase manquante' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Non autorisé' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: 'Session invalide' }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile) {
      return json({ error: 'Profil introuvable' }, 403);
    }

    if (profile.role !== 'admin') {
      return json({ error: 'Accès refusé' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    const role = String(body.role || '').trim() as (typeof allowedRoles)[number];

    if (!email || !fullName) {
      return json({ error: 'Nom et email sont requis' }, 400);
    }

    if (!allowedRoles.includes(role)) {
      return json({ error: 'Rôle invalide' }, 400);
    }

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role },
      redirectTo: Deno.env.get('SITE_URL') || undefined,
    });

    if (inviteError) {
      return json({ error: inviteError.message }, 400);
    }

    const invitedUser = inviteData.user;
    if (!invitedUser) {
      return json({ error: 'Invitation créée mais utilisateur introuvable' }, 500);
    }

    const { error: profileUpsertError } = await adminClient.from('profiles').upsert(
      {
        id: invitedUser.id,
        email: invitedUser.email || email,
        full_name: fullName,
        role,
        is_active: true,
        phone: null,
        avatar_url: null,
        pending_changes: null,
      },
      { onConflict: 'id' },
    );

    if (profileUpsertError) {
      return json({ error: profileUpsertError.message }, 400);
    }

    return json({ success: true, user_id: invitedUser.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, 500);
  }
});
