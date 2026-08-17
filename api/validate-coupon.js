import { assertSameOrigin, json, safeString } from '../lib/http.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const code = safeString(body.code, 30).toUpperCase();
    if (!code) return json({ valid: false }, 200);

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('coupons')
      .select('code,percent_off,active,starts_at,ends_at')
      .eq('code', code)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;

    const valid = Boolean(data)
      && (!data.starts_at || data.starts_at <= now)
      && (!data.ends_at || data.ends_at >= now);

    return json(valid ? { valid: true, code: data.code, percentOff: Number(data.percent_off) } : { valid: false });
  } catch (error) {
    console.error('validate-coupon:', error);
    return json({ valid: false, error: 'ตรวจสอบคูปองไม่สำเร็จ' }, 400);
  }
}
