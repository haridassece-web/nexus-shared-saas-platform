import { useEffect, useState, FormEvent } from "react";
import { api } from "../lib/api";
import { getTemplateForBusinessType } from "../lib/businessTemplates";

type BusinessRow = {
  id: string;
  name: string;
  business_type: string;
  invoice_prefix?: string;
  created_at: string;
  owner_count: number;
  subscription?: {
    id: string;
    plan_code: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
  };
};

type Overview = {
  summary: {
    businesses: number;
    trialing: number;
    active: number;
    expired: number;
  };
  businesses: BusinessRow[];
  adminEmail?: string;
  isOwner?: boolean;
  ownerName?: string;
  rpcMissing?: boolean;
};

type Plan = {
  code: string;
  name: string;
  monthly_price_paise: number;
  annual_price_paise: number;
  max_users: number;
  max_products: number;
  features?: any;
  is_active?: boolean;
};

export function PlatformAdmin() {
  const [data, setData] = useState<Overview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState("");

  // Search & Filter
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal: Add / Modify Tenant Subscription
  const [subModalTarget, setSubModalTarget] = useState<BusinessRow | null>(null);
  const [subForm, setSubForm] = useState({
    plan_code: "starter",
    status: "active",
    duration: "monthly", // "14days", "monthly", "3months", "6months", "annual", "lifetime", "custom"
    custom_ends_at: "",
  });

  // Modal: Create New Subscription Plan
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    monthly_price: "149",
    annual_price: "1490",
    max_users: "5",
    max_products: "1000",
  });

  async function load() {
    try {
      setError("");
      const [overview, pList] = await Promise.all([
        api<Overview>("/api/platform/overview").catch(() => null),
        api<Plan[]>("/api/plans").catch(() => []),
      ]);
      if (overview) {
        setData(overview);
      } else {
        setData({
          summary: { businesses: 0, trialing: 0, active: 0, expired: 0 },
          businesses: [],
          adminEmail: "haridass.ece@gmail.com",
          isOwner: true,
          ownerName: "Haridass",
          rpcMissing: true,
        });
      }
      setPlans(pList || []);
    } catch (e: any) {
      setError(e.message || "Unable to load Super Admin dashboard");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 1. Add / Modify Subscription
  async function handleSaveSubscription(e: FormEvent) {
    e.preventDefault();
    if (!subModalTarget) return;

    setBusy(subModalTarget.id);
    setError("");
    setSuccessMsg("");

    let endsAt: string | null = null;
    const now = Date.now();
    if (subForm.duration === "14days") {
      endsAt = new Date(now + 14 * 86400000).toISOString();
    } else if (subForm.duration === "monthly") {
      endsAt = new Date(now + 30 * 86400000).toISOString();
    } else if (subForm.duration === "3months") {
      endsAt = new Date(now + 90 * 86400000).toISOString();
    } else if (subForm.duration === "6months") {
      endsAt = new Date(now + 180 * 86400000).toISOString();
    } else if (subForm.duration === "annual") {
      endsAt = new Date(now + 365 * 86400000).toISOString();
    } else if (subForm.duration === "lifetime") {
      endsAt = "2099-12-31T23:59:59.000Z";
    } else if (subForm.duration === "custom" && subForm.custom_ends_at) {
      endsAt = new Date(subForm.custom_ends_at).toISOString();
    }

    try {
      await api("/api/platform/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          business_id: subModalTarget.id,
          plan_code: subForm.plan_code,
          status: subForm.status,
          period: subForm.duration,
          ends_at: endsAt,
        }),
      });

      setSuccessMsg(
        `Subscription updated for ${subModalTarget.name} (${subForm.plan_code.toUpperCase()} · ${subForm.status})`
      );
      setSubModalTarget(null);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to update subscription");
    } finally {
      setBusy("");
    }
  }

  // 2. Delete / Revoke Subscription
  async function handleDeleteSubscription(biz: BusinessRow) {
    const confirmDelete = window.confirm(
      `Are you sure you want to REVOKE and DELETE the active subscription for "${biz.name}"?`
    );
    if (!confirmDelete) return;

    setBusy(biz.id);
    setError("");
    setSuccessMsg("");

    try {
      await api("/api/platform/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({
          business_id: biz.id,
        }),
      });

      setSuccessMsg(`Subscription removed for "${biz.name}". Tenant is now expired.`);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to delete subscription");
    } finally {
      setBusy("");
    }
  }

  // 3. Delete Business Workspace
  async function handleDeleteBusiness(biz: BusinessRow) {
    const confirmName = window.prompt(
      `⚠️ WARNING: This will permanently DELETE "${biz.name}" and all its invoices, products, and categories.\n\nType DELETE to confirm:`
    );
    if (confirmName !== "DELETE") return;

    setBusy(biz.id);
    setError("");
    setSuccessMsg("");

    try {
      await api("/api/platform/businesses", {
        method: "DELETE",
        body: JSON.stringify({
          business_id: biz.id,
        }),
      });

      setSuccessMsg(`Business workspace "${biz.name}" permanently deleted.`);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to delete business workspace");
    } finally {
      setBusy("");
    }
  }

  // 4. Create New Subscription Plan
  async function handleCreatePlan(e: FormEvent) {
    e.preventDefault();
    if (!planForm.code || !planForm.name) return;

    setBusy("create_plan");
    setError("");
    setSuccessMsg("");

    try {
      await api("/api/platform/plans", {
        method: "POST",
        body: JSON.stringify({
          code: planForm.code.trim().toLowerCase(),
          name: planForm.name.trim(),
          monthly_price_paise: Math.round(Number(planForm.monthly_price) * 100),
          annual_price_paise: Math.round(Number(planForm.annual_price) * 100),
          max_users: Number(planForm.max_users) || 5,
          max_products: Number(planForm.max_products) || 1000,
          features: {
            gst_billing: true,
            inventory: true,
            pdf_invoice: true,
            whatsapp_share: true,
            barcode: true,
            reports: true,
          },
        }),
      });

      setSuccessMsg(`New subscription plan "${planForm.name}" created successfully.`);
      setShowPlanModal(false);
      setPlanForm({
        code: "",
        name: "",
        monthly_price: "499",
        annual_price: "4999",
        max_users: "5",
        max_products: "1000",
      });
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to create subscription plan");
    } finally {
      setBusy("");
    }
  }

  // 5. Delete / Deactivate Plan
  async function handleDeletePlan(planCode: string) {
    if (planCode === "trial" || planCode === "starter") {
      alert("Base platform plans (trial/starter) cannot be deleted.");
      return;
    }
    const confirmDeactivate = window.confirm(
      `Are you sure you want to delete/deactivate the "${planCode}" plan?`
    );
    if (!confirmDeactivate) return;

    setBusy(`plan_${planCode}`);
    setError("");
    setSuccessMsg("");

    try {
      await api("/api/platform/plans", {
        method: "DELETE",
        body: JSON.stringify({
          code: planCode,
        }),
      });

      setSuccessMsg(`Plan "${planCode}" deactivated.`);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to delete plan");
    } finally {
      setBusy("");
    }
  }

  // Filter businesses
  const filteredBusinesses = (data?.businesses || []).filter((b) => {
    const q = filterQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      b.name.toLowerCase().includes(q) ||
      b.business_type.toLowerCase().includes(q) ||
      (b.invoice_prefix && b.invoice_prefix.toLowerCase().includes(q)) ||
      (b.subscription?.plan_code && b.subscription.plan_code.toLowerCase().includes(q));

    const status = b.subscription?.status || "expired";
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && status === "active") ||
      (statusFilter === "trialing" && status === "trialing") ||
      (statusFilter === "expired" && (status === "expired" || status === "cancelled"));

    return matchesQuery && matchesStatus;
  });

  return (
    <section>
      {/* Super Admin Platform Control Header */}
      <div className="page-head" style={{ marginBottom: "1.2rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span
              className="pill"
              style={{
                background: "#fef3c7",
                color: "#92400e",
                fontWeight: 800,
                fontSize: "12px",
                border: "1px solid #fde68a",
              }}
            >
              👑 Platform Owner: Haridass
            </span>
            <span className="pill" style={{ background: "#dcfce7", color: "#166534" }}>
              Super Admin Access Verified
            </span>
          </div>
          <h1 style={{ margin: "2px 0 6px 0" }}>Super Admin Control Center</h1>
          <p className="muted">
            Manage customer business workspaces, add / delete subscriptions, and control pricing plans.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowPlanModal(true)}
          >
            ➕ New Plan
          </button>
          <button type="button" className="primary" onClick={load}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {data?.rpcMissing && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            color: "#92400e",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "1.2rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <b style={{ fontSize: "15px" }}>
                ⚡ Supabase Database Migration Needed
              </b>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#78350f" }}>
                The database functions for Super Admin (<code>platform_business_overview</code>)
                and Invoice Branding have not been executed in your Supabase project yet.
                Run <code>008_super_admin_subscriptions.sql</code> and{" "}
                <code>009_invoice_branding.sql</code> in the Supabase SQL Editor to activate full access.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            color: "#b91c1c",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontWeight: 600,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #34d399",
            color: "#065f46",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontWeight: 600,
          }}
        >
          ✅ {successMsg}
        </div>
      )}

      {/* KPI Cards */}
      {data && (
        <>
          <div className="stats" style={{ marginBottom: "1.5rem" }}>
            <article>
              <small>Total Businesses</small>
              <strong>{data.summary.businesses}</strong>
            </article>
            <article>
              <small>Free Trials Active</small>
              <strong style={{ color: "#2563eb" }}>{data.summary.trialing}</strong>
            </article>
            <article>
              <small>Paid Subscriptions</small>
              <strong style={{ color: "#16a34a" }}>{data.summary.active}</strong>
            </article>
            <article>
              <small>Expired / Due</small>
              <strong style={{ color: "#dc2626" }}>{data.summary.expired}</strong>
            </article>
            <article>
              <small>Active Plans</small>
              <strong>{plans.length}</strong>
            </article>
          </div>

          {/* Tenants & Subscriptions Management */}
          <div className="panel" style={{ marginBottom: "2rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Tenant Subscriptions ({filteredBusinesses.length})</h2>
                <small className="muted">
                  Super Admin subscription overrides, upgrades, and cancellations
                </small>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  style={{ width: "220px", padding: "6px 10px", fontSize: "13px" }}
                  placeholder="🔍 Search Business, Prefix, Plan..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
                <select
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="trialing">Trialing Only</option>
                  <option value="expired">Expired Only</option>
                </select>
              </div>
            </div>

            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Category</th>
                    <th>Prefix</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Validity End</th>
                    <th style={{ textAlign: "right" }}>Super Admin Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBusinesses.map((b) => {
                    const tmpl = getTemplateForBusinessType(b.business_type);
                    const status = b.subscription?.status || "expired";
                    const isLifetime =
                      b.subscription?.ends_at &&
                      new Date(b.subscription.ends_at).getFullYear() >= 2099;

                    return (
                      <tr key={b.id}>
                        <td>
                          <b>{b.name}</b>
                          <small className="muted" style={{ display: "block" }}>
                            ID: {b.id.slice(0, 8)}…
                          </small>
                        </td>
                        <td>
                          <span className="pill" style={{ background: "#f1f5f9" }}>
                            {tmpl.name}
                          </span>
                        </td>
                        <td>
                          <code>{b.invoice_prefix || "INV"}</code>
                        </td>
                        <td>
                          <span
                            className="pill"
                            style={{
                              background:
                                b.subscription?.plan_code === "business"
                                  ? "#e0e7ff"
                                  : b.subscription?.plan_code === "growth"
                                  ? "#dcfce7"
                                  : "#f3f4f6",
                              fontWeight: 700,
                            }}
                          >
                            {(b.subscription?.plan_code || "None").toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span
                            className="pill"
                            style={{
                              background:
                                status === "active"
                                  ? "#dcfce7"
                                  : status === "trialing"
                                  ? "#dbeafe"
                                  : "#fee2e2",
                              color:
                                status === "active"
                                  ? "#15803d"
                                  : status === "trialing"
                                  ? "#1d4ed8"
                                  : "#b91c1c",
                              fontWeight: 700,
                            }}
                          >
                            {status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {isLifetime ? (
                            <span style={{ color: "#16a34a", fontWeight: 700 }}>
                              ♾️ Lifetime Access
                            </span>
                          ) : b.subscription?.ends_at ? (
                            new Date(b.subscription.ends_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              className="secondary"
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                margin: 0,
                                background: "#eff6ff",
                                color: "#1d4ed8",
                              }}
                              disabled={busy === b.id}
                              onClick={() => {
                                setSubModalTarget(b);
                                setSubForm({
                                  plan_code: b.subscription?.plan_code || "starter",
                                  status: b.subscription?.status === "active" ? "active" : "active",
                                  duration: "monthly",
                                  custom_ends_at: b.subscription?.ends_at
                                    ? new Date(b.subscription.ends_at).toISOString().split("T")[0]
                                    : "",
                                });
                              }}
                            >
                              ✏️ Add / Edit
                            </button>

                            <button
                              type="button"
                              className="secondary"
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                margin: 0,
                                color: "#b91c1c",
                              }}
                              disabled={busy === b.id || !b.subscription}
                              title="Delete active subscription"
                              onClick={() => handleDeleteSubscription(b)}
                            >
                              🗑️ Revoke
                            </button>

                            <button
                              type="button"
                              className="secondary"
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                margin: 0,
                                color: "#6b7280",
                              }}
                              disabled={busy === b.id}
                              title="Delete business workspace"
                              onClick={() => handleDeleteBusiness(b)}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredBusinesses.length && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2rem" }}>
                        <p className="muted">No businesses found matching criteria.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subscription Plans Manager Panel */}
          <div className="panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Platform Subscription Plans ({plans.length})</h2>
                <small className="muted">
                  Configure SaaS subscription pricing, quotas, and feature tiers
                </small>
              </div>

              <button
                type="button"
                className="secondary"
                onClick={() => setShowPlanModal(true)}
              >
                + Create Custom Plan
              </button>
            </div>

            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Plan Code</th>
                    <th>Plan Name</th>
                    <th>Monthly Price</th>
                    <th>Annual Price</th>
                    <th>User Quota</th>
                    <th>Product Quota</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.code}>
                      <td>
                        <code>{p.code}</code>
                      </td>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td>
                        ₹{(p.monthly_price_paise / 100).toFixed(2)} / mo
                      </td>
                      <td>
                        ₹{(p.annual_price_paise / 100).toFixed(2)} / yr
                      </td>
                      <td>{p.max_users} users</td>
                      <td>{p.max_products} items</td>
                      <td style={{ textAlign: "right" }}>
                        {p.code !== "trial" && p.code !== "starter" && (
                          <button
                            type="button"
                            className="secondary"
                            style={{
                              padding: "4px 8px",
                              fontSize: "12px",
                              margin: 0,
                              color: "#b91c1c",
                            }}
                            disabled={busy === `plan_${p.code}`}
                            onClick={() => handleDeletePlan(p.code)}
                          >
                            🗑️ Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal 1: Add / Edit Subscription */}
      {subModalTarget && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "480px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>⚡ Assign / Modify Subscription</h2>
              <button
                type="button"
                className="secondary"
                style={{ margin: 0, padding: "4px 8px" }}
                onClick={() => setSubModalTarget(null)}
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: "4px 0 16px 0" }}>
              Target Business: <b>{subModalTarget.name}</b>
            </p>

            <form onSubmit={handleSaveSubscription}>
              <label>
                Subscription Plan
                <select
                  value={subForm.plan_code}
                  onChange={(e) =>
                    setSubForm({ ...subForm, plan_code: e.target.value })
                  }
                >
                  {plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} (₹{p.monthly_price_paise / 100}/mo)
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Subscription Status
                <select
                  value={subForm.status}
                  onChange={(e) =>
                    setSubForm({ ...subForm, status: e.target.value })
                  }
                >
                  <option value="active">Active (Paid Access)</option>
                  <option value="trialing">Trialing (Free Trial)</option>
                  <option value="expired">Expired (Block Access)</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="past_due">Past Due (Grace Period)</option>
                </select>
              </label>

              <label>
                Duration / Validity Period
                <select
                  value={subForm.duration}
                  onChange={(e) =>
                    setSubForm({ ...subForm, duration: e.target.value })
                  }
                >
                  <option value="14days">14 Days (Free Trial)</option>
                  <option value="monthly">1 Month (30 Days)</option>
                  <option value="3months">3 Months (90 Days)</option>
                  <option value="6months">6 Months (180 Days)</option>
                  <option value="annual">1 Year (365 Days)</option>
                  <option value="lifetime">♾️ Lifetime Access (Permanent)</option>
                  <option value="custom">📅 Custom Expiry Date...</option>
                </select>
              </label>

              {subForm.duration === "custom" && (
                <label>
                  Specific Expiration Date
                  <input
                    type="date"
                    required
                    value={subForm.custom_ends_at}
                    onChange={(e) =>
                      setSubForm({ ...subForm, custom_ends_at: e.target.value })
                    }
                  />
                </label>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "1.2rem" }}>
                <button
                  type="submit"
                  className="primary full"
                  disabled={busy === subModalTarget.id}
                >
                  {busy === subModalTarget.id ? "Saving…" : "Save Subscription"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSubModalTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Create Custom Plan */}
      {showPlanModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "480px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>➕ Create Custom Subscription Plan</h2>
              <button
                type="button"
                className="secondary"
                style={{ margin: 0, padding: "4px 8px" }}
                onClick={() => setShowPlanModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} style={{ marginTop: "1rem" }}>
              <label>
                Plan Code (Unique identifier, lower-case) *
                <input
                  required
                  placeholder="e.g. enterprise / clinic_special"
                  value={planForm.code}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, code: e.target.value })
                  }
                />
              </label>

              <label>
                Plan Display Name *
                <input
                  required
                  placeholder="e.g. Enterprise VIP Plan"
                  value={planForm.name}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, name: e.target.value })
                  }
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                }}
              >
                <label>
                  Monthly Price (₹) *
                  <input
                    required
                    type="number"
                    value={planForm.monthly_price}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, monthly_price: e.target.value })
                    }
                  />
                </label>

                <label>
                  Annual Price (₹) *
                  <input
                    required
                    type="number"
                    value={planForm.annual_price}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, annual_price: e.target.value })
                    }
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                }}
              >
                <label>
                  Max Users Allowed
                  <input
                    required
                    type="number"
                    value={planForm.max_users}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, max_users: e.target.value })
                    }
                  />
                </label>

                <label>
                  Max Products Allowed
                  <input
                    required
                    type="number"
                    value={planForm.max_products}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, max_products: e.target.value })
                    }
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "1.2rem" }}>
                <button
                  type="submit"
                  className="primary full"
                  disabled={busy === "create_plan"}
                >
                  {busy === "create_plan" ? "Creating…" : "Create Plan"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowPlanModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
