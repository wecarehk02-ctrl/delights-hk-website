-- ============================================================================
-- 帝樂倉存系統 · Supabase 建置 SQL
-- 喺 Supabase → SQL Editor 貼上並執行（一次過）。
--
-- 儲存模型：每個 collection 一行，data 係 jsonb（整個 JSON blob）。
-- 呢個對應前端本地快取，最簡單、最穩陣，支援動態欄位（產品可增減欄位）。
-- ============================================================================

create table if not exists public.inventory_store (
  collection  text primary key,
  data        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.inventory_store enable row level security;

-- ---------------------------------------------------------------------------
-- 方案 A（預設・建議）：只有「已登入」用戶可讀寫。
-- 配合前端 Email/密碼登入。受保護標籤資料喺伺服器端真正受控。
-- ---------------------------------------------------------------------------
drop policy if exists "inv_auth_all" on public.inventory_store;
create policy "inv_auth_all"
  on public.inventory_store
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 方案 B（免登入・唔建議放敏感資料）：任何持 anon key 嘅人可讀寫。
-- 如要用，喺前端設定剔「改用 anon 免登入」，並改用以下 policy：
--   （先移除方案 A，再啟用下面）
-- ---------------------------------------------------------------------------
-- drop policy if exists "inv_auth_all" on public.inventory_store;
-- drop policy if exists "inv_anon_all" on public.inventory_store;
-- create policy "inv_anon_all"
--   on public.inventory_store
--   for all
--   to anon
--   using (true)
--   with check (true);

-- ---------------------------------------------------------------------------
-- Realtime：令前端可以收到其他裝置嘅改動（多機即時同步）。
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.inventory_store;

-- 自動更新 updated_at
create or replace function public.inv_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists inv_touch on public.inventory_store;
create trigger inv_touch before update on public.inventory_store
  for each row execute function public.inv_touch_updated_at();

-- ============================================================================
-- 建立員工帳號（方案 A）：
--   Supabase → Authentication → Users → Add user（設 email + 密碼）。
--   並喺 Authentication → Providers → Email 關閉「Allow new users to sign up」，
--   咁只有你手動加嘅員工先登入到。
--
-- 前端設定：倉存系統 → 設定 → 雲端同步，填 Project URL 同 anon key
--   （Supabase → Project Settings → API 搵到）。
-- ============================================================================
