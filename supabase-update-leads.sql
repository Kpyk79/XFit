-- ============================================================
-- Оновлення бази XFit: позначка «Оброблено» для заявок з сайту.
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
-- Без цього оновлення позначка зберігається лише в браузері адміністратора.
-- ============================================================

alter table leads add column if not exists handled_at timestamptz;

-- Змінювати заявки (ставити позначку) може лише залогінений адміністратор
drop policy if exists "Admin update leads" on leads;
create policy "Admin update leads" on leads for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
