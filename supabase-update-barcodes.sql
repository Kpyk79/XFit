-- ============================================================
-- Оновлення бази XFit: штрихкоди EAN-13, як на пластикових картах.
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
--
-- Пластикові карти залу: 2 500000 xxxxx C (внутрішня нумерація, починається з «2»).
-- Карти з додатку отримують номери з окремого діапазону 251xxxxxxxxxC,
-- тому з пластиковими вони не перетнуться.
-- ============================================================

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
