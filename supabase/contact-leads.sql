-- ============================================================================
-- 帝樂香港有限公司 · 網站聯絡表單 leads 表（Supabase）
-- 喺 Supabase → SQL Editor 貼上並執行一次。
--
-- 安全模型：公開網站用 anon key，只准「INSERT」（寫入查詢），唔准讀 / 改 / 刪。
-- 員工登入（authenticated）先可以讀。咁樣就算 anon key 公開喺網站都冇得偷資料。
-- 倉存系統 inventory_docs 維持「authenticated only」policy，anon key 掂唔到。
-- ============================================================================

create table if not exists public.contact_leads (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  company      text,
  contact_name text,
  phone        text,
  email        text,
  interests    text[]      not null default '{}',
  message      text,
  source       text        not null default 'website'
);

alter table public.contact_leads enable row level security;

-- 任何持 anon key 者：只准 INSERT（寫入新查詢）
drop policy if exists "contact_leads_anon_insert" on public.contact_leads;
create policy "contact_leads_anon_insert"
  on public.contact_leads
  for insert
  to anon
  with check (true);

-- 已登入員工：可讀取查詢列表
drop policy if exists "contact_leads_auth_read" on public.contact_leads;
create policy "contact_leads_auth_read"
  on public.contact_leads
  for select
  to authenticated
  using (true);

-- （選用）即時通知：如想喺後台即時見到新查詢，可加入 realtime
-- alter publication supabase_realtime add table public.contact_leads;
