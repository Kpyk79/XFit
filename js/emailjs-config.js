/* ============================================================
   Налаштування EmailJS — щоб заявки з форми контактів
   надходили тобі на email (без бекенду).

   1. Створи безкоштовний акаунт на https://www.emailjs.com
      (безкоштовний тариф — ~200 листів/міс)
   2. Email Services → Add New Service → підключи свою Gmail-пошту
      (або іншу) → скопіюй Service ID
   3. Email Templates → Create New Template. Використай змінні
      {{name}}, {{phone}}, {{message}} у тексті листа, наприклад:

        Нова заявка з сайту XFit
        Ім'я: {{name}}
        Телефон: {{phone}}
        Повідомлення: {{message}}

      Збережи і скопіюй Template ID
   4. Account → General → скопіюй Public Key
   5. Встав усі три значення нижче замість плейсхолдерів

   Якщо залишити плейсхолдери — email просто не надсилатиметься
   (заявки й далі зберігатимуться в Supabase, якщо він налаштований).
   ============================================================ */
window.XFIT_EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
window.XFIT_EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
window.XFIT_EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';
