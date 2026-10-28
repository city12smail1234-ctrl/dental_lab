# City Smile Dental Lab

منصة لمعمل أسنان ومتجر مستلزمات: حسابات أطباء، حالات معملية وملفاتها، متجر وسلة وطلبات، حساب مالي لكل دكتور، توصيل، إشعارات، تقارير، ولوحة إدارة حسب الدور.

**Monorepo:** `apps/web` (Next.js) · `apps/api` (NestJS) · `supabase` (PostgreSQL).

## التشغيل المحلي
1. انسخ `.env.example` إلى `.env` واملأه (مفاتيح Supabase).
2. في Supabase SQL Editor نفّذ ملفات `supabase/migrations/0001…0014` بالترتيب (أو `all_migrations.sql` لمشروع جديد فاضي).
3. `npm install`
4. `npm run dev:api` (الـ API على 4000، و`/docs` للتوثيق) و`npm run dev:web` (الموقع على 3000).

## النشر
راجع **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Supabase + Render + Vercel، قائمة الفحص، الأمان، النسخ الاحتياطي).

## أول مالك
سجّل حساب عادي، ثم في SQL Editor:
```sql
insert into public.user_roles(user_id, role)
select id, 'super_admin' from auth.users where email = 'ايميلك@gmail.com';
```

## المعمارية
- Next.js للواجهة فقط. NestJS هو الـ backend الوحيد لمنطق العمل والصلاحيات.
- Supabase: قاعدة البيانات، المصادقة، التخزين، Realtime. العمليات الحساسة (الطلبات، المخزون، الحالات، الحساب المالي، التوصيل) تتم داخل دوال SQL ذرّية، وسياسات RLS طبقة حماية إضافية.
- الأسعار والإجماليات بتتحسب في السيرفر من قاعدة البيانات، ولا يُوثق في أي قيمة من المتصفح.
