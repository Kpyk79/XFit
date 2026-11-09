-- ============================================================
-- Оновлення бази XFit: звідки прийшов клієнт і хто його запросив.
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
--
-- source       — звідки реєстрація: site, poster (QR на рецепції), friend, admin…
-- referred_by  — код запрошення друга (перші 10 знаків SHA-256 від секретного коду його карти);
--                адмінка сама знаходить, кому належить код. Секретний код карти при цьому не розкривається.
-- ============================================================

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
