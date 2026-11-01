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
