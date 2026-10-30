-- ============================================================
-- XFit — схема бази даних для Supabase
-- Виконати повністю у Supabase → SQL Editor → New query → Run
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
