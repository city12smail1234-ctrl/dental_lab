# دليل النشر — City Smile Dental Lab

الهدف: موقع شغال على الإنترنت للأطباء الحقيقيين. المكونات التلاتة:

| المكوّن | بيشتغل فين | الملف/المجلد |
|---|---|---|
| الموقع (Next.js) | Vercel | `apps/web` |
| الـ API (NestJS) | Render (أو أي استضافة Node أو Docker) | `apps/api` |
| قاعدة البيانات والمصادقة والملفات | Supabase | `supabase/all_migrations.sql` |

> **مهم:** اعمل مشروع Supabase **جديد** للإنتاج، منفصل عن مشروع التجربة. كده بيانات التجربة ما تدخلش على بيانات الأطباء الحقيقية، ومفاتيحك اللي استخدمتها في التجربة ما تبقاش هي اللي على الإنترنت.

---

## 0) رفع الكود على GitHub
1. اعمل حساب على github.com، ثم **New repository** باسم `city-smile` واختار **Private**.
2. في الترمنال من مجلد المشروع:
```
git init
git add .
git commit -m "City Smile Dental Lab"
git branch -M main
git remote add origin https://github.com/اسم-حسابك/city-smile.git
git push -u origin main
```
3. **تأكد إن ملف `.env` مارفعش:** اكتب `git status` قبل الـ commit، لازم ما يظهرش `.env`. (الملف `.gitignore` بيمنعه، بس اتأكد.)

## 1) Supabase للإنتاج
1. **New project** — اختار أقرب منطقة، وكلمة سر قوية للقاعدة واحفظها.
2. **SQL Editor ثم New query**، والصق محتوى الملف **`supabase/all_migrations.sql`** كله، واضغط **Run**. لازم تظهر **Success**.
   - الملف ده هو كل التحديثات من 0001 لـ 0014 بالترتيب، لقاعدة جديدة فقط. **ما تشغّلوش على مشروع التجربة** (هيطلع أخطاء إن الجداول موجودة).
3. تأكد من **Storage**: لازم تلاقي `product-images` و`service-images` (عامين)، و`case-files` و`payment-proofs` (**Private**).
4. **Authentication ثم URL Configuration** (هتكملها بعد ما تعرف عنوان الموقع، خطوة 4).
5. **Authentication ثم Providers ثم Email:** خلّي **Confirm email** مفعّل.
6. **إيميل الإنتاج (مهم):** خدمة الإيميل الافتراضية في Supabase محدودة جدًا (عدد قليل في الساعة) ومش مناسبة للأطباء. من **Project Settings ثم Authentication ثم SMTP Settings** اربط خدمة بريد (Brevo أو Resend أو Gmail بكلمة مرور تطبيق).
7. **تسجيل Google (اختياري):** في Google Cloud Console اعمل **OAuth client** نوع Web، وحط في **Authorized redirect URIs**:
   `https://<كود-مشروعك>.supabase.co/auth/v1/callback`
   وبعدين الصق الـ Client ID والـ Secret في **Authentication ثم Providers ثم Google** في Supabase وفعّله.
8. **المفاتيح:** من **Project Settings ثم API Keys** خد: الرابط (Project URL) و**Publishable key** و**Secret key**.

## 2) الـ API على Render
1. على render.com اعمل حساب واربطه بـ GitHub.
2. **New ثم Blueprint** واختار مستودعك (هيقرا `render.yaml`). أو **New ثم Web Service** يدويًا بالإعدادات دي:
   - Root Directory: `apps/api`
   - Build Command: `npm install --include=dev && npm run build`  (**لازم `--include=dev`**، وإلا البناء بيفشل برسالة `nest: not found` لأن Render بيتخطى أدوات البناء في وضع الإنتاج)
   - Start Command: `npm run start`
   - Health Check Path: `/health`
3. المتغيرات (Environment):

| الاسم | القيمة |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | رابط مشروع الإنتاج |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret key** (للـ API فقط) |
| `WEB_ORIGIN` | مؤقتًا `http://localhost:3000` (هتغيّره في خطوة 4) |

4. بعد ما يخلص النشر هتاخد عنوان زي `https://city-smile-api.onrender.com`. افتح `/health` على العنوان ده، لازم تشوف `{"status":"ok"...}`.
5. **ملاحظة:** الخطة المجانية بتنام بعد فترة من عدم الاستخدام، فأول طلب بعدها بياخد 30-60 ثانية. للإنتاج الحقيقي استخدم خطة مدفوعة (Starter).
6. بديل: أي سيرفر عليه Docker: `docker compose up -d --build` (بيقرا `.env`).

## 3) الموقع على Vercel
1. على vercel.com اعمل حساب واربطه بـ GitHub، ثم **Add New ثم Project** واختار المستودع.
2. **Root Directory:** `apps/web` (Framework: Next.js يتعرف تلقائيًا).
3. **Environment Variables:**

| الاسم | القيمة |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | رابط مشروع الإنتاج |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Publishable key** |
| `NEXT_PUBLIC_API_URL` | عنوان الـ API من Render (من غير `/` في الآخر) |

> ❌ **ما تحطش الـ Secret key في Vercel أبدًا.** هو للـ API بس.

4. اضغط **Deploy**. هتاخد عنوان زي `https://city-smile.vercel.app`.
5. أي تعديل في متغيرات `NEXT_PUBLIC_*` محتاج **Redeploy**، لأنها بتتثبّت وقت البناء.

## 4) ربط الأجزاء ببعض
1. **Render ثم Environment:** غيّر `WEB_ORIGIN` لعنوان Vercel (ولو عندك دومين خاص ضيفه بعد فاصلة):
   `https://city-smile.vercel.app,https://www.دومينك.com`
   وبعدين **Manual Deploy**.
2. **Supabase ثم Authentication ثم URL Configuration:**
   - **Site URL:** عنوان الموقع.
   - **Redirect URLs:** ضيف `https://عنوان-موقعك/**`.
3. (اختياري) **دومين خاص:** في Vercel **Settings ثم Domains**، وعدّل الـ DNS عند مزوّد الدومين زي ما Vercel بيقولك. الـ HTTPS بيتفعّل تلقائيًا.

## 5) أول مالك (Owner)
1. افتح الموقع واعمل حساب عادي بإيميلك وفعّله من الرسالة.
2. في Supabase **SQL Editor** (استبدل الإيميل):
```sql
insert into public.user_roles(user_id, role)
select id, 'super_admin' from auth.users where email = 'ايميلك@gmail.com';
```
3. ادخل على `/admin`. ومن `/admin/staff` ضيف باقي الموظفين.
4. من `/admin/settings` اكتب بيانات المعمل، ورقم فودافون كاش وإنستاباي، ورسوم التوصيل. ومن `/admin/prices` و`/admin/products` ضيف الأسعار والمنتجات الحقيقية.

---

## قائمة الفحص قبل ما أول دكتور حقيقي يدخل
جرّب بحسابين دكاترة (واحد منهم في نافذة Incognito) وحساب الأدمن:

- [ ] التسجيل بالإيميل بيوصّل رسالة التفعيل فعلًا (وجرّب Google لو فعّلته).
- [ ] دكتور جديد بيظهر "قيد المراجعة" ومايقدرش يبعت حالة أو طلب لحد ما توافق عليه.
- [ ] الدكتور بيبعت حالة بملف، والأدمن بيشوفها باسم الدكتور وبيفتح الملف.
- [ ] تغيير حالة الحالة عند الأدمن بيوصّل إشعار للدكتور.
- [ ] طلب متجر بكل طريقة دفع (كاش، فودافون كاش + إيصال، إنستاباي + إيصال)، والمخزون بينقص، والإلغاء بيرجّعه.
- [ ] **عزل البيانات:** الدكتور الأول يحاول يفتح رابط حالة أو طلب أو ملف تبع الدكتور التاني (انسخ الرابط) → لازم "غير موجود".
- [ ] دكتور عادي يفتح `/admin` → بيتحوّل لصفحته. والـ API بيرفض `/admin/...` بدون صلاحية.
- [ ] `https://عنوان-الـ-API/docs` **مقفول** (404) في الإنتاج.
- [ ] كشف حساب الدكتور بيطلع المطالبات صح، وتسجيل الدفعة بينزّل الرصيد.
- [ ] التوصيل: تغيير الحالة بيتزامن مع الطلب، وتسجيل اسم المستلم.
- [ ] الموقع كله شغال على الموبايل (عربي + إنجليزي + الوضع الداكن).

## الأمان — لازم تتأكد منه
- **الـ Secret key** موجود في Render **فقط**. لو اتعرض في أي مكان (صورة، رسالة)، اعمل له **Rotate** من Supabase وحدّثه في Render.
- كلمة سر قوية لحساب المالك. **المصادقة الثنائية للأدمن لسه ما اتبنتش في الموقع** (Supabase بتدعمها، لكن شاشتها محتاجة تتعمل). لحد ما تتعمل: كلمة سر طويلة وفريدة، وفعّل التحقق بخطوتين على الإيميل نفسه.
- لا تنشر `.env` ولا ترفعه على GitHub.
- الـ API فيه حد للطلبات (100 في الدقيقة لكل عنوان)، وهيدرات أمان على الـ API والموقع.
- الموقع بيحتفظ بكود المريض الداخلي فقط. راجع متطلبات حماية البيانات الشخصية المطبّقة عندك (قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020) واستشر مختصًا قانونيًا.

## النسخ الاحتياطي
- **قاعدة البيانات:** خطط Supabase المدفوعة فيها نسخ يومية تلقائية. على الخطة المجانية اعمل نسخة يدوية بانتظام: **Project Settings ثم Database** وخد الـ connection string، وبعدين `pg_dump "رابط-الاتصال" > backup.sql`، واحفظ الملف في مكان آمن خارج الجهاز.
- **الملفات (Storage):** مش بتدخل في نسخة القاعدة. حمّل `case-files` و`payment-proofs` دوريًا أو استخدم نسخًا مجدولًا.
- جرّب **الاسترجاع** مرة على مشروع تجريبي قبل ما تحتاجه فعلًا.

## المراقبة
- سجلات الـ API: Render ثم **Logs**. سجلات الموقع: Vercel ثم **Logs**. سجلات القاعدة والمصادقة: Supabase ثم **Logs**.
- اعمل مراقبة مجانية (مثل UptimeRobot) على `https://عنوان-الـ-API/health` كل 5 دقايق، وهتوصلك رسالة لو وقع. (وكمان بتخلّي الخطة المجانية ما تنامش.)
- من لوحة الأدمن (`/admin`) لو ظهر شريط أحمر بيقولك أي جدول أو دالة ناقصة.

## التحديثات بعد النشر
1. جرّب التعديل على جهازك.
2. لو فيه ملف SQL جديد: نفّذه في Supabase الإنتاج **الأول**.
3. `git add . && git commit -m "..." && git push` → Render وVercel بيحدّثوا نفسهم تلقائيًا.

## حل المشاكل

| المشكلة | السبب والحل |
|---|---|
| `Failed to fetch` في الموقع | `NEXT_PUBLIC_API_URL` غلط، أو الـ API نايم/واقف (افتح `/health`)، أو `WEB_ORIGIN` مش مطابق لعنوان الموقع بالظبط (من غير `/` في الآخر). |
| تسجيل الدخول بـ Google بيرجّع لعنوان غلط | **Site URL** و**Redirect URLs** في Supabase. |
| الإيميل مش بيوصل | اربط SMTP خاص (خطوة 1.6). |
| الـ API مش بيشتغل ومكتوب `Invalid environment` | متغير ناقص أو غلط في Render (السجلات بتقولك أنهي واحد). |
| أخطاء في صفحة الأدمن واللوحة الرئيسية فيها شريط أحمر | ملف SQL ناقص. نفّذ `all_migrations.sql` على قاعدة جديدة فقط. |
| الصور مش بتظهر | تأكد إن `product-images` و`service-images` **Public**. |

## اللي لسه ما اتبنيش (من المواصفات)
الفواتير الرسمية (كشف الحساب هو الأساس حاليًا)، العروض والخصومات، متغيرات المنتجات، إشعارات البريد وWeb Push، المصادقة الثنائية للأدمن، ضبط حالات الحالات حسب الخدمة، واختبارات آلية (Jest وPlaywright). الموقع جرى فحصه على قاعدة بيانات حقيقية وببناء كامل، بس **لازم تجرّب قائمة الفحص أعلاه على نسختك** قبل الاعتماد عليه.

## تنبيهات واتساب / تيليجرام (اختياري)
راجع `docs/ALERTS.md`. مهم: لو الـ API على خطة مجانية بتنام، الرسائل هتتأخر لحد ما يصحى.

## بدون فيزا: الـ API على Vercel (بدل Render)
لو Render طلب فيزا، شغّل الـ API على Vercel كمشروع تاني من نفس الـ repository:
1. Vercel ثم **Add New ثم Project**، اختار نفس الـ repository، و**Root Directory = `apps/api`**، و**Framework Preset = Other**. (الأوامر جاهزة في `apps/api/vercel.json`.)
2. المتغيرات: `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` (الـ Secret key، هنا بس) و`WEB_ORIGIN` (عنوان الموقع بالظبط، من غير `/` في الآخر) و`DISABLE_OUTBOX=true`.
3. بعد النشر افتح `عنوان-الـAPI/health`، لازم تشوف `{"status":"ok"}`.
4. في مشروع **الموقع**: `NEXT_PUBLIC_API_URL` = عنوان الـ API الجديد، و`NEXT_PUBLIC_MAX_UPLOAD_MB=4`، ثم **Redeploy**.

**حدود لازم تعرفها:** حجم أي طلب على Vercel حوالي 4.5MB (فالملفات الأكبر مش هتترفع)، وأول طلب بعد فترة سكون بياخد ثانية أو اتنين، ومفيش مؤقت شغال في الخلفية. تنبيهات واتساب وتيليجرام محتاجة جدولة خارجية: ضيف `CRON_SECRET`، واجعل أي خدمة جدولة مجانية (cron-job.org مثلًا) تبعت كل دقيقة: `POST عنوان-الـAPI/internal/outbox/tick` وفيه الهيدر `x-cron-secret: القيمة`.
