-- ============================================================
-- Оновлення бази XFit: клієнт сам видаляє свою карту й дані
-- (вимога Google Play та App Store для додатків з реєстрацією).
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
-- ============================================================
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
