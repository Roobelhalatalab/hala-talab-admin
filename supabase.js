import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { APP_CONFIG } from './config.js';

export function isSupabaseConfigured() {
  return Boolean(
    APP_CONFIG.supabaseUrl &&
    APP_CONFIG.supabaseAnonKey &&
    !APP_CONFIG.supabaseUrl.includes('YOUR-PROJECT') &&
    !APP_CONFIG.supabaseAnonKey.includes('YOUR_PUBLIC_ANON_KEY')
  );
}

export const supabase = isSupabaseConfigured()
  ? createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function metadataIsAdmin(user) {
  const wanted = String(APP_CONFIG.adminRoleValue || 'admin').toLowerCase();
  const values = [
    user?.app_metadata?.role,
    user?.user_metadata?.role,
    user?.app_metadata?.user_role,
    user?.user_metadata?.user_role,
  ];
  return values.some((v) => String(v || '').toLowerCase() === wanted);
}

async function tableIsAdmin(user) {
  if (!supabase || !user) return false;

  const table = APP_CONFIG.adminTable;
  const userIdColumn = APP_CONFIG.adminUserIdColumn;
  const roleColumn = APP_CONFIG.adminRoleColumn;
  const roleValue = APP_CONFIG.adminRoleValue;

  if (!table || !userIdColumn || !roleColumn || !roleValue) return false;

  const { data, error } = await supabase
    .from(table)
    .select(`${userIdColumn}, ${roleColumn}`)
    .eq(userIdColumn, user.id)
    .eq(roleColumn, roleValue)
    .maybeSingle();

  if (error) {
    console.warn('Admin table check skipped/failed:', error.message);
    return false;
  }
  return Boolean(data);
}

export async function verifyAdmin(user) {
  const mode = APP_CONFIG.adminCheckMode || 'either';
  if (mode === 'metadata') return metadataIsAdmin(user);
  if (mode === 'table') return tableIsAdmin(user);
  if (metadataIsAdmin(user)) return true;
  return tableIsAdmin(user);
}
