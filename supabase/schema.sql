-- ============================================================================
-- 帝樂倉存系統 · Supabase 建置 SQL（最終整合版 · row-level）
-- 喺 Supabase → SQL Editor 貼上並執行（一次過）。
--
-- 儲存模型（見 inventory/DATABASE.md）：每份文件一行，data 係 jsonb。
--   collection = 'orders'/'products'/'settings'…；singleton 用 doc_id='_doc'。
-- 逐行 upsert → 兩個人改「不同記錄」互不覆蓋（並發安全）；支援動態欄位。
-- ============================================================================

create table if not exists public.inventory_docs (
  collection  text        not null,
  doc_id      text        not null,          -- 文件 id；singleton 用 '_doc'
  data        jsonb       not null default '{}'::jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  primary key (collection, doc_id)
);

create index if not exists inv_docs_collection_idx on public.inventory_docs (collection) where not deleted;

alter table public.inventory_docs enable row level security;

-- ---------------------------------------------------------------------------
-- 方案 A（預設・建議）：只有「已登入」用戶可讀寫。配合前端 Email/密碼登入。
-- ---------------------------------------------------------------------------
drop policy if exists "inv_docs_auth_all" on public.inventory_docs;
create policy "inv_docs_auth_all"
  on public.inventory_docs
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 方案 B（免登入・唔建議放敏感資料）：任何持 anon key 者可讀寫。
-- 要用先喺前端設定剔「改用 anon 免登入」，並改用以下 policy（先移除方案 A）：
-- ---------------------------------------------------------------------------
-- drop policy if exists "inv_docs_auth_all" on public.inventory_docs;
-- create policy "inv_docs_anon_all"
--   on public.inventory_docs for all to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime：多機即時同步。
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.inventory_docs;

-- 自動更新 updated_at
create or replace function public.inv_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists inv_docs_touch on public.inventory_docs;
create trigger inv_docs_touch before update on public.inventory_docs
  for each row execute function public.inv_touch_updated_at();

-- ============================================================================
-- 建立員工帳號（方案 A）：
--   Supabase → Authentication → Users → Add user（email + 密碼）。
--   並喺 Authentication → Providers → Email 關閉「Allow new users to sign up」。
--
-- 前端設定：倉存系統 → 設定 → 雲端同步，填 Project URL 同 anon key
--   （Supabase → Project Settings → API 搵到）。
--
-- 由舊版（inventory_store，整 collection blob）升級者：
--   舊表可保留作備份；新版只用 inventory_docs。首次連線時前端會把本地資料
--   逐份文件推上新表。確認無誤後可 `drop table public.inventory_store;`。
-- ============================================================================
