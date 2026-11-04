import { Router } from "express";
import { z } from "zod";
import type { Request, Response } from "express";

const router = Router();
const fail = (r: Response, e: any) =>
  r.status(400).json({ error: e?.message || "Request failed" });

// Customer business admin: subscription and plan information
router.get("/plans", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("subscription_plans")
    .select(
      "code,name,monthly_price_paise,annual_price_paise,max_users,max_products,features"
    )
    .eq("is_active", true)
    .order("monthly_price_paise");
  if (error) return fail(res, error);
  res.json(data);
});

router.get("/subscription", async (req: Request, res: Response) => {
  const { data, error } = await req.db!.rpc("tenant_subscription_status", {
    p_business_id: req.businessId!,
  });
  if (error) return fail(res, error);
  res.json(data);
});

// Nexus Creative Super Admin APIs. Access is granted only by platform_admins table.
router.get("/platform/overview", async (req: Request, res: Response) => {
  const { data, error } = await req.db!.rpc("platform_business_overview");
  if (error) return res.status(403).json({ error: error.message });
  res.json(data);
});

router.post("/platform/subscriptions", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        business_id: z.string().uuid(),
        plan_code: z.string(),
        status: z.enum([
          "active",
          "trialing",
          "past_due",
          "cancelled",
          "expired",
        ]),
        period: z.enum(["monthly", "annual"]).default("monthly"),
      })
      .parse(req.body);
    const { data, error } = await req.db!.rpc("platform_set_subscription", {
      p_business_id: p.business_id,
      p_plan_code: p.plan_code,
      p_status: p.status,
      p_period: p.period,
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});


router.post("/platform/plans", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        code: z.string().min(2).max(40),
        name: z.string().min(2).max(80),
        monthly_price_paise: z.number().nonnegative(),
        annual_price_paise: z.number().nonnegative(),
        max_users: z.number().int().positive(),
        max_products: z.number().int().positive(),
        features: z.record(z.any()).default({}),
      })
      .parse(req.body);
    const { data, error } = await req
      .db!.from("subscription_plans")
      .upsert({ ...p, is_active: true }, { onConflict: "code" })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/platform/plans", async (req: Request, res: Response) => {
  try {
    const p = z.object({ code: z.string().min(1) }).parse(req.body);
    const { error } = await req.db!.from("subscription_plans").delete().eq("code", p.code);
    if (error) throw error;
    res.json({ success: true, deleted: p.code });
  } catch (e) {
    fail(res, e);
  }
});

router.get("/businesses", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("business_users")
    .select("role,businesses(id,name,business_type,gstin,state_code)")
    .eq("user_id", req.userId!);
  if (error) return fail(res, error);
  res.json((data || []).map((x: any) => ({ ...x.businesses, role: x.role })));
});

router.post("/businesses", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(2).max(160),
        business_type: z.enum([
          "retail",
          "supermarket",
          "salon",
          "gym",
          "clinic",
          "barbershop",
          "general_pos",
        ]),
        gstin: z.string().max(15).nullable().optional(),
        state_code: z.string().length(2).optional(),
      })
      .parse(req.body);
    const { data, error } = await req.db!.rpc("create_business", {
      p_name: p.name,
      p_type: p.business_type,
      p_gstin: p.gstin || null,
      p_state_code: p.state_code || null,
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

// Categories
router.get("/categories", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("categories")
    .select("id,name,description")
    .eq("business_id", req.businessId!)
    .order("name");
  if (error) return fail(res, error);
  res.json(data);
});

router.post("/categories", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1).max(100),
        description: z.string().max(300).nullable().optional(),
      })
      .parse(req.body);
    const { data, error } = await req
      .db!.from("categories")
      .insert({ ...p, business_id: req.businessId! })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.get("/retail/products", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("products")
    .select(
      "id,name,sku,barcode,hsn_code,unit,selling_price,purchase_price,gst_rate,stock_qty,low_stock_threshold,category_id,categories(name)"
    )
    .eq("business_id", req.businessId!)
    .eq("is_active", true)
    .order("name");
  if (error) return fail(res, error);
  res.json(
    (data || []).map((p: any) => ({
      ...p,
      category_name: p.categories?.name || null,
    }))
  );
});

router.post("/retail/products", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1),
        sku: z.string().nullable().optional(),
        barcode: z.string().nullable().optional(),
        hsn_code: z.string().nullable().optional(),
        category_id: z.string().uuid().nullable().optional(),
        unit: z.string().default("pcs"),
        selling_price: z.number().nonnegative(),
        purchase_price: z.number().nonnegative().optional(),
        gst_rate: z.number().min(0).max(28),
        stock_qty: z.number().int().nonnegative(),
        low_stock_threshold: z.number().int().nonnegative().optional(),
      })
      .parse(req.body);
    const limit = Number(req.subscription?.plan?.max_products || 500);
    const { count } = await req
      .db!.from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", req.businessId!);
    if ((count || 0) >= limit)
      throw new Error(`Your plan allows up to ${limit} products. Upgrade your plan.`);
    const { data, error } = await req
      .db!.from("products")
      .insert({ ...p, business_id: req.businessId })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

// Bulk products import
router.post("/retail/products/bulk", async (req: Request, res: Response) => {
  try {
    const itemsSchema = z.array(
      z.object({
        name: z.string().min(1),
        sku: z.string().nullable().optional(),
        barcode: z.string().nullable().optional(),
        hsn_code: z.string().nullable().optional(),
        category_id: z.string().uuid().nullable().optional(),
        unit: z.string().default("pcs"),
        selling_price: z.number().nonnegative(),
        purchase_price: z.number().nonnegative().optional(),
        gst_rate: z.number().min(0).max(28).default(0),
        stock_qty: z.number().int().nonnegative().default(0),
        low_stock_threshold: z.number().int().nonnegative().optional(),
      })
    );
    const items = itemsSchema.parse(Array.isArray(req.body) ? req.body : req.body.items);
    const { data, error } = await req
      .db!.from("products")
      .insert(items.map((i) => ({ ...i, business_id: req.businessId })))
      .select();
    if (error) throw error;
    res.status(201).json({ count: data?.length || 0, items: data });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/retail/invoices", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        customer_name: z.string().max(160).optional(),
        customer_phone: z.string().max(20).nullable().optional(),
        customer_state_code: z.string().length(2).nullable().optional(),
        payment_method: z.enum(["UPI", "Cash", "Card", "Bank transfer"]),
        payment_reference: z.string().max(120).nullable().optional(),
        items: z
          .array(
            z.object({
              product_id: z.string().uuid(),
              quantity: z.number().int().positive(),
            })
          )
          .min(1),
      })
      .parse(req.body);
    const { data, error } = await req.db!.rpc("create_gst_invoice", {
      p_business_id: req.businessId!,
      p_customer_name: p.customer_name || "Walk-in",
      p_customer_phone: p.customer_phone || null,
      p_customer_state_code: p.customer_state_code || null,
      p_payment_method: p.payment_method,
      p_payment_reference: p.payment_reference || null,
      p_items: p.items,
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.get("/customers", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("customers")
    .select("id,name,phone,email,gstin,state_code,billing_address,created_at")
    .eq("business_id", req.businessId!)
    .order("name");
  if (error) return fail(res, error);
  res.json(data);
});

router.post("/customers", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1).max(160),
        phone: z.string().max(20).nullable().optional(),
        email: z.string().email().nullable().optional(),
        gstin: z.string().max(15).nullable().optional(),
        state_code: z.string().length(2).nullable().optional(),
        billing_address: z.string().max(500).nullable().optional(),
      })
      .parse(req.body);
    const { data, error } = await req
      .db!.from("customers")
      .upsert(
        { ...p, business_id: req.businessId },
        { onConflict: "business_id,phone" }
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.post("/inventory/adjust", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        product_id: z.string().uuid(),
        quantity_change: z.number().int().refine((n) => n !== 0),
        note: z.string().max(300).optional(),
      })
      .parse(req.body);
    const { data, error } = await req.db!.rpc("adjust_stock", {
      p_business_id: req.businessId!,
      p_product_id: p.product_id,
      p_quantity_change: p.quantity_change,
      p_note: p.note || null,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.get("/inventory/movements", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("stock_movements")
    .select(
      "id,product_id,movement_type,quantity_change,note,created_at,products(name)"
    )
    .eq("business_id", req.businessId!)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail(res, error);
  res.json(data);
});

router.get("/payments", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("payments")
    .select(
      "id,invoice_id,amount,method,reference,status,created_at,invoices(invoice_number,customer_name)"
    )
    .eq("business_id", req.businessId!)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail(res, error);
  res.json(data);
});

router.get("/retail/reports/sales", async (req: Request, res: Response) => {
  const from = String(req.query.from || "2000-01-01"),
    to = String(req.query.to || "2100-01-01");
  const { data, error } = await req
    .db!.from("invoices")
    .select("id,invoice_number,customer_name,total,payment_method,created_at")
    .eq("business_id", req.businessId!)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59.999`)
    .order("created_at", { ascending: false });
  if (error) return fail(res, error);
  res.json(data);
});

export default router;
