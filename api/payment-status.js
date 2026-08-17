import Stripe from 'stripe';
import { getErrorMessage, json } from '../lib/http.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export default async function handler(request) {
  try {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const sessionId = new URL(request.url).searchParams.get('session_id');
    if (!sessionId || sessionId.length > 255) return json({ error: 'session_id ไม่ถูกต้อง' }, 400);
    if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe is not configured' }, 503);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const supabase = getSupabaseAdmin();

    if (session.payment_status === 'paid' && session.metadata?.order_id) {
      await supabase
        .from('orders')
        .update({ payment_status: 'paid', status: 'pending' })
        .eq('id', session.metadata.order_id)
        .neq('status', 'cancelled');
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('order_no,customer_name,total,payment_method,payment_status,status,created_at')
      .eq('stripe_session_id', sessionId)
      .single();
    if (error) throw error;

    return json({
      ok: true,
      orderNo: order.order_no,
      customerName: order.customer_name,
      total: Number(order.total),
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      status: order.status,
      createdAt: order.created_at,
    });
  } catch (error) {
    console.error('payment-status:', error);
    return json({ error: getErrorMessage(error) }, 400);
  }
}
