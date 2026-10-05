# HSE Flash Audit System — Orascom Construction

نظام لإدارة أوديتات الـ HSE Flash Audit لكل المشاريع:
- كل مشروع يدخل بباسورد خاص بيه ويشوف بياناته بس. الإدارة تشوف كل المشاريع وتعدّل وتمسح أي حاجة.
- فورمة أوديت (109 بند على 13 موضوع) بالصور، تشتغل من الموبايل في الموقع.
- رفع تقارير Excel بفورمة F-HSE-0075 بالصور، وتتحفظ وتظهر في الـ Dashboard.
- Findings Register بفلاتر وتصدير Excel.
- إقفال الملاحظات: المشروع يرفع الإجراء وصورة الإقفال، والإدارة توافق أو ترجّعها بتعليق.
- Dashboard بشكل Power BI (فلاتر، تغطية المشاريع، أعمار الملاحظات، جدول أداء المشاريع، وضع العرض Full screen).
- تنزيل تقرير أي أوديت Excel (F-HSE-0075) أو PowerPoint بالصور، وتنزيل ملخص الـ Dashboard كـ PowerPoint (charts قابلة للتعديل) أو Excel.
- **أبلكيشن أندرويد (HSE-Audit.apk):** بيتنزّل من صفحة الدخول (Install the app on this phone ← Download the Android app) أو من `downloads/HSE-Audit.apk`. الكاميرا والمعرض ورفع الـ Excel شغالين، والتقارير بتتحفظ في Downloads ← HSE Audit.
- **الآيفون (PWA):** Safari ← Share ← Add to Home Screen. يفتح full screen والكاميرا تفتح منه مباشرة.
- **Settings من غير كود:** تعديل الـ Checklist (topics وبنود وخطورة)، قائمة الـ Root causes، الـ Dashboard (العنوان، الأهداف، الرسومات اللي تظهر)، وعناوين التقارير.
- **رفع أي شيت Excel:** مش لازم فورمة F-HSE-0075؛ السيستم بيتعرف على الأعمدة من العناوين (عربي أو إنجليزي) وتقدر تعدّل التوصيل، والصور على الشيت أو جوه الخلايا (Excel 365 و WPS) بتتسحب، والتعليقات بتتضاف.
- **صفحة Help** بالعربي والإنجليزي للإدارة والمشاريع.
- مسح البيانات للإدارة: تحديد ملاحظات أو أوديتات ومسحها مرة واحدة، أو مسح بيانات مشروع أو فترة كاملة من **Projects ← Delete data**.

---

## خطوات التشغيل (مرة واحدة، حوالي 30 دقيقة)

### 1) اعمل مشروع على Supabase
1. ادخل [supabase.com](https://supabase.com) واعمل حساب.
2. اضغط **New project**:
   - **Name:** `orascom-hse-audit`
   - **Database Password:** باسورد قوي، واحفظه عندك.
   - **Region:** اختار **Central EU (Frankfurt)** أو **South Asia (Mumbai)**. مفيش region في الشرق الأوسط على Supabase.
3. استنى دقيقتين لحد ما المشروع يجهز.

### 2) شغّل ملف قاعدة البيانات
1. من القائمة الشمال: **SQL Editor** ← **New query**.
2. افتح الملف `supabase/schema.sql` من الـ repo، انسخ محتواه كله، والصقه.
3. اضغط **Run**. المفروض يظهر `Success`.
   > الملف ده بيعمل الجداول وقواعد الحماية، وبيعمل مكان تخزين الصور `audit-photos` (private). تقدر تشغّله تاني من غير ما البيانات تتمسح.

### 3) اقفل التسجيل العام (مهم جدًا للأمان)
**Authentication** ← **Sign In / Providers** (أو **Settings**) ← اقفل **Allow new users to sign up** ← **Save**.
كده محدش يقدر يعمل حساب لنفسه، والحسابات بتتعمل من جوه السيستم بس.

### 4) اعمل حساب الأدمن الأول (حسابك)
1. **Authentication** ← **Users** ← **Add user** ← **Create new user**.
2. اكتب إيميلك وباسورد، وعلّم على **Auto Confirm User** ← **Create user**.
3. ارجع لـ **SQL Editor** ← **New query** وشغّل الأمر ده بعد ما تحط إيميلك واسمك:
   ```sql
   insert into public.profiles (user_id, role, display_name)
   select id, 'admin', 'Antonios Shawky' from auth.users where email = 'YOUR-EMAIL@orascom.com';
   ```
   المفروض يظهر `INSERT 0 1`.

### 5) ارفع الـ function الخاصة بإدارة الحسابات
دي اللي بتعمل باسوردات المشاريع وحسابات الأدمن.
1. **Edge Functions** ← **Deploy a new function** ← **Via Editor**.
2. **اسم الـ function لازم يكون بالظبط:** `admin-users`
3. امسح الكود اللي في المحرر، وانسخ مكانه محتوى الملف `supabase/functions/admin-users/index.ts`.
4. اضغط **Deploy function**.
5. افتح الـ function ← **Details**. لو فيه اختيار اسمه **Verify JWT** (أو **Enforce JWT verification**)، اقفله واحفظ. الـ function نفسها بتتأكد إن اللي بيكلمها أدمن.

### 6) حط بيانات الربط في الكود
1. **Project Settings** ← **API** (أو **API Keys**). خد حاجتين:
   - **Project URL** (زي `https://abcdxyz.supabase.co`)
   - **anon public key**. لو المشروع جديد ومش لاقيه، خد الـ **publishable key**.
2. افتح الملف `js/config.js` وحطهم:
   ```js
   window.HSE_CONFIG = {
     supabaseUrl: "https://abcdxyz.supabase.co",
     supabaseKey: "eyJhbGciOi....",
   };
   ```
   > المفتاح ده معمول علشان يبقى public وآمن يتحط في الكود، لأن قواعد قاعدة البيانات هي اللي بتحدد كل login يشوف إيه. **أوعى تحط الـ service_role أو الـ secret key هنا.**

### 7) انشر الموقع على GitHub Pages
1. في الـ repo على GitHub: **Settings** ← **Pages**.
2. **Source:** `Deploy from a branch` ← **Branch:** `main` و `/ (root)` ← **Save**.
3. بعد دقيقة أو اتنين يظهر اللينك، مثلًا: `https://hsescct-sudo.github.io/orascom-hse-audit/`

### 8) أول استخدام
1. افتح اللينك ← **Administration** ← ادخل بإيميلك وباسوردك.
2. **Projects** ← **Import list from Excel**: ملف فيه أعمدة `Project, Code, Location, Project Manager, Client` (أو ضيف المشاريع واحد واحد بـ **Add project**).
3. اضغط **Create logins**. السيستم هيعمل باسورد لكل مشروع وينزّلك ملف Excel بيهم. ابعت لكل مشروع الباسورد بتاعه بس.
4. لو عايز تضيف أدمن تاني (مثلًا Riham أو Noha): **Administrators** ← **Add administrator**.

---

### 9) تحديث قاعدة البيانات لصفحة Settings (مرة واحدة)
لو السيستم كان شغال قبل إضافة صفحة Settings، شغّل الجزء الخاص بـ `app_settings` من `supabase/schema.sql` في SQL Editor (أو الملف كله، آمن يتشغل أكتر من مرة). صفحة Settings نفسها بتعرض الكود ده لو الجدول مش موجود.

## ملاحظات مهمة
- **الخطة المجانية في Supabase بتتوقف لو محدش استخدم السيستم أسبوع.** وقت الحملة غالبًا مش هتفرق، بس لو السيستم هيتعمم على الشركة اشترك في **Pro** (25 دولار في الشهر)، وفيها كمان backup يومي.
- الصور بتتضغط قبل الرفع (حوالي 200 لـ 400 KB للصورة). الخطة المجانية فيها 1 GB، يعني تقريبًا 3,000 صورة.
- **مسح البيانات:** المسح نهائي ومعاه الصور. نزّل الـ Register أو التقارير قبلها لو محتاجها. المشاريع والباسوردات وحسابات الأدمن مبتتمسحش من **Delete data**.
- **تعديل الباسوردات:** من **Projects** ← **Change password**. الباسورد القديم بيقف على طول.
- **لو حد نسي باسورد الأدمن:** من Supabase ← **Authentication** ← **Users** ← اختار المستخدم ← **Send password recovery**، أو أدمن تاني يغيّره من **Administrators**.
- **دومين خاص بدل github.io:** من **Settings** ← **Pages** ← **Custom domain** (محتاج IT يعمل CNAME).
- **قواعد الإقفال:**
  - الملاحظة اللي بيرفعها المشروع على أنها "اتصلحت في ساعتها" بتروح **Pending review** لحد ما الإدارة توافق.
  - الأدمن لو صلّحها في ساعتها بتتقفل على طول.
  - بعد ما الأوديت يتعمل له Submit، المشروع ميقدرش يعدّل الملاحظات. يقدر بس يرفع إقفال ويكتب تعليقات.

---

## For IT / reviewers (English)

**Stack:** static site (HTML/JS modules, no build step) on GitHub Pages · Supabase (Postgres, Auth, Storage, one Edge Function).

**Security model**
- Row Level Security on every table. A project login (one Supabase Auth user per project, e-mail `p-<project-uuid>@projects.hse-audit.internal`, password set by an administrator) can read and write only rows whose `project_id` is its own project. Administrators (rows in `profiles` with `role = 'admin'`) can read and write everything.
- Business rules are enforced in the database by triggers, not only in the UI: projects cannot change submitted audits or close findings directly; closures go through `submit_closure` → `review_closure` (admin only). Findings and photos always inherit the project of their audit.
- Photos are in a **private** bucket (`audit-photos/<project_id>/<finding_id>/…`) with storage policies matching the table rules; the app shows them through short-lived signed URLs.
- Public sign-up must be disabled (step 3). The browser only holds the anon/publishable key. The `admin-users` Edge Function uses the service key server-side and checks that the caller is an administrator before creating or changing logins.
- The app records the person's name with each action (project logins are shared per project).

**Files**
| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/`, `assets/` | the web app |
| `js/config.js` | Supabase URL + anon/publishable key (public by design) |
| `supabase/schema.sql` | tables, RLS policies, triggers, workflow functions, storage bucket and policies (idempotent) |
| `supabase/functions/admin-users/index.ts` | Edge Function for project passwords and administrator accounts |
| `android/` | Android app (`com.orascom.hseaudit`): a WebView shell for the live site with camera/gallery pickers, Excel file picking and a download bridge (`window.HSEAndroid`, used by `saveBlob` in `js/ui.js`) |
| `.github/workflows/android.yml` | builds the APKs on GitHub and opens the debug build on an emulator; results on the `apk-build` branch |
| `downloads/HSE-Audit.apk` | the signed Android app. The release APK is signed (APK Signature Scheme v2) with the HSE Audit key, which is kept outside this repository; keep the same key for every update or phones will refuse to update |
| `.github/workflows/android-verify.yml` | checks the published APK with Google's `apksigner` and installs it on an emulator; results on the `apk-verify` branch |

**Tested** against Supabase Auth v2.180, PostgREST 12 and Postgres 16 (68 automated security/workflow checks, plus end-to-end browser runs for admin and project roles), including import of a real F-HSE-0075 report with 42 photos.
