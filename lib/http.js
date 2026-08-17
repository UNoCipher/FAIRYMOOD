export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function getErrorMessage(error, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || error.error_description || fallback;
}

export function assertMethod(request, allowed) {
  if (!allowed.includes(request.method)) {
    throw Object.assign(new Error('Method not allowed'), { statusCode: 405 });
  }
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const target = new URL(request.url).origin;
  if (origin !== target) {
    throw Object.assign(new Error('Invalid request origin'), { statusCode: 403 });
  }
}

export function safeString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export async function parseJsonBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw Object.assign(new Error('Content-Type ต้องเป็น application/json'), { statusCode: 415 });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('ข้อมูล JSON ไม่ถูกต้อง'), { statusCode: 400 });
  }
}
