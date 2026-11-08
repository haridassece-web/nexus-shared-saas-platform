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

// Nexus Creative Super Admin APIs (Owner: Haridass)
router.get("/platform/overview", async (req: Request, res: Response) => {
  try {
    const isSuperAdminEmail =
      req.userEmail?.toLowerCase().includes("haridass") ||
      req.userEmail?.toLowerCase() === "haridass.ece@gmail.com";

    // 1. Try database RPC first
    const { data: rpcData, error: rpcErr } = await req.db!.rpc("platform_business_overview");
    if (!rpcErr && rpcData) {
      return res.json({
        ...rpcData,
        adminEmail: req.userEmail || "haridass.ece@gmail.com",
        isOwner: isSuperAdminEmail,
        ownerName: "Haridass",
      });
    }

    // 2. Direct fallback query if RPC is not present or permissions restricted
    const { data: businesses, error: bErr } = await req
      .db!.from("businesses")
      .select("id, name, business_type, invoice_prefix, created_at")
      .order("created_at", { ascending: false });

    if (bErr) throw bErr;

    const { data: subs } = await req
      .db!.from("subscriptions")
      .select("id, business_id, plan_code, status, starts_at, ends_at")
      .order("created_at", { ascending: false });

    const { data: members } = await req
      .db!.from("business_users")
      .select("business_id, user_id, role");

    // Subscriptions map
    const subMap = new Map<string, any>();
    (subs || []).forEach((s) => {
      if (!subMap.has(s.business_id)) subMap.set(s.business_id, s);
    });

    const memberCountMap = new Map<string, number>();
    (members || []).forEach((m) => {
      memberCountMap.set(m.business_id, (memberCountMap.get(m.business_id) || 0) + 1);
    });

    let activeCount = 0;
    let trialingCount = 0;
    let expiredCount = 0;

    const bizRows = (businesses || []).map((b) => {
      const s = subMap.get(b.id);
      let status = s?.status || "trialing";
      if (
        s?.ends_at &&
        new Date(s.ends_at).getTime() <= Date.now() &&
        ["trialing", "active"].includes(s.status)
      ) {
        status = "expired";
      }
      if (status === "active") activeCount++;
      else if (status === "trialing") trialingCount++;
      else expiredCount++;

      return {
        id: b.id,
        name: b.name,
        business_type: b.business_type,
        invoice_prefix: b.invoice_prefix,
        created_at: b.created_at,
        owner_count: memberCountMap.get(b.id) || 1,
        subscription: s
          ? {
              id: s.id,
              plan_code: s.plan_code,
              status,
              starts_at: s.starts_at,
              ends_at: s.ends_at,
            }
          : undefined,
      };
    });

    res.json({
      summary: {
        businesses: bizRows.length,
        trialing: trialingCount,
        active: activeCount,
        expired: expiredCount,
      },
      businesses: bizRows,
      adminEmail: req.userEmail || "haridass.ece@gmail.com",
      isOwner: isSuperAdminEmail,
      ownerName: "Haridass",
    });
  } catch (e: any) {
    res.status(403).json({ error: e.message || "Failed to load platform overview" });
  }
});

// Super Admin: Update / Set Subscription
router.post("/platform/subscriptions", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        business_id: z.string().uuid(),
        plan_code: z.string().default("starter"),
        status: z.enum([
          "active",
          "trialing",
          "past_due",
          "cancelled",
          "expired",
        ]).default("active"),
        period: z
          .enum([
            "14days",
            "monthly",
            "3months",
            "6months",
            "annual",
            "lifetime",
            "custom",
          ])
          .default("monthly"),
        ends_at: z.string().optional().nullable(),
      })
      .parse(req.body);

    let endsAt: string | null = p.ends_at || null;
    const now = Date.now();
    if (!endsAt) {
      if (p.period === "14days" || p.status === "trialing") {
        endsAt = new Date(now + 14 * 86400000).toISOString();
      } else if (p.period === "monthly") {
        endsAt = new Date(now + 30 * 86400000).toISOString();
      } else if (p.period === "3months") {
        endsAt = new Date(now + 90 * 86400000).toISOString();
      } else if (p.period === "6months") {
        endsAt = new Date(now + 180 * 86400000).toISOString();
      } else if (p.period === "annual") {
        endsAt = new Date(now + 365 * 86400000).toISOString();
      } else if (p.period === "lifetime") {
        endsAt = "2099-12-31T23:59:59.000Z";
      } else {
        endsAt = new Date(now + 30 * 86400000).toISOString();
      }
    }

    // Try RPC first
    const { data, error } = await req.db!.rpc("platform_set_subscription", {
      p_business_id: p.business_id,
      p_plan_code: p.plan_code,
      p_status: p.status,
      p_period: p.period === "lifetime" ? "lifetime" : p.period === "annual" ? "annual" : "monthly",
      p_ends_at: endsAt,
    });

    if (!error && data) {
      return res.status(201).json(data);
    }

    // Fallback: Direct database insert/update
    await req.db!
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("business_id", p.business_id)
      .in("status", ["active", "trialing"]);

    const { data: inserted, error: insErr } = await req.db!
      .from("subscriptions")
      .insert({
        business_id: p.business_id,
        plan_code: p.plan_code,
        status: p.status,
        starts_at: new Date().toISOString(),
        ends_at: endsAt,
      })
      .select()
      .single();

    if (insErr) throw insErr;
    res.status(201).json(inserted);
  } catch (e) {
    fail(res, e);
  }
});

// Super Admin: 1-Click Activate Account
router.post("/platform/subscriptions/activate", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        business_id: z.string().uuid(),
        plan_code: z.string().default("starter"),
        period: z.enum(["14days", "monthly", "annual", "lifetime"]).default("monthly"),
      })
      .parse(req.body);

    const now = Date.now();
    let endsAt = new Date(now + 30 * 86400000).toISOString();
    if (p.period === "annual") endsAt = new Date(now + 365 * 86400000).toISOString();
    else if (p.period === "lifetime") endsAt = "2099-12-31T23:59:59.000Z";
    else if (p.period === "14days") endsAt = new Date(now + 14 * 86400000).toISOString();

    await req.db!
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("business_id", p.business_id)
      .in("status", ["active", "trialing"]);

    const { data, error } = await req.db!
      .from("subscriptions")
      .insert({
        business_id: p.business_id,
        plan_code: p.plan_code,
        status: "active",
        starts_at: new Date().toISOString(),
        ends_at: endsAt,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, activated: data });
  } catch (e) {
    fail(res, e);
  }
});

// Super Admin: 1-Click Activate Multiple / All Accounts
router.post("/platform/subscriptions/activate-batch", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        business_ids: z.array(z.string().uuid()),
        plan_code: z.string().default("starter"),
        period: z.enum(["monthly", "annual", "lifetime"]).default("monthly"),
      })
      .parse(req.body);

    const now = Date.now();
    let endsAt = new Date(now + 30 * 86400000).toISOString();
    if (p.period === "annual") endsAt = new Date(now + 365 * 86400000).toISOString();
    else if (p.period === "lifetime") endsAt = "2099-12-31T23:59:59.000Z";

    const activated: any[] = [];
    for (const bid of p.business_ids) {
      await req.db!
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("business_id", bid)
        .in("status", ["active", "trialing"]);

      const { data } = await req.db!
        .from("subscriptions")
        .insert({
          business_id: bid,
          plan_code: p.plan_code,
          status: "active",
          starts_at: new Date().toISOString(),
          ends_at: endsAt,
        })
        .select()
        .single();

      if (data) activated.push(data);
    }

    res.json({ success: true, count: activated.length, activated });
  } catch (e) {
    fail(res, e);
  }
});

// Super Admin: Revoke / Delete Subscription
router.delete("/platform/subscriptions", async (req: Request, res: Response) => {
  try {
    const p = z.object({ business_id: z.string().uuid() }).parse(req.body);
    const { error } = await req.db!
      .from("subscriptions")
      .delete()
      .eq("business_id", p.business_id);
    if (error) throw error;
    res.json({ success: true, business_id: p.business_id });
  } catch (e) {
    fail(res, e);
  }
});

// Super Admin: Delete Business Workspace
router.delete("/platform/businesses", async (req: Request, res: Response) => {
  try {
    const p = z.object({ business_id: z.string().uuid() }).parse(req.body);
    const { error } = await req.db!.from("businesses").delete().eq("id", p.business_id);
    if (error) throw error;
    res.json({ success: true, business_id: p.business_id });
  } catch (e) {
    fail(res, e);
  }
});

// Super Admin: Create / Edit Subscription Plan
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

// Super Admin: Delete Subscription Plan
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

// Workspace & Businesses
router.get("/businesses", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("business_users")
    .select(
      "role,businesses(id,name,business_type,invoice_prefix,state_code,phone,address,gstin,pan,bank_account_no,bank_ifsc,bank_name,upi_id,terms_conditions)"
    )
    .eq("user_id", req.userId!);
  if (error) return fail(res, error);
  res.json(
    data.map((r: any) => ({
      ...r.businesses,
      role: r.role,
    }))
  );
});

router.post("/businesses", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(2).max(100),
        business_type: z.string().min(2).max(50),
        invoice_prefix: z.string().max(10).optional(),
        state_code: z.string().length(2).default("33"),
      })
      .parse(req.body);
    const { data, error } = await req.db!.rpc("create_business_workspace", {
      p_name: p.name,
      p_business_type: p.business_type,
      p_invoice_prefix: p.invoice_prefix || "INV",
      p_state_code: p.state_code,
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.post("/businesses/seed-all", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        businesses: z.array(
          z.object({
            name: z.string().min(2),
            business_type: z.string().min(2),
          })
        ),
      })
      .parse(req.body);

    const created: any[] = [];
    for (const b of p.businesses) {
      const { data, error } = await req.db!.rpc("create_business_workspace", {
        p_name: b.name,
        p_business_type: b.business_type,
        p_invoice_prefix: b.name.slice(0, 3).toUpperCase(),
        p_state_code: "33",
      });
      if (!error && data) {
        created.push(data);
      }
    }
    res.status(201).json({ count: created.length, businesses: created });
  } catch (e) {
    fail(res, e);
  }
});

// Categories
router.get("/categories", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("categories")
    .select("id, name, description, is_active")
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
        description: z.string().max(255).optional(),
      })
      .parse(req.body);
    const { data, error } = await req
      .db!.from("categories")
      .insert({ ...p, business_id: req.businessId })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.post("/categories/bulk", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        categories: z.array(
          z.object({
            name: z.string().min(1).max(100),
            description: z.string().max(255).optional(),
          })
        ),
      })
      .parse(req.body);

    const rows = p.categories.map((c) => ({
      name: c.name,
      description: c.description || null,
      business_id: req.businessId,
    }));

    const { data, error } = await req
      .db!.from("categories")
      .insert(rows)
      .select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/categories/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await req
      .db!.from("products")
      .update({ category_id: null })
      .eq("business_id", req.businessId!)
      .eq("category_id", id);

    const { error } = await req
      .db!.from("categories")
      .delete()
      .eq("business_id", req.businessId!)
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true, id });
  } catch (e) {
    fail(res, e);
  }
});

// Retail Products
router.get("/retail/products", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("products")
    .select(
      "id,name,sku,barcode,hsn_code,selling_price,cost_price,gst_rate,stock_qty,category_id,is_service"
    )
    .eq("business_id", req.businessId!)
    .eq("is_active", true)
    .order("name");
  if (error) return fail(res, error);
  res.json(data);
});

router.post("/retail/products", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1).max(200),
        sku: z.string().max(60).optional(),
        barcode: z.string().max(80).optional(),
        hsn_code: z.string().max(16).optional(),
        selling_price: z.number().nonnegative(),
        cost_price: z.number().nonnegative().default(0),
        gst_rate: z.number().min(0).max(40).default(0),
        stock_qty: z.number().default(0),
        category_id: z.string().uuid().optional().nullable(),
        is_service: z.boolean().default(false),
      })
      .parse(req.body);
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

router.post("/retail/products/bulk", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        products: z.array(
          z.object({
            name: z.string().min(1).max(200),
            sku: z.string().max(60).optional(),
            barcode: z.string().max(80).optional(),
            hsn_code: z.string().max(16).optional(),
            selling_price: z.number().nonnegative(),
            cost_price: z.number().nonnegative().default(0),
            gst_rate: z.number().min(0).max(40).default(0),
            stock_qty: z.number().default(0),
            category_id: z.string().uuid().optional().nullable(),
            is_service: z.boolean().default(false),
          })
        ),
      })
      .parse(req.body);

    const rows = p.products.map((prod) => ({
      ...prod,
      business_id: req.businessId,
    }));

    const { data, error } = await req.db!.from("products").insert(rows).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

// Invoices
router.post("/retail/invoices", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        customer_name: z.string().min(1).max(120),
        customer_phone: z.string().max(20).optional(),
        customer_gstin: z.string().max(15).optional(),
        order_type: z.string().max(50).default("Counter Sale"),
        custom_fields: z.record(z.any()).optional().default({}),
        payment_method: z.string().default("cash"),
        payment_reference: z.string().optional(),
        items: z
          .array(
            z.object({
              product_id: z.string().uuid().optional(),
              description: z.string().min(1),
              hsn_code: z.string().optional(),
              quantity: z.number().positive(),
              unit_price: z.number().nonnegative(),
              gst_rate: z.number().min(0).max(40),
            })
          )
          .min(1),
      })
      .parse(req.body);

    const { data, error } = await req.db!.rpc("create_invoice_with_items", {
      p_business_id: req.businessId!,
      p_customer_name: p.customer_name,
      p_customer_phone: p.customer_phone || null,
      p_customer_gstin: p.customer_gstin || null,
      p_order_type: p.order_type,
      p_custom_fields: p.custom_fields,
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

// Customers
router.get("/customers", async (req: Request, res: Response) => {
  const { data, error } = await req
    .db!.from("customers")
    .select("id,name,phone,email,gstin,city")
    .eq("business_id", req.businessId!)
    .order("name");
  if (error) return fail(res, error);
  res.json(data);
});

router.post("/customers", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1).max(120),
        phone: z.string().max(20).optional(),
        email: z.string().email().optional(),
        gstin: z.string().max(15).optional(),
        city: z.string().max(80).optional(),
      })
      .parse(req.body);
    const { data, error } = await req
      .db!.from("customers")
      .insert({ ...p, business_id: req.businessId })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e);
  }
});

// Inventory
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

// Payments
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

// Reports
router.get("/retail/reports/sales", async (req: Request, res: Response) => {
  const from = String(req.query.from || "2000-01-01"),
    to = String(req.query.to || "2100-01-01");
  const { data, error } = await req
    .db!.from("invoices")
    .select(
      "id,invoice_number,customer_name,customer_phone,order_type,subtotal,tax_total,cgst_total,sgst_total,igst_total,total,payment_method,payment_status,custom_fields,created_at,invoice_items(id,description,quantity,unit_price,gst_rate,taxable_amount,tax_amount,line_total,hsn_code)"
    )
    .eq("business_id", req.businessId!)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59.999`)
    .order("created_at", { ascending: false });
  if (error) return fail(res, error);
  res.json(data);
});

router.get("/retail/reports/sales/export.csv", async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from || "2000-01-01"),
      to = String(req.query.to || "2100-01-01");
    const { data, error } = await req
      .db!.from("invoices")
      .select(
        "id,invoice_number,customer_name,customer_phone,order_type,subtotal,tax_total,cgst_total,sgst_total,igst_total,total,payment_method,payment_status,created_at"
      )
      .eq("business_id", req.businessId!)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59.999`)
      .order("created_at", { ascending: false });

    if (error) return fail(res, error);

    const headers = [
      "Invoice Number",
      "Date",
      "Customer Name",
      "Customer Phone",
      "Order Type",
      "Payment Mode",
      "Status",
      "Subtotal (INR)",
      "CGST (INR)",
      "SGST (INR)",
      "IGST (INR)",
      "Tax Total (INR)",
      "Grand Total (INR)",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(",")];
    (data || []).forEach((row: any) => {
      csvRows.push(
        [
          escapeCsv(row.invoice_number),
          escapeCsv(new Date(row.created_at).toLocaleString("en-IN")),
          escapeCsv(row.customer_name),
          escapeCsv(row.customer_phone || ""),
          escapeCsv(row.order_type || "Counter Sale"),
          escapeCsv(row.payment_method),
          escapeCsv(row.payment_status || "paid"),
          Number(row.subtotal || 0).toFixed(2),
          Number(row.cgst_total || 0).toFixed(2),
          Number(row.sgst_total || 0).toFixed(2),
          Number(row.igst_total || 0).toFixed(2),
          Number(row.tax_total || 0).toFixed(2),
          Number(row.total || 0).toFixed(2),
        ].join(",")
      );
    });

    const csvContent = "\uFEFF" + csvRows.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales_report_backup_${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csvContent);
  } catch (e) {
    fail(res, e);
  }
});

export default router;
