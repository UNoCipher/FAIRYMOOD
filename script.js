let products = [];
let cart = [];
let appliedDiscount = 0;
let appliedCouponCode = '';
let appliedCouponPercent = 0;
let checkoutTurnstileToken = '';
let checkoutTurnstileWidgetId = null;
let activeCategory = 'all';
let selectedMatch = { top: null, bottom: null, acc: null };
window.selectedDetailSize = 'Freesize';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function money(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('fairymood_cart_v1') || '[]');
    cart = Array.isArray(saved) ? saved : [];
  } catch {
    cart = [];
  }
}

function persistCart() {
  localStorage.setItem('fairymood_cart_v1', JSON.stringify(cart.map(({ id, size, quantity }) => ({ id, size, quantity }))));
}

function hydrateCartFromProducts() {
  const saved = cart;
  cart = saved.map((savedItem) => {
    const product = products.find((p) => p.id === Number(savedItem.id) && p.active !== false);
    if (!product || product.stock <= 0) return null;
    return { ...product, size: savedItem.size || 'Freesize', quantity: Math.min(Number(savedItem.quantity || 1), product.stock) };
  }).filter(Boolean);
  persistCart();
}

async function initApp() {
  try {
    await FairyStore.ready();
    loadCart();
    await refreshProducts();
    hydrateCartFromProducts();
    updateCartUI();

    selectedMatch.top = products.find((p) => p.type === 'top') || null;
    selectedMatch.bottom = products.find((p) => p.type === 'bottom') || null;
    selectedMatch.acc = products.find((p) => p.type === 'acc') || null;
    renderMatchSelector();
    updateMatchPreview();

    const params = new URLSearchParams(location.search);
    if (params.get('payment') === 'cancelled') {
      showToast('ยกเลิกการชำระเงินแล้ว คุณสามารถลองชำระใหม่ได้');
      history.replaceState({}, '', location.pathname);
    }
    if (location.hash === '#admin') goToAdminLogin();
    else if (location.hash === '#track') switchTab('track');
  } catch (error) {
    console.error(error);
    const grid = document.getElementById('product-grid');
    if (grid) grid.innerHTML = `<div class="col-span-full rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-xs text-red-600">เชื่อมต่อระบบร้านค้าไม่สำเร็จ: ${escapeHtml(error.message)}<br><span class="text-[10px] text-red-400">ตรวจสอบ Environment Variables และ Supabase ก่อนเผยแพร่</span></div>`;
    showToast('เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
window.addEventListener('focus', () => refreshProducts().catch(console.error));

async function refreshProducts() {
  products = await FairyStore.getProducts();
  if (cart.length) { hydrateCartFromProducts(); updateCartUI(); }
  renderProducts(products);
  renderMatchSelector();
  updateMatchPreview();
}

function switchTab(tabName) {
  if (tabName === 'admin') return goToAdminLogin();
  const tabs = ['shop', 'match', 'track', 'reviews', 'about', 'admin'];
  tabs.forEach((tab) => {
    document.getElementById(`tab-${tab}`)?.classList.add('hidden');
    const btn = document.getElementById(`nav-btn-${tab}`);
    if (btn) {
      btn.classList.remove('text-black', 'border-b-2', 'border-black');
      btn.classList.add('text-gray-500');
    }
  });
  document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`nav-btn-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-gray-500');
    activeBtn.classList.add('text-black', 'border-b-2', 'border-black');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToAdminLogin() {
  window.location.href = 'login.html';
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu')?.classList.toggle('hidden');
}

function renderProducts(items) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  document.getElementById('product-count').innerText = `กำลังแสดง ${items.length} รายการ`;
  if (!items.length) {
    grid.innerHTML = '<div class="col-span-full py-16 text-center text-gray-400"><i class="fa-solid fa-shirt text-4xl mb-3"></i><p class="text-xs">ไม่พบสินค้าในหมวดหมู่นี้</p></div>';
    return;
  }

  grid.innerHTML = items.map((p) => {
    const soldOut = Number(p.stock) <= 0;
    return `<div class="group cursor-pointer">
      <div class="relative overflow-hidden rounded-2xl bg-gray-100 mb-3 aspect-[3/4]" onclick="openProductModal(${p.id})">
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500 ${soldOut ? 'opacity-60' : ''}">
        <span class="absolute top-2.5 left-2.5 ${soldOut ? 'bg-red-600' : 'bg-black'} text-white text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">${soldOut ? 'สินค้าหมด' : 'ส่งฟรี'}</span>
        <button ${soldOut ? 'disabled' : ''} onclick="event.stopPropagation(); addToCart(${p.id})" class="absolute bottom-3 right-3 bg-white text-black w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:bg-black hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"><i class="fa-solid fa-plus text-xs"></i></button>
      </div>
      <div><span class="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-0.5">FAIRYMOOD</span><h3 class="text-xs font-medium text-gray-900 group-hover:underline truncate" onclick="openProductModal(${p.id})">${escapeHtml(p.name)}</h3><div class="flex items-center justify-between gap-2"><p class="text-xs font-bold text-black mt-1">${money(p.price)}</p><span class="text-[9px] text-gray-400">เหลือ ${p.stock}</span></div></div>
    </div>`;
  }).join('');
}

function filterCategory(category, evt) {
  activeCategory = category;
  document.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.classList.remove('bg-black', 'text-white', 'shadow-sm');
    btn.classList.add('bg-gray-100', 'text-gray-700');
  });
  if (evt?.target) {
    evt.target.classList.remove('bg-gray-100', 'text-gray-700');
    evt.target.classList.add('bg-black', 'text-white', 'shadow-sm');
  }
  applyFiltersAndSort();
}

function handleSort() { applyFiltersAndSort(); }

function applyFiltersAndSort() {
  let result = [...products];
  if (activeCategory !== 'all') result = result.filter((p) => p.category === activeCategory);
  const sortVal = document.getElementById('sort-select')?.value;
  if (sortVal === 'price-asc') result.sort((a, b) => a.price - b.price);
  if (sortVal === 'price-desc') result.sort((a, b) => b.price - a.price);
  if (sortVal === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  renderProducts(result);
}

function addToCart(productId, size = 'Freesize') {
  const product = products.find((p) => p.id === Number(productId));
  if (!product || product.stock <= 0) return showToast('สินค้านี้หมดชั่วคราว');
  const currentQty = cart.filter((i) => i.id === product.id).reduce((sum, i) => sum + i.quantity, 0);
  if (currentQty >= product.stock) return showToast('จำนวนสินค้าในตะกร้าถึงสต็อกที่มีแล้ว');
  const existing = cart.find((i) => i.id === product.id && i.size === size);
  if (existing) existing.quantity += 1;
  else cart.push({ ...product, size, quantity: 1 });
  persistCart();
  updateCartUI();
  showToast(`เพิ่ม “${product.name}” ลงตะกร้าแล้ว`);
}

function changeQty(productId, size, delta) {
  const item = cart.find((i) => i.id === Number(productId) && i.size === size);
  if (!item) return;
  const product = products.find((p) => p.id === Number(productId));
  const totalForProduct = cart.filter((i) => i.id === Number(productId)).reduce((sum, i) => sum + i.quantity, 0);
  if (delta > 0 && product && totalForProduct >= product.stock) return showToast('สต็อกสินค้าไม่เพียงพอ');
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter((i) => !(i.id === Number(productId) && i.size === size));
  persistCart();
  updateCartUI();
}

function removeFromCart(productId, size) {
  cart = cart.filter((i) => !(i.id === Number(productId) && i.size === size));
  persistCart();
  updateCartUI();
}

function cartSubtotal() {
  return cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
}

function updateCartUI() {
  const container = document.getElementById('cart-items');
  if (!container) return;
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cart-count').innerText = totalCount;
  const subtotal = cartSubtotal();
  if (appliedCouponCode && appliedCouponPercent > 0) appliedDiscount = Math.round((subtotal * appliedCouponPercent / 100) * 100) / 100;
  const total = Math.max(0, subtotal - appliedDiscount);
  document.getElementById('cart-subtotal-price').innerText = money(subtotal);
  document.getElementById('cart-total-price').innerText = money(total);
  document.getElementById('cart-discount-row').classList.toggle('hidden', appliedDiscount <= 0);
  document.getElementById('cart-discount-price').innerText = `-${money(appliedDiscount)}`;

  if (!cart.length) {
    container.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fa-solid fa-bag-shopping text-3xl mb-2"></i><p class="text-xs">ตะกร้าของคุณยังว่างอยู่</p></div>';
    return;
  }
  container.innerHTML = cart.map((item) => `<div class="flex items-center space-x-3 pb-3 border-b border-gray-100">
    <img src="${escapeHtml(item.image)}" class="w-14 h-14 object-cover rounded-xl bg-gray-100">
    <div class="flex-1 min-w-0"><h4 class="text-xs font-medium text-gray-900 truncate">${escapeHtml(item.name)}</h4><span class="text-[10px] text-gray-400 block">ไซส์: ${escapeHtml(item.size)}</span><p class="text-xs font-bold text-black mt-0.5">${money(item.price)}</p><div class="flex items-center space-x-2 mt-1"><button onclick="changeQty(${item.id}, '${escapeHtml(item.size)}', -1)" class="w-5 h-5 bg-gray-100 rounded-md text-xs font-bold">-</button><span class="text-xs font-semibold">${item.quantity}</span><button onclick="changeQty(${item.id}, '${escapeHtml(item.size)}', 1)" class="w-5 h-5 bg-gray-100 rounded-md text-xs font-bold">+</button></div></div>
    <button onclick="removeFromCart(${item.id}, '${escapeHtml(item.size)}')" class="text-gray-300 hover:text-red-500 text-xs p-1"><i class="fa-solid fa-trash-can"></i></button>
  </div>`).join('');
}

async function applyCoupon() {
  const input = document.getElementById('coupon-input').value.trim().toUpperCase();
  const msg = document.getElementById('coupon-message');
  msg.classList.remove('hidden', 'text-green-600', 'text-red-500');
  try {
    const result = await FairyStore.validateCoupon(input);
    if (!result.valid) throw new Error('โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ');
    appliedCouponCode = result.code;
    appliedCouponPercent = Number(result.percentOff);
    appliedDiscount = Math.round((cartSubtotal() * appliedCouponPercent / 100) * 100) / 100;
    msg.innerText = `✨ ใช้ส่วนลด ${result.percentOff}% สำเร็จ!`;
    msg.classList.add('text-green-600');
    updateCartUI();
  } catch (error) {
    appliedCouponCode = '';
    appliedCouponPercent = 0;
    appliedDiscount = 0;
    msg.innerText = `❌ ${error.message}`;
    msg.classList.add('text-red-500');
    updateCartUI();
  }
}

function toggleCartModal() { document.getElementById('cart-modal')?.classList.toggle('hidden'); }

function renderMatchSelector() {
  if (!document.getElementById('match-selector-tops')) return;
  const renderCards = (items, targetId, selectedObj) => {
    document.getElementById(targetId).innerHTML = items.filter((item) => item.stock > 0).map((item) => `<div onclick="setMatchItem('${item.type}', ${item.id})" class="cursor-pointer border ${selectedObj?.id === item.id ? 'border-black ring-2 ring-black bg-gray-50' : 'border-gray-200 bg-white'} rounded-2xl p-2 hover:border-black transition"><img src="${escapeHtml(item.image)}" class="w-full h-24 object-cover rounded-xl mb-1.5"><h5 class="text-[11px] font-medium truncate">${escapeHtml(item.name)}</h5><p class="text-[10px] font-bold text-black">${money(item.price)}</p></div>`).join('');
  };
  renderCards(products.filter((p) => p.type === 'top'), 'match-selector-tops', selectedMatch.top);
  renderCards(products.filter((p) => p.type === 'bottom'), 'match-selector-bottoms', selectedMatch.bottom);
  renderCards(products.filter((p) => p.type === 'acc'), 'match-selector-accs', selectedMatch.acc);
}

function setMatchItem(type, id) {
  selectedMatch[type] = products.find((p) => p.id === Number(id)) || null;
  updateMatchPreview();
  renderMatchSelector();
}

function resetMatchSelection() { selectedMatch = { top: null, bottom: null, acc: null }; updateMatchPreview(); renderMatchSelector(); }

function updateMatchPreview() {
  if (!document.getElementById('match-total-price')) return;
  const updateBox = (key, prefix) => {
    const item = selectedMatch[key];
    document.getElementById(`${prefix}-img`).src = item?.image || '';
    document.getElementById(`${prefix}-title`).innerText = item?.name || 'ยังไม่ได้เลือก';
    document.getElementById(`${prefix}-price`).innerText = money(item?.price || 0);
  };
  updateBox('top', 'match-top'); updateBox('bottom', 'match-bottom'); updateBox('acc', 'match-acc');
  document.getElementById('match-total-price').innerText = money((selectedMatch.top?.price || 0) + (selectedMatch.bottom?.price || 0) + (selectedMatch.acc?.price || 0));
}

function addMatchSetToCart() {
  const selected = ['top', 'bottom', 'acc'].map((k) => selectedMatch[k]).filter(Boolean);
  if (!selected.length) return showToast('โปรดเลือกอย่างน้อย 1 ชิ้นเพื่อจัดเซ็ต');
  selected.forEach((item) => addToCart(item.id));
  toggleCartModal();
}

async function ensureCheckoutTurnstile() {
  const config = await FairyStore.getPublicConfig();
  if (!config?.turnstileSiteKey) throw new Error('ระบบป้องกันบอทยังไม่ได้ตั้งค่า');
  const container = document.getElementById('turnstile-container');
  if (!container) return;

  const render = () => {
    if (!window.turnstile) throw new Error('Cloudflare Turnstile โหลดไม่สำเร็จ');
    if (checkoutTurnstileWidgetId !== null) {
      window.turnstile.reset(checkoutTurnstileWidgetId);
      checkoutTurnstileToken = '';
      return;
    }
    checkoutTurnstileWidgetId = window.turnstile.render(container, {
      sitekey: config.turnstileSiteKey,
      theme: 'light',
      size: 'flexible',
      callback: (token) => { checkoutTurnstileToken = token; },
      'expired-callback': () => { checkoutTurnstileToken = ''; },
      'error-callback': () => { checkoutTurnstileToken = ''; },
    });
  };

  if (window.turnstile) return render();
  await new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.turnstile) { clearInterval(timer); resolve(); }
      else if (attempts >= 50) { clearInterval(timer); reject(new Error('Cloudflare Turnstile โหลดไม่สำเร็จ')); }
    }, 100);
  });
  render();
}

function resetCheckoutTurnstile() {
  checkoutTurnstileToken = '';
  if (window.turnstile && checkoutTurnstileWidgetId !== null) {
    try { window.turnstile.reset(checkoutTurnstileWidgetId); } catch {}
  }
}

async function openCheckoutModal() {
  if (!cart.length) return showToast('โปรดเลือกสินค้าลงตะกร้าก่อนทำรายการ');
  toggleCartModal();
  const total = Math.max(0, cartSubtotal() - appliedDiscount);
  document.getElementById('checkout-grand-total').innerText = money(total);
  const payAmountEl = document.getElementById('checkout-pay-amount');
  if (payAmountEl) payAmountEl.innerText = money(total);
  document.getElementById('checkout-modal').classList.remove('hidden');
  togglePaymentUI();
  try { await ensureCheckoutTurnstile(); } catch (error) { showToast(error.message); }
}

function closeCheckoutModal() { document.getElementById('checkout-modal')?.classList.add('hidden'); resetCheckoutTurnstile(); }

function togglePaymentUI() {
  const method = document.querySelector('input[name="payment-method"]:checked')?.value || 'promptpay';
  const box = document.getElementById('payment-promptpay-box');
  if (!box) return;
  if (method === 'cod') {
    box.innerHTML = '<div class="py-2"><i class="fa-solid fa-truck-fast text-xl mb-2"></i><p class="text-xs font-semibold">เก็บเงินปลายทาง</p><p class="text-[10px] text-gray-500 mt-1">ระบบจะสร้างออเดอร์ทันทีและชำระเมื่อได้รับสินค้า</p></div>';
  } else {
    box.innerHTML = `<div class="py-2"><i class="fa-solid fa-shield-halved text-xl mb-2"></i><p class="text-xs font-semibold">ชำระผ่าน Stripe Checkout</p><p class="text-[10px] text-gray-500 mt-1">${method === 'promptpay' ? 'ระบบจะสร้าง QR PromptPay จริงบนหน้าชำระเงินของ Stripe' : 'กรอกข้อมูลบัตรบนหน้าชำระเงินที่ปลอดภัยของ Stripe'} หลังยืนยันออเดอร์</p><p class="text-[10px] text-gray-500 mt-2">ยอดชำระ: <strong id="checkout-pay-amount-inline" class="text-sm text-black">${money(Math.max(0, cartSubtotal() - appliedDiscount))}</strong></p></div>`;
  }
}

async function handleFormCheckout(event) {
  event.preventDefault();
  if (!cart.length) return showToast('ตะกร้าสินค้าว่าง');
  if (!checkoutTurnstileToken) return showToast('กรุณายืนยันความปลอดภัยก่อนสั่งซื้อ');
  const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้างคำสั่งซื้อ';

  try {
    const payload = {
      name: document.getElementById('cust-name').value.trim(),
      phone: document.getElementById('cust-phone').value.trim(),
      email: document.getElementById('cust-email')?.value.trim() || '',
      address: document.getElementById('cust-address').value.trim(),
      subdistrict: document.getElementById('cust-subdistrict').value.trim(),
      district: document.getElementById('cust-district').value.trim(),
      province: document.getElementById('cust-province').value.trim(),
      zipcode: document.getElementById('cust-zipcode').value.trim(),
      paymentMethod: document.querySelector('input[name="payment-method"]:checked')?.value || 'promptpay',
      couponCode: appliedCouponCode,
      turnstileToken: checkoutTurnstileToken,
      items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity, size: item.size || 'Freesize' })),
    };

    const result = await FairyStore.checkout(payload);
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }

    // COD order created successfully.
    cart = [];
    appliedDiscount = 0;
    appliedCouponCode = '';
    appliedCouponPercent = 0;
    persistCart();
    updateCartUI();
    closeCheckoutModal();
    document.getElementById('receipt-order-id').innerText = result.orderNo;
    document.getElementById('receipt-cust-name').innerText = payload.name;
    document.getElementById('receipt-total-amount').innerText = money(result.total);
    document.getElementById('receipt-modal').classList.remove('hidden');
    event.target.reset();
    await refreshProducts();
  } catch (error) {
    console.error(error);
    resetCheckoutTurnstile();
    showToast(error.message || 'สร้างคำสั่งซื้อไม่สำเร็จ');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalText;
  }
}

function closeReceiptModal() { document.getElementById('receipt-modal')?.classList.add('hidden'); switchTab('shop'); }

async function copyOrderId() {
  const orderId = document.getElementById('receipt-order-id').innerText;
  try { await navigator.clipboard.writeText(orderId); } catch {}
  showToast('คัดลอก Order ID แล้ว');
}

async function searchOrderTrack() {
  const orderNo = document.getElementById('track-order-input').value.trim().toUpperCase();
  const phone = document.getElementById('track-phone-input').value.trim();
  const container = document.getElementById('track-result-container');
  if (!orderNo || !phone) return showToast('กรุณากรอก Order ID และเบอร์โทรที่ใช้สั่งซื้อ');
  container.classList.remove('hidden');
  container.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-xl block mb-2"></i>กำลังตรวจสอบข้อมูล</div>';

  try {
    const match = await FairyStore.trackOrder(orderNo, phone);
    if (!match) {
      container.innerHTML = '<div class="text-center py-6 text-gray-400"><i class="fa-solid fa-magnifying-glass text-3xl mb-2"></i><p class="text-xs">ไม่พบคำสั่งซื้อ กรุณาตรวจ Order ID และเบอร์โทรอีกครั้ง</p></div>';
      return;
    }

    const statusTextMap = { awaiting_payment: 'รอชำระเงิน', pending: 'ยืนยันคำสั่งซื้อแล้ว', packing: 'กำลังจัดเตรียมสินค้า', shipped: 'จัดส่งแล้ว', completed: 'จัดส่งสำเร็จ', cancelled: 'ยกเลิกคำสั่งซื้อ' };
    const paymentMap = { pending: 'รอยืนยันการชำระ', unpaid: 'เก็บเงินปลายทาง', paid: 'ชำระแล้ว', failed: 'ชำระไม่สำเร็จ', refunded: 'คืนเงินแล้ว' };
    const progress = match.status === 'pending' ? 'w-1/3' : match.status === 'packing' ? 'w-2/3' : ['shipped', 'completed'].includes(match.status) ? 'w-full' : 'w-0';
    const items = Array.isArray(match.items) ? match.items : [];

    container.innerHTML = `<div class="space-y-4">
      <div class="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-gray-100"><div><span class="text-[10px] text-gray-400 font-bold uppercase block">หมายเลขออเดอร์</span><h4 class="text-base font-bold text-black font-mono">${escapeHtml(match.order_no)}</h4></div><span class="bg-black text-white text-[10px] px-3 py-1 rounded-full font-semibold">${escapeHtml(statusTextMap[match.status] || match.status)}</span></div>
      <div class="grid sm:grid-cols-2 gap-2 text-xs"><div><span class="text-gray-400">ชื่อผู้รับ:</span> ${escapeHtml(match.customer_name || '-')}</div><div><span class="text-gray-400">ยอดรวม:</span> ${money(match.total)}</div><div><span class="text-gray-400">การชำระ:</span> ${escapeHtml(paymentMap[match.payment_status] || match.payment_status)}</div><div><span class="text-gray-400">เลขพัสดุ:</span> <strong class="font-mono">${escapeHtml(match.tracking_no || '-')}</strong></div></div>
      <div class="border border-gray-100 rounded-2xl divide-y divide-gray-100">${items.map((item) => `<div class="p-3 flex justify-between gap-3 text-xs"><span>${escapeHtml(item.name)} <small class="text-gray-400">×${item.quantity} · ${escapeHtml(item.size)}</small></span><strong>${money(Number(item.unit_price) * Number(item.quantity))}</strong></div>`).join('')}</div>
      <div class="pt-4 border-t border-gray-100"><div class="flex justify-between text-[10px] font-semibold text-gray-500 mb-2"><span>1. ยืนยันออเดอร์</span><span>2. แพ็คสินค้า</span><span>3. จัดส่ง</span></div><div class="w-full bg-gray-200 h-2 rounded-full overflow-hidden"><div class="bg-black h-full ${progress}"></div></div></div>
    </div>`;
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="text-center py-6 text-red-500 text-xs">ตรวจสอบออเดอร์ไม่สำเร็จ: ${escapeHtml(error.message)}</div>`;
  }
}

function openProductModal(productId) {
  const product = products.find((p) => p.id === Number(productId));
  if (!product) return;
  const soldOut = product.stock <= 0;
  document.getElementById('product-modal-content').innerHTML = `<div class="aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden"><img src="${escapeHtml(product.image)}" class="w-full h-full object-cover"></div><div class="flex flex-col justify-between"><div><span class="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">FAIRYMOOD COLLECTION</span><h2 class="text-xl font-bold text-gray-900 mb-2 font-serif-title">${escapeHtml(product.name)}</h2><p class="text-lg font-bold text-black mb-2">${money(product.price)}</p><p class="text-[10px] ${soldOut ? 'text-red-600' : 'text-green-600'} mb-4">${soldOut ? 'สินค้าหมดชั่วคราว' : `พร้อมส่ง ${product.stock} ชิ้น · จัดส่งฟรี`}</p><p class="text-xs text-gray-600 leading-relaxed mb-6">${escapeHtml(product.description)}</p><div class="mb-4"><span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">เลือกไซส์</span><div class="flex space-x-2" id="detail-size-picker"><button onclick="selectDetailSize(this, 'S')" class="size-opt-btn border border-gray-300 w-9 h-9 rounded-xl text-xs font-semibold">S</button><button onclick="selectDetailSize(this, 'M')" class="size-opt-btn border border-gray-300 w-9 h-9 rounded-xl text-xs font-semibold">M</button><button onclick="selectDetailSize(this, 'Freesize')" class="size-opt-btn border-black bg-black text-white w-20 h-9 rounded-xl text-xs font-semibold">Freesize</button></div></div></div><div class="space-y-2 pt-6 border-t border-gray-100"><button ${soldOut ? 'disabled' : ''} onclick="addToCart(${product.id}, selectedDetailSize); closeProductModal();" class="w-full bg-black text-white py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider disabled:bg-gray-300">${soldOut ? 'สินค้าหมด' : 'เพิ่มลงตะกร้าสินค้า'}</button></div></div>`;
  window.selectedDetailSize = 'Freesize';
  document.getElementById('product-modal').classList.remove('hidden');
}

function selectDetailSize(btn, size) {
  document.querySelectorAll('.size-opt-btn').forEach((b) => { b.classList.remove('bg-black', 'text-white', 'border-black'); b.classList.add('border-gray-300'); });
  btn.classList.add('bg-black', 'text-white', 'border-black');
  window.selectedDetailSize = size;
}
function closeProductModal() { document.getElementById('product-modal')?.classList.add('hidden'); }
function openSizeGuideModal() { document.getElementById('size-modal')?.classList.remove('hidden'); }
function closeSizeGuideModal() { document.getElementById('size-modal')?.classList.add('hidden'); }
function toggleSearchModal() { document.getElementById('search-modal')?.classList.toggle('hidden'); }

function handleSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const container = document.getElementById('search-results');
  if (!query) return container.innerHTML = '';
  const filtered = products.filter((p) => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query));
  container.innerHTML = filtered.slice(0, 10).map((p) => `<div onclick="openProductModal(${p.id}); toggleSearchModal();" class="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-xl cursor-pointer"><img src="${escapeHtml(p.image)}" class="w-10 h-10 object-cover rounded-lg bg-gray-100"><div><h4 class="text-xs font-medium text-gray-900">${escapeHtml(p.name)}</h4><p class="text-[10px] font-bold text-black">${money(p.price)}</p></div></div>`).join('');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toast-message').innerText = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  clearTimeout(window.__fairyToastTimer);
  window.__fairyToastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3500);
}
