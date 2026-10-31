-- Nexus Creative SaaS subscriptions and platform administration
create table if not exists public.platform_admins(
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.subscription_plans(
 code text primary key,
 name text not null,
 monthly_price_paise integer not null check(monthly_price_paise>=0),
 annual_price_paise integer not null check(annual_price_paise>=0),
 max_users integer not null,
 max_products integer not null,
 features jsonb not null default '{}'::jsonb,
 is_active boolean not null default true
);
insert into public.subscription_plans(code,name,monthly_price_paise,annual_price_paise,max_users,max_products,features) values
 ('trial','14-day Trial',0,0,2,100,'{"gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"barcode":true,"reports":true}'),
 ('starter','Starter',49900,499900,2,500,'{"gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"barcode":true,"reports":true}'),
 ('growth','Growth',99900,999900,5,5000,'{"gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"barcode":true,"reports":true,"advanced_reports":true}'),
 ('business','Business',199900,1999900,20,25000,'{"gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"barcode":true,"reports":true,"advanced_reports":true,"priority_support":true}')
on conflict(code) do nothing;

insert into public.subscriptions(business_id,plan_code,status,starts_at,ends_at)
select b.id,'trial','trialing',now(),now()+interval '14 days' from public.businesses b
where not exists(select 1 from public.subscriptions s where s.business_id=b.id);

alter table public.platform_admins enable row level security;
alter table public.subscription_plans enable row level security;
create policy "users can read own platform admin status" on public.platform_admins for select to authenticated using(user_id=auth.uid());
create policy "authenticated users read active plans" on public.subscription_plans for select to authenticated using(is_active=true);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;

create or replace function public.start_business_trial()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
 insert into public.subscriptions(business_id,plan_code,status,starts_at,ends_at)
 values(new.id,'trial','trialing',now(),now()+interval '14 days');
 return new;
end $$;
drop trigger if exists businesses_start_trial on public.businesses;
create trigger businesses_start_trial after insert on public.businesses for each row execute function public.start_business_trial();

create or replace function public.platform_business_overview()
returns jsonb language plpgsql security definer set search_path=public
as $$ declare result jsonb; begin
 if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
 select jsonb_build_object(
  'summary',jsonb_build_object(
   'businesses',(select count(*) from public.businesses),
   'trialing',(select count(*) from public.subscriptions where status='trialing' and ends_at>now()),
   'active',(select count(*) from public.subscriptions where status='active' and (ends_at is null or ends_at>now())),
   'expired',(select count(*) from public.subscriptions where status in('expired','cancelled') or (status in('trialing','active') and ends_at<=now()))
  ),
  'businesses',coalesce((select jsonb_agg(jsonb_build_object(
   'id',b.id,'name',b.name,'business_type',b.business_type,'created_at',b.created_at,
   'owner_count',(select count(*) from public.business_users bu where bu.business_id=b.id),
   'subscription',jsonb_build_object('id',s.id,'plan_code',s.plan_code,'status',case when s.ends_at is not null and s.ends_at<=now() and s.status in('trialing','active') then 'expired' else s.status end,'starts_at',s.starts_at,'ends_at',s.ends_at)
  ) order by b.created_at desc) from public.businesses b left join lateral (select * from public.subscriptions x where x.business_id=b.id order by x.created_at desc limit 1) s on true),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.platform_set_subscription(p_business_id uuid,p_plan_code text,p_status text,p_period text default 'monthly')
returns jsonb language plpgsql security definer set search_path=public
as $$ declare plan public.subscription_plans; sub public.subscriptions; begin
 if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
 if p_status not in ('active','trialing','past_due','cancelled','expired') then raise exception 'Invalid subscription status'; end if;
 select * into plan from public.subscription_plans where code=p_plan_code and is_active=true;
 if not found and p_plan_code<>'trial' then raise exception 'Unknown or inactive plan'; end if;
 insert into public.subscriptions(business_id,plan_code,status,starts_at,ends_at)
 values(p_business_id,p_plan_code,p_status,now(),case when p_status='trialing' then now()+interval '14 days' when p_status='active' and p_period='annual' then now()+interval '1 year' when p_status='active' then now()+interval '1 month' else null end)
 returning * into sub;
 return to_jsonb(sub);
end $$;

grant execute on function public.platform_business_overview() to authenticated;
grant execute on function public.platform_set_subscription(uuid,text,text,text) to authenticated;

create or replace function public.tenant_subscription_status(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$ declare result jsonb; begin
 if not public.is_business_member(p_business_id) then raise exception 'Business membership required'; end if;
 select jsonb_build_object('status',case when s.ends_at is not null and s.ends_at<=now() and s.status in('trialing','active') then 'expired' else s.status end,'plan_code',s.plan_code,'starts_at',s.starts_at,'ends_at',s.ends_at,'plan',coalesce(to_jsonb(p),'{}'::jsonb))
 into result from public.subscriptions s left join public.subscription_plans p on p.code=s.plan_code
 where s.business_id=p_business_id order by s.created_at desc limit 1;
 return coalesce(result,'{"status":"expired","plan_code":"trial"}'::jsonb);
end $$;
grant execute on function public.tenant_subscription_status(uuid) to authenticated;
