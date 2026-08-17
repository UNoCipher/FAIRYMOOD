import Stripe from 'stripe';
import { assertMethod, assertSameOrigin, getErrorMessage, json, parseJsonBody } from '../lib/http.js';
import { normalizeCheckoutPayload, toRpcArgs } from '../lib/order-input.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { verifyTurnstile } from '../lib/turnstile.js';

export default async function handler(request) {
  let createdOrderId = null;
  try {
    assertMethod(request, ['POST']);
    assertSameOrigin(request);
    const body = await parseJsonBody(request);
    await verifyTurnstile(request, body.turnstileToken);
    const payload = normalizeCheckoutPayload(body, ['card', 'promptpay']);

    if (!process.env.STRIPE_SECRET_KEY) {
      throw Object.assign(new Error('ยังไม่ได้ตั้งค่า Stripe Secret Key บนเซิร์ฟเวอร์'), { statusCode: 503 });
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error: orderError } = await supabase.rpc('create_order', toRpcArgs(payload));
    if (orderError) throw orderError;
    createdOrderId = order.order_id;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = new URL(request.url).origin;
    const lineItems = order.items.map((item) => ({
      quantity: Number(item.quantity),
      price_data: {
        currency: 'thb',
        unit_amount: Math.round(Number(item.unit_price) * 100),
        product_data: { name: item.name },
      },
    }));

    const sessionParams = {
      mode: 'payment',
      payment_method_types: [payload.paymentMethod],
      line_items: lineItems,
      client_reference_id: order.order_no,
      metadata: {
        order_id: String(order.order_id),
        order_no: String(order.order_no),
      },
      success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/index.html?payment=cancelled&order=${encodeURIComponent(order.order_no)}`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
      locale: 'auto',
    };

    if (payload.email) sessionParams.customer_email = payload.email;

    if (Number(order.discount) > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(Number(order.discount) * 100),
        currency: 'thb',
        duration: 'once',
        name: order.coupon_code || payload.couponCode || 'FAIRYMOOD discount',
        metadata: { order_no: String(order.order_no) },
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    const { error: updateError } = await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.order_id);
    if (updateError) throw updateError;

    return json({ ok: true, checkoutUrl: session.url, orderNo: order.order_no });
  } catch (error) {
    console.error('create-checkout-session:', error);

    if (createdOrderId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.rpc('release_order_stock', { p_order_id: createdOrderId });
        await supabase.from('orders').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', createdOrderId);
      } catch (rollbackError) {
        console.error('checkout rollback:', rollbackError);
      }
    }

    return json({ error: getErrorMessage(error) }, error.statusCode || 400);
  }
}
