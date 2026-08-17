-- สร้าง User ก่อนใน Supabase Authentication > Users แล้วนำ UUID มาแทนค่า
insert into public.admin_users(user_id, email)
values ('PASTE-AUTH-USER-UUID-HERE', 'admin@yourdomain.com');
