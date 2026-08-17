# FAIRYMOOD — Production Store

เวอร์ชันนี้เปลี่ยนจาก Demo/localStorage เป็นระบบร้านค้าออนไลน์ที่ใช้ฐานข้อมูลจริงและระบบชำระเงินจริง

## สถาปัตยกรรม

- Frontend: HTML + JavaScript + Tailwind CSS แบบ compile ตอน build (ไม่ใช้ Play CDN)
- Database: Supabase Postgres
- Admin Auth: Supabase Auth (Email/Password)
- Authorization: Postgres Row Level Security (RLS)
- Product images: Supabase Storage (`product-images`)
- Payments: Stripe Checkout (Card / PromptPay) + COD
- Backend endpoints: Vercel Functions (`/api/*`)
- Checkout bot protection: Cloudflare Turnstile (server-side verification)
- Hosting: Vercel

## สิ่งที่เปลี่ยนจากเวอร์ชันทดลอง

- ไม่มีสินค้า/ออเดอร์/ลูกค้าใน `localStorage` อีกต่อไป
- ไม่มีรหัสผ่าน Admin ฝังใน JavaScript
- ราคาสินค้า สต็อก และคูปองถูกคำนวณซ้ำที่ฐานข้อมูล/เซิร์ฟเวอร์
- สต็อกถูกจองแบบ atomic ระหว่างสร้างออเดอร์
- Stripe webhook ตรวจลายเซ็นก่อนอัปเดตสถานะการชำระเงิน
- การติดตามออเดอร์ต้องใช้ทั้ง Order ID + เบอร์โทร และเรียกผ่าน Server API
- Checkout ทุกแบบต้องผ่าน Cloudflare Turnstile ก่อนสร้างออเดอร์
- Admin เพิ่ม/แก้ไข/ลบสินค้าและอัปโหลดรูปเข้า Storage ได้
- Admin อัปเดตสถานะออเดอร์, Payment status และ Tracking ได้
- การยกเลิกออเดอร์คืนสต็อกอัตโนมัติ
- การลบลูกค้าจะลบ PII/ทำให้ออเดอร์เก่าไม่ระบุตัวตน และไม่ยอมให้ลบหากยังมีออเดอร์ที่กำลังดำเนินการ

---

# 1) สร้าง Supabase

1. สร้าง Project ใหม่ใน Supabase
2. เปิด **SQL Editor**
3. รันไฟล์:

```text
supabase/001_production_schema.sql
```

ไฟล์นี้จะสร้าง:

- `products`
- `customers`
- `orders`
- `order_items`
- `coupons`
- `admin_users`
- RLS policies
- Order RPC functions
- Product image bucket
- สินค้าเริ่มต้น 8 รายการ

## สร้าง Admin คนแรก

ไปที่:

```text
Supabase Dashboard > Authentication > Users > Add user
```

สร้าง Email + Password จริงของ Admin แล้ว Copy UUID ของ User

จากนั้นรัน SQL:

```sql
insert into public.admin_users(user_id, email)
values ('UUID-ของ-user', 'admin@โดเมนของคุณ.com');
```

> ห้ามนำ `SUPABASE_SERVICE_ROLE_KEY` ไปใส่ใน HTML/JavaScript ฝั่ง Browser

---

# 2) ตั้งค่า Stripe

สร้าง/ยืนยันบัญชี Stripe และเปิด Payment methods ที่ต้องการใช้

สำหรับเว็บนี้รองรับ:

- Card
- PromptPay

สร้าง Webhook endpoint:

```text
https://YOUR-DOMAIN.com/api/stripe-webhook
```

เลือก Events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
```

Copy Webhook signing secret (`whsec_...`)

> ตอนพัฒนาควรใช้ Test keys ก่อน เมื่อทดสอบครบแล้วจึงเปลี่ยนเป็น Live keys

---

# 3) ตั้งค่า Cloudflare Turnstile

1. สร้าง Turnstile widget สำหรับโดเมนร้าน
2. ตั้ง Allowed Hostnames ให้เฉพาะโดเมนจริงและโดเมน Preview/Staging ที่ต้องใช้
3. เก็บ Site Key และ Secret Key
4. Checkout จะไม่สร้างออเดอร์หาก Server ตรวจ token ไม่ผ่าน

Environment ที่ใช้:

```text
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

---

# 4) Environment Variables บน Vercel

Vercel > Project > Settings > Environment Variables

เพิ่ม:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

ตัวอย่างชื่ออยู่ใน `.env.example`

หลังแก้ Environment Variables ต้อง Redeploy

---

# 5) Deploy ขึ้น Vercel

วิธีแนะนำ:

1. Push โฟลเดอร์นี้ขึ้น GitHub
2. เข้า Vercel
3. Add New Project
4. Import Repository
5. ใส่ Environment Variables
6. Deploy
7. หลังได้ Domain จริง ให้ตั้ง Stripe Webhook เป็น Domain นั้น
8. Vercel จะรัน `npm run build` เพื่อสร้าง `tailwind.generated.css`
9. ทดสอบ `/api/health`

ตัวอย่าง:

```text
https://your-domain.com/api/health
```

ควรได้ JSON ลักษณะ:

```json
{
  "ok": true,
  "database": "connected",
  "stripeConfigured": true,
  "turnstileConfigured": true
}
```

---

# 6) Flow การทำงานจริง

## ลูกค้า

```text
หน้าร้าน
  ↓
เลือกสินค้า
  ↓
Checkout
  ↓
Server ตรวจราคา + Stock + Coupon จากฐานข้อมูล
  ↓
สร้าง Order
  ├─ COD → เข้า Admin ทันที
  └─ Card / PromptPay → Stripe Checkout
                         ↓
                    Stripe Webhook
                         ↓
                     Payment = Paid
                         ↓
                     เข้า Admin
```

## Admin

```text
login.html
  ↓
Supabase Auth
  ↓
ตรวจ admin_users
  ↓
admin.html
  ├─ Dashboard
  ├─ Products CRUD
  ├─ Upload Product Image
  ├─ Orders
  ├─ Payment Status
  ├─ Tracking
  └─ Customer PII deletion
```

---

# 7) สิ่งที่ต้องแก้เป็นข้อมูลธุรกิจจริงก่อนเปิดรับลูกค้า

ตรวจในเว็บให้ตรงกับร้านจริง:

- LINE Official / ช่องทางติดต่อ
- ชื่อผู้ประกอบการ/ชื่อร้านที่ใช้จริง
- นโยบายคืนสินค้า/คืนเงิน
- ระยะเวลาจัดส่ง
- ข้อมูลภาษี/ใบเสร็จ (ถ้ามี)
- Domain จริง
- Stripe Live account
- ข้อความ Privacy / Terms ให้ตรงกับกระบวนการธุรกิจจริง

ไฟล์ที่เกี่ยวข้อง:

```text
privacy.html
terms.html
index.html
```

---

# 8) ไฟล์สำคัญ

```text
index.html                  หน้าร้าน
script.js                   Logic หน้าร้าน
login.html / login.js       Admin Login
admin.html / admin.js       ระบบหลังบ้าน
payment-success.html        หน้ากลับจาก Stripe
data-store.js               Supabase client/data layer
api/                        Server-side Vercel Functions
lib/                        Server helpers
supabase/001_production_schema.sql
.env.example
vercel.json
```

## Security note

`SUPABASE_ANON_KEY` ใช้บน Browser ได้เมื่อ RLS ถูกตั้งถูกต้อง แต่ `SUPABASE_SERVICE_ROLE_KEY` และ `STRIPE_SECRET_KEY` เป็น Secret และต้องอยู่เฉพาะ Environment Variables ฝั่ง Server เท่านั้น
