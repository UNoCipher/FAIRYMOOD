export async function verifyTurnstile(request, token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw Object.assign(new Error('ระบบป้องกันบอทยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์'), { statusCode: 503 });
  }
  if (!token || typeof token !== 'string' || token.length > 2048) {
    throw Object.assign(new Error('กรุณายืนยันว่าคุณไม่ใช่บอทก่อนสั่งซื้อ'), { statusCode: 400 });
  }

  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const remoteip = forwardedFor.split(',')[0].trim();
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    throw Object.assign(new Error('ตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาลองใหม่'), { statusCode: 503, cause: error });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw Object.assign(new Error('ตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาลองใหม่'), { statusCode: 503 });
  }

  const result = await response.json();
  if (!result.success) {
    throw Object.assign(new Error('การยืนยันความปลอดภัยหมดอายุหรือไม่ถูกต้อง กรุณายืนยันใหม่'), { statusCode: 400 });
  }
  return result;
}
