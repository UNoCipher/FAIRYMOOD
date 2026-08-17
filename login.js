const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('login-error');
const errorText = document.getElementById('login-error-text');
const togglePasswordButton = document.getElementById('toggle-password');

async function initLogin() {
  try {
    await FairyStore.ready();
    const session = await FairyStore.getSession();
    if (session && await FairyStore.isAdmin()) {
      window.location.replace('admin.html');
    }
  } catch (error) {
    showLoginError(`เชื่อมต่อระบบไม่สำเร็จ: ${error.message}`);
  }
}

document.addEventListener('DOMContentLoaded', initLogin);

togglePasswordButton.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePasswordButton.innerHTML = isHidden ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
});

function showLoginError(message) {
  errorBox.classList.remove('hidden');
  if (errorText) errorText.textContent = message;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');
  const submit = event.submitter;
  const original = submit.innerHTML;
  submit.disabled = true;
  submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังตรวจสอบ';

  try {
    const email = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const { data, error } = await FairyStore.signIn(email, password);
    if (error) throw error;
    if (!data.session || !(await FairyStore.isAdmin())) {
      await FairyStore.signOut();
      throw new Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
    }
    window.location.replace('admin.html');
  } catch (error) {
    passwordInput.value = '';
    passwordInput.focus();
    showLoginError(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : (error.message || 'เข้าสู่ระบบไม่สำเร็จ'));
  } finally {
    submit.disabled = false;
    submit.innerHTML = original;
  }
});
