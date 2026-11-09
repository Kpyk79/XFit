-- ============================================================
-- Оновлення бази XFit: два зали — Подільськ і Балта.
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
--
-- • Ролі адміністраторів (admin_profiles):
--     gym = null       — власник: бачить і змінює все;
--     gym = 'podilsk'  — адміністратор Подільська: клієнти, заявки й сторінка Подільська;
--     gym = 'balta'    — адміністратор Балти: те саме для Балти.
--   Усі наявні акаунти адміністратора стають власниками.
--   Новий акаунт (Supabase → Authentication → Add user) не має доступу,
--   доки власник не призначить йому зал в адмінці (Налаштування → Адміністратори).
-- • Сторінки залів: тексти, фото, тренери, списки, розклад, ціни —
--   з префіксом ключа 'podilsk:' / 'balta:'; оголошення — з полем gym.
-- • Заявки отримують поле gym ('Подільськ' / 'Балта' / '' — не вказано).
-- • Нинішні тренери, галерея, ціни, розклад копіюються на сторінку Подільська.
-- ============================================================

-- ---------- Ролі адміністраторів ----------
create table if not exists admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gym text check (gym in ('podilsk', 'balta')),
  created_at timestamptz not null default now()
);
alter table admin_profiles enable row level security;
-- наявні адміністратори → власники (лише коли ролей ще немає зовсім)
insert into admin_profiles (user_id, gym)
select u.id, null from auth.users u
where not exists (select 1 from admin_profiles)
on conflict (user_id) do nothing;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_profiles p where p.user_id = auth.uid());
$$;
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_profiles p where p.user_id = auth.uid() and p.gym is null);
$$;
create or replace function admin_gym() returns text
language sql stable security definer set search_path = public as $$
  select p.gym from admin_profiles p where p.user_id = auth.uid();
$$;
create or replace function gym_name(p_slug text) returns text
language sql immutable set search_path = public as $$
  select case p_slug when 'podilsk' then 'Подільськ' when 'balta' then 'Балта' else '' end;
$$;
revoke all on function is_admin() from public;
revoke all on function is_owner() from public;
revoke all on function admin_gym() from public;
-- анонімним відвідувачам функції повертають «не адміністратор» (правила доступу не падають з помилкою)
grant execute on function is_admin() to anon, authenticated;
grant execute on function is_owner() to anon, authenticated;
grant execute on function admin_gym() to anon, authenticated;

drop policy if exists "Admin read own profile" on admin_profiles;
create policy "Admin read own profile" on admin_profiles for select
  using (user_id = auth.uid() or is_owner());

-- Роль поточного адміністратора: { role: 'owner' | 'gym' | 'none', gym, email }
create or replace function my_admin_role() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'role', case when not exists (select 1 from admin_profiles p where p.user_id = auth.uid()) then 'none'
                 when (select p.gym from admin_profiles p where p.user_id = auth.uid()) is null then 'owner' else 'gym' end,
    'gym', (select p.gym from admin_profiles p where p.user_id = auth.uid()),
    'email', (select u.email from auth.users u where u.id = auth.uid()));
$$;
revoke all on function my_admin_role() from public, anon;
grant execute on function my_admin_role() to authenticated;

-- Список адміністраторів (лише для власника)
create or replace function list_admins() returns table (email text, gym text, has_access boolean, last_sign_in timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden'; end if;
  return query
    select u.email::text, p.gym, p.user_id is not null, u.last_sign_in_at
    from auth.users u left join admin_profiles p on p.user_id = u.id
    order by p.user_id is null, p.gym nulls first, u.email;
end;
$$;
revoke all on function list_admins() from public, anon;
grant execute on function list_admins() to authenticated;

-- Призначити роль: p_role = 'owner' | 'podilsk' | 'balta' | 'none' (забрати доступ)
create or replace function set_admin_role(p_email text, p_role text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_owner() then raise exception 'forbidden'; end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_id is null then raise exception 'user_not_found'; end if;
  if p_role not in ('owner', 'podilsk', 'balta', 'none') then raise exception 'invalid_role'; end if;
  if v_id = auth.uid() and p_role <> 'owner' then raise exception 'cannot_change_self'; end if;
  if p_role = 'none' then
    delete from admin_profiles where user_id = v_id;
  else
    insert into admin_profiles (user_id, gym) values (v_id, nullif(p_role, 'owner'))
    on conflict (user_id) do update set gym = excluded.gym;
  end if;
  return p_role;
end;
$$;
revoke all on function set_admin_role(text, text) from public, anon;
grant execute on function set_admin_role(text, text) to authenticated;

-- ---------- Заявки: зал ----------
alter table leads add column if not exists gym text not null default '';
create or replace function leads_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  new.name := left(trim(coalesce(new.name, '')), 80);
  new.phone := left(trim(coalesce(new.phone, '')), 30);
  new.message := left(coalesce(new.message, ''), 2000);
  new.gym := case when new.gym in ('Подільськ', 'Балта') then new.gym else '' end;
  new.created_at := now();
  if length(new.name) < 2 or length(v_digits) < 9 or length(v_digits) > 15 then
    raise exception 'invalid_data';
  end if;
  if exists (
    select 1 from leads l
    where l.created_at > now() - interval '10 minutes'
      and right(regexp_replace(l.phone, '\D', '', 'g'), 9) = right(v_digits, 9)
  ) then
    raise exception 'too_many_requests';
  end if;
  if (select count(*) from leads l where l.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too_many_requests';
  end if;
  return new;
end;
$$;
revoke all on function leads_guard() from public, anon, authenticated;

drop policy if exists "Admin read leads" on leads;
drop policy if exists "Admin delete leads" on leads;
drop policy if exists "Admin update leads" on leads;
drop policy if exists "Gym admin read leads" on leads;
drop policy if exists "Gym admin update leads" on leads;
drop policy if exists "Gym admin delete leads" on leads;
create policy "Gym admin read leads" on leads for select
  using (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))));
create policy "Gym admin update leads" on leads for update
  using (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))))
  with check (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))));
create policy "Gym admin delete leads" on leads for delete
  using (is_owner() or (is_admin() and (gym = '' or gym = gym_name(admin_gym()))));

-- ---------- Клієнти: кожен адміністратор — лише свого залу ----------
drop policy if exists "Admin manage members" on members;
drop policy if exists "Gym admin manage members" on members;
create policy "Gym admin manage members" on members for all
  using (is_owner() or (is_admin() and gym = gym_name(admin_gym())))
  with check (is_owner() or (is_admin() and gym = gym_name(admin_gym())));

-- ---------- Сторінки сайту ----------
alter table announcements add column if not exists gym text not null default '';

drop policy if exists "Admin write content" on site_content;
drop policy if exists "Admin write photos" on site_photos;
drop policy if exists "Admin write settings" on site_settings;
drop policy if exists "Admin write announcements" on announcements;
drop policy if exists "Gym admin write content" on site_content;
drop policy if exists "Gym admin write photos" on site_photos;
drop policy if exists "Gym admin write settings" on site_settings;
drop policy if exists "Gym admin write announcements" on announcements;
-- власник — уся сайт; адміністратор залу — лише ключі своєї сторінки ('podilsk:…' / 'balta:…')
create policy "Gym admin write content" on site_content for all
  using (is_owner() or (is_admin() and key like admin_gym() || ':%'))
  with check (is_owner() or (is_admin() and key like admin_gym() || ':%'));
create policy "Gym admin write photos" on site_photos for all
  using (is_owner() or (is_admin() and key like admin_gym() || ':%'))
  with check (is_owner() or (is_admin() and key like admin_gym() || ':%'));
create policy "Gym admin write settings" on site_settings for all
  using (is_owner() or (is_admin() and key like admin_gym() || ':%'))
  with check (is_owner() or (is_admin() and key like admin_gym() || ':%'));
create policy "Gym admin write announcements" on announcements for all
  using (is_owner() or (is_admin() and gym = admin_gym()))
  with check (is_owner() or (is_admin() and gym = admin_gym()));

-- Нинішні тренери, галерея, ціни й розклад — на сторінку Подільська (один раз)
insert into site_content (key, value)
select 'podilsk:' || c.key, c.value from site_content c
where c.key !~ '^(podilsk|balta):' and c.key ~ '^(trainer|gallery|price|pricing_|schedule|location1\.)'
on conflict (key) do nothing;
insert into site_photos (key, data_url)
select 'podilsk:' || p.key, p.data_url from site_photos p
where p.key !~ '^(podilsk|balta):' and p.key ~ '^(trainer|gallery)'
on conflict (key) do nothing;
insert into site_settings (key, value)
select 'podilsk:' || s.key, s.value from site_settings s
where s.key !~ '^(podilsk|balta):' and (s.key = 'trainers_list' or s.key in ('list:gallery', 'list:pricing', 'list:schedule') or s.key ~ '^list:price[0-9]+\.items$' or s.key ~ '^list:pricing_')
on conflict (key) do nothing;
-- Контакти Балти з головної — на сторінку Балти
insert into site_content (key, value)
select 'balta:' || c.key, c.value from site_content c
where c.key ~ '^location2\.'
on conflict (key) do nothing;
