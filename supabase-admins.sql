-- ============================================================
-- XFit: адміністратори залів і права доступу (RLS).
-- Це точний знімок того, що працює в живій базі (знято 2026-11-14).
-- Виконувати ПІСЛЯ supabase-schema.sql і supabase-update-*.sql:
-- файл замінює їхні старі політики «будь-який залогінений = адмін»
-- на правила за залом. Повторний запуск безпечний.
--
-- Ролі:
--   gym = null        → власник: бачить і змінює все
--   gym = 'podilsk'   → адмін залу Подільськ (лише свої дані)
--   gym = 'balta'     → адмін залу Балта
-- Новий адмін: створи користувача в Supabase → Authentication, потім
--   insert into admin_profiles (user_id, gym) values ('<uuid>', 'podilsk');
-- ============================================================

-- ---------- Колонка «зал» у таблицях з даними залів ----------
alter table announcements add column if not exists gym text not null default '';
alter table leads         add column if not exists gym text not null default '';
alter table members       add column if not exists gym text not null default '';

-- ---------- Хто адміністратор ----------
create table if not exists admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gym text,
  created_at timestamptz not null default now()
);
alter table admin_profiles drop constraint if exists admin_profiles_gym_check;
alter table admin_profiles add constraint admin_profiles_gym_check check (gym = any (array['podilsk', 'balta']));
alter table admin_profiles enable row level security;

-- ---------- Допоміжні функції (security definer, щоб читати admin_profiles без політики) ----------
create or replace function admin_gym()
returns text language sql stable security definer set search_path = public as $$
  select p.gym from admin_profiles p where p.user_id = auth.uid();
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_profiles p where p.user_id = auth.uid());
$$;

create or replace function is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_profiles p where p.user_id = auth.uid() and p.gym is null);
$$;

-- slug залу → назва, як вона записана в members.gym / leads.gym
create or replace function gym_name(p_slug text)
returns text language sql immutable set search_path = public as $$
  select case p_slug when 'podilsk' then 'Подільськ' when 'balta' then 'Балта' else '' end;
$$;

-- ---------- Прибираємо старі політики зі схеми (вони пускали будь-якого залогіненого) ----------
drop policy if exists "Admin manage members"    on members;
drop policy if exists "Admin write content"     on site_content;
drop policy if exists "Admin write photos"      on site_photos;
drop policy if exists "Admin write announcements" on announcements;
drop policy if exists "Admin write settings"    on site_settings;
drop policy if exists "Admin read leads"        on leads;
drop policy if exists "Admin delete leads"      on leads;
drop policy if exists "Admin update leads"      on leads;

-- ---------- Нові політики ----------
drop policy if exists "Admin read own profile" on admin_profiles;
create policy "Admin read own profile" on admin_profiles for select
  using (user_id = auth.uid() or is_owner());

drop policy if exists "Gym admin manage members" on members;
create policy "Gym admin manage members" on members for all
  using (is_owner() or (is_admin() and gym = gym_name(admin_gym())))
  with check (is_owner() or (is_admin() and gym = gym_name(admin_gym())));

-- Тексти, фото, налаштування: ключі залу мають вигляд 'podilsk:...'
drop policy if exists "Gym admin write content" on site_content;
create policy "Gym admin write content" on site_content for all
  using (is_owner() or (is_admin() and key like admin_gym() || ':%'))
  with check (is_owner() or (is_admin() and key like admin_gym() || ':%'));

drop policy if exists "Gym admin write photos" on site_photos;
create policy "Gym admin write photos" on site_photos for all
  using (is_owner() or (is_admin() and key like admin_gym() || ':%'))
  with check (is_owner() or (is_admin() and key like admin_gym() || ':%'));

drop policy if exists "Gym admin write settings" on site_settings;
create policy "Gym admin write settings" on site_settings for all
  using (is_owner() or (is_admin() and key like admin_gym() || ':%'))
  with check (is_owner() or (is_admin() and key like admin_gym() || ':%'));

-- Оголошення: тут gym зберігається як slug ('podilsk'), на відміну від members/leads
drop policy if exists "Gym admin write announcements" on announcements;
create policy "Gym admin write announcements" on announcements for all
  using (is_owner() or (is_admin() and gym = admin_gym()))
  with check (is_owner() or (is_admin() and gym = admin_gym()));

-- Заявки: адмін бачить заявки свого залу і загальні (gym = '')
drop policy if exists "Gym admin read leads" on leads;
create policy "Gym admin read leads" on leads for select
  using (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))));

drop policy if exists "Gym admin update leads" on leads;
create policy "Gym admin update leads" on leads for update
  using (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))))
  with check (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))));

drop policy if exists "Gym admin delete leads" on leads;
create policy "Gym admin delete leads" on leads for delete
  using (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))));
