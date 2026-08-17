import { json } from '../lib/http.js';

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !turnstileSiteKey) {
    return json({ error: 'Public production configuration is incomplete' }, 500);
  }

  return json({ supabaseUrl, supabaseAnonKey, turnstileSiteKey }, 200, {
    'cache-control': 'public, max-age=300, s-maxage=300',
  });
}
