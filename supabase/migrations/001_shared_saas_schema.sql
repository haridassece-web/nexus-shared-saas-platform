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
