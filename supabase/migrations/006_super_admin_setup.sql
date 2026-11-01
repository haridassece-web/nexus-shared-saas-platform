-- Migration 006: Super Admin Platform Access Setup & Functions

-- 1. Ensure platform_admins table exists with RLS
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
drop policy if exists "users can read own platform admin status" on public.platform_admins;
create policy "users can read own platform admin status" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

-- 2. Helper to check if current user is platform admin
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.platform_admins where user_id = auth.uid()) $$;
grant execute on function public.is_platform_admin() to authenticated;

-- 3. Super Admin overview function
create or replace function public.platform_business_overview()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'businesses', (select count(*) from public.businesses),
      'trialing', (select count(*) from public.subscriptions where status = 'trialing' and (ends_at is null or ends_at > now())),
      'active', (select count(*) from public.subscriptions where status = 'active' and (ends_at is null or ends_at > now())),
      'expired', (select count(*) from public.subscriptions where status in ('expired', 'cancelled') or (status in ('trialing', 'active') and ends_at <= now()))
    ),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'business_type', b.business_type,
        'created_at', b.created_at,
        'owner_count', (select count(*) from public.business_users bu where bu.business_id = b.id),
        'subscription', jsonb_build_object(
          'id', s.id,
          'plan_code', s.plan_code,
          'status', case when s.ends_at is not null and s.ends_at <= now() and s.status in ('trialing', 'active') then 'expired' else coalesce(s.status, 'trialing') end,
          'starts_at', s.starts_at,
          'ends_at', s.ends_at
        )
      ) order by b.created_at desc)
      from public.businesses b
      left join lateral (
        select * from public.subscriptions x
        where x.business_id = b.id
        order by x.created_at desc
        limit 1
      ) s on true
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;
grant execute on function public.platform_business_overview() to authenticated;

-- 4. Super Admin change subscription function
create or replace function public.platform_set_subscription(
  p_business_id uuid,
  p_plan_code text,
  p_status text,
  p_period text default 'monthly'
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  sub public.subscriptions%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if p_status not in ('active', 'trialing', 'past_due', 'cancelled', 'expired') then
    raise exception 'Invalid subscription status';
  end if;

  insert into public.subscriptions(business_id, plan_code, status, starts_at, ends_at)
  values(
    p_business_id,
    p_plan_code,
    p_status,
    now(),
    case
      when p_status = 'trialing' then now() + interval '14 days'
      when p_status = 'active' and p_period = 'annual' then now() + interval '1 year'
      when p_status = 'active' then now() + interval '1 month'
      else null
    end
  )
  returning * into sub;

  return to_jsonb(sub);
end $$;
grant execute on function public.platform_set_subscription(uuid, text, text, text) to authenticated;

-- 5. Automatically grant Platform Admin access to registered user accounts
insert into public.platform_admins (user_id)
select id from auth.users
on conflict (user_id) do nothing;

