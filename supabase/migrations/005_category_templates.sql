-- Migration 005: Category Templates, Supermarket Business Type, and Bulk Product Support

-- 1. Add 'supermarket' to supported business types
alter table public.businesses drop constraint if exists businesses_business_type_check;
alter table public.businesses add constraint businesses_business_type_check
  check(business_type in ('retail','supermarket','salon','gym','clinic','barbershop','general_pos'));

-- 2. Create categories table
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique(business_id, name)
);

create index if not exists categories_business_idx on public.categories(business_id, name);

-- 3. Add category_id to products
alter table public.products add column if not exists category_id uuid references public.categories(id) on delete set null;
create index if not exists products_category_idx on public.products(business_id, category_id);

-- 4. Enable RLS on categories
alter table public.categories enable row level security;
drop policy if exists "members manage categories" on public.categories;
create policy "members manage categories" on public.categories for all to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- 5. Automatic category seeding function
create or replace function public.seed_business_categories(p_business_id uuid, p_business_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_business_type = 'supermarket' then
    insert into public.categories (business_id, name) values
      (p_business_id, 'Rice & Grains'),
      (p_business_id, 'Pulses & Dals'),
      (p_business_id, 'Oils & Ghee'),
      (p_business_id, 'Dairy Products'),
      (p_business_id, 'Fruits & Vegetables'),
      (p_business_id, 'Snacks & Biscuits'),
      (p_business_id, 'Beverages'),
      (p_business_id, 'Personal Care'),
      (p_business_id, 'Household Cleaning'),
      (p_business_id, 'Frozen Foods'),
      (p_business_id, 'Bakery Products'),
      (p_business_id, 'Packaged Foods'),
      (p_business_id, 'Baby Care'),
      (p_business_id, 'Pet Supplies')
    on conflict (business_id, name) do nothing;
  elsif p_business_type = 'retail' then
    insert into public.categories (business_id, name) values
      (p_business_id, 'Clothing & Garments'),
      (p_business_id, 'Footwear'),
      (p_business_id, 'Electronics'),
      (p_business_id, 'Mobile Accessories'),
      (p_business_id, 'Stationery'),
      (p_business_id, 'Home Appliances'),
      (p_business_id, 'Cosmetics & Beauty'),
      (p_business_id, 'Home & Kitchen'),
      (p_business_id, 'Toys & Gifts'),
      (p_business_id, 'General Products')
    on conflict (business_id, name) do nothing;
  else
    insert into public.categories (business_id, name) values
      (p_business_id, 'General Products')
    on conflict (business_id, name) do nothing;
  end if;
end $$;
grant execute on function public.seed_business_categories(uuid, text) to authenticated;

-- 6. Trigger to automatically seed categories on business creation
create or replace function public.on_business_created_seed_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_business_categories(new.id, new.business_type);
  return new;
end $$;

drop trigger if exists trigger_seed_business_categories on public.businesses;
create trigger trigger_seed_business_categories
  after insert on public.businesses
  for each row execute function public.on_business_created_seed_categories();

-- 7. Seed categories for existing businesses that don't have categories yet
do $$
declare
  b record;
begin
  for b in select id, business_type from public.businesses loop
    perform public.seed_business_categories(b.id, b.business_type);
  end loop;
end $$;
