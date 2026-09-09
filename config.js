// Hala Talab Admin - Stage 4
// Public browser-safe Supabase configuration only.
// Never place service_role / secret keys in this file.
export const APP_CONFIG = {
  supabaseUrl: 'https://czoqxshblhgwanwsrudk.supabase.co',
  supabaseAnonKey: 'sb_publishable_O9snz4RgxKSLCl6XTmoWDw_1dCjzAli',
  // Leave empty for automatic public URL detection after deployment.
  // Example if you later want to force a dedicated domain: 'https://menu.example.com/'
  publicMenuBaseUrl: '',
  adminCheckMode: 'either',
  adminTable: 'admin_users',
  adminUserIdColumn: 'id',
  adminRoleColumn: 'role',
  adminRoleValue: 'admin',

  // Stage 2 tries the real tables in this order and gracefully skips missing tables.
  dashboardTables: {
    orders: ['orders'],
    stores: ['stores', 'partner_profiles'],
    drivers: [],
    support: ['customer_support_conversations', 'customer_support_messages', 'partner_support_tickets'],
  },
};
