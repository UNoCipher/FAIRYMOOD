import Stripe from 'stripe';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Stripe webhook is not configured', { status: 503 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('stripe signature:', error.message);
    return new Response('Invalid signature', { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const session = event.data.object;
  const orderId = session?.metadata?.order_id;

  try {
    if (orderId && (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')) {
      if (session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
        const { error } = await supabase
          .from('orders')
          .update({ payment_status: 'paid', status: 'pending' })
          .eq('id', orderId)
          .neq('status', 'cancelled');
        if (error) throw error;
      }
    }

    if (orderId && (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed')) {
      await supabase.rpc('release_order_stock', { p_order_id: orderId });
      const { error } = await supabase
        .from('orders')
        .update({ payment_status: 'failed', status: 'cancelled' })
        .eq('id', orderId)
        .neq('payment_status', 'paid');
      if (error) throw error;
    }
  } catch (error) {
    console.error('stripe webhook processing:', error);
    return new Response('Webhook processing failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
