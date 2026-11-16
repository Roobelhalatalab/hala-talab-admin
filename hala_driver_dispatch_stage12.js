// Hala Talab drivers: isolated Stage 12 admin integration.
// Requires authenticated Supabase client and server-side admin authorization (RLS/RPC).
// Not loaded by the production dashboard until backend RPC is verified.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function checkId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
export async function assignHalaDriverArea(supabase, {driverId, storeId, areaId, active = true}) {
  if (!supabase?.rpc) throw new Error('Authenticated Supabase client required');
  const {data, error} = await supabase.rpc('hala_driver_assign_area_v1', {
    p_driver_id: checkId(driverId, 'driverId'),
    p_store_id: checkId(storeId, 'storeId'),
    p_area_id: checkId(areaId, 'areaId'),
    p_active: active === true
  });
  if (error) throw error;
  return data;
}
// No arbitrary cap on stores: a separate assignment per (driver, store, area).
// Sequential calls intentionally stop on failure; return completed assignments for reconciliation.
export async function assignHalaDriverToStores(supabase, {driverId, storeIds, areaIds, active = true}) {
  checkId(driverId, 'driverId');
  if (!Array.isArray(storeIds) || !storeIds.length || !Array.isArray(areaIds) || !areaIds.length)
    throw new Error('Select at least one store and one delivery area');
  const stores = [...new Set(storeIds.map(x => checkId(x, 'storeId')))];
  const areas = [...new Set(areaIds.map(x => checkId(x, 'areaId')))];
  const completed = [];
  for (const storeId of stores) for (const areaId of areas) {
    try {
      await assignHalaDriverArea(supabase, {driverId, storeId, areaId, active});
      completed.push({driverId, storeId, areaId, active});
    } catch (error) {
      error.completedAssignments = completed;
      throw error;
    }
  }
  return completed;
}
