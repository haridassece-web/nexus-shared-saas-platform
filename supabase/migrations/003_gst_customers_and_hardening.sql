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
