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

