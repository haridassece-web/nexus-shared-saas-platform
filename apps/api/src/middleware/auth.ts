import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user)
      return res.status(401).json({ error: "Invalid session" });

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    req.db = db;
    next();
  } catch (e) {
    next(e);
  }
}

export async function tenantContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = String(req.headers["x-business-id"] || "");
    if (!businessId)
      return res.status(400).json({ error: "x-business-id header required" });

    const { data, error } = await req
      .db!.from("business_users")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return res
        .status(403)
        .json({ error: "You are not a member of this business" });

    const { data: subscription, error: subError } = await req
      .db!.rpc("tenant_subscription_status", {
        p_business_id: businessId,
      });
    if (subError) throw subError;

    req.businessId = businessId;
    req.role = data.role;
    req.subscription = subscription;

    if (
      ["expired", "cancelled", "past_due"].includes(subscription?.status) &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      return res.status(402).json({
        error:
          "Subscription inactive. Contact Nexus Creative or renew your plan to continue.",
        subscription,
      });
    }

    next();
  } catch (e) {
    next(e);
  }
}
