import { assertMethod, assertSameOrigin, getErrorMessage, json, parseJsonBody } from '../lib/http.js';
import { normalizeCheckoutPayload, toRpcArgs } from '../lib/order-input.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { verifyTurnstile } from '../lib/turnstile.js';

export default async function handler(request) {
  try {
    assertMethod(request, ['POST']);
    assertSameOrigin(request);
    const body = await parseJsonBody(request);
    await verifyTurnstile(request, body.turnstileToken);
    const payload = normalizeCheckoutPayload(body, ['cod']);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc('create_order', toRpcArgs(payload));
    if (error) throw error;

    return json({
      ok: true,
      orderNo: data.order_no,
      total: Number(data.total),
      paymentMethod: data.payment_method,
    });
  } catch (error) {
    console.error('create-order:', error);
    return json({ error: getErrorMessage(error) }, error.statusCode || 400);
  }
}
