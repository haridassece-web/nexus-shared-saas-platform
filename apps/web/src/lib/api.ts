import { supabase } from "./supabase";

const rawApiUrl = import.meta.env.VITE_API_URL || "";
// Only use external HTTP API if explicitly configured with an https URL or if running in local dev with localhost
const hasExternalApi = Boolean(
  rawApiUrl &&
    rawApiUrl !== "http://localhost:4000" &&
    rawApiUrl.startsWith("http")
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
      // If external API fails, fall through to direct Supabase client below
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
      const { data, error } = await supabase
        .from("business_users")
        .select("role,businesses(id,name,business_type,gstin,state_code)")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []).map((x: any) => ({
        ...x.businesses,
        role: x.role,
      })) as T;
    }
    if (method === "POST") {
      const { data, error } = await supabase.rpc("create_business", {
        p_name: body.name,
        p_type: body.business_type,
        p_gstin: body.gstin || null,
        p_state_code: body.state_code || null,
      });
      if (error) throw error;
      return data as T;
    }
  }

  // 2. Retail Products
  if (cleanPath === "/retail/products" || cleanPath === "retail/products") {
    if (!businessId) throw new Error("Workspace business ID required");
    if (method === "GET") {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,barcode,hsn_code,unit,selling_price,purchase_price,gst_rate,stock_qty,low_stock_threshold"
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as T;
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

  // 3. Retail Invoices (GST Calculation & Atomic Stock Lock)
  if (cleanPath === "/retail/invoices" || cleanPath === "retail/invoices") {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase.rpc("create_gst_invoice", {
      p_business_id: businessId,
      p_customer_name: body.customer_name || "Walk-in",
      p_customer_phone: body.customer_phone || null,
      p_customer_state_code: body.customer_state_code || null,
      p_payment_method: body.payment_method,
      p_payment_reference: body.payment_reference || null,
      p_items: body.items,
    });
    if (error) throw error;
    return data as T;
  }

  // 4. Inventory Stock Adjustments
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

  // 5. Sales Reports
  if (
    cleanPath.startsWith("/retail/reports/sales") ||
    cleanPath.startsWith("retail/reports/sales")
  ) {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase
      .from("invoices")
      .select("id,invoice_number,customer_name,total,payment_method,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as T;
  }

  // 6. Subscriptions
  if (cleanPath === "/subscription" || cleanPath === "subscription") {
    if (!businessId) throw new Error("Workspace business ID required");
    const { data, error } = await supabase.rpc("tenant_subscription_status", {
      p_business_id: businessId,
    });
    if (error) throw error;
    return data as T;
  }

  // 7. Subscription Plans
  if (cleanPath === "/plans" || cleanPath === "plans") {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(
        "code,name,monthly_price_paise,annual_price_paise,max_users,max_products,features"
      )
      .eq("is_active", true)
      .order("monthly_price_paise");
    if (error) throw error;
    return data as T;
  }

  // 8. Customers
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

  // 9. Stock Movements
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

  // 10. Payments
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

  // 11. Platform Admin
  if (
    cleanPath === "/platform/overview" ||
    cleanPath === "platform/overview"
  ) {
    const { data, error } = await supabase.rpc("platform_business_overview");
    if (error) throw error;
    return data as T;
  }
  if (
    cleanPath === "/platform/subscriptions" ||
    cleanPath === "platform/subscriptions"
  ) {
    const { data, error } = await supabase.rpc("platform_set_subscription", {
      p_business_id: body.business_id,
      p_plan_code: body.plan_code,
      p_status: body.status,
      p_period: body.period,
    });
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Endpoint not supported: ${path}`);
}
