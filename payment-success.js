function money(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function setState(kind, title, message) {
  const icon = document.getElementById('status-icon');
  const iconHtml = kind === 'success' ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';
  icon.className = `w-16 h-16 rounded-full ${kind === 'success' ? 'bg-black text-white' : 'bg-red-50 text-red-600'} flex items-center justify-center text-2xl mx-auto mt-8`;
  icon.innerHTML = iconHtml;
  document.getElementById('status-title').textContent = title;
  document.getElementById('status-message').textContent = message;
}

async function init() {
  const sessionId = new URLSearchParams(location.search).get('session_id');
  if (!sessionId) return setState('error', 'ไม่พบข้อมูลการชำระเงิน', 'กรุณากลับหน้าร้านและตรวจสอบคำสั่งซื้ออีกครั้ง');

  try {
    const response = await fetch(`/api/payment-status?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ตรวจสอบการชำระเงินไม่สำเร็จ');

    const paid = data.paymentStatus === 'paid';
    setState(paid ? 'success' : 'error', paid ? 'ชำระเงินสำเร็จ!' : 'กำลังรอยืนยันการชำระเงิน', paid ? 'เราได้รับการชำระเงินแล้ว และคำสั่งซื้อถูกส่งเข้าสู่ระบบหลังบ้านเรียบร้อย' : 'หากเพิ่งชำระเงิน กรุณารอสักครู่แล้วรีเฟรชหน้านี้');

    document.getElementById('order-card').classList.remove('hidden');
    document.getElementById('success-order-no').textContent = data.orderNo;
    document.getElementById('success-name').textContent = data.customerName || '-';
    document.getElementById('success-total').textContent = money(data.total);
    document.getElementById('success-payment').textContent = paid ? 'ชำระแล้ว' : data.paymentStatus;
    const copyBtn = document.getElementById('copy-order-btn');
    copyBtn.classList.remove('hidden');
    copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(data.orderNo); } catch {}
      copyBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>คัดลอกแล้ว';
    };

    if (paid) localStorage.removeItem('fairymood_cart_v1');
  } catch (error) {
    setState('error', 'ตรวจสอบการชำระเงินไม่สำเร็จ', error.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
