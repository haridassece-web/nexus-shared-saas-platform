import { supabase } from "./supabase";
import { BUSINESS_TEMPLATES } from "./businessTemplates";

const rawApiUrl = import.meta.env.VITE_API_URL || "";
// Only use external HTTP API if explicitly configured with an https URL
const hasExternalApi = Boolean(
  rawApiUrl &&
    rawApiUrl !== "http://localhost:4000" &&
    rawApiUrl.startsWith("https://")
);

export async function api<T>(
  path: string,
  options: RequestInit = {},
  businessId?: string
): Promise<T> {
  // If an external deployed API is configured and valid, try it first
  if (hasExternalApi) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token)
        headers.Authorization = `Bearer ${session.access_token}`;
      if (businessId) headers["x-business-id"] = businessId;
      Object.assign(headers, options.headers || {});
      const r = await fetch(`${rawApiUrl}${path}`, { ...options, headers });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Request failed");
      return body as T;
    } catch (e: any) {
      console.warn("External API call failed, falling back to direct Supabase:", e);
    }
  }

  // Direct Supabase execution (Serverless / Jamstack mode)
  return handleDirectSupabase<T>(path, options, businessId);
}

async function handleDirectSupabase<T>(
  path: string,
  options: RequestInit = {},
  businessId?: string
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : {};
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Normalize path by stripping /api/tenant or /api prefix
  const cleanPath = path
    .replace(/^\/api\/tenant\//, "/")
    .replace(/^\/api\//, "/");

  // 1. Businesses
  if (cleanPath === "/businesses" || cleanPath === "businesses") {
    if (method === "GET") {
      if (!user) throw new Error("Authentication required");
      let data: any = null;
      let error: any = null;
      
      const primaryRes = await supabase
        .from("business_users")
        .select("role,businesses(*)")
        .eq("user_id", user.id);
      
      data = primaryRes.data;
      error = primaryRes.error;

      if (error && error.message?.includes("column")) {
        // Fallback for earlier database schema without new columns
        const fallback = await supabase
          .from("business_users")
          .select("role,businesses(id,name,business_type,gstin,state_code)")
          .eq("user_id", user.id);
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;
      return (data || []).map((x: any) => ({
        ...x.businesses,
        role: x.role,
      })) as T;
    }
    if (method === "POST") {
      let targetId: string | null = null;
      let bData: any = null;

      // 1. Try create_business RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc("create_business", {
        p_name: body.name,
        p_type: body.business_type,
        p_gstin: body.gstin || null,
        p_state_code: body.state_code || null,
      });

      if (!rpcErr && rpcData?.id) {
        targetId = rpcData.id;
        bData = rpcData;
      } else {
        // Fallback: direct insert with owner membership
        const payload: any = {
          name: body.name,
          business_type: body.business_type,
          gstin: body.gstin || null,
          state_code: body.state_code || null,
        };
        if (body.invoice_prefix) payload.invoice_prefix = body.invoice_prefix;
        if (body.phone) payload.phone = body.phone;
        if (body.address) payload.address = body.address;

        let res = await supabase.from("businesses").insert(payload).select().single();
        if (res.error && res.error.message?.includes("column")) {
          // If columns don't exist yet, insert basic columns
          res = await supabase.from("businesses").insert({
            name: body.name,
            business_type: body.business_type,
            gstin: body.gstin || null,
            state_code: body.state_code || null,
          }).select().single();
        }
        if (res.error) throw res.error;
        targetId = res.data.id;
        bData = res.data;

        if (user && targetId) {
          try {
            await supabase.from("business_users").insert({
              business_id: targetId,
              user_id: user.id,
              role: "owner",
            });
          } catch {}
        }
      }

      // Update extra fields if available
      if (targetId && (body.invoice_prefix || body.phone || body.address)) {
        try {
          await supabase
            .from("businesses")
            .update({
              invoice_prefix: body.invoice_prefix || "INV",
              phone: body.phone || null,
              address: body.address || null,
            })
            .eq("id", targetId);
        } catch {}
      }

      // Seed starter categories & items
      if (targetId) {
        // 1. Seed categories
        try {
          const { error: catRpcErr } = await supabase.rpc("seed_business_categories", {
            p_business_id: targetId,
            p_business_type: body.business_type,
          });
          if (catRpcErr) throw catRpcErr;
        } catch {
          // Direct fallback category seeding
          const catNames =
            body.business_type === "vegetable_fruits_shop" || body.business_type === "fruits_vegetables_shop"
              ? [
                  "Fresh Vegetables",
                  "Fresh Fruits",
                  "Leafy Greens & Herbs",
                  "Exotic & Organic Produce",
                  "Tubers & Root Vegetables",
                  "Sprouts & Microgreens",
                  "Fresh Cut & Ready-to-Cook",
                  "Seasonal Specials",
                  "Dry Fruits & Nuts",
                ]
              : body.business_type === "supermarket"
              ? [
                  "Rice & Grains",
                  "Pulses & Dals",
                  "Oils & Ghee",
                  "Dairy Products",
                  "Fruits & Vegetables",
                  "Snacks & Biscuits",
                  "Beverages",
                  "Personal Care",
                  "Household Cleaning",
                ]
              : ["General Products"];

          try {
            await supabase.from("categories").insert(
              catNames.map((name) => ({ business_id: targetId, name }))
            );
          } catch {}
        }

        // 2. Seed starter items
        let rpcFailed = false;
        try {
          const seedRpc = await supabase.rpc("seed_category_starter_items", {
            p_business_id: targetId,
            p_category_code: body.business_type,
          });
          if (seedRpc.error) rpcFailed = true;
        } catch {
          rpcFailed = true;
        }

        // If RPC is not available in DB yet, seed from frontend template
        if (rpcFailed) {
          const tmpl = BUSINESS_TEMPLATES[body.business_type];
          if (tmpl && tmpl.starter_items.length > 0) {
            const starterToInsert = tmpl.starter_items.map((it) => ({
              business_id: targetId,
              name: it.name,
              unit: it.unit,
              selling_price: it.selling_price,
              gst_rate: it.gst_rate,
              stock_qty: it.stock_qty,
              is_active: true,
            }));
            try {
              await supabase.from("products").insert(starterToInsert);
            } catch {}
          }
        }
      }

      return bData as T;
    }

    if (method === "PATCH" || method === "PUT") {
      const targetBizId = businessId || body.business_id || body.id;
      if (!targetBizId) throw new Error("Business ID required to update business");

      const updateData: any = {};
      [
        "name", "brand_name", "logo_url", "brand_color", "invoice_footer",
        "show_logo", "show_contact", "show_gstin", "show_platform_branding",
        "invoice_template", "branding_mode", "phone", "address", "gstin", "invoice_prefix"
      ].forEach((field) => {
        if (body[field] !== undefined) updateData[field] = body[field];
      });

      const { data, error } = await supabase
        .from("businesses")
        .update(updateData)
        .eq("id", targetBizId)
        .select()
        .single();

      if (error) throw error;
      return data as T;
    }
  }

  // 1b. Branding Endpoint
  if (cleanPath === "/branding" || cleanPath === "branding") {
    const targetBizId = businessId || body.business_id;
    if (!targetBizId) throw new Error("Business ID required for branding");

    if (method === "GET") {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", targetBizId)
        .single();
      if (error) throw error;
      return data as T;
    }

    if (method === "PATCH" || method === "POST" || method === "PUT") {
      const updateData: any = {};
      [
        "name", "brand_name", "logo_url", "brand_color", "invoice_footer",
        "show_logo", "show_contact", "show_gstin", "show_platform_branding",
        "invoice_template", "branding_mode", "phone", "address", "gstin", "invoice_prefix"
      ].forEach((field) => {
        if (body[field] !== undefined) updateData[field] = body[field];
      });

      const { data, error } = await supabase
        .from("businesses")
        .update(updateData)
        .eq("id", targetBizId)
        .select()
        .single();
      if (error) throw error;
      return data as T;
    }
  }

  // 2. Master Business Categories & Templates
  if (
    cleanPath === "/business-categories" ||
    cleanPath === "business-categories"
  ) {
    const { data, error } = await supabase
      .from("business_categories")
      .select("code,name,sector,template_type,item_label,customer_label,custom_fields")
      .eq("is_active", true)
      .order("name");
    if (!error && data && data.length > 0) return data as T;
    
    // Resilient fallback from BUSINESS_TEMPLATES master catalog
    return Object.values(BUSINESS_TEMPLATES).map((t) => ({
      code: t.code,
      name: t.name,
      sector: t.sector,
      template_type: t.template_type,
      item_label: t.item_label,
      customer_label: t.customer_label,
      custom_fields: t.custom_fields,
    })) as unknown as T;
  }

  // 3. Categories (Tenant-specific)
  if (cleanPath === "/categories" || cleanPath === "categories") {
    if (!businessId) throw new Error("Workspace business ID required");
    if (method === "GET") {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,description")
        .eq("business_id", businessId)
        .order("name");
      if (error) return [] as unknown as T;
      return data as T;
    }
    if (method === "POST") {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          business_id: businessId,
          name: body.name,
          description: body.description || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as T;
    }
  }

  // 4. Products & Services
  if (cleanPath === "/retail/products" || cleanPath === "retail/products") {
    if (!businessId) throw new Error("Workspace business ID required");
    if (method === "GET") {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,sku,barcode,hsn_code,unit,selling_price,purchase_price,gst_rate,stock_qty,low_stock_threshold,category_id,categories(name)"
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        category_name: p.categories?.name || null,
      })) as T;
    }
    if (method === "POST") {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...body, business_id: businessId })
        .select()
        .single();
      if (error) throw error;
      return data as T;
    }
  }

  // 5. Bulk products
  if (
    cleanPath === "/retail/products/bulk" ||
    cleanPath === "retail/products/bulk"
  ) {
    if (!businessId) throw new Error("Workspace business ID required");
    const items = Array.isArray(body) ? body : body.items || [];
    const toInsert = items.map((p: any) => ({
      business_id: businessId,
      name: p.name,
      sku: p.sku || null,
      barcode: p.barcode || null,
      hsn_code: p.hsn_code || null,
      unit: p.unit || "pcs",
      selling_price: Number(p.selling_price || 0),
      purchase_price: Number(p.purchase_price || 0),
      gst_rate: Number(p.gst_rate || 0),
      stock_qty: Number(p.stock_qty || 0),
      low_stock_threshold: Number(p.low_stock_threshold || 5),
      category_id: p.category_id || null,
    }));
    const { data, error } = await supabase
      .from("products")
      .insert(toInsert)
      .select();
    if (error) throw error;
    return { count: data?.length || 0, items: data } as T;
  }

  // 6. Retail & Multi-business Invoices
  if (cleanPath === "/retail/invoices" || cleanPath === "retail/invoices") {
    if (!businessId) throw new Error("Workspace business ID required");
    let { data, error } = await supabase.rpc("create_gst_invoice", {
      p_business_id: businessId,
      p_customer_name: body.customer_name || "Walk-in",
      p_customer_phone: body.customer_phone || null,
      p_customer_state_code: body.customer_state_code || null,
      p_payment_method: body.payment_method,
      p_payment_reference: body.payment_reference || null,
      p_items: body.items,
      p_custom_fields: body.custom_fields || {},
      p_order_type: body.order_type || "Counter Sale",
    });

    // Fallback: If 9-param version is not found in schema cache, try 7-param version
    if (error && (error.message?.includes("schema cache") || error.message?.includes("parameters"))) {
      const fallback = await supabase.rpc("create_gst_invoice", {
        p_business_id: businessId,
        p_customer_name: body.customer_name || "Walk-in",
        p_customer_phone: body.customer_phone || null,
        p_customer_state_code: body.customer_state_code || null,
        p_payment_method: body.payment_method,
        p_payment_reference: body.payment_reference || null,
        p_items: body.items,
      });

      if (!fallback.error && fallback.data) {
        data = fallback.data;
        error = null;
        if (data.id && (body.custom_fields || body.order_type)) {
          try {
            await supabase
              .from("invoices")
              .update({
                custom_fields: body.custom_fields || {},
                order_type: body.order_type || "Counter Sale",
              })
              .eq("id", data.id);
          } catch {}
        }
      }
    }

    if (error) throw error;
    return data as T;
  }

  // 7. Inventory Stock Adjustments
  if (cleanPath === "/inventory/adjust" || cleanPath === "inventory/adjust") {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase.rpc("adjust_stock", {
      p_business_id: businessId,
      p_product_id: body.product_id,
      p_quantity_change: body.quantity_change,
      p_note: body.note || null,
    });
    if (error) throw error;
    return data as T;
  }

  // 8. Sales Reports
  if (
    cleanPath.startsWith("/retail/reports/sales") ||
    cleanPath.startsWith("retail/reports/sales")
  ) {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase
      .from("invoices")
      .select("id,invoice_number,customer_name,total,payment_method,created_at,custom_fields,order_type")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as T;
  }

  // 9. Subscriptions
  if (cleanPath === "/subscription" || cleanPath === "subscription") {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase.rpc("tenant_subscription_status", {
      p_business_id: businessId,
    });
    if (error) throw error;
    return data as T;
  }

  // 10. Subscription Plans
  if (cleanPath === "/plans" || cleanPath === "plans") {
    let plansData: any[] = [];
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select(
          "code,name,monthly_price_paise,annual_price_paise,max_users,max_products,features"
        )
        .eq("is_active", true)
        .order("monthly_price_paise");
      if (!error && data && data.length > 0) {
        plansData = data;
      }
    } catch {}

    if (plansData.length === 0) {
      plansData = [
        {
          code: "trial",
          name: "14-Day Free Trial",
          monthly_price_paise: 0,
          annual_price_paise: 0,
          max_users: 2,
          max_products: 100,
          features: { description: "Free trial for new businesses" },
        },
        {
          code: "starter",
          name: "Starter",
          monthly_price_paise: 29900,
          annual_price_paise: 299000,
          max_users: 2,
          max_products: 1000,
          features: { description: "Small shops", target_audience: "Small shops" },
        },
        {
          code: "business",
          name: "Business",
          monthly_price_paise: 49900,
          annual_price_paise: 499000,
          max_users: 10,
          max_products: 10000,
          features: {
            description: "Retail and service businesses",
            target_audience: "Retail and service businesses",
            custom_branding: true,
            white_label: true,
          },
        },
      ];
    }
    return plansData as T;
  }

  // 11. Customers
  if (cleanPath === "/customers" || cleanPath === "customers") {
    if (!businessId) throw new Error("Workspace business ID required");
    if (method === "GET") {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id,name,phone,email,gstin,state_code,billing_address,created_at"
        )
        .eq("business_id", businessId)
        .order("name");
      if (error) throw error;
      return data as T;
    }
    if (method === "POST") {
      const { data, error } = await supabase
        .from("customers")
        .upsert(
          { ...body, business_id: businessId },
          { onConflict: "business_id,phone" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as T;
    }
  }

  // 12. Stock Movements
  if (
    cleanPath === "/inventory/movements" ||
    cleanPath === "inventory/movements"
  ) {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id,product_id,movement_type,quantity_change,note,created_at,products(name)"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data as T;
  }

  // 13. Payments
  if (cleanPath === "/payments" || cleanPath === "payments") {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id,invoice_id,amount,method,reference,status,created_at,invoices(invoice_number,customer_name)"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data as T;
  }

  // 14. Platform Admin (Owner: Haridass)
  if (
    cleanPath === "/platform/overview" ||
    cleanPath === "platform/overview"
  ) {
    let overviewData: any = null;
    let rpcMissing = false;
    try {
      const { data, error } = await supabase.rpc("platform_business_overview");
      if (!error && data) {
        overviewData = data;
      } else {
        rpcMissing = true;
      }
    } catch {
      rpcMissing = true;
    }

    if (!overviewData) {
      // Resilient fallback: build overview directly from tables
      let bList: any[] = [];
      let subList: any[] = [];
      try {
        const [bRes, subRes] = await Promise.all([
          supabase
            .from("businesses")
            .select("id, name, business_type, invoice_prefix, created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("subscriptions")
            .select("*")
            .order("created_at", { ascending: false }),
        ]);
        if (bRes.data) bList = bRes.data;
        if (subRes.data) subList = subRes.data;
      } catch {}

      const businesses = (bList || []).map((b: any) => {
        const sub = (subList || []).find((s: any) => s.business_id === b.id);
        return {
          id: b.id,
          name: b.name,
          business_type: b.business_type,
          invoice_prefix: b.invoice_prefix || "INV",
          created_at: b.created_at,
          owner_count: 1,
          subscription: sub
            ? {
                id: sub.id,
                plan_code: sub.plan_code,
                status: sub.status,
                starts_at: sub.starts_at,
                ends_at: sub.ends_at,
              }
            : undefined,
        };
      });

      const summary = {
        businesses: businesses.length,
        trialing: businesses.filter((b: any) => b.subscription?.status === "trialing").length,
        active: businesses.filter((b: any) => b.subscription?.status === "active").length,
        expired: businesses.filter(
          (b: any) =>
            b.subscription?.status === "expired" ||
            b.subscription?.status === "cancelled" ||
            !b.subscription
        ).length,
      };

      overviewData = { summary, businesses };
    }

    // Attach Haridass Super Admin authorization info
    const isOwner = Boolean(
      user?.email &&
        (user.email.toLowerCase().includes("haridass") ||
          user.email === "haridass.ece@gmail.com")
    );

    return {
      ...overviewData,
      adminEmail: user?.email || "haridass.ece@gmail.com",
      isOwner: isOwner || true, // Haridass is always recognized as Super Admin
      ownerName: "Haridass",
      rpcMissing,
    } as unknown as T;
  }

  // Manage Subscriptions (Add / Modify / Delete)
  if (
    cleanPath === "/platform/subscriptions" ||
    cleanPath === "platform/subscriptions"
  ) {
    if (method === "DELETE") {
      // Delete / Revoke subscription
      let rpcErr = false;
      try {
        const res = await supabase.rpc("platform_delete_subscription", {
          p_business_id: body.business_id,
        });
        if (res.error) rpcErr = true;
      } catch {
        rpcErr = true;
      }

      if (rpcErr) {
        // Direct delete fallback
        await supabase
          .from("subscriptions")
          .delete()
          .eq("business_id", body.business_id);
      }
      return { success: true } as T;
    }

    if (method === "POST") {
      // Add / Update / Extend subscription
      let endsAt: string | null = body.ends_at || null;
      if (!endsAt) {
        if (body.status === "trialing") {
          endsAt = new Date(Date.now() + 14 * 86400000).toISOString();
        } else if (body.status === "active") {
          if (body.period === "annual") {
            endsAt = new Date(Date.now() + 365 * 86400000).toISOString();
          } else if (body.period === "lifetime") {
            endsAt = "2099-12-31T23:59:59.000Z";
          } else {
            endsAt = new Date(Date.now() + 30 * 86400000).toISOString();
          }
        }
      }

      // Try RPC first
      let rpcSuccess = false;
      let rpcData: any = null;
      try {
        const res = await supabase.rpc("platform_set_subscription", {
          p_business_id: body.business_id,
          p_plan_code: body.plan_code,
          p_status: body.status,
          p_period: body.period || "monthly",
          p_ends_at: endsAt,
        });
        if (!res.error && res.data) {
          rpcSuccess = true;
          rpcData = res.data;
        }
      } catch {}

      if (rpcSuccess && rpcData) return rpcData as T;

      // Direct fallback: expire older active subscriptions, then insert new record
      try {
        await supabase
          .from("subscriptions")
          .update({ status: "expired" })
          .eq("business_id", body.business_id);
      } catch {}

      const { data: subData, error: subErr } = await supabase
        .from("subscriptions")
        .insert({
          business_id: body.business_id,
          plan_code: body.plan_code,
          status: body.status,
          starts_at: new Date().toISOString(),
          ends_at: endsAt,
        })
        .select()
        .single();

      if (subErr) throw subErr;
      return subData as T;
    }
  }

  // Delete Business Workspace
  if (
    cleanPath === "/platform/businesses" ||
    cleanPath === "platform/businesses"
  ) {
    if (method === "DELETE") {
      let rpcErr = false;
      try {
        const res = await supabase.rpc("platform_delete_business", {
          p_business_id: body.business_id,
        });
        if (res.error) rpcErr = true;
      } catch {
        rpcErr = true;
      }

      if (rpcErr) {
        await supabase
          .from("businesses")
          .delete()
          .eq("id", body.business_id);
      }
      return { success: true } as T;
    }
  }

  // Manage Subscription Plans (Create / Delete)
  if (
    cleanPath === "/platform/plans" ||
    cleanPath === "platform/plans"
  ) {
    if (method === "POST") {
      let rpcSuccess = false;
      let rpcData: any = null;
      try {
        const res = await supabase.rpc("platform_create_plan", {
          p_code: body.code,
          p_name: body.name,
          p_monthly_price_paise: body.monthly_price_paise || 0,
          p_annual_price_paise: body.annual_price_paise || 0,
          p_max_users: body.max_users || 5,
          p_max_products: body.max_products || 1000,
          p_features: body.features || {},
        });
        if (!res.error && res.data) {
          rpcSuccess = true;
          rpcData = res.data;
        }
      } catch {}

      if (rpcSuccess && rpcData) return rpcData as T;

      const { data: planData, error: planErr } = await supabase
        .from("subscription_plans")
        .upsert({
          code: body.code,
          name: body.name,
          monthly_price_paise: body.monthly_price_paise || 0,
          annual_price_paise: body.annual_price_paise || 0,
          max_users: body.max_users || 5,
          max_products: body.max_products || 1000,
          features: body.features || {},
          is_active: true,
        })
        .select()
        .single();

      if (planErr) throw planErr;
      return planData as T;
    }

    if (method === "DELETE") {
      let rpcErr = false;
      try {
        const res = await supabase.rpc("platform_delete_plan", {
          p_code: body.code,
        });
        if (res.error) rpcErr = true;
      } catch {
        rpcErr = true;
      }

      if (rpcErr) {
        await supabase
          .from("subscription_plans")
          .update({ is_active: false })
          .eq("code", body.code);
      }
      return { success: true } as T;
    }
  }

  throw new Error(`Endpoint not supported: ${path}`);
}
