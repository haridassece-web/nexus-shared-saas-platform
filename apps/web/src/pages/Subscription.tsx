import { useEffect, useState } from "react";
import { api } from "../lib/api";

type SubscriptionInfo = {
  plan_code?: string;
  status?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  plan?: {
    code: string;
    name: string;
    monthly_price_paise: number;
    annual_price_paise: number;
    max_users: number;
    max_products: number;
    features?: any;
  };
};

type Plan = {
  code: string;
  name: string;
  monthly_price_paise: number;
  annual_price_paise: number;
  max_users: number;
  max_products: number;
  features?: any;
};

export function Subscription({ businessId }: { businessId: string }) {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, p] = await Promise.all([
        api<SubscriptionInfo>("/api/tenant/subscription", {}, businessId).catch(() => null),
        api<Plan[]>("/api/tenant/plans", {}, businessId).catch(() => []),
      ]);
      setSub(s);
      setPlans(p || []);
    } catch (e: any) {
      setError(e.message || "Failed to load subscription details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [businessId]);

  const activePlanCode = sub?.plan?.code || sub?.plan_code || "trial";
  const subStatus = sub?.status || "trialing";
  const isExpired = subStatus === "expired" || subStatus === "cancelled";
  const isLifetime = sub?.ends_at && new Date(sub.ends_at).getFullYear() >= 2099;

  return (
    <section>
      {/* Page Header */}
      <div className="page-head" style={{ marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow">NEXUS CREATIVE · BILLING & PLANS</p>
          <h1 style={{ margin: "2px 0 6px 0" }}>Subscription & Plans</h1>
          <p className="muted">
            Simple, affordable SaaS billing tailored for Indian small shops, retail stores, and service businesses.
          </p>
        </div>
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "🔄 Refresh Status"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            color: "#b91c1c",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "1.2rem",
            fontWeight: 600,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Current Active Plan Status Banner */}
      <div
        className="panel"
        style={{
          background: "linear-gradient(135deg, #0f2b48, #1e4a7a)",
          color: "white",
          borderRadius: "14px",
          padding: "24px",
          marginBottom: "2rem",
          boxShadow: "0 4px 18px rgba(15, 43, 72, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span
                style={{
                  background: isExpired ? "#ef4444" : subStatus === "active" ? "#10b981" : "#3b82f6",
                  color: "white",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                ● {subStatus.toUpperCase()}
              </span>
              <span style={{ fontSize: "13px", opacity: 0.85 }}>Current Plan:</span>
              <strong style={{ fontSize: "16px", letterSpacing: "0.5px" }}>
                {activePlanCode.toUpperCase()}
              </strong>
            </div>

            <h2 style={{ color: "white", margin: "6px 0 8px 0", fontSize: "22px" }}>
              {sub?.plan?.name || (activePlanCode === "starter" ? "Starter Plan" : activePlanCode === "business" ? "Business Plan" : "14-Day Free Trial")}
            </h2>

            <p style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>
              {isLifetime ? (
                <span>♾️ <b>Lifetime Unlimited Access</b> activated</span>
              ) : sub?.ends_at ? (
                <span>
                  {isExpired ? "Subscription ended on: " : "Next renewal / expiry: "}
                  <b>{new Date(sub.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</b>
                </span>
              ) : (
                "Full access granted for current billing period"
              )}
            </p>
          </div>

          <div style={{ textAlign: "right", minWidth: "180px" }}>
            <span style={{ fontSize: "12px", opacity: 0.75, display: "block" }}>Platform Owner</span>
            <strong style={{ fontSize: "15px" }}>Haridass (Platform Admin)</strong>
            <div style={{ fontSize: "12px", opacity: 0.9, marginTop: "2px", fontWeight: 600 }}>
              📞 +91 98849 33079
            </div>
            <div style={{ marginTop: "8px" }}>
              <a
                href="https://wa.me/919884933079?text=Hi%20Haridass,%20I%20would%20like%20to%20activate%20Nexus%20Creative%20Billing%20subscription"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  background: "#22c55e",
                  color: "white",
                  textDecoration: "none",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                💬 WhatsApp Haridass
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Available Plans Grid */}
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 6px 0" }}>Choose the Best Plan for Your Business</h2>
        <p className="muted" style={{ margin: "0 0 1.5rem 0" }}>
          Transparent pricing with no hidden charges. All plans include automated GST calculations, invoice generation, and customer sharing.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          alignItems: "stretch",
        }}
      >
        {/* Plan 1: Starter */}
        <div
          style={{
            background: "white",
            border: activePlanCode === "starter" ? "2px solid #2563eb" : "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "26px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: activePlanCode === "starter" ? "0 8px 24px rgba(37,99,235,0.12)" : "0 2px 10px rgba(0,0,0,0.04)",
            position: "relative",
          }}
        >
          {activePlanCode === "starter" && (
            <span
              style={{
                position: "absolute",
                top: "-12px",
                right: "20px",
                background: "#2563eb",
                color: "white",
                padding: "2px 12px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.5px",
              }}
            >
              CURRENT PLAN
            </span>
          )}

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>Starter</h3>
              <span
                style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                Small shops
              </span>
            </div>

            <p className="muted" style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
              Designed specifically for small grocery shops, vegetable stores, pharmacies, and single-counter retail.
            </p>

            <div style={{ margin: "16px 0", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a" }}>₹149</span>
                <span className="muted" style={{ fontSize: "14px" }}>/ month</span>
              </div>
              <small className="muted" style={{ display: "block", marginTop: "4px" }}>
                or ₹1,490 / year (save ₹298 on annual billing)
              </small>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0", display: "grid", gap: "10px", fontSize: "13px" }}>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> 2 Team User Logins
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> Up to 1,000 Products & Stock Items
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> GST & Non-GST Thermal POS (80mm) Print
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> PDF Invoices & 1-Click WhatsApp Share
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> Barcode Scanning & Item Code Search
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> Real-time Daily Sales & Payment Reports
              </li>
            </ul>
          </div>

          <a
            href="https://wa.me/919884933079?text=Hi%20Haridass,%20I%20want%20to%20activate%20Starter%20Plan%20(Rs.149/mo)%20for%20my%20business"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              background: activePlanCode === "starter" ? "#f1f5f9" : "#2563eb",
              color: activePlanCode === "starter" ? "#475569" : "white",
              textDecoration: "none",
              padding: "12px",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            {activePlanCode === "starter" ? "Active Plan" : "Choose Starter (₹149/mo)"}
          </a>
        </div>

        {/* Plan 2: Business (Featured) */}
        <div
          style={{
            background: "white",
            border: "2px solid #059669",
            borderRadius: "14px",
            padding: "26px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 10px 30px rgba(5,150,105,0.15)",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "-12px",
              right: "20px",
              background: "#059669",
              color: "white",
              padding: "2px 12px",
              borderRadius: "12px",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.5px",
            }}
          >
            POPULAR · RECOMMENDED
          </span>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>Business</h3>
              <span
                style={{
                  background: "#dcfce7",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                Retail & service businesses
              </span>
            </div>

            <p className="muted" style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
              Ideal for supermarkets, clinics, salons, restaurants, workshops, and growing multi-staff retail.
            </p>

            <div style={{ margin: "16px 0", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "32px", fontWeight: 800, color: "#059669" }}>₹299</span>
                <span className="muted" style={{ fontSize: "14px" }}>/ month</span>
              </div>
              <small className="muted" style={{ display: "block", marginTop: "4px" }}>
                or ₹2,990 / year (save ₹598 on annual billing)
              </small>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0", display: "grid", gap: "10px", fontSize: "13px" }}>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> <b>Everything in Starter, plus:</b>
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> <b>10 Team User Logins</b> (Admins, Cashiers, Stylists)
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> <b>10,000+ Products</b> with Bulk Excel/CSV Import
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> <b>Custom Invoice Branding</b> (Upload Logo & Accent Colors)
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> <b>100% White-Label Invoices</b> (Nexus branding removed)
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> Custom Invoice Fields (Doctor, Vehicle No, Table No)
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span> Priority WhatsApp & Phone Support
              </li>
            </ul>
          </div>

          <a
            href="https://wa.me/919884933079?text=Hi%20Haridass,%20I%20want%20to%20activate%20Business%20Plan%20(Rs.299/mo)%20for%20my%20business"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              background: "#059669",
              color: "white",
              textDecoration: "none",
              padding: "12px",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            {activePlanCode === "business" ? "Active Plan" : "Choose Business (₹299/mo)"}
          </a>
        </div>

        {/* Plan 3: 14-Day Free Trial */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: "14px",
            padding: "26px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#475569" }}>Free Trial</h3>
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                14 Days Free
              </span>
            </div>

            <p className="muted" style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
              Included automatically with every new workspace. No credit card required.
            </p>

            <div style={{ margin: "16px 0", borderBottom: "1px solid #e2e8f0", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "32px", fontWeight: 800, color: "#475569" }}>₹0</span>
                <span className="muted" style={{ fontSize: "14px" }}>/ 14 days</span>
              </div>
              <small className="muted" style={{ display: "block", marginTop: "4px" }}>
                Explore all 60 business templates risk-free
              </small>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0", display: "grid", gap: "10px", fontSize: "13px", color: "#64748b" }}>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#64748b" }}>✓</span> Test GST billing and print formats
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#64748b" }}>✓</span> Up to 100 inventory products
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#64748b" }}>✓</span> Try barcode scanning & search
              </li>
            </ul>
          </div>

          <div
            style={{
              padding: "10px",
              background: "#e2e8f0",
              borderRadius: "8px",
              textAlign: "center",
              fontSize: "13px",
              color: "#475569",
              fontWeight: 600,
            }}
          >
            Auto-activated on workspace setup
          </div>
        </div>
      </div>
    </section>
  );
}
