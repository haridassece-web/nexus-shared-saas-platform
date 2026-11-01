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
