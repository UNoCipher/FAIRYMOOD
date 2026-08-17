import { safeString } from './http.js';

export function normalizeCheckoutPayload(body, expectedPaymentMethods) {
  const paymentMethod = safeString(body.paymentMethod, 20).toLowerCase();
  if (!expectedPaymentMethods.includes(paymentMethod)) {
    throw Object.assign(new Error('วิธีชำระเงินไม่ถูกต้อง'), { statusCode: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, 20).map((item) => ({
    product_id: Number(item.product_id),
    quantity: Math.trunc(Number(item.quantity)),
    size: safeString(item.size || 'Freesize', 30),
  })).sort((a, b) => a.product_id - b.product_id) : [];

  if (!items.length || items.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) {
    throw Object.assign(new Error('รายการสินค้าไม่ถูกต้อง'), { statusCode: 400 });
  }

  const phone = safeString(body.phone, 30).replace(/\D/g, '');
  if (phone.length < 9 || phone.length > 10) {
    throw Object.assign(new Error('เบอร์โทรศัพท์ไม่ถูกต้อง'), { statusCode: 400 });
  }

  const name = safeString(body.name, 160);
  const address = safeString(body.address, 300);
  const province = safeString(body.province, 100);
  if (name.length < 2 || address.length < 3 || province.length < 2) {
    throw Object.assign(new Error('กรุณากรอกชื่อและที่อยู่จัดส่งให้ครบ'), { statusCode: 400 });
  }

  const email = safeString(body.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('รูปแบบอีเมลไม่ถูกต้อง'), { statusCode: 400 });
  }

  return {
    paymentMethod,
    name,
    phone,
    email,
    address,
    subdistrict: safeString(body.subdistrict, 100),
    district: safeString(body.district, 100),
    province,
    zipcode: safeString(body.zipcode, 10),
    couponCode: safeString(body.couponCode, 30).toUpperCase(),
    items,
  };
}

export function toRpcArgs(payload) {
  return {
    p_name: payload.name,
    p_phone: payload.phone,
    p_email: payload.email || null,
    p_address: payload.address,
    p_subdistrict: payload.subdistrict,
    p_district: payload.district,
    p_province: payload.province,
    p_zipcode: payload.zipcode,
    p_payment_method: payload.paymentMethod,
    p_coupon_code: payload.couponCode || null,
    p_items: payload.items,
  };
}
