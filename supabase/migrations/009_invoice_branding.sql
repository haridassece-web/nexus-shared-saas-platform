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

