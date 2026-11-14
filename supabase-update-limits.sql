-- ============================================================
-- Оновлення бази XFit: ліміти проти ботів — по IP, а не лише загальні.
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
--
-- Реєстрація картки:  8 за годину і 20 за добу з одного IP; 60 за годину всього.
-- Заявка з сайту:     5 за 10 хв з одного IP; 100 за 10 хв всього (+ як було: 1 на номер за 10 хв).
-- Відновлення картки: невдалих 5 за добу на пару «телефон + IP», 30 за добу на телефон з усіх IP,
--                     20 спроб за годину з одного IP. Загальний ліміт 100/год прибрано —
--                     через нього один бот блокував відновлення всім.
--
-- IP зберігається лише як хеш (md5 + сіль), у відкритому вигляді його в базі немає.
-- Якщо IP визначити не вдалося (порожній хеш), ліміти по IP пропускаються,
-- а загальні й «на номер» діють, як і раніше.
-- ============================================================

alter table members                 add column if not exists reg_ip  text not null default '';
alter table leads                   add column if not exists ip_hash text not null default '';
alter table member_restore_attempts add column if not exists ip_hash text not null default '';
create index if not exists members_reg_ip_at on members (reg_ip, created_at) where reg_ip <> '';
create index if not exists leads_ip_at on leads (ip_hash, created_at) where ip_hash <> '';
create index if not exists member_restore_attempts_ip on member_restore_attempts (ip_hash, at) where ip_hash <> '';

-- Хеш IP відвідувача з заголовків запиту (Cloudflare → X-Forwarded-For). Порожній, якщо IP невідомий.
create or replace function client_ip_hash()
returns text language sql stable set search_path = public as $$
  select case when ip = '' then '' else md5('xfit-ip:' || ip) end
  from (
    select trim(split_part(coalesce(
      nullif(h ->> 'cf-connecting-ip', ''),
      nullif(h ->> 'x-forwarded-for', ''),
      ''), ',', 1)) as ip
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
  ) y;
$$;
revoke all on function client_ip_hash() from public, anon, authenticated;

-- ---------- Заявки ----------
create or replace function leads_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  v_ip text := client_ip_hash();
begin
  new.name := left(trim(coalesce(new.name, '')), 80);
  new.phone := left(trim(coalesce(new.phone, '')), 30);
  new.message := left(coalesce(new.message, ''), 2000);
  new.created_at := now();
  new.ip_hash := v_ip; -- завжди з сервера: підставити свій хеш не можна
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
  if v_ip <> '' and (select count(*) from leads l where l.ip_hash = v_ip and l.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_requests';
  end if;
  if (select count(*) from leads l where l.created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'too_many_requests';
  end if;
  return new;
end;
$$;

-- ---------- Реєстрація картки ----------
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
  v_ip text := client_ip_hash();
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
  if v_ip <> '' and (
       (select count(*) from members m where m.reg_ip = v_ip and m.created_at > now() - interval '1 hour') >= 8
    or (select count(*) from members m where m.reg_ip = v_ip and m.created_at > now() - interval '1 day') >= 20
  ) then
    raise exception 'too_many_requests';
  end if;
  if (select count(*) from members m where m.created_at > now() - interval '1 hour') >= 60 then
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
  insert into members (card_number, token, full_name, phone, gym, birth_date, email, status, consent_at, plan, desired_plan, barcode, barcode_source, source, referred_by, reg_ip)
  values (v_num, v_token, v_name, '+' || v_digits, left(coalesce(p_gym, ''), 40), p_birth_date, left(coalesce(p_email, ''), 120), 'pending', now(), '', left(coalesce(p_plan, ''), 60), v_barcode, v_bsource, v_source, v_ref, v_ip);
  return query select v_token, v_num;
end;
$$;

-- ---------- Відновлення картки ----------
create or replace function restore_member_card(p_phone text, p_barcode text default null, p_birth_date date default null)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_key text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_code text := nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), '');
  v_ip text := client_ip_hash();
  v_token text;
begin
  if length(v_key) < 9 or (v_code is null and p_birth_date is null) then
    raise exception 'invalid_data';
  end if;
  if (select count(*) from member_restore_attempts a where a.phone_key = v_key and not a.ok and a.at > now() - interval '1 day') >= 30
     or (v_ip <> '' and (
          (select count(*) from member_restore_attempts a where a.phone_key = v_key and a.ip_hash = v_ip and not a.ok and a.at > now() - interval '1 day') >= 5
       or (select count(*) from member_restore_attempts a where a.ip_hash = v_ip and a.at > now() - interval '1 hour') >= 20
     )) then
    raise exception 'too_many_attempts';
  end if;
  select m.token into v_token
  from members m
  where right(regexp_replace(m.phone, '\D', '', 'g'), 9) = v_key
    and ((v_code is not null and m.barcode = v_code) or (p_birth_date is not null and m.birth_date = p_birth_date))
  limit 1;
  -- спробу записуємо й тоді, коли дані не підійшли (тому без raise — інакше запис відкотиться)
  insert into member_restore_attempts (phone_key, ok, ip_hash) values (v_key, v_token is not null, v_ip);
  delete from member_restore_attempts where at < now() - interval '7 days';
  return v_token; -- null — карту не знайдено
end;
$$;
