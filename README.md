# Corporate HSE audits, Orascom Construction

سيستم واحد لأوديتات الـ HSE على كل المشاريع، فيه تلات أنواع:

- **Flash Audit** (F-HSE-0075): 109 بند على 13 موضوع، كل بند Yes أو No أو N/A، والسكور هو نسبة الـ Yes.
- **HSE Audit** (F-HSE-078): الأوديت الكامل بسكور الشركة.
- **Lifting** (F-HSE-0175): تقييم عمليات الرفع.

الخطوات واحدة للتلاتة: الأوديتور يعمل الأوديت ويبعته للاعتماد، والأدمن أو الـ Approver يعتمده ويبعت الإيميل للمشروع، والمشروع يقفل الـ NCRs من اللينك من غير دخول، والأدمن والأوديتور يتابعوا. محدش يعتمد أوديت كان فيه.

- الصفحة الأولى: https://hsescct-sudo.github.io/orascom-hse-audit/start/
- السيستم: https://hsescct-sudo.github.io/orascom-hse-audit/audit/
- التفاصيل والتشغيل: `audit/README.md`
- السيرفر (Supabase): ملفات `supabase/audit-*.sql` بالترتيب.

نظام الفلاش القديم (دخول المشاريع بباسورد) اتلغى. جداوله القديمة في الداتابيز (`audits`, `findings`, ...) مش مستخدمة، ومش اتمسحت.
