(function () {
  let client = null;
  let initPromise = null;
  let publicConfig = null;

  const PAYMENT_LABELS = { card: 'Card', promptpay: 'PromptPay', cod: 'COD' };

  function mapProduct(row) {
    return {
      id: Number(row.id),
      sku: row.sku || '',
      name: row.name,
      category: row.category,
      price: Number(row.price),
      image: row.image_url,
      description: row.description || '',
      colors: Array.isArray(row.colors) ? row.colors : [],
      type: row.product_type,
      stock: Number(row.stock || 0),
      active: row.active !== false,
      createdAt: row.created_at,
    };
  }

  function mapOrder(row) {
    const parts = [row.address, row.subdistrict, row.district, row.province, row.zipcode].filter(Boolean);
    return {
      uuid: row.id,
      customerId: row.customer_id,
      id: row.order_no,
      custName: row.customer_name || 'ลูกค้า',
      phone: row.phone || '-',
      email: row.email || '',
      address: parts.join(' '),
      total: Number(row.total || 0),
      subtotal: Number(row.subtotal || 0),
      discount: Number(row.discount || 0),
      paymentMethod: PAYMENT_LABELS[row.payment_method] || row.payment_method,
      paymentMethodKey: row.payment_method,
      paymentStatus: row.payment_status,
      status: row.status,
      trackingNo: row.tracking_no || '-',
      date: row.created_at ? new Date(row.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
      items: (row.order_items || []).map((item) => ({
        id: item.product_id,
        name: item.product_name,
        price: Number(item.unit_price || 0),
        quantity: Number(item.quantity || 1),
        size: item.size || 'Freesize',
      })),
    };
  }

  async function ready() {
    if (client) return client;
    if (!initPromise) {
      initPromise = (async () => {
        if (!window.supabase?.createClient) throw new Error('Supabase client library failed to load');
        const response = await fetch('/api/public-config', { cache: 'no-store' });
        const config = await response.json();
        if (!response.ok) throw new Error(config.error || 'โหลดการตั้งค่าระบบไม่สำเร็จ');
        publicConfig = config;
        client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        return client;
      })();
    }
    return initPromise;
  }

  async function getClient() {
    return ready();
  }

  async function getPublicConfig() {
    await ready();
    return publicConfig;
  }

  async function getProducts({ admin = false } = {}) {
    const supabaseClient = await ready();
    let query = supabaseClient.from('products').select('*').order('created_at', { ascending: false });
    if (!admin) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapProduct);
  }

  async function getOrders() {
    const supabaseClient = await ready();
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrder);
  }

  async function getCustomers() {
    const supabaseClient = await ready();
    const { data, error } = await supabaseClient.from('customers').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function saveProduct(product) {
    const supabaseClient = await ready();
    const payload = {
      name: String(product.name || '').trim(),
      price: Number(product.price),
      stock: Number(product.stock),
      category: product.category,
      product_type: product.type,
      image_url: String(product.image || '').trim(),
      description: String(product.description || '').trim(),
      active: product.active !== false,
      colors: Array.isArray(product.colors) ? product.colors : ['ดำ', 'ขาว'],
    };

    if (product.id) {
      const { data, error } = await supabaseClient.from('products').update(payload).eq('id', Number(product.id)).select().single();
      if (error) throw error;
      return mapProduct(data);
    }

    const { data, error } = await supabaseClient.from('products').insert(payload).select().single();
    if (error) throw error;
    return mapProduct(data);
  }

  async function deleteProduct(id) {
    const supabaseClient = await ready();
    const { error } = await supabaseClient.from('products').delete().eq('id', Number(id));
    if (error) throw error;
  }

  async function uploadProductImage(file) {
    const supabaseClient = await ready();
    if (!file || !file.type?.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์รูปภาพ');
    if (file.size > 5 * 1024 * 1024) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB');
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseClient.storage.from('product-images').upload(path, file, { cacheControl: '31536000', upsert: false });
    if (error) throw error;
    const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function updateOrder(orderUuid, status, trackingNo, paymentStatus) {
    const supabaseClient = await ready();
    const { error } = await supabaseClient.rpc('admin_update_order', {
      p_order_id: orderUuid,
      p_status: status,
      p_tracking_no: trackingNo || null,
      p_payment_status: paymentStatus,
    });
    if (error) throw error;
  }

  async function deleteCustomer(customerUuid) {
    const supabaseClient = await ready();
    const { error } = await supabaseClient.rpc('delete_customer_personal_data', { p_customer_id: customerUuid });
    if (error) throw error;
  }

  async function trackOrder(orderNo, phone) {
    const response = await fetch('/api/track-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNo, phone }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ตรวจสอบออเดอร์ไม่สำเร็จ');
    return data.order || null;
  }

  async function validateCoupon(code) {
    const response = await fetch('/api/validate-coupon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ตรวจสอบคูปองไม่สำเร็จ');
    return data;
  }

  async function checkout(payload) {
    const endpoint = payload.paymentMethod === 'cod' ? '/api/create-order' : '/api/create-checkout-session';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'สร้างคำสั่งซื้อไม่สำเร็จ');
    return data;
  }

  async function signIn(email, password) {
    const supabaseClient = await ready();
    return supabaseClient.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    const supabaseClient = await ready();
    return supabaseClient.auth.signOut();
  }

  async function getSession() {
    const supabaseClient = await ready();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function isAdmin() {
    const supabaseClient = await ready();
    const { data, error } = await supabaseClient.rpc('is_admin');
    if (error) throw error;
    return data === true;
  }

  window.FairyStore = {
    ready,
    getClient,
    getPublicConfig,
    getProducts,
    getOrders,
    getCustomers,
    saveProduct,
    deleteProduct,
    uploadProductImage,
    updateOrder,
    deleteCustomer,
    trackOrder,
    validateCoupon,
    checkout,
    signIn,
    signOut,
    getSession,
    isAdmin,
  };
})();
