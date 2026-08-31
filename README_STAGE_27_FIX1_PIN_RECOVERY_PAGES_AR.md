# Hala Talab Admin — Stage 27 FIX1

- فصل استرجاع PIN العملاء في صفحة مستقلة داخل إدارة النظام.
- فصل استرجاع PIN الشركاء في صفحة مستقلة مع فلتر المتاجر / السائقين.
- إشعار استرجاع PIN يفتح الصفحة الصحيحة ويحدد الطلب نفسه.
- مدة رمز الاسترجاع أصبحت 30 دقيقة، ولمرة واحدة فقط.
- صفحة الدعم لم تعد تعرض طلبات PIN حتى لا تختلط مع محادثات الدعم.

## SQL المطلوب بعد Stage 27
شغّل مرة واحدة:
`admin_stage27_fix1_pin_recovery_30min.sql`


Stage 27 FIX2: PIN recovery pages and admin notifications now update through Supabase Realtime without manual browser refresh.
