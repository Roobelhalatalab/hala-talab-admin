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

// Always verify admin privileges on the server. User-editable metadata must
// never grant access to the admin dashboard.
export async function verifyAdmin(user) {
  if (!supabase || !user?.id) return false;
  const { data, error } = await supabase.rpc('hala_is_admin');
  if (error) {
    console.warn('Admin verification failed:', error.message);
    return false;
  }
  return data === true;
}
