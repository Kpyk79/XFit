-- Оновлення бази XFit: захист заявок від спаму.
-- Виконай один раз у Supabase → SQL Editor. Повторний запуск безпечний.
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
