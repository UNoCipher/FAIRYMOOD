import { assertMethod, assertSameOrigin, getErrorMessage, json, parseJsonBody, safeString } from '../lib/http.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export default async function handler(request) {
  try {
    assertMethod(request, ['POST']);
    assertSameOrigin(request);
    const body = await parseJsonBody(request);
    const orderNo = safeString(body.orderNo, 80).toUpperCase();
    const phone = safeString(body.phone, 30).replace(/\D/g, '');
    if (!orderNo || phone.length < 9 || phone.length > 10) {
      throw Object.assign(new Error('ข้อมูลติดตามออเดอร์ไม่ถูกต้อง'), { statusCode: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('track_order', { p_order_no: orderNo, p_phone: phone });
    if (error) throw error;
    // Always return 200/null for unknown combinations to avoid exposing which field matched.
    return json({ order: data || null });
  } catch (error) {
    console.error('track-order:', error);
    return json({ error: getErrorMessage(error) }, error.statusCode || 400);
  }
}
