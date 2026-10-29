/* ============================================================
   Налаштування Supabase для сайту XFit.

   1. Створи безкоштовний проєкт на https://supabase.com
   2. У SQL Editor виконай скрипт з файлу supabase-schema.sql
      (він у корені проєкту)
   3. У Authentication → Users додай одного адміністратора
      (Email + Password) — саме цим паролем адмін входитиме на сайті
   4. У Project Settings → API скопіюй "Project URL" та "anon public" ключ
      і встав їх нижче замість плейсхолдерів
   5. У поле ADMIN_EMAIL встав той самий email, що і в Authentication → Users

   Якщо залишити плейсхолдери — сайт продовжить працювати у
   локальному режимі (як раніше): зміни бачить лише той самий браузер.
   ============================================================ */
window.XFIT_SUPABASE_URL = 'https://uzjwqderiuqxvdnypkzp.supabase.co';
window.XFIT_SUPABASE_ANON_KEY = 'sb_publishable_wKfYmcXKbtk8V_CJwc97Og_lWmIrGZ8';
window.XFIT_ADMIN_EMAIL = 'gwosd79@gmail.com';
