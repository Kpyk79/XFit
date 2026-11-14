-- ============================================================
-- XFit — схема бази даних для Supabase
-- Виконати повністю у Supabase → SQL Editor → New query → Run
--
-- УВАГА: політики «Admin …» нижче (auth.role() = 'authenticated') пускають
-- будь-якого залогінений користувача. Після цього файлу (і після будь-якого
-- supabase-update-*.sql) ОБОВ'ЯЗКОВО виконай supabase-admins.sql — він
-- замінює їх на правила за залом. Без цього права на живій базі зміняться!
-- ============================================================

-- Тексти сайту (заголовки, ціни, контакти тощо): ключ -> значення
create table if not exists site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- Фото тренерів і галереї залу: ключ -> base64 зображення
create table if not exists site_photos (
  key text primary key,
  data_url text not null,
  updated_at timestamptz not null default now()
);

-- Оголошення та афіші
create table if not exists announcements (
  id text primary key,
  title text not null default '',
  body text not null default '',
  date_label text not null default '',
  image_url text,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Загальні налаштування сайту (напр. чи увімкнено розділ оголошень)
create table if not exists site_settings (
  key text primary key,
  value text not null default ''
);

-- Заявки з контактної форми
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table site_content enable row level security;
alter table site_photos enable row level security;
alter table announcements enable row level security;
alter table site_settings enable row level security;
alter table leads enable row level security;

-- Читати може будь-хто (відвідувачі сайту)
drop policy if exists "Public read content" on site_content;
create policy "Public read content" on site_content for select using (true);

drop policy if exists "Public read photos" on site_photos;
create policy "Public read photos" on site_photos for select using (true);

drop policy if exists "Public read announcements" on announcements;
create policy "Public read announcements" on announcements for select using (true);

drop policy if exists "Public read settings" on site_settings;
create policy "Public read settings" on site_settings for select using (true);

-- Писати може лише залогінений адміністратор (Supabase Auth)
drop policy if exists "Admin write content" on site_content;
create policy "Admin write content" on site_content for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Admin write photos" on site_photos;
create policy "Admin write photos" on site_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Admin write announcements" on announcements;
create policy "Admin write announcements" on announcements for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Admin write settings" on site_settings;
create policy "Admin write settings" on site_settings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Заявки: будь-хто (відвідувач) може надіслати заявку, але читати й
-- видаляти їх може лише залогінений адміністратор — так номери
-- телефонів клієнтів не витікають у публічний доступ.
drop policy if exists "Public submit leads" on leads;
create policy "Public submit leads" on leads for insert with check (true);

drop policy if exists "Admin read leads" on leads;
create policy "Admin read leads" on leads for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin delete leads" on leads;
create policy "Admin delete leads" on leads for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- Клієнти та віртуальні карти (додано в пакеті оновлень)
-- Виконати в Supabase → SQL Editor (можна виконати весь файл ще раз)
-- ============================================================
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  card_number text unique not null,
  token text unique not null,
  full_name text not null default '',
  phone text not null default '',
  plan text not null default '',
  gym text not null default '',
  valid_from date,
  valid_to date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table members enable row level security;

-- Список клієнтів бачить і змінює лише залогінений адміністратор
drop policy if exists "Admin manage members" on members;
create policy "Admin manage members" on members for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Самостійна реєстрація в додатку: додаткові поля
alter table members add column if not exists birth_date date;
alter table members add column if not exists email text not null default '';
alter table members add column if not exists status text not null default 'active'; -- 'pending' = зареєструвався сам, абонемент ще не активовано
alter table members add column if not exists consent_at timestamptz;
alter table members add column if not exists desired_plan text not null default ''; -- що клієнт обрав при реєстрації

-- Клієнт бачить лише свою карту — за секретним кодом з особистого посилання.
-- Повертаються тільки дані для карти (телефон частково приховано, без нотаток).
drop function if exists get_member_card(text);
create or replace function get_member_card(p_token text)
returns table (card_number text, full_name text, phone_masked text, plan text, gym text, valid_from date, valid_to date, status text, desired_plan text)
language sql stable security definer set search_path = public as $$
  select m.card_number, m.full_name,
    case when length(d.digits) >= 7
      then '+' || left(d.digits, 3) || ' •• ••• ' || substr(right(d.digits, 4), 1, 2) || ' ' || right(d.digits, 2)
      else '' end,
    m.plan, m.gym, m.valid_from, m.valid_to, m.status, m.desired_plan
  from members m
  cross join lateral (select regexp_replace(m.phone, '\D', '', 'g') as digits) d
  where length(p_token) >= 16 and m.token = p_token;
$$;

revoke all on function get_member_card(text) from public;
grant execute on function get_member_card(text) to anon, authenticated;

-- Реєстрація клієнта самим клієнтом (з додатку). Номер карти й секретний код
-- генерує сервер; один номер телефону — одна карта.
drop function if exists register_member(text, text, text, date, text);
create or replace function register_member(p_full_name text, p_phone text, p_gym text, p_birth_date date, p_email text, p_plan text default '')
returns table (token text, card_number text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text := left(trim(coalesce(p_full_name, '')), 80);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_token text;
  v_body text;
  v_num text;
  v_sum int;
  v_d int;
  i int;
begin
  -- 067… → 38067…, 67… → 38067…
  if length(v_digits) = 10 and left(v_digits, 1) = '0' then v_digits := '38' || v_digits; end if;
  if length(v_digits) = 9 then v_digits := '380' || v_digits; end if;
  if length(v_name) < 3 or length(v_digits) < 11 or length(v_digits) > 15 then
    raise exception 'invalid_data';
  end if;
  -- той самий номер у будь-якому записі (+380…, 067…, з пробілами) — порівнюємо останні 9 цифр
  if exists (select 1 from members m where right(regexp_replace(m.phone, '\D', '', 'g'), 9) = right(v_digits, 9)) then
    raise exception 'phone_exists';
  end if;
  -- захист від масової реєстрації ботом: не більше 20 нових карт за годину
  if (select count(*) from members m where m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_requests';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  loop
    v_body := to_char(now(), 'YYYY') || lpad((floor(random() * 1e11))::bigint::text, 11, '0');
    v_sum := 0;
    for i in 1..15 loop
      v_d := substr(v_body, 16 - i, 1)::int;
      if i % 2 = 1 then v_d := v_d * 2; if v_d > 9 then v_d := v_d - 9; end if; end if;
      v_sum := v_sum + v_d;
    end loop;
    v_num := v_body || ((10 - v_sum % 10) % 10)::text;
    exit when not exists (select 1 from members m where m.card_number = v_num);
  end loop;
  insert into members (card_number, token, full_name, phone, gym, birth_date, email, status, consent_at, plan, desired_plan)
  values (v_num, v_token, v_name, '+' || v_digits, left(coalesce(p_gym, ''), 40), p_birth_date, left(coalesce(p_email, ''), 120), 'pending', now(), '', left(coalesce(p_plan, ''), 60));
  return query select v_token, v_num;
end;
$$;

revoke all on function register_member(text, text, text, date, text, text) from public;
grant execute on function register_member(text, text, text, date, text, text) to anon, authenticated;

-- ---------- Захист заявок від спаму ----------
-- Перевірка виконується в базі, тому її не обійти навіть запитом напряму:
-- завеликі поля, заявка без телефону, повтор з того самого номера частіше
-- ніж раз на 10 хвилин або понад 30 заявок за 10 хвилин від усіх — відхиляються.
create or replace function leads_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  new.name := left(trim(coalesce(new.name, '')), 80);
  new.phone := left(trim(coalesce(new.phone, '')), 30);
  new.message := left(coalesce(new.message, ''), 2000);
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

drop trigger if exists leads_guard on leads;
create trigger leads_guard before insert on leads
  for each row execute function leads_guard();
-- функцію викликає лише тригер — напряму через API вона недоступна
revoke all on function leads_guard() from public, anon, authenticated;

-- ---------- Штрихкоди EAN-13, як на пластикових картах (див. supabase-update-barcodes.sql) ----------
alter table members add column if not exists barcode text;
alter table members add column if not exists barcode_source text not null default 'app'; -- 'app' | 'plastic'
create unique index if not exists members_barcode_key on members (barcode) where barcode is not null;

-- Контрольна цифра EAN-13 для перших 12 цифр
create or replace function ean13_check(p12 text)
returns int language sql immutable set search_path = public as $$
  select (10 - (sum(substr(p12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)) % 10
  from generate_series(1, 12) as i;
$$;

-- Номер карти XFit: 13 цифр, починається з «2», контрольна цифра сходиться
create or replace function is_member_barcode(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p ~ '^2[0-9]{12}$' and right(p, 1)::int = ean13_check(left(p, 12)), false);
$$;

-- Новий штрихкод для карти з додатку: 251 + 9 випадкових цифр + контрольна
create or replace function gen_member_barcode()
returns text language plpgsql volatile set search_path = public as $$
declare
  v12 text;
  v text;
begin
  loop
    v12 := '251' || lpad((floor(random() * 1e9))::bigint::text, 9, '0');
    v := v12 || ean13_check(v12)::text;
    exit when not exists (select 1 from members m where m.barcode = v);
  end loop;
  return v;
end;
$$;

revoke all on function ean13_check(text) from public, anon, authenticated;
revoke all on function is_member_barcode(text) from public, anon, authenticated;
revoke all on function gen_member_barcode() from public, anon, authenticated;

-- Клієнтам, які вже зареєструвались, видаємо штрихкод
update members set barcode = gen_member_barcode(), barcode_source = 'app' where barcode is null;

-- Карта клієнта (за секретним кодом з особистого посилання) — тепер зі штрихкодом
drop function if exists get_member_card(text);
create or replace function get_member_card(p_token text)
returns table (card_number text, full_name text, phone_masked text, plan text, gym text, valid_from date, valid_to date, status text, desired_plan text, barcode text, barcode_source text)
language sql stable security definer set search_path = public as $$
  select m.card_number, m.full_name,
    case when length(d.digits) >= 7
      then '+' || left(d.digits, 3) || ' •• ••• ' || substr(right(d.digits, 4), 1, 2) || ' ' || right(d.digits, 2)
      else '' end,
    m.plan, m.gym, m.valid_from, m.valid_to, m.status, m.desired_plan, m.barcode, m.barcode_source
  from members m
  cross join lateral (select regexp_replace(m.phone, '\D', '', 'g') as digits) d
  where length(p_token) >= 16 and m.token = p_token;
$$;
revoke all on function get_member_card(text) from public;
grant execute on function get_member_card(text) to anon, authenticated;

-- Реєстрація з додатку: p_barcode — номер пластикової карти (якщо клієнт її вже має)
drop function if exists register_member(text, text, text, date, text, text);
create or replace function register_member(p_full_name text, p_phone text, p_gym text, p_birth_date date, p_email text, p_plan text default '', p_barcode text default null)
returns table (token text, card_number text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text := left(trim(coalesce(p_full_name, '')), 80);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_barcode text := nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), '');
  v_source text := 'app';
  v_token text;
  v_body text;
  v_num text;
  v_sum int;
  v_d int;
  i int;
begin
  if length(v_digits) = 10 and left(v_digits, 1) = '0' then v_digits := '38' || v_digits; end if;
  if length(v_digits) = 9 then v_digits := '380' || v_digits; end if;
  if length(v_name) < 3 or length(v_digits) < 11 or length(v_digits) > 15 then
    raise exception 'invalid_data';
  end if;
  if exists (select 1 from members m where right(regexp_replace(m.phone, '\D', '', 'g'), 9) = right(v_digits, 9)) then
    raise exception 'phone_exists';
  end if;
  if v_barcode is not null then
    if not is_member_barcode(v_barcode) then raise exception 'invalid_barcode'; end if;
    if exists (select 1 from members m where m.barcode = v_barcode) then raise exception 'barcode_exists'; end if;
    v_source := 'plastic';
  else
    v_barcode := gen_member_barcode();
  end if;
  if (select count(*) from members m where m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_requests';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  loop
    v_body := to_char(now(), 'YYYY') || lpad((floor(random() * 1e11))::bigint::text, 11, '0');
    v_sum := 0;
    for i in 1..15 loop
      v_d := substr(v_body, 16 - i, 1)::int;
      if i % 2 = 1 then v_d := v_d * 2; if v_d > 9 then v_d := v_d - 9; end if; end if;
      v_sum := v_sum + v_d;
    end loop;
    v_num := v_body || ((10 - v_sum % 10) % 10)::text;
    exit when not exists (select 1 from members m where m.card_number = v_num);
  end loop;
  insert into members (card_number, token, full_name, phone, gym, birth_date, email, status, consent_at, plan, desired_plan, barcode, barcode_source)
  values (v_num, v_token, v_name, '+' || v_digits, left(coalesce(p_gym, ''), 40), p_birth_date, left(coalesce(p_email, ''), 120), 'pending', now(), '', left(coalesce(p_plan, ''), 60), v_barcode, v_source);
  return query select v_token, v_num;
end;
$$;
revoke all on function register_member(text, text, text, date, text, text, text) from public;
grant execute on function register_member(text, text, text, date, text, text, text) to anon, authenticated;

-- Клієнт з віртуальною картою додає свою пластикову карту (за секретним кодом посилання)
create or replace function link_member_barcode(p_token text, p_barcode text)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_barcode text := regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g');
  v_id uuid;
begin
  if length(coalesce(p_token, '')) < 16 then raise exception 'not_found'; end if;
  select m.id into v_id from members m where m.token = p_token;
  if v_id is null then raise exception 'not_found'; end if;
  if not is_member_barcode(v_barcode) then raise exception 'invalid_barcode'; end if;
  if exists (select 1 from members m where m.barcode = v_barcode and m.id <> v_id) then raise exception 'barcode_exists'; end if;
  update members set barcode = v_barcode, barcode_source = 'plastic', updated_at = now() where id = v_id;
  return v_barcode;
end;
$$;
revoke all on function link_member_barcode(text, text) from public;
grant execute on function link_member_barcode(text, text) to anon, authenticated;

-- ---------- Повторний вхід у карту (див. supabase-update-restore.sql) ----------
create table if not exists member_restore_attempts (
  id bigserial primary key,
  phone_key text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists member_restore_attempts_phone on member_restore_attempts (phone_key, at);
-- Доступ лише через функцію нижче: RLS увімкнено, політик немає
alter table member_restore_attempts enable row level security;

create or replace function restore_member_card(p_phone text, p_barcode text default null, p_birth_date date default null)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_key text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_code text := nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), '');
  v_token text;
begin
  if length(v_key) < 9 or (v_code is null and p_birth_date is null) then
    raise exception 'invalid_data';
  end if;
  if (select count(*) from member_restore_attempts a where a.phone_key = v_key and not a.ok and a.at > now() - interval '1 day') >= 5
     or (select count(*) from member_restore_attempts a where a.at > now() - interval '1 hour') >= 100 then
    raise exception 'too_many_attempts';
  end if;
  select m.token into v_token
  from members m
  where right(regexp_replace(m.phone, '\D', '', 'g'), 9) = v_key
    and ((v_code is not null and m.barcode = v_code) or (p_birth_date is not null and m.birth_date = p_birth_date))
  limit 1;
  -- спробу записуємо й тоді, коли дані не підійшли (тому без raise — інакше запис відкотиться)
  insert into member_restore_attempts (phone_key, ok) values (v_key, v_token is not null);
  delete from member_restore_attempts where at < now() - interval '7 days';
  return v_token; -- null — карту не знайдено
end;
$$;
revoke all on function restore_member_card(text, text, date) from public;
grant execute on function restore_member_card(text, text, date) to anon, authenticated;

-- ---------- Позначка «Оброблено» для заявок (див. supabase-update-leads.sql) ----------
alter table leads add column if not exists handled_at timestamptz;
drop policy if exists "Admin update leads" on leads;
create policy "Admin update leads" on leads for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- Звідки прийшов клієнт і хто запросив (див. supabase-update-growth.sql) ----------
alter table members add column if not exists source text not null default '';
alter table members add column if not exists referred_by text not null default '';

drop function if exists register_member(text, text, text, date, text, text, text);
drop function if exists register_member(text, text, text, date, text, text, text, text, text);
create or replace function register_member(p_full_name text, p_phone text, p_gym text, p_birth_date date, p_email text,
  p_plan text default '', p_barcode text default null, p_source text default '', p_ref text default '')
returns table (token text, card_number text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text := left(trim(coalesce(p_full_name, '')), 80);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_barcode text := nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), '');
  v_source text := left(regexp_replace(coalesce(p_source, ''), '[^a-z0-9_-]', '', 'g'), 20);
  v_ref text := left(regexp_replace(lower(coalesce(p_ref, '')), '[^0-9a-f]', '', 'g'), 10);
  v_bsource text := 'app';
  v_token text;
  v_body text;
  v_num text;
  v_sum int;
  v_d int;
  i int;
begin
  if length(v_digits) = 10 and left(v_digits, 1) = '0' then v_digits := '38' || v_digits; end if;
  if length(v_digits) = 9 then v_digits := '380' || v_digits; end if;
  if length(v_name) < 3 or length(v_digits) < 11 or length(v_digits) > 15 then
    raise exception 'invalid_data';
  end if;
  if exists (select 1 from members m where right(regexp_replace(m.phone, '\D', '', 'g'), 9) = right(v_digits, 9)) then
    raise exception 'phone_exists';
  end if;
  if v_barcode is not null then
    if not is_member_barcode(v_barcode) then raise exception 'invalid_barcode'; end if;
    if exists (select 1 from members m where m.barcode = v_barcode) then raise exception 'barcode_exists'; end if;
    v_bsource := 'plastic';
  else
    v_barcode := gen_member_barcode();
  end if;
  if (select count(*) from members m where m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_requests';
  end if;
  if length(v_ref) <> 10 then v_ref := ''; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  loop
    v_body := to_char(now(), 'YYYY') || lpad((floor(random() * 1e11))::bigint::text, 11, '0');
    v_sum := 0;
    for i in 1..15 loop
      v_d := substr(v_body, 16 - i, 1)::int;
      if i % 2 = 1 then v_d := v_d * 2; if v_d > 9 then v_d := v_d - 9; end if; end if;
      v_sum := v_sum + v_d;
    end loop;
    v_num := v_body || ((10 - v_sum % 10) % 10)::text;
    exit when not exists (select 1 from members m where m.card_number = v_num);
  end loop;
  insert into members (card_number, token, full_name, phone, gym, birth_date, email, status, consent_at, plan, desired_plan, barcode, barcode_source, source, referred_by)
  values (v_num, v_token, v_name, '+' || v_digits, left(coalesce(p_gym, ''), 40), p_birth_date, left(coalesce(p_email, ''), 120), 'pending', now(), '', left(coalesce(p_plan, ''), 60), v_barcode, v_bsource, v_source, v_ref);
  return query select v_token, v_num;
end;
$$;
revoke all on function register_member(text, text, text, date, text, text, text, text, text) from public;
grant execute on function register_member(text, text, text, date, text, text, text, text, text) to anon, authenticated;

-- ---------- Клієнт видаляє свою карту (див. supabase-update-delete.sql) ----------
create or replace function delete_member_card(p_token text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_n int;
begin
  if length(coalesce(p_token, '')) < 16 then return false; end if;
  delete from members m where m.token = p_token;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function delete_member_card(text) from public;
grant execute on function delete_member_card(text) to anon, authenticated;
