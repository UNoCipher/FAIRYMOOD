import { json } from '../lib/http.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) throw error;
    return json({
      ok: true,
      database: 'connected',
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      turnstileConfigured: Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY),
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
