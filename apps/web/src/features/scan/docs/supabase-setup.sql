-- Supabase 初始化 SQL · scan 模块
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- 1. 资产记录表：一次扫码会话（session_id）可产生多条 2.5D 资产
create table if not exists scan_assets (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,               -- 电脑端生成的会话标识
  status text not null default 'pending', -- pending -> ready / failed
  asset_url text,                         -- 处理后的 2.5D 贴图（透明底 PNG）公网 URL
  label text default '',                  -- 备注，如 "正面" / "手机拍摄"
  created_at timestamptz not null default now()
);

create index if not exists scan_assets_session_idx on scan_assets (session_id);

-- 2. 行级安全：演示阶段使用宽松策略，正式上线请按 auth.uid() 收紧
alter table scan_assets enable row level security;

drop policy if exists "demo anon all" on scan_assets;
create policy "demo anon all" on scan_assets
  for all using (true) with check (true);

-- 3. 开启 Realtime 推送（电脑端订阅 INSERT 事件的必要条件）
alter publication supabase_realtime add table scan_assets;

-- 4. Storage：public 桶存 2.5D 贴图
insert into storage.buckets (id, name, public)
values ('scan-assets', 'scan-assets', true)
on conflict (id) do nothing;

-- 允许匿名读写该桶（演示阶段）
drop policy if exists "demo public read scan-assets" on storage.objects;
create policy "demo public read scan-assets" on storage.objects
  for select using (bucket_id = 'scan-assets');

drop policy if exists "demo public insert scan-assets" on storage.objects;
create policy "demo public insert scan-assets" on storage.objects
  for insert with check (bucket_id = 'scan-assets');
