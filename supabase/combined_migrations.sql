-- Nexus Creative Shared SaaS Platform: tenant-aware core schema
create extension if not exists pgcrypto;

create table public.businesses(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 business_type text not null check(business_type in('retail','salon','gym','clinic','barbershop','general_pos')),
 gstin varchar(15),
 state_code varchar(2),
 phone text,email text,address text,
 created_at timestamptz not null default now()
);
create table public.business_users(
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'owner' check(role in('owner','admin','manager','cashier','inventory','accountant','staff')),
 created_at timestamptz not null default now(),
 primary key(business_id,user_id)
);
create or replace function public.is_business_member(bid uuid)
returns boolean language sql stable security definer set search_path=public
as $$select exists(select 1 from public.business_users where business_id=bid and user_id=auth.uid())$$;
create or replace function public.is_business_admin(bid uuid)
returns boolean language sql stable security definer set search_path=public
as $$select exists(select 1 from public.business_users where business_id=bid and user_id=auth.uid() and role in('owner','admin'))$$;
grant execute on function public.is_business_admin(uuid) to authenticated;
create or replace function public.create_business(p_name text,p_type text,p_gstin text default null,p_state_code text default null)
returns public.businesses language plpgsql security definer set search_path=public
as $$declare b public.businesses;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 insert into public.businesses(name,business_type,gstin,state_code) values(p_name,p_type,p_gstin,p_state_code) returning * into b;
 insert into public.business_users(business_id,user_id,role) values(b.id,auth.uid(),'owner');
 return b;
end$$;
grant execute on function public.create_business(text,text,text,text) to authenticated;

create table public.subscriptions(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 plan_code text not null default 'trial',
 status text not null default 'trialing' check(status in('trialing','active','past_due','cancelled','expired')),
 starts_at timestamptz not null default now(),ends_at timestamptz,
 provider text,provider_subscription_id text,
 created_at timestamptz not null default now()
);
create table public.products(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null,sku text,barcode text,selling_price numeric(12,2) not null default 0 check(selling_price>=0),
 purchase_price numeric(12,2) not null default 0 check(purchase_price>=0),gst_rate numeric(5,2) not null default 0,
 stock_qty integer not null default 0 check(stock_qty>=0),low_stock_threshold integer not null default 5,
 is_active boolean not null default true,created_at timestamptz not null default now(),
 unique(business_id,sku),unique(business_id,barcode)
);
create table public.invoices(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_number text not null,customer_name text not null default 'Walk-in',customer_phone text,
 subtotal numeric(12,2) not null,tax_total numeric(12,2) not null,total numeric(12,2) not null,
 payment_method text not null check(payment_method in('UPI','Cash','Card','Bank transfer')),
 payment_status text not null default 'paid' check(payment_status in('paid','partial','unpaid')),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(business_id,invoice_number)
);
create table public.invoice_items(
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.invoices(id) on delete cascade,
 product_id uuid references public.products(id),description text not null,quantity integer not null check(quantity>0),
 unit_price numeric(12,2) not null,gst_rate numeric(5,2) not null,taxable_amount numeric(12,2) not null,
 tax_amount numeric(12,2) not null,line_total numeric(12,2) not null
);
create table public.stock_movements(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 product_id uuid not null references public.products(id),invoice_id uuid references public.invoices(id),
 movement_type text not null check(movement_type in('opening','sale','purchase','adjustment','return')),
 quantity_change integer not null,note text,created_at timestamptz not null default now()
);
create table public.payments(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade,amount numeric(12,2) not null,
 method text not null,reference text,status text not null default 'recorded',created_at timestamptz not null default now()
);
create table public.audit_logs(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid references auth.users(id),action text not null,entity_type text,entity_id uuid,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index products_biz_idx on public.products(business_id);
create index invoices_biz_date_idx on public.invoices(business_id,created_at desc);
create index memberships_user_idx on public.business_users(user_id);

alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create policy "member reads own businesses" on public.businesses for select to authenticated using(is_business_member(id));
create policy "member reads own membership" on public.business_users for select to authenticated using(user_id=auth.uid());
create policy "owner manages memberships" on public.business_users for all to authenticated using(is_business_admin(business_id)) with check(is_business_admin(business_id));
create policy "members read subscriptions" on public.subscriptions for select to authenticated using(is_business_member(business_id));
create policy "members manage products" on public.products for all to authenticated using(is_business_member(business_id)) with check(is_business_member(business_id));
create policy "members read invoices" on public.invoices for select to authenticated using(is_business_member(business_id));
create policy "members read invoice items" on public.invoice_items for select to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id and is_business_member(i.business_id)));
create policy "members read stock movements" on public.stock_movements for select to authenticated using(is_business_member(business_id));
create policy "members read payments" on public.payments for select to authenticated using(is_business_member(business_id));
create policy "members read audit" on public.audit_logs for select to authenticated using(is_business_member(business_id));

-- Atomic retail invoice RPC. It validates tenant membership and locks stock rows.
create or replace function public.create_retail_invoice(
 p_business_id uuid,p_customer_name text,p_customer_phone text,p_payment_method text,
 p_subtotal numeric,p_tax_total numeric,p_total numeric,p_items jsonb
) returns jsonb language plpgsql security invoker set search_path=public
as $$declare v_id uuid;v_no text;v_item jsonb;v_product public.products%rowtype;
begin
 if not is_business_member(p_business_id) then raise exception 'Not authorized';end if;
 v_no:='NR-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.invoices(business_id,invoice_number,customer_name,customer_phone,subtotal,tax_total,total,payment_method,created_by)
 values(p_business_id,v_no,coalesce(p_customer_name,'Walk-in'),p_customer_phone,p_subtotal,p_tax_total,p_total,p_payment_method,auth.uid()) returning id into v_id;
 for v_item in select * from jsonb_array_elements(p_items) loop
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=p_business_id and is_active for update;
  if not found then raise exception 'Product not found';end if;
  if v_product.stock_qty < (v_item->>'quantity')::integer then raise exception 'Insufficient stock: %',v_product.name;end if;
  insert into public.invoice_items(invoice_id,product_id,description,quantity,unit_price,gst_rate,taxable_amount,tax_amount,line_total)
  values(v_id,v_product.id,v_item->>'description',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,(v_item->>'gst_rate')::numeric,(v_item->>'taxable_amount')::numeric,(v_item->>'tax_amount')::numeric,(v_item->>'line_total')::numeric);
  update public.products set stock_qty=stock_qty-(v_item->>'quantity')::integer where id=v_product.id;
  insert into public.stock_movements(business_id,product_id,invoice_id,movement_type,quantity_change,note)
  values(p_business_id,v_product.id,v_id,'sale',-((v_item->>'quantity')::integer),'Retail sale');
 end loop;
 insert into public.payments(business_id,invoice_id,amount,method,status) values(p_business_id,v_id,p_total,p_payment_method,'recorded');
 insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id) values(p_business_id,auth.uid(),'invoice.created','invoice',v_id);
 return jsonb_build_object('id',v_id,'invoice_number',v_no,'subtotal',p_subtotal,'tax_total',p_tax_total,'total',p_total);
end$$;
grant execute on function public.create_retail_invoice(uuid,text,text,text,numeric,numeric,numeric,jsonb) to authenticated;
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
-- Nexus Creative Billing SaaS: customer records and server-calculated GST invoices
create table if not exists public.customers (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null,
 phone text,
 email text,
 gstin varchar(15),
 state_code varchar(2),
 billing_address text,
 created_at timestamptz not null default now(),
 unique(business_id, phone)
);
create index if not exists customers_business_idx on public.customers(business_id, name);
alter table public.products add column if not exists hsn_code text;
alter table public.products add column if not exists unit text not null default 'pcs';
alter table public.invoices add column if not exists customer_id uuid references public.customers(id);
alter table public.invoices add column if not exists cgst_total numeric(12,2) not null default 0;
alter table public.invoices add column if not exists sgst_total numeric(12,2) not null default 0;
alter table public.invoices add column if not exists igst_total numeric(12,2) not null default 0;
alter table public.invoices add column if not exists place_of_supply varchar(2);
alter table public.invoice_items add column if not exists hsn_code text;
alter table public.invoice_items add column if not exists cgst_amount numeric(12,2) not null default 0;
alter table public.invoice_items add column if not exists sgst_amount numeric(12,2) not null default 0;
alter table public.invoice_items add column if not exists igst_amount numeric(12,2) not null default 0;
alter table public.customers enable row level security;
drop policy if exists "members manage customers" on public.customers;
create policy "members manage customers" on public.customers for all to authenticated
 using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));

-- All prices and tax rates are read from the tenant's product records, never trusted from browser totals.
create or replace function public.create_gst_invoice(
 p_business_id uuid,
 p_customer_name text,
 p_customer_phone text,
 p_customer_state_code varchar(2),
 p_payment_method text,
 p_payment_reference text,
 p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
 v_business public.businesses%rowtype;
 v_product public.products%rowtype;
 v_item jsonb;
 v_invoice_id uuid;
 v_invoice_no text;
 v_qty integer;
 v_taxable numeric(12,2);
 v_rate numeric(5,2);
 v_tax numeric(12,2);
 v_cgst numeric(12,2);
 v_sgst numeric(12,2);
 v_igst numeric(12,2);
 v_subtotal numeric(12,2):=0;
 v_cgst_total numeric(12,2):=0;
 v_sgst_total numeric(12,2):=0;
 v_igst_total numeric(12,2):=0;
 v_total numeric(12,2):=0;
 v_local boolean;
 v_customer_id uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized for this business'; end if;
 if p_payment_method not in ('UPI','Cash','Card','Bank transfer') then raise exception 'Invalid payment method'; end if;
 select * into v_business from public.businesses where id=p_business_id;
 if not found then raise exception 'Business not found'; end if;
 v_local := coalesce(v_business.state_code,'') = coalesce(p_customer_state_code,v_business.state_code,'');
 if p_customer_phone is not null then
   insert into public.customers(business_id,name,phone,state_code)
   values(p_business_id,coalesce(nullif(trim(p_customer_name),''),'Walk-in'),p_customer_phone,p_customer_state_code)
   on conflict (business_id,phone) do update set name=excluded.name,state_code=excluded.state_code
   returning id into v_customer_id;
 end if;
 v_invoice_no := 'NC-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.invoices(business_id,invoice_number,customer_id,customer_name,customer_phone,subtotal,tax_total,total,payment_method,created_by,place_of_supply)
 values(p_business_id,v_invoice_no,v_customer_id,coalesce(nullif(trim(p_customer_name),''),'Walk-in'),p_customer_phone,0,0,0,p_payment_method,auth.uid(),p_customer_state_code)
 returning id into v_invoice_id;
 for v_item in select * from jsonb_array_elements(p_items) loop
   v_qty := (v_item->>'quantity')::integer;
   if v_qty < 1 then raise exception 'Quantity must be positive'; end if;
   select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=p_business_id and is_active=true for update;
   if not found then raise exception 'Product not found'; end if;
   if v_product.stock_qty < v_qty then raise exception 'Insufficient stock: %',v_product.name; end if;
   v_taxable := round(v_product.selling_price*v_qty,2);
   v_rate := v_product.gst_rate;
   v_tax := round(v_taxable*v_rate/100,2);
   if v_local then v_cgst:=round(v_tax/2,2); v_sgst:=v_tax-v_cgst; v_igst:=0; else v_cgst:=0;v_sgst:=0;v_igst:=v_tax;end if;
   insert into public.invoice_items(invoice_id,product_id,description,quantity,unit_price,gst_rate,taxable_amount,tax_amount,line_total,hsn_code,cgst_amount,sgst_amount,igst_amount)
   values(v_invoice_id,v_product.id,v_product.name,v_qty,v_product.selling_price,v_rate,v_taxable,v_tax,v_taxable+v_tax,v_product.hsn_code,v_cgst,v_sgst,v_igst);
   update public.products set stock_qty=stock_qty-v_qty where id=v_product.id;
   insert into public.stock_movements(business_id,product_id,invoice_id,movement_type,quantity_change,note)
   values(p_business_id,v_product.id,v_invoice_id,'sale',-v_qty,'Invoice '||v_invoice_no);
   v_subtotal:=v_subtotal+v_taxable; v_cgst_total:=v_cgst_total+v_cgst; v_sgst_total:=v_sgst_total+v_sgst; v_igst_total:=v_igst_total+v_igst; v_total:=v_total+v_taxable+v_tax;
 end loop;
 if v_subtotal=0 then raise exception 'Invoice must contain at least one item'; end if;
 update public.invoices set subtotal=v_subtotal,cgst_total=v_cgst_total,sgst_total=v_sgst_total,igst_total=v_igst_total,tax_total=v_cgst_total+v_sgst_total+v_igst_total,total=v_total where id=v_invoice_id;
 insert into public.payments(business_id,invoice_id,amount,method,reference,status) values(p_business_id,v_invoice_id,v_total,p_payment_method,p_payment_reference,'recorded');
 insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id) values(p_business_id,auth.uid(),'invoice.created','invoice',v_invoice_id);
 return jsonb_build_object('id',v_invoice_id,'invoice_number',v_invoice_no,'subtotal',v_subtotal,'cgst_total',v_cgst_total,'sgst_total',v_sgst_total,'igst_total',v_igst_total,'tax_total',v_cgst_total+v_sgst_total+v_igst_total,'total',v_total);
end $$;
grant execute on function public.create_gst_invoice(uuid,text,text,varchar,text,text,jsonb) to authenticated;

create or replace function public.adjust_stock(p_business_id uuid,p_product_id uuid,p_quantity_change integer,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_product public.products%rowtype;
begin
 if not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_quantity_change=0 then raise exception 'Adjustment cannot be zero'; end if;
 select * into v_product from public.products where id=p_product_id and business_id=p_business_id for update;
 if not found then raise exception 'Product not found'; end if;
 if v_product.stock_qty+p_quantity_change<0 then raise exception 'Stock cannot be negative'; end if;
 update public.products set stock_qty=stock_qty+p_quantity_change where id=p_product_id returning * into v_product;
 insert into public.stock_movements(business_id,product_id,movement_type,quantity_change,note)
 values(p_business_id,p_product_id,'adjustment',p_quantity_change,coalesce(p_note,'Manual stock adjustment'));
 return jsonb_build_object('product_id',p_product_id,'stock_qty',v_product.stock_qty);
end $$;
grant execute on function public.adjust_stock(uuid,uuid,integer,text) to authenticated;

-- Avoid recursive RLS evaluation in the business_users membership-management policy.
create or replace function public.is_business_admin(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.business_users bu where bu.business_id=p_business_id and bu.user_id=auth.uid() and bu.role in ('owner','admin')) $$;
drop policy if exists "owner manages memberships" on public.business_users;
create policy "owner manages memberships" on public.business_users for all to authenticated
 using(public.is_business_admin(business_id)) with check(public.is_business_admin(business_id));
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

-- Migration 007: Multi-Business Invoice Engine (60 Categories, Templates, Custom Fields & Financial Year Sequences)

-- 1. Relax business_type constraint on businesses to allow all 60 categories
alter table public.businesses drop constraint if exists businesses_business_type_check;

-- Add custom template settings to businesses
alter table public.businesses add column if not exists invoice_prefix varchar(20) default 'INV';
alter table public.businesses add column if not exists default_tax_rate numeric(5,2) default 18;
alter table public.businesses add column if not exists tax_settings jsonb default '{"gst_enabled": true, "is_composition": false, "terms": "Thank you for your business."}'::jsonb;

-- 2. Business Categories Master Table
create table if not exists public.business_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  sector text not null,
  template_type text not null,
  item_label text not null default 'Item',
  customer_label text not null default 'Customer',
  custom_fields jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Enable RLS on business_categories (read-only for all authenticated users)
alter table public.business_categories enable row level security;
drop policy if exists "anyone can read categories" on public.business_categories;
create policy "anyone can read categories" on public.business_categories
  for select to authenticated using (is_active = true);

-- 3. Preload all 60 Business Categories
insert into public.business_categories (code, name, sector, template_type, item_label, customer_label, custom_fields) values
-- Healthcare (8)
('hospital', 'Hospital', 'Healthcare', 'healthcare', 'Procedure / Service / Medicine', 'Patient', '[{"name":"patient_id","label":"Patient ID / UHID","type":"text"},{"name":"doctor_name","label":"Doctor / Consultant","type":"text"},{"name":"department","label":"Department","type":"text"},{"name":"bed_no","label":"Room / Bed No","type":"text"}]'),
('clinic', 'Clinic', 'Healthcare', 'healthcare', 'Consultation / Service', 'Patient', '[{"name":"patient_id","label":"Patient ID","type":"text"},{"name":"doctor_name","label":"Doctor Name","type":"text"}]'),
('dental_clinic', 'Dental Clinic', 'Healthcare', 'healthcare', 'Dental Treatment / Procedure', 'Patient', '[{"name":"patient_id","label":"Patient ID","type":"text"},{"name":"dentist_name","label":"Dentist Name","type":"text"},{"name":"tooth_no","label":"Tooth No(s)","type":"text"}]'),
('pharmacy', 'Pharmacy', 'Healthcare', 'healthcare', 'Medicine / Product', 'Customer', '[{"name":"doctor_name","label":"Prescribed by Doctor","type":"text"},{"name":"prescription_no","label":"Prescription No","type":"text"}]'),
('diagnostic_lab', 'Diagnostic Lab', 'Healthcare', 'healthcare', 'Lab Test / Investigation', 'Patient', '[{"name":"patient_id","label":"Patient ID","type":"text"},{"name":"doctor_name","label":"Referred By Doctor","type":"text"},{"name":"sample_id","label":"Sample Barcode / ID","type":"text"}]'),
('medical_centre', 'Medical Centre', 'Healthcare', 'healthcare', 'Medical Service / Consultation', 'Patient', '[{"name":"patient_id","label":"Patient ID","type":"text"},{"name":"doctor_name","label":"Attending Doctor","type":"text"}]'),
('physiotherapy', 'Physiotherapy', 'Healthcare', 'healthcare', 'Therapy Session / Service', 'Patient', '[{"name":"patient_id","label":"Patient ID","type":"text"},{"name":"therapist_name","label":"Physiotherapist","type":"text"},{"name":"sessions","label":"Session Number","type":"text"}]'),
('veterinary_clinic', 'Veterinary Clinic', 'Healthcare', 'healthcare', 'Vet Treatment / Vaccine', 'Pet Parent', '[{"name":"pet_name","label":"Pet Name & Breed","type":"text"},{"name":"vet_doctor","label":"Veterinarian","type":"text"}]'),

-- Fitness & Wellness (4)
('gym', 'Gym', 'Fitness & Wellness', 'fitness', 'Membership Plan / Training', 'Member', '[{"name":"member_id","label":"Member ID","type":"text"},{"name":"plan_duration","label":"Plan Validity","type":"text"},{"name":"trainer","label":"Assigned Trainer","type":"text"}]'),
('yoga_centre', 'Yoga Centre', 'Fitness & Wellness', 'fitness', 'Yoga Class / Package', 'Member', '[{"name":"member_id","label":"Member ID","type":"text"},{"name":"batch_time","label":"Batch Timing","type":"text"}]'),
('fitness_studio', 'Fitness Studio', 'Fitness & Wellness', 'fitness', 'Studio Class / Workout Plan', 'Member', '[{"name":"member_id","label":"Member ID","type":"text"},{"name":"instructor","label":"Instructor","type":"text"}]'),
('spa', 'Spa', 'Fitness & Wellness', 'salon', 'Spa Therapy / Massage', 'Client', '[{"name":"therapist","label":"Therapist Name","type":"text"},{"name":"room_no","label":"Therapy Room","type":"text"}]'),

-- Personal Care (3)
('salon', 'Salon', 'Personal Care', 'salon', 'Hair / Beauty Service', 'Client', '[{"name":"stylist_name","label":"Stylist Name","type":"text"},{"name":"appointment_time","label":"Appointment Time","type":"text"}]'),
('beauty_parlour', 'Beauty Parlour', 'Personal Care', 'salon', 'Beauty Treatment / Makeup', 'Client', '[{"name":"beautician","label":"Beautician","type":"text"}]'),
('tailoring', 'Tailoring', 'Personal Care', 'services', 'Stitching / Alteration', 'Customer', '[{"name":"order_no","label":"Measurement / Job No","type":"text"},{"name":"delivery_date","label":"Trial / Delivery Date","type":"date"}]'),

-- Retail & Grocery (12)
('supermarket', 'Supermarket', 'Retail & Grocery', 'retail_supermarket', 'Product', 'Customer', '[{"name":"counter","label":"Counter / POS No","type":"text"}]'),
('grocery_store', 'Grocery Store', 'Retail & Grocery', 'retail_supermarket', 'Grocery Item', 'Customer', '[]'),
('retail_shop', 'Retail Shop', 'Retail & Grocery', 'retail_supermarket', 'Product', 'Customer', '[]'),
('textile_shop', 'Textile Shop', 'Retail & Grocery', 'retail_supermarket', 'Fabric / Saree / Dress', 'Customer', '[{"name":"meterage","label":"Total Cut (Meters)","type":"text"}]'),
('garments_shop', 'Garments Shop', 'Retail & Grocery', 'retail_supermarket', 'Apparel / Clothing', 'Customer', '[{"name":"salesperson","label":"Sales Assistant","type":"text"}]'),
('electrical_shop', 'Electrical Shop', 'Retail & Grocery', 'retail_supermarket', 'Electrical Goods / Parts', 'Customer', '[]'),
('hardware_shop', 'Hardware Shop', 'Retail & Grocery', 'retail_supermarket', 'Hardware Tool / Material', 'Customer', '[]'),
('furniture_shop', 'Furniture Shop', 'Retail & Grocery', 'retail_supermarket', 'Furniture Item', 'Customer', '[{"name":"delivery_address","label":"Delivery Location","type":"text"}]'),
('mobile_shop', 'Mobile Shop', 'Retail & Grocery', 'retail_supermarket', 'Mobile Device / Accessory', 'Customer', '[{"name":"imei_no","label":"IMEI / Serial No","type":"text"}]'),
('computer_shop', 'Computer Shop', 'Retail & Grocery', 'retail_supermarket', 'Computer / Peripheral', 'Customer', '[{"name":"serial_no","label":"Device Serial Number","type":"text"}]'),
('electronics_shop', 'Electronics Shop', 'Retail & Grocery', 'retail_supermarket', 'Electronics / Appliance', 'Customer', '[{"name":"model_no","label":"Model / Serial No","type":"text"}]'),
('pet_shop', 'Pet Shop', 'Retail & Grocery', 'retail_supermarket', 'Pet Food / Supply', 'Customer', '[]'),

-- Food & Hospitality (6)
('restaurant', 'Restaurant', 'Food & Hospitality', 'food_hospitality', 'Food / Beverage', 'Guest', '[{"name":"table_no","label":"Table No","type":"text"},{"name":"captain","label":"Steward / Captain","type":"text"}]'),
('hotel', 'Hotel', 'Food & Hospitality', 'food_hospitality', 'Room Stay / Food / Service', 'Guest', '[{"name":"room_no","label":"Room No","type":"text"},{"name":"checkin","label":"Check-in Date","type":"date"},{"name":"checkout","label":"Check-out Date","type":"date"}]'),
('bakery', 'Bakery', 'Food & Hospitality', 'food_hospitality', 'Cake / Bakery Item', 'Customer', '[{"name":"order_type","label":"Dine-in / Takeaway / Custom Cake","type":"text"}]'),
('catering', 'Catering', 'Food & Hospitality', 'food_hospitality', 'Catering Menu / Plate Rate', 'Client', '[{"name":"event_name","label":"Event Name","type":"text"},{"name":"guest_count","label":"Number of Guests","type":"text"},{"name":"event_date","label":"Event Date","type":"date"}]'),
('juice_shop', 'Juice Shop', 'Food & Hospitality', 'food_hospitality', 'Juice / Shake', 'Customer', '[]'),
('coffee_shop', 'Coffee Shop', 'Food & Hospitality', 'food_hospitality', 'Coffee / Beverage / Snack', 'Customer', '[{"name":"order_token","label":"Token No","type":"text"}]'),

-- Automobile (4)
('automobile_workshop', 'Automobile Workshop', 'Automobile', 'automobile', 'Service / Labour / Spare Part', 'Vehicle Owner', '[{"name":"vehicle_no","label":"Vehicle Registration No","type":"text"},{"name":"odometer","label":"Odometer KM","type":"text"},{"name":"service_advisor","label":"Service Advisor","type":"text"}]'),
('bike_service_centre', 'Bike Service Centre', 'Automobile', 'automobile', 'Bike Service / Spare Part', 'Vehicle Owner', '[{"name":"bike_no","label":"Bike Number","type":"text"},{"name":"km_reading","label":"KM Reading","type":"text"}]'),
('car_wash', 'Car Wash', 'Automobile', 'automobile', 'Wash / Detailing Service', 'Vehicle Owner', '[{"name":"vehicle_no","label":"Vehicle Number","type":"text"},{"name":"package_type","label":"Wash Package","type":"text"}]'),
('petrol_bunk', 'Petrol Bunk', 'Automobile', 'automobile', 'Fuel / Lubricant', 'Customer', '[{"name":"vehicle_no","label":"Vehicle No","type":"text"},{"name":"dispenser","label":"Dispenser / Nozzle No","type":"text"}]'),

-- Services & Maintenance (7)
('laundry', 'Laundry', 'Services & Maintenance', 'services', 'Wash & Fold / Press', 'Customer', '[{"name":"cloth_count","label":"Total Clothes Count","type":"text"},{"name":"pickup_date","label":"Pickup Date","type":"date"}]'),
('dry_cleaning', 'Dry Cleaning', 'Services & Maintenance', 'services', 'Dry Clean Item', 'Customer', '[{"name":"tag_no","label":"Tag Number","type":"text"},{"name":"delivery_date","label":"Delivery Date","type":"date"}]'),
('mobile_repair', 'Mobile Repair', 'Services & Maintenance', 'services', 'Repair Service / Screen / Battery', 'Customer', '[{"name":"device_model","label":"Device Model","type":"text"},{"name":"imei","label":"IMEI / Serial","type":"text"},{"name":"issue_reported","label":"Issue Reported","type":"text"}]'),
('hardware_services', 'Hardware Services', 'Services & Maintenance', 'services', 'Hardware Service / Installation', 'Customer', '[{"name":"job_card","label":"Job Card No","type":"text"}]'),
('plumbing_services', 'Plumbing Services', 'Services & Maintenance', 'services', 'Plumbing Work / Material', 'Client', '[{"name":"service_address","label":"Service Location","type":"text"}]'),
('electrical_services', 'Electrical Services', 'Services & Maintenance', 'services', 'Electrical Work / Material', 'Client', '[{"name":"technician","label":"Electrician Name","type":"text"}]'),
('cctv_services', 'CCTV Services', 'Services & Maintenance', 'services', 'Camera / NVR / Installation', 'Client', '[{"name":"premises_name","label":"Installation Site","type":"text"},{"name":"camera_count","label":"Number of Channels","type":"text"}]'),

-- Real Estate & Construction (3)
('real_estate', 'Real Estate', 'Real Estate & Construction', 'services', 'Brokerage / Consultation Fee', 'Client', '[{"name":"property_id","label":"Property ID / Plot No","type":"text"},{"name":"project_name","label":"Project / Layout Name","type":"text"}]'),
('property_management', 'Property Management', 'Real Estate & Construction', 'services', 'Maintenance / Management Fee', 'Client', '[{"name":"flat_no","label":"Flat / Villa No","type":"text"},{"name":"period","label":"Maintenance Period","type":"text"}]'),
('construction', 'Construction', 'Real Estate & Construction', 'services', 'Contract Work / Material', 'Client', '[{"name":"site_name","label":"Construction Site","type":"text"},{"name":"stage_name","label":"Work Stage / Milestone","type":"text"}]'),
('interior_design', 'Interior Design', 'Real Estate & Construction', 'services', 'Design / Turnkey Project', 'Client', '[{"name":"project_name","label":"Project Name","type":"text"},{"name":"sqft_area","label":"Area (Sq. Ft.)","type":"text"}]'),

-- IT & Digital (3)
('networking_it', 'Networking & IT', 'IT & Digital', 'services', 'IT Support / Network Setup', 'Client', '[{"name":"po_number","label":"Purchase Order (PO) #","type":"text"}]'),
('digital_agency', 'Digital Agency', 'IT & Digital', 'services', 'Marketing / SEO / Campaign', 'Client', '[{"name":"campaign_name","label":"Campaign / Brand Name","type":"text"},{"name":"billing_month","label":"Billing Month","type":"text"}]'),
('website_development', 'Website Development', 'IT & Digital', 'services', 'Web Dev / Hosting / AMC', 'Client', '[{"name":"domain_name","label":"Domain / App Name","type":"text"},{"name":"milestone","label":"Project Milestone","type":"text"}]'),

-- Education (3)
('education_centre', 'Education Centre', 'Education', 'education', 'Course Fee / Training', 'Student', '[{"name":"student_id","label":"Student ID / Roll No","type":"text"},{"name":"course_name","label":"Course Enrolled","type":"text"},{"name":"batch_name","label":"Batch Name","type":"text"}]'),
('tuition_centre', 'Tuition Centre', 'Education', 'education', 'Tuition Fee / Material', 'Student', '[{"name":"student_name","label":"Student Name","type":"text"},{"name":"grade","label":"Class / Subject","type":"text"},{"name":"fee_month","label":"Month","type":"text"}]'),
('college', 'College', 'Education', 'education', 'Semester Fee / Exam Fee', 'Student', '[{"name":"register_no","label":"Register / Roll No","type":"text"},{"name":"department","label":"Department / Degree","type":"text"},{"name":"semester","label":"Semester","type":"text"}]'),

-- Media, Events & Logistics (5)
('travel_agency', 'Travel Agency', 'Media & Events', 'services', 'Tour Package / Ticket Booking', 'Traveler', '[{"name":"destination","label":"Destination","type":"text"},{"name":"travel_dates","label":"Travel Dates","type":"text"},{"name":"booking_pnr","label":"PNR / Booking Ref","type":"text"}]'),
('event_management', 'Event Management', 'Media & Events', 'services', 'Event Setup / Coordination', 'Client', '[{"name":"event_title","label":"Event Title","type":"text"},{"name":"venue","label":"Venue","type":"text"},{"name":"event_date","label":"Event Date","type":"date"}]'),
('photography', 'Photography', 'Media & Events', 'services', 'Photo / Video Shoot', 'Client', '[{"name":"event_type","label":"Shoot Type (Wedding/Product)","type":"text"},{"name":"shoot_date","label":"Date of Shoot","type":"date"}]'),
('printing_shop', 'Printing Shop', 'Media & Events', 'services', 'Printing / Binding / Vinyl', 'Customer', '[{"name":"job_specs","label":"Size & Paper Specs","type":"text"},{"name":"copies","label":"Number of Copies","type":"text"}]'),
('courier_services', 'Courier Services', 'Media & Events', 'services', 'Parcel / Consignment', 'Sender', '[{"name":"tracking_no","label":"Airway Bill / Tracking #","type":"text"},{"name":"destination_pincode","label":"Destination Pincode","type":"text"},{"name":"weight_kg","label":"Parcel Weight (kg)","type":"text"}]'),
('general_services', 'General Services', 'General', 'services', 'Service / Labour Charge', 'Customer', '[{"name":"service_notes","label":"Service Reference","type":"text"}]')
on conflict (code) do update set
  name = excluded.name,
  sector = excluded.sector,
  template_type = excluded.template_type,
  item_label = excluded.item_label,
  customer_label = excluded.customer_label,
  custom_fields = excluded.custom_fields;

-- 4. Financial Year Invoice Sequences
create table if not exists public.invoice_sequences (
  business_id uuid not null references public.businesses(id) on delete cascade,
  financial_year varchar(10) not null,
  last_seq integer not null default 0,
  prefix varchar(20) not null default 'INV',
  primary key (business_id, financial_year)
);

create or replace function public.get_financial_year(p_date timestamptz default now())
returns varchar(10) language plpgsql immutable as $$
declare
  v_month integer;
  v_year integer;
begin
  v_month := extract(month from p_date);
  v_year := extract(year from p_date);
  if v_month >= 4 then
    return v_year::text || '-' || right((v_year + 1)::text, 2);
  else
    return (v_year - 1)::text || '-' || right(v_year::text, 2);
  end if;
end $$;

-- Atomic sequence generator per business and financial year
create or replace function public.next_invoice_number(p_business_id uuid, p_prefix text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_fy varchar(10);
  v_prefix text;
  v_seq integer;
begin
  v_fy := public.get_financial_year(now());
  select coalesce(p_prefix, invoice_prefix, 'INV') into v_prefix from public.businesses where id = p_business_id;
  v_prefix := coalesce(v_prefix, 'INV');

  insert into public.invoice_sequences (business_id, financial_year, last_seq, prefix)
  values (p_business_id, v_fy, 1, v_prefix)
  on conflict (business_id, financial_year)
  do update set last_seq = invoice_sequences.last_seq + 1
  returning last_seq into v_seq;

  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0');
end $$;
grant execute on function public.next_invoice_number(uuid, text) to authenticated;

-- 5. Extend invoices table with custom_fields & order metadata
alter table public.invoices add column if not exists custom_fields jsonb default '{}'::jsonb;
alter table public.invoices add column if not exists order_type text default 'Counter Sale';
alter table public.invoices add column if not exists financial_year varchar(10);

-- 6. Preload starter products and services based on category
create or replace function public.seed_category_starter_items(p_business_id uuid, p_category_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_category_code in ('hospital', 'clinic', 'medical_centre') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'General Consultation', 'visit', 400.00, 0, 999),
      (p_business_id, 'Specialist Consultation', 'visit', 800.00, 0, 999),
      (p_business_id, 'Blood Pressure & Sugar Check', 'test', 100.00, 0, 999),
      (p_business_id, 'Wound Dressing & Bandage', 'service', 250.00, 0, 999),
      (p_business_id, 'ECG Investigation', 'test', 350.00, 0, 999)
    on conflict do nothing;

  elsif p_category_code in ('dental_clinic') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Dental Consultation & X-Ray', 'visit', 350.00, 0, 999),
      (p_business_id, 'Teeth Cleaning / Scaling', 'session', 1200.00, 0, 999),
      (p_business_id, 'Composite Tooth Filling', 'tooth', 1500.00, 0, 999),
      (p_business_id, 'Root Canal Treatment (RCT)', 'tooth', 4500.00, 0, 999)
    on conflict do nothing;

  elsif p_category_code in ('gym', 'yoga_centre', 'fitness_studio') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Monthly Gym Membership', 'month', 1500.00, 18, 999),
      (p_business_id, 'Quarterly Membership (3 Months)', 'package', 3999.00, 18, 999),
      (p_business_id, 'Annual VIP Membership (12 Months)', 'year', 11999.00, 18, 999),
      (p_business_id, 'Personal Trainer Session (1 Month)', 'month', 4500.00, 18, 999),
      (p_business_id, 'Gym Joining / Registration Fee', 'one-time', 500.00, 18, 999)
    on conflict do nothing;

  elsif p_category_code in ('salon', 'beauty_parlour', 'spa') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Men Haircut & Styling', 'service', 250.00, 18, 999),
      (p_business_id, 'Women Haircut & Blowdry', 'service', 650.00, 18, 999),
      (p_business_id, 'Gold Glow Facial Treatment', 'service', 1400.00, 18, 999),
      (p_business_id, 'Hair Spa & Scalp Massage', 'service', 950.00, 18, 999),
      (p_business_id, 'Beard Grooming & Shape', 'service', 150.00, 18, 999)
    on conflict do nothing;

  elsif p_category_code in ('automobile_workshop', 'bike_service_centre', 'car_wash') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'General Vehicle Periodic Service', 'service', 1800.00, 18, 999),
      (p_business_id, 'Synthetic Engine Oil (3.5L)', 'can', 2200.00, 18, 50),
      (p_business_id, 'Oil Filter Replacement', 'pcs', 350.00, 18, 40),
      (p_business_id, 'Brake Pad Cleaning & Adjustment', 'service', 450.00, 18, 999),
      (p_business_id, 'Foam Wash & Interior Vacuum', 'service', 600.00, 18, 999)
    on conflict do nothing;

  elsif p_category_code in ('education_centre', 'tuition_centre', 'college') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Monthly Tuition Fee', 'month', 2000.00, 0, 999),
      (p_business_id, 'Study Material & Test Series Kit', 'kit', 1500.00, 5, 200),
      (p_business_id, 'Annual Registration & Exam Fee', 'year', 1000.00, 0, 999)
    on conflict do nothing;

  elsif p_category_code in ('digital_agency', 'website_development', 'networking_it') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Custom Website Design & Development', 'project', 25000.00, 18, 999),
      (p_business_id, 'Monthly SEO & Digital Marketing Retainer', 'month', 15000.00, 18, 999),
      (p_business_id, 'Cloud Hosting & Domain Maintenance (1 Year)', 'year', 6000.00, 18, 999)
    on conflict do nothing;

  else
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Standard Service / Product', 'pcs', 100.00, 18, 100),
      (p_business_id, 'Premium Consultation / Service', 'service', 500.00, 18, 999)
    on conflict do nothing;
  end if;
end $$;
grant execute on function public.seed_category_starter_items(uuid, text) to authenticated;

-- 7. Update on_business_created trigger to seed categories AND starter products
create or replace function public.on_business_created_seed_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_business_categories(new.id, new.business_type);
  perform public.seed_category_starter_items(new.id, new.business_type);
  return new;
end $$;

-- 8. Enhanced universal GST Invoice Creator with Custom Fields & Financial Year Numbering
drop function if exists public.create_gst_invoice(uuid, text, text, varchar, text, text, jsonb);
drop function if exists public.create_gst_invoice(uuid, text, text, text, text, text, jsonb);
drop function if exists public.create_gst_invoice(uuid, text, text, varchar, text, text, jsonb, jsonb, text);

create or replace function public.create_gst_invoice(
  p_business_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_state_code varchar(2),
  p_payment_method text,
  p_payment_reference text,
  p_items jsonb,
  p_custom_fields jsonb default '{}'::jsonb,
  p_order_type text default 'Counter Sale'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_business public.businesses%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_invoice_id uuid;
  v_invoice_no text;
  v_customer_id uuid;
  v_fy text;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_cgst_total numeric(12,2) := 0;
  v_sgst_total numeric(12,2) := 0;
  v_igst_total numeric(12,2) := 0;
  v_is_interstate boolean := false;
begin
  if not is_business_member(p_business_id) then
    raise exception 'Access denied for business %', p_business_id;
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if v_business.id is null then raise exception 'Business not found'; end if;

  if p_customer_state_code is not null and v_business.state_code is not null then
    v_is_interstate := (trim(p_customer_state_code) <> trim(v_business.state_code));
  end if;

  -- Create or update customer record
  if p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    insert into public.customers (business_id, name, phone, state_code)
    values (p_business_id, coalesce(nullif(trim(p_customer_name),''),'Walk-in customer'), trim(p_customer_phone), p_customer_state_code)
    on conflict (business_id, phone) do update set
      name = excluded.name,
      state_code = coalesce(excluded.state_code, customers.state_code)
    returning id into v_customer_id;
  end if;

  -- Generate sequential financial year invoice number (e.g. INV/2026-27/0001)
  v_invoice_no := public.next_invoice_number(p_business_id, v_business.invoice_prefix);
  v_fy := public.get_financial_year(now());

  insert into public.invoices (
    business_id, customer_id, invoice_number, customer_name, customer_phone,
    subtotal, tax_total, cgst_total, sgst_total, igst_total,
    place_of_supply, total, payment_method, created_by,
    custom_fields, order_type, financial_year
  ) values (
    p_business_id, v_customer_id, v_invoice_no, coalesce(nullif(trim(p_customer_name),''),'Walk-in'), p_customer_phone,
    0, 0, 0, 0, 0,
    coalesce(p_customer_state_code, v_business.state_code), 0, p_payment_method, auth.uid(),
    coalesce(p_custom_fields, '{}'::jsonb), coalesce(p_order_type, 'Counter Sale'), v_fy
  ) returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty <= 0 then raise exception 'Item quantity must be positive'; end if;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and business_id = p_business_id and is_active for update;
    if not found then raise exception 'Product % not found in this business', (v_item->>'product_id'); end if;

    declare
      v_item_taxable numeric(12,2) := round(v_product.selling_price * v_qty, 2);
      v_item_tax numeric(12,2) := round(v_item_taxable * (v_product.gst_rate / 100.0), 2);
      v_item_cgst numeric(12,2) := 0;
      v_item_sgst numeric(12,2) := 0;
      v_item_igst numeric(12,2) := 0;
    begin
      if v_is_interstate then
        v_item_igst := v_item_tax;
      else
        v_item_cgst := round(v_item_tax / 2.0, 2);
        v_item_sgst := v_item_tax - v_item_cgst;
      end if;

      insert into public.invoice_items (
        invoice_id, product_id, description, hsn_code, quantity,
        unit_price, gst_rate, taxable_amount, tax_amount,
        cgst_amount, sgst_amount, igst_amount, line_total
      ) values (
        v_invoice_id, v_product.id, v_product.name, v_product.hsn_code, v_qty,
        v_product.selling_price, v_product.gst_rate, v_item_taxable, v_item_tax,
        v_item_cgst, v_item_sgst, v_item_igst, v_item_taxable + v_item_tax
      );

      v_subtotal := v_subtotal + v_item_taxable;
      v_tax_total := v_tax_total + v_item_tax;
      v_cgst_total := v_cgst_total + v_item_cgst;
      v_sgst_total := v_sgst_total + v_item_sgst;
      v_igst_total := v_igst_total + v_item_igst;

      -- If item has stock trackable, decrement it (services with 999 remain active)
      if v_product.stock_qty < 900 then
        update public.products set stock_qty = stock_qty - v_qty where id = v_product.id;
        insert into public.stock_movements (business_id, product_id, invoice_id, movement_type, quantity_change, note)
        values (p_business_id, v_product.id, v_invoice_id, 'sale', -v_qty, 'Invoice ' || v_invoice_no);
      end if;
    end;
  end loop;

  update public.invoices
  set subtotal = v_subtotal,
      tax_total = v_tax_total,
      cgst_total = v_cgst_total,
      sgst_total = v_sgst_total,
      igst_total = v_igst_total,
      total = v_subtotal + v_tax_total
  where id = v_invoice_id;

  insert into public.payments (business_id, invoice_id, amount, method, reference, status)
  values (p_business_id, v_invoice_id, v_subtotal + v_tax_total, p_payment_method, p_payment_reference, 'recorded');

  return jsonb_build_object(
    'id', v_invoice_id,
    'invoice_number', v_invoice_no,
    'subtotal', v_subtotal,
    'cgst_total', v_cgst_total,
    'sgst_total', v_sgst_total,
    'igst_total', v_igst_total,
    'total', v_subtotal + v_tax_total
  );
end $$;
grant execute on function public.create_gst_invoice to authenticated;
-- Migration 008: Super Admin Access & Full Subscription Management (Owner: Haridass)

-- 1. Ensure platform_admins table exists
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
drop policy if exists "users can read own platform admin status" on public.platform_admins;
create policy "users can read own platform admin status" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

-- 2. Secure helper to identify Platform Owner / Super Admin (Owner: Haridass)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  ) or exists (
    select 1 from auth.users
    where id = auth.uid()
      and (
        email ilike '%haridass%'
        or email = 'haridass.ece@gmail.com'
      )
  );
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- Automatically grant platform admin status to Haridass and existing accounts
insert into public.platform_admins (user_id)
select id from auth.users
where email ilike '%haridass%' or email = 'haridass.ece@gmail.com'
on conflict (user_id) do nothing;

-- 3. Super Admin RLS Policies for full access
drop policy if exists "platform admin manages subscriptions" on public.subscriptions;
create policy "platform admin manages subscriptions" on public.subscriptions
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "platform admin manages subscription plans" on public.subscription_plans;
create policy "platform admin manages subscription plans" on public.subscription_plans
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "platform admin manages businesses" on public.businesses;
create policy "platform admin manages businesses" on public.businesses
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 4. Super Admin Add / Modify / Extend Subscription RPC
drop function if exists public.platform_set_subscription(uuid, text, text, text);
drop function if exists public.platform_set_subscription(uuid, text, text, text, timestamptz);
create or replace function public.platform_set_subscription(
  p_business_id uuid,
  p_plan_code text,
  p_status text,
  p_period text default 'monthly',
  p_ends_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_ends_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  if p_status not in ('active', 'trialing', 'past_due', 'cancelled', 'expired') then
    raise exception 'Invalid subscription status: %', p_status;
  end if;

  -- Calculate expiry based on period or custom date
  if p_ends_at is not null then
    v_ends_at := p_ends_at;
  elsif p_status = 'trialing' then
    v_ends_at := now() + interval '14 days';
  elsif p_status = 'active' and p_period = 'annual' then
    v_ends_at := now() + interval '1 year';
  elsif p_status = 'active' and p_period = 'lifetime' then
    v_ends_at := '2099-12-31 23:59:59+00'::timestamptz;
  elsif p_status = 'active' then
    v_ends_at := now() + interval '1 month';
  else
    v_ends_at := null;
  end if;

  -- Deactivate previous subscriptions for this business
  update public.subscriptions
  set status = 'expired'
  where business_id = p_business_id and status in ('active', 'trialing');

  -- Insert new active subscription record
  insert into public.subscriptions (
    business_id, plan_code, status, starts_at, ends_at
  ) values (
    p_business_id, p_plan_code, p_status, now(), v_ends_at
  )
  returning * into v_sub;

  return to_jsonb(v_sub);
end $$;
grant execute on function public.platform_set_subscription(uuid, text, text, text, timestamptz) to authenticated;

-- 5. Super Admin Delete / Revoke Subscription RPC
create or replace function public.platform_delete_subscription(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  delete from public.subscriptions where business_id = p_business_id;
  return true;
end $$;
grant execute on function public.platform_delete_subscription(uuid) to authenticated;

-- 6. Super Admin Delete Business Workspace RPC
create or replace function public.platform_delete_business(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  delete from public.businesses where id = p_business_id;
  return true;
end $$;
grant execute on function public.platform_delete_business(uuid) to authenticated;

-- 7. Super Admin Create / Edit Subscription Plan RPC
create or replace function public.platform_create_plan(
  p_code text,
  p_name text,
  p_monthly_price_paise integer,
  p_annual_price_paise integer,
  p_max_users integer,
  p_max_products integer,
  p_features jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  insert into public.subscription_plans (
    code, name, monthly_price_paise, annual_price_paise, max_users, max_products, features, is_active
  ) values (
    p_code, p_name, p_monthly_price_paise, p_annual_price_paise, p_max_users, p_max_products, coalesce(p_features, '{}'::jsonb), true
  )
  on conflict (code) do update set
    name = excluded.name,
    monthly_price_paise = excluded.monthly_price_paise,
    annual_price_paise = excluded.annual_price_paise,
    max_users = excluded.max_users,
    max_products = excluded.max_products,
    features = excluded.features,
    is_active = true
  returning * into v_plan;

  return to_jsonb(v_plan);
end $$;
grant execute on function public.platform_create_plan to authenticated;

-- 8. Super Admin Delete / Deactivate Subscription Plan RPC
create or replace function public.platform_delete_plan(p_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  update public.subscription_plans set is_active = false where code = p_code;
  return true;
end $$;
grant execute on function public.platform_delete_plan(text) to authenticated;

-- 9. Comprehensive Platform Overview with Full Details
create or replace function public.platform_business_overview()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
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
        'invoice_prefix', b.invoice_prefix,
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

-- Migration 009: Custom Business Invoice Branding & White-Label Support

-- 1. Extend businesses table with custom branding fields
alter table public.businesses add column if not exists brand_name text;
alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists brand_color varchar(20) default '#2563eb';
alter table public.businesses add column if not exists invoice_footer text default 'Thank you for your business!';
alter table public.businesses add column if not exists show_logo boolean default true;
alter table public.businesses add column if not exists show_contact boolean default true;
alter table public.businesses add column if not exists show_gstin boolean default true;
alter table public.businesses add column if not exists show_platform_branding boolean default true;
alter table public.businesses add column if not exists invoice_template text default 'modern';
alter table public.businesses add column if not exists branding_mode text default 'business';

-- Populate brand_name from name for existing businesses
update public.businesses set brand_name = name where brand_name is null;

-- 2. Create Storage Bucket for business-logos (if storage extension is available)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('business-logos', 'business-logos', true)
    on conflict (id) do update set public = true;

    -- Bucket Policies
    drop policy if exists "public read for business logos" on storage.objects;
    create policy "public read for business logos" on storage.objects
      for select using (bucket_id = 'business-logos');

    drop policy if exists "authenticated users upload business logos" on storage.objects;
    create policy "authenticated users upload business logos" on storage.objects
      for insert to authenticated with check (bucket_id = 'business-logos');

    drop policy if exists "authenticated users update business logos" on storage.objects;
    create policy "authenticated users update business logos" on storage.objects
      for update to authenticated using (bucket_id = 'business-logos');

    drop policy if exists "authenticated users delete business logos" on storage.objects;
    create policy "authenticated users delete business logos" on storage.objects
      for delete to authenticated using (bucket_id = 'business-logos');
  end if;
end $$;

-- 3. Helper RPC to update business invoice branding
create or replace function public.update_business_branding(
  p_business_id uuid,
  p_brand_name text default null,
  p_logo_url text default null,
  p_brand_color text default null,
  p_invoice_footer text default null,
  p_show_logo boolean default null,
  p_show_contact boolean default null,
  p_show_gstin boolean default null,
  p_show_platform_branding boolean default null,
  p_invoice_template text default null,
  p_branding_mode text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_biz public.businesses%rowtype;
begin
  if not is_business_member(p_business_id) and not public.is_platform_admin() then
    raise exception 'Access denied for business %', p_business_id;
  end if;

  update public.businesses set
    brand_name = coalesce(p_brand_name, brand_name),
    logo_url = coalesce(p_logo_url, logo_url),
    brand_color = coalesce(p_brand_color, brand_color),
    invoice_footer = coalesce(p_invoice_footer, invoice_footer),
    show_logo = coalesce(p_show_logo, show_logo),
    show_contact = coalesce(p_show_contact, show_contact),
    show_gstin = coalesce(p_show_gstin, show_gstin),
    show_platform_branding = coalesce(p_show_platform_branding, show_platform_branding),
    invoice_template = coalesce(p_invoice_template, invoice_template),
    branding_mode = coalesce(p_branding_mode, branding_mode)
  where id = p_business_id
  returning * into v_biz;

  return to_jsonb(v_biz);
end $$;
grant execute on function public.update_business_branding to authenticated;


-- Migration 010: Vegetable & Fruits Shop Category & Fresh Produce Template

-- 1. Insert Vegetable & Fruits Shop into preloaded business categories
insert into public.business_categories (
  code, name, sector, template_type, item_label, customer_label, custom_fields
) values (
  'vegetable_fruits_shop',
  'Vegetable & Fruits Shop',
  'Retail & Grocery',
  'retail_supermarket',
  'Produce / Fruit / Vegetable',
  'Customer Name',
  '[{"name":"weighing_scale","label":"Weighing Scale / Counter No","type":"text"},{"name":"batch_lot","label":"Harvest / Lot Batch","type":"text"},{"name":"delivery_slot","label":"Delivery Slot","type":"text"}]'::jsonb
), (
  'fruits_vegetables_shop',
  'Vegetable & Fruits Shop',
  'Retail & Grocery',
  'retail_supermarket',
  'Produce / Fruit / Vegetable',
  'Customer Name',
  '[{"name":"weighing_scale","label":"Weighing Scale / Counter No","type":"text"}]'::jsonb
)
on conflict (code) do update set
  name = excluded.name,
  sector = excluded.sector,
  template_type = excluded.template_type,
  item_label = excluded.item_label,
  customer_label = excluded.customer_label,
  custom_fields = excluded.custom_fields;

-- 2. Update category seeding function to support vegetable_fruits_shop
create or replace function public.seed_business_categories(p_business_id uuid, p_business_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_business_type in ('vegetable_fruits_shop', 'fruits_vegetables_shop') then
    insert into public.categories (business_id, name) values
      (p_business_id, 'Fresh Vegetables'),
      (p_business_id, 'Fresh Fruits'),
      (p_business_id, 'Leafy Greens & Herbs'),
      (p_business_id, 'Exotic & Organic Produce'),
      (p_business_id, 'Tubers & Root Vegetables'),
      (p_business_id, 'Sprouts & Microgreens'),
      (p_business_id, 'Fresh Cut & Ready-to-Cook'),
      (p_business_id, 'Seasonal Specials'),
      (p_business_id, 'Dry Fruits & Nuts')
    on conflict (business_id, name) do nothing;

  elsif p_business_type = 'supermarket' then
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

  elsif p_business_type = 'retail' or p_business_type = 'retail_shop' then
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

-- 3. Update starter items seeding function with fresh fruits and vegetables (0% GST)
create or replace function public.seed_category_starter_items(p_business_id uuid, p_category_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_category_code in ('vegetable_fruits_shop', 'fruits_vegetables_shop') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Fresh Red Onion (1kg)', 'kg', 35.00, 0, 200),
      (p_business_id, 'Hybrid Tomato (1kg)', 'kg', 40.00, 0, 150),
      (p_business_id, 'Jyoti Potato (1kg)', 'kg', 30.00, 0, 250),
      (p_business_id, 'Fresh Ooty Carrot (1kg)', 'kg', 60.00, 0, 80),
      (p_business_id, 'Fresh Coriander Leaves', 'bunch', 15.00, 0, 100),
      (p_business_id, 'Fresh Mint Leaves', 'bunch', 10.00, 0, 100),
      (p_business_id, 'Green Chillies (250g)', 'pack', 20.00, 0, 60),
      (p_business_id, 'Fresh Ginger / Adrak (250g)', 'pack', 30.00, 0, 50),
      (p_business_id, 'Fresh Garlic / Lahsun (250g)', 'pack', 45.00, 0, 50),
      (p_business_id, 'Robusta Banana (1 Dozen)', 'dozen', 50.00, 0, 60),
      (p_business_id, 'Shimla Apple Premium (1kg)', 'kg', 180.00, 0, 40),
      (p_business_id, 'Nagpur Sweet Orange (1kg)', 'kg', 90.00, 0, 50),
      (p_business_id, 'Pomegranate / Kesar Anar (1kg)', 'kg', 160.00, 0, 35),
      (p_business_id, 'Fresh Tender Coconut', 'pcs', 45.00, 0, 80),
      (p_business_id, 'Palak / Spinach', 'bunch', 20.00, 0, 70)
    on conflict do nothing;

  elsif p_category_code in ('hospital', 'clinic', 'medical_centre') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'General Consultation', 'visit', 400.00, 0, 999),
      (p_business_id, 'Specialist Consultation', 'visit', 800.00, 0, 999),
      (p_business_id, 'Blood Pressure & Sugar Check', 'test', 100.00, 0, 999),
      (p_business_id, 'Wound Dressing & Bandage', 'service', 250.00, 0, 999),
      (p_business_id, 'ECG Investigation', 'test', 350.00, 0, 999)
    on conflict do nothing;

  elsif p_category_code in ('supermarket', 'grocery_store') then
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Basmati Rice 5kg', 'bag', 490.00, 5, 50),
      (p_business_id, 'Toor Dal Premium 1kg', 'kg', 165.00, 0, 100),
      (p_business_id, 'Sunflower Cooking Oil 1L', 'pouch', 135.00, 5, 80),
      (p_business_id, 'Pure Ghee 500ml', 'jar', 340.00, 12, 40),
      (p_business_id, 'Wheat Flour (Atta) 5kg', 'bag', 245.00, 0, 60)
    on conflict do nothing;

  else
    insert into public.products (business_id, name, unit, selling_price, gst_rate, stock_qty) values
      (p_business_id, 'Standard Product / Produce', 'kg', 50.00, 0, 100),
      (p_business_id, 'General Grocery / Item', 'pcs', 100.00, 5, 100)
    on conflict do nothing;
  end if;
end $$;
grant execute on function public.seed_category_starter_items(uuid, text) to authenticated;
