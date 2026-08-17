let products = [];
let orders = [];
let customers = [];
let currentSection = 'overview';
let currentOrderUuid = null;

const CATEGORY_LABELS = {
  camisole: 'เสื้อสายเดี่ยว / ถัก',
  outer: 'เสื้อคลุม / ซีทรู',
  bottoms: 'กระโปรง / กางเกง',
  accessories: 'เครื่องประดับ',
};

const STATUS_LABELS = {
  awaiting_payment: 'รอชำระเงิน',
  pending: 'รอตรวจสอบ',
  packing: 'กำลังแพ็ค',
  shipped: 'จัดส่งแล้ว',
  completed: 'สำเร็จ',
  cancelled: 'ยกเลิก',
};

const STATUS_CLASSES = {
  awaiting_payment: 'bg-gray-50 text-gray-600 border-gray-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  packing: 'bg-blue-50 text-blue-700 border-blue-100',
  shipped: 'bg-violet-50 text-violet-700 border-violet-100',
  completed: 'bg-green-50 text-green-700 border-green-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

const PAYMENT_STATUS_LABELS = {
  pending: 'รอยืนยัน', unpaid: 'ยังไม่ชำระ', paid: 'ชำระแล้ว', failed: 'ล้มเหลว', refunded: 'คืนเงินแล้ว',
};

function money(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function statusBadge(status) {
  return `<span class="inline-flex px-2.5 py-1 rounded-full border text-[9px] font-semibold ${STATUS_CLASSES[status] || STATUS_CLASSES.pending}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function paymentBadge(status) {
  const classes = status === 'paid' ? 'bg-green-50 text-green-700' : status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600';
  return `<span class="inline-flex px-2 py-1 rounded-full text-[9px] font-semibold ${classes}">${escapeHtml(PAYMENT_STATUS_LABELS[status] || status)}</span>`;
}

async function initAdmin() {
  try {
    await FairyStore.ready();
    const session = await FairyStore.getSession();
    if (!session || !(await FairyStore.isAdmin())) {
      await FairyStore.signOut().catch(() => {});
      return window.location.replace('login.html');
    }
    document.getElementById('admin-email').textContent = session.user.email || 'Admin';
    bindAdminEvents();
    await refreshData();
  } catch (error) {
    console.error(error);
    showToast(`เชื่อมต่อระบบหลังบ้านไม่สำเร็จ: ${error.message}`);
  }
}

document.addEventListener('DOMContentLoaded', initAdmin);

function bindAdminEvents() {
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.go)));
  document.querySelectorAll('.admin-nav-btn, .mobile-nav-btn').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.section)));
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => document.getElementById('mobile-menu')?.classList.remove('hidden'));
  document.getElementById('mobile-menu-close')?.addEventListener('click', () => document.getElementById('mobile-menu')?.classList.add('hidden'));
  document.getElementById('admin-refresh-btn')?.addEventListener('click', () => refreshData().then(() => showToast('โหลดข้อมูลล่าสุดแล้ว')).catch((error) => showToast(error.message)));
  document.getElementById('order-search')?.addEventListener('input', renderOrders);
  document.getElementById('order-status-filter')?.addEventListener('change', renderOrders);
  document.getElementById('product-search')?.addEventListener('input', renderProducts);
  document.getElementById('product-editor-form')?.addEventListener('submit', saveProductFromForm);
  document.getElementById('edit-product-file')?.addEventListener('change', previewProductFile);
}

function setSection(section) {
  currentSection = section;
  document.querySelectorAll('.admin-section').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`section-${section}`)?.classList.remove('hidden');
  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    const active = btn.dataset.section === section;
    btn.classList.toggle('bg-white', active);
    btn.classList.toggle('text-black', active);
    btn.classList.toggle('font-semibold', active);
    btn.classList.toggle('text-gray-400', !active);
  });
  const titles = {
    overview: ['Dashboard', 'ภาพรวมร้านค้า'], orders: ['Order Management', 'จัดการคำสั่งซื้อ'], products: ['Product Management', 'จัดการสินค้า'], customers: ['Customer Data', 'ข้อมูลลูกค้า'],
  };
  document.getElementById('page-kicker').textContent = titles[section][0];
  document.getElementById('page-title').textContent = titles[section][1];
  document.getElementById('mobile-menu')?.classList.add('hidden');
  if (section === 'orders') renderOrders();
  if (section === 'products') renderProducts();
  if (section === 'customers') renderCustomers();
}

async function refreshData() {
  const refreshButton = document.getElementById('admin-refresh-btn');
  if (refreshButton) refreshButton.disabled = true;
  try {
    [products, orders, customers] = await Promise.all([
      FairyStore.getProducts({ admin: true }),
      FairyStore.getOrders(),
      FairyStore.getCustomers(),
    ]);
    renderOverview(); renderOrders(); renderProducts(); renderCustomers();
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

function buildCustomers() {
  const map = new Map(customers.map((customer) => [customer.id, {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email || '',
    address: [customer.address, customer.subdistrict, customer.district, customer.province, customer.zipcode].filter(Boolean).join(' '),
    count: 0,
    total: 0,
  }]));

  orders.filter((o) => o.status !== 'cancelled').forEach((order) => {
    if (!order.customerId || !map.has(order.customerId)) return;
    const current = map.get(order.customerId);
    current.count += 1;
    current.total += Number(order.total || 0);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function renderOverview() {
  const validOrders = orders.filter((o) => o.status !== 'cancelled' && o.paymentStatus !== 'failed');
  const totalSales = validOrders.filter((o) => o.paymentStatus === 'paid').reduce((sum, o) => sum + Number(o.total || 0), 0);
  const pending = orders.filter((o) => ['pending', 'packing'].includes(o.status)).length;
  const lowStock = products.filter((p) => Number(p.stock || 0) <= 5).length;
  document.getElementById('stat-sales').textContent = money(totalSales);
  document.getElementById('stat-orders').textContent = orders.length;
  document.getElementById('stat-pending').textContent = `${pending} รายการรอดำเนินการ`;
  document.getElementById('stat-products').textContent = products.length;
  document.getElementById('stat-low-stock').textContent = `${lowStock} รายการสต็อกต่ำ`;
  document.getElementById('stat-customers').textContent = buildCustomers().length;
  document.getElementById('nav-order-badge').textContent = pending;

  const recent = orders.slice(0, 6);
  document.getElementById('overview-orders').innerHTML = recent.length ? recent.map((order) => `<tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer" onclick="openOrderEditor('${order.uuid}')"><td class="px-5 py-4"><p class="font-mono font-bold">${escapeHtml(order.id)}</p><p class="text-[9px] text-gray-400 mt-1">${escapeHtml(order.date)}</p></td><td class="px-5 py-4"><p class="font-medium">${escapeHtml(order.custName)}</p><p class="text-[9px] text-gray-400 mt-1">${escapeHtml(order.phone)}</p></td><td class="px-5 py-4 font-semibold">${money(order.total)}</td><td class="px-5 py-4">${statusBadge(order.status)}</td></tr>`).join('') : '<tr><td class="p-8 text-center text-gray-400">ยังไม่มีคำสั่งซื้อ</td></tr>';

  const lows = products.filter((p) => Number(p.stock || 0) <= 5).sort((a, b) => a.stock - b.stock).slice(0, 6);
  document.getElementById('low-stock-list').innerHTML = lows.length ? lows.map((p) => `<button onclick="openProductEditor(${p.id})" class="w-full flex items-center gap-3 text-left p-2 rounded-xl hover:bg-gray-50 transition"><img src="${escapeHtml(p.image)}" class="w-11 h-11 rounded-xl object-cover bg-gray-100"><div class="min-w-0 flex-1"><p class="text-[10px] font-semibold truncate">${escapeHtml(p.name)}</p><p class="text-[9px] text-gray-400 mt-1">${money(p.price)}</p></div><span class="text-[10px] font-bold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}">${p.stock} ชิ้น</span></button>`).join('') : '<div class="py-8 text-center text-xs text-gray-400"><i class="fa-solid fa-circle-check text-green-500 text-xl block mb-2"></i>สต็อกอยู่ในระดับปกติ</div>';
}

function renderOrders() {
  const tbody = document.getElementById('orders-table');
  if (!tbody) return;
  const q = (document.getElementById('order-search')?.value || '').trim().toLowerCase();
  const status = document.getElementById('order-status-filter')?.value || 'all';
  const filtered = orders.filter((order) => `${order.id} ${order.custName} ${order.phone}`.toLowerCase().includes(q) && (status === 'all' || order.status === status));
  tbody.innerHTML = filtered.length ? filtered.map((order) => `<tr class="hover:bg-gray-50 transition"><td class="px-5 py-4"><p class="font-mono font-bold">${escapeHtml(order.id)}</p><p class="text-[9px] text-gray-400 mt-1">${escapeHtml(order.date)}</p></td><td class="px-5 py-4"><p class="font-medium">${escapeHtml(order.custName)}</p><p class="text-[9px] text-gray-400 mt-1">${escapeHtml(order.phone)}</p></td><td class="px-5 py-4 font-bold">${money(order.total)}</td><td class="px-5 py-4"><div>${escapeHtml(order.paymentMethod)}</div><div class="mt-1">${paymentBadge(order.paymentStatus)}</div></td><td class="px-5 py-4">${statusBadge(order.status)}</td><td class="px-5 py-4 font-mono text-[10px]">${escapeHtml(order.trackingNo)}</td><td class="px-5 py-4 text-right"><button onclick="openOrderEditor('${order.uuid}')" class="bg-black text-white px-3 py-2 rounded-full text-[9px] font-semibold">จัดการ</button></td></tr>`).join('') : '<tr><td colspan="7" class="p-10 text-center text-gray-400">ไม่พบคำสั่งซื้อ</td></tr>';
}

function renderProducts() {
  const tbody = document.getElementById('products-table');
  if (!tbody) return;
  const q = (document.getElementById('product-search')?.value || '').trim().toLowerCase();
  const filtered = products.filter((p) => `${p.name} ${CATEGORY_LABELS[p.category] || ''}`.toLowerCase().includes(q));
  tbody.innerHTML = filtered.length ? filtered.map((p) => `<tr class="hover:bg-gray-50 transition"><td class="px-5 py-4"><div class="flex items-center gap-3"><img src="${escapeHtml(p.image)}" class="w-12 h-14 rounded-xl object-cover bg-gray-100"><div class="min-w-0"><p class="font-medium truncate max-w-[250px]">${escapeHtml(p.name)}</p><p class="text-[9px] text-gray-400 mt-1">#${p.id}</p></div></div></td><td class="px-5 py-4">${escapeHtml(CATEGORY_LABELS[p.category] || p.category)}</td><td class="px-5 py-4 font-bold">${money(p.price)}</td><td class="px-5 py-4"><span class="font-bold ${p.stock <= 5 ? 'text-red-600' : ''}">${p.stock}</span></td><td class="px-5 py-4"><span class="${p.active ? 'text-green-600' : 'text-gray-400'}">${p.active ? '● แสดงบนร้าน' : '○ ซ่อน'}</span></td><td class="px-5 py-4 text-right whitespace-nowrap"><button onclick="openProductEditor(${p.id})" class="px-3 py-2 rounded-full bg-gray-100 hover:bg-black hover:text-white mr-1">แก้ไข</button><button onclick="deleteProduct(${p.id})" class="px-3 py-2 rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white">ลบ</button></td></tr>`).join('') : '<tr><td colspan="6" class="p-10 text-center text-gray-400">ไม่พบสินค้า</td></tr>';
}

function renderCustomers() {
  const tbody = document.getElementById('customers-table');
  if (!tbody) return;
  const rows = buildCustomers();
  tbody.innerHTML = rows.length ? rows.map((c) => `<tr class="hover:bg-gray-50"><td class="px-5 py-4"><p class="font-medium">${escapeHtml(c.name)}</p><p class="text-[9px] text-gray-400 mt-1">${escapeHtml(c.email || '-')}</p></td><td class="px-5 py-4">${escapeHtml(c.phone)}</td><td class="px-5 py-4">${c.count}</td><td class="px-5 py-4 font-bold">${money(c.total)}</td><td class="px-5 py-4 max-w-xs truncate">${escapeHtml(c.address || '-')}</td><td class="px-5 py-4 text-right"><button onclick="deleteCustomerProfile('${c.id}')" class="inline-flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-2 rounded-full text-[9px] font-semibold transition"><i class="fa-solid fa-user-shield"></i> ลบข้อมูลส่วนตัว</button></td></tr>`).join('') : '<tr><td colspan="6" class="p-10 text-center text-gray-400">ยังไม่มีข้อมูลลูกค้า</td></tr>';
}

async function deleteCustomerProfile(customerId) {
  const customer = buildCustomers().find((c) => c.id === customerId);
  if (!customer) return;
  if (!confirm(`ลบข้อมูลส่วนตัวของ “${customer.name}” ใช่หรือไม่?\n\nระบบจะลบชื่อ เบอร์โทร อีเมล และที่อยู่จากฐานลูกค้า และทำให้ออเดอร์เก่าเป็นข้อมูลไม่ระบุตัวตน โดยจะไม่ลบยอดขาย/รายการสินค้า`)) return;
  try {
    await FairyStore.deleteCustomer(customerId);
    await refreshData();
    showToast('ลบข้อมูลส่วนตัวลูกค้าแล้ว');
  } catch (error) {
    showToast(error.message || 'ลบข้อมูลลูกค้าไม่สำเร็จ');
  }
}

function openProductEditor(id = null) {
  const product = id ? products.find((p) => p.id === Number(id)) : null;
  document.getElementById('product-editor-title').textContent = product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่';
  document.getElementById('edit-product-id').value = product?.id || '';
  document.getElementById('edit-product-name').value = product?.name || '';
  document.getElementById('edit-product-price').value = product?.price ?? '';
  document.getElementById('edit-product-stock').value = product?.stock ?? 10;
  document.getElementById('edit-product-category').value = product?.category || 'camisole';
  document.getElementById('edit-product-image').value = product?.image || '';
  document.getElementById('edit-product-description').value = product?.description || '';
  document.getElementById('edit-product-active').checked = product?.active !== false;
  const fileInput = document.getElementById('edit-product-file');
  if (fileInput) fileInput.value = '';
  const preview = document.getElementById('edit-product-preview');
  if (preview) { preview.src = product?.image || ''; preview.classList.toggle('hidden', !product?.image); }
  document.getElementById('product-editor-modal').classList.remove('hidden');
}

function closeProductEditor() { document.getElementById('product-editor-modal').classList.add('hidden'); }
function productType(category) { return category === 'bottoms' ? 'bottom' : ['outer', 'accessories'].includes(category) ? 'acc' : 'top'; }

function previewProductFile() {
  const file = document.getElementById('edit-product-file')?.files?.[0];
  if (!file) return;
  const preview = document.getElementById('edit-product-preview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
}

async function saveProductFromForm(event) {
  event.preventDefault();
  const submit = event.submitter;
  const original = submit.innerHTML;
  submit.disabled = true;
  submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>กำลังบันทึก';
  try {
    const id = Number(document.getElementById('edit-product-id').value || 0);
    const category = document.getElementById('edit-product-category').value;
    let image = document.getElementById('edit-product-image').value.trim();
    const file = document.getElementById('edit-product-file')?.files?.[0];
    if (file) image = await FairyStore.uploadProductImage(file);
    if (!image) throw new Error('กรุณาใส่รูปสินค้า หรืออัปโหลดไฟล์รูป');

    await FairyStore.saveProduct({
      id: id || null,
      name: document.getElementById('edit-product-name').value.trim(),
      price: Number(document.getElementById('edit-product-price').value),
      stock: Number(document.getElementById('edit-product-stock').value),
      category,
      type: productType(category),
      image,
      description: document.getElementById('edit-product-description').value.trim(),
      active: document.getElementById('edit-product-active').checked,
      colors: id ? products.find((p) => p.id === id)?.colors : ['ดำ', 'ขาว'],
    });
    closeProductEditor();
    await refreshData();
    showToast(id ? 'บันทึกการแก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าใหม่แล้ว');
  } catch (error) {
    showToast(error.message || 'บันทึกสินค้าไม่สำเร็จ');
  } finally {
    submit.disabled = false;
    submit.innerHTML = original;
  }
}

async function deleteProduct(id) {
  const product = products.find((p) => p.id === Number(id));
  if (!product || !confirm(`ลบสินค้า “${product.name}” ออกจากระบบ?\nประวัติสินค้าที่อยู่ในออเดอร์เก่าจะยังถูกเก็บไว้`)) return;
  try {
    await FairyStore.deleteProduct(id);
    await refreshData();
    showToast('ลบสินค้าแล้ว');
  } catch (error) {
    showToast(error.message || 'ลบสินค้าไม่สำเร็จ');
  }
}

function openOrderEditor(orderUuid) {
  const order = orders.find((o) => o.uuid === orderUuid);
  if (!order) return;
  currentOrderUuid = orderUuid;
  document.getElementById('order-editor-title').textContent = order.id;
  const items = order.items || [];
  document.getElementById('order-editor-body').innerHTML = `<div class="grid sm:grid-cols-2 gap-3 mb-6"><div class="bg-gray-50 rounded-2xl p-4"><p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-2">ลูกค้า</p><p class="font-semibold">${escapeHtml(order.custName)}</p><p class="text-gray-500 mt-1">${escapeHtml(order.phone)}</p><p class="text-gray-500 mt-2 leading-relaxed">${escapeHtml(order.address)}</p></div><div class="bg-gray-50 rounded-2xl p-4"><p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-2">การชำระเงิน</p><p class="font-semibold">${escapeHtml(order.paymentMethod)}</p><div class="mt-2">${paymentBadge(order.paymentStatus)}</div><p class="font-serif-title text-2xl font-bold mt-3">${money(order.total)}</p></div></div><div class="mb-6"><p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-3">รายการสินค้า</p><div class="border border-gray-100 rounded-2xl divide-y divide-gray-100">${items.map((item) => `<div class="flex justify-between gap-3 p-3 text-xs"><div><p class="font-medium">${escapeHtml(item.name)}</p><p class="text-[9px] text-gray-400 mt-1">ไซส์ ${escapeHtml(item.size)} · ${item.quantity} ชิ้น</p></div><span class="font-semibold">${money(item.price * item.quantity)}</span></div>`).join('')}</div></div><div class="grid sm:grid-cols-3 gap-3"><div><label class="text-[10px] font-semibold text-gray-500 block mb-1">สถานะออเดอร์</label><select id="edit-order-status" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-xs">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${order.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div><label class="text-[10px] font-semibold text-gray-500 block mb-1">สถานะชำระเงิน</label><select id="edit-order-payment-status" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-xs">${Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${order.paymentStatus === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div><label class="text-[10px] font-semibold text-gray-500 block mb-1">Tracking Number</label><input id="edit-order-tracking" value="${escapeHtml(order.trackingNo === '-' ? '' : order.trackingNo)}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-xs"></div></div><div class="flex justify-end mt-6 pt-5 border-t border-gray-100"><button onclick="saveOrderChanges()" class="bg-black text-white px-6 py-3 rounded-full text-xs font-semibold">บันทึกสถานะ</button></div>`;
  document.getElementById('order-editor-modal').classList.remove('hidden');
}

function closeOrderEditor() { document.getElementById('order-editor-modal').classList.add('hidden'); currentOrderUuid = null; }

async function saveOrderChanges() {
  if (!currentOrderUuid) return;
  try {
    await FairyStore.updateOrder(
      currentOrderUuid,
      document.getElementById('edit-order-status').value,
      document.getElementById('edit-order-tracking').value.trim(),
      document.getElementById('edit-order-payment-status').value,
    );
    closeOrderEditor();
    await refreshData();
    showToast('อัปเดตออเดอร์แล้ว');
  } catch (error) {
    showToast(error.message || 'อัปเดตออเดอร์ไม่สำเร็จ');
  }
}

async function logoutAdmin() {
  await FairyStore.signOut().catch(() => {});
  window.location.replace('login.html');
}

function showToast(message) {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;
  document.getElementById('admin-toast-message').textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  clearTimeout(window.__adminToastTimer);
  window.__adminToastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3500);
}
