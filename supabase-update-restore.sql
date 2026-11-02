-- ============================================================
-- Оновлення бази XFit: повторний вхід у свою карту (новий телефон,
-- очищений браузер). Виконай один раз у Supabase → SQL Editor.
-- Повторний запуск безпечний.
--
-- Клієнт вводить телефон і підтверджує, що карта його:
--   • штрихкодом пластикової карти XFit (13 цифр), або
--   • датою народження (якщо вказував її при реєстрації).
-- Не більше 5 невдалих спроб на номер за добу і 100 спроб на годину загалом.
-- ============================================================

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
