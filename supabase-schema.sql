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
