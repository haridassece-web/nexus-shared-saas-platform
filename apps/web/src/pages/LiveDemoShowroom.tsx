import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BUSINESS_TEMPLATES, BusinessCategoryTemplate } from "../lib/businessTemplates";
import { api } from "../lib/api";

const SECTORS = [
  { id: "all", label: "✨ All Businesses", count: 62 },
  { id: "Healthcare", label: "🏥 Healthcare & Clinics", count: 8 },
  { id: "Fitness & Wellness", label: "🏋️ Fitness & Gym", count: 4 },
  { id: "Personal Care", label: "✂️ Personal Care & Salon", count: 3 },
  { id: "Retail & Grocery", label: "🛒 Retail & Supermarket", count: 13 },
  { id: "Food & Hospitality", label: "🍽️ Food & Restaurant", count: 6 },
  { id: "Automobile", label: "🚗 Automobile & Workshop", count: 4 },
  { id: "Services & Maintenance", label: "🔧 Services & Repairs", count: 7 },
  { id: "Real Estate & Construction", label: "🏢 Construction & Interior", count: 4 },
  { id: "IT & Digital", label: "💻 IT & Digital Agency", count: 3 },
  { id: "Education", label: "🎓 Education & Colleges", count: 3 },
  { id: "Media & Events", label: "📸 Events, Media & Logistics", count: 6 },
];

export function LiveDemoShowroom() {
  const navigate = useNavigate();
  const [selectedSector, setSelectedSector] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const templatesList: BusinessCategoryTemplate[] = useMemo(() => {
    return Object.values(BUSINESS_TEMPLATES);
  }, []);

  const filteredTemplates = useMemo(() => {
    return templatesList.filter((tmpl) => {
      const matchSector =
        selectedSector === "all" ||
        tmpl.sector.toLowerCase() === selectedSector.toLowerCase();

      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.sector.toLowerCase().includes(q) ||
        tmpl.item_label.toLowerCase().includes(q) ||
        tmpl.customer_label.toLowerCase().includes(q) ||
        tmpl.starter_items.some((it) => it.name.toLowerCase().includes(q));

      return matchSector && matchSearch;
    });
  }, [templatesList, selectedSector, search]);

  // Launch Live Interactive Demo in Retail POS
  function launchDemo(tmpl: BusinessCategoryTemplate) {
    localStorage.setItem("nexus_demo_template", tmpl.code);
    navigate("/retail");
  }

  // Create Real Workspace in database & seed starter items
  async function createWorkspace(tmpl: BusinessCategoryTemplate) {
    setBusy(true);
    setMsg("");
    try {
      const res: any = await api("/api/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: `${tmpl.name} (Live Demo)`,
          business_type: tmpl.code,
          state_code: "33",
        }),
      });

      if (res && res.id) {
        localStorage.setItem("nexus_business_id", res.id);
        localStorage.removeItem("nexus_demo_template");

        // Seed categories & starter items if available
        if (tmpl.starter_items?.length) {
          try {
            await api(
              "/api/tenant/categories/bulk",
              {
                method: "POST",
                body: JSON.stringify({ names: [tmpl.name, `${tmpl.name} Services`] }),
              },
              res.id
            );

            const itemsToInsert = tmpl.starter_items.map((item, idx) => ({
              name: item.name,
              sku: `${tmpl.prefix || "ITEM"}-${String(idx + 1).padStart(3, "0")}`,
              barcode: null,
              hsn_code: null,
              category_id: null,
              unit: item.unit || "pcs",
              selling_price: item.selling_price || 0,
              purchase_price: Math.round((item.selling_price || 0) * 0.75),
              gst_rate: item.gst_rate ?? 18,
              stock_qty: item.stock_qty || 50,
              low_stock_threshold: 5,
            }));

            await api(
              "/api/tenant/retail/products/bulk",
              {
                method: "POST",
                body: JSON.stringify(itemsToInsert),
              },
              res.id
            );
          } catch (seedErr) {
            console.warn("Auto-seed items failed:", seedErr);
          }
        }

        setMsg(`Created workspace for ${tmpl.name}! Redirecting to Retail POS…`);
        setTimeout(() => navigate("/retail"), 800);
      }
    } catch (e: any) {
      setMsg(e.message || "Failed to create business");
    } finally {
      setBusy(false);
    }
  }

  // Seed All 62 Demo Businesses into user account
  async function seedAllDemoBusinesses() {
    if (
      !window.confirm(
        `Create demo workspaces for all ${templatesList.length} business types in your account? This allows testing every industry directly from your workspace.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("Seeding all 62 demo workspaces… please wait a few seconds.");
    try {
      const payload = templatesList.map((t) => ({
        name: `${t.name} (Demo)`,
        business_type: t.code,
      }));

      const res: any = await api("/api/businesses/seed-all", {
        method: "POST",
        body: JSON.stringify({ businesses: payload }),
      });

      setMsg(
        `🎉 Successfully created ${res.count || templatesList.length} business workspaces! Redirecting to Workspace…`
      );
      setTimeout(() => navigate("/"), 1200);
    } catch (e: any) {
      setMsg(e.message || "Failed to batch create businesses");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head" style={{ marginBottom: "16px" }}>
        <div>
          <p className="eyebrow">LIVE INTERACTIVE SHOWROOM · 62 BUSINESS ENGINES</p>
          <h1 style={{ fontSize: "28px", margin: "4px 0" }}>
            All 60+ Business Live Demos
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Explore ready-made Point of Sale billing, custom fields, and starter items tailored for every industry.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="primary link-btn"
            style={{ background: "#2563eb", fontWeight: 700 }}
            onClick={seedAllDemoBusinesses}
            disabled={busy}
          >
            ⚡ Seed All 62 Businesses to Workspace
          </button>
          <button
            type="button"
            className="secondary link-btn"
            onClick={() => navigate("/retail")}
          >
            🛒 Go to Retail POS
          </button>
        </div>
      </header>

      {msg && (
        <div
          className="panel"
          style={{ background: "#f0fdf4", borderColor: "#86efac", marginBottom: "16px" }}
        >
          <b>{msg}</b>
        </div>
      )}

      {/* Sector Filter Bar */}
      <div
        className="panel"
        style={{
          padding: "16px",
          marginBottom: "18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <input
            placeholder="🔍 Search any business (e.g. Hospital, Gym, Bike Workshop, Salon, Dental, Bakery, Fruits...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 320px",
              padding: "10px 14px",
              fontSize: "14px",
              borderRadius: "8px",
            }}
          />
          <span className="muted" style={{ fontSize: "13px" }}>
            Showing <b>{filteredTemplates.length}</b> of <b>{templatesList.length}</b> Business Demos
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {SECTORS.map((s) => {
            const isActive = selectedSector === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className="sector-preset-btn"
                style={{
                  background: isActive ? "#2563eb" : "#ffffff",
                  color: isActive ? "#ffffff" : "#334155",
                  borderColor: isActive ? "#2563eb" : "#cbd5e1",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: "12px",
                  padding: "5px 12px",
                }}
                onClick={() => setSelectedSector(s.id)}
              >
                <span>{s.label}</span>
                <span
                  style={{
                    opacity: 0.8,
                    fontSize: "11px",
                    background: isActive ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                    padding: "1px 6px",
                    borderRadius: "10px",
                  }}
                >
                  {s.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 60+ Business Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "16px",
        }}
      >
        {filteredTemplates.map((t) => (
          <article
            key={t.code}
            className="panel"
            style={{
              margin: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px",
              background: "#ffffff",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <div>
              {/* Badges */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", gap: "6px" }}>
                  <span
                    className="pill"
                    style={{ background: "#dbeafe", color: "#1e40af", fontWeight: 700 }}
                  >
                    {t.sector}
                  </span>
                  <span className="pill" style={{ background: "#f1f5f9", color: "#475569" }}>
                    Prefix: {t.prefix}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                  {t.starter_items.length} Starter Items
                </span>
              </div>

              {/* Title & Customer Label */}
              <h2 style={{ fontSize: "20px", margin: "6px 0 2px 0", color: "#0f172a" }}>
                {t.name}
              </h2>
              <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#64748b" }}>
                Customer: <b>{t.customer_label}</b> · Item: <b>{t.item_label}</b>
              </p>

              {/* Order Types */}
              {t.order_types?.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <small style={{ color: "#475569", fontWeight: 600, fontSize: "11px" }}>
                    Order Types:
                  </small>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "3px" }}>
                    {t.order_types.map((ot, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                          fontSize: "11px",
                          padding: "2px 6px",
                          color: "#334155",
                        }}
                      >
                        {ot}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Fields */}
              {t.custom_fields?.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <small style={{ color: "#475569", fontWeight: 600, fontSize: "11px" }}>
                    Invoice Custom Fields ({t.custom_fields.length}):
                  </small>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "3px" }}>
                    {t.custom_fields.map((cf, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: "4px",
                          fontSize: "11px",
                          padding: "2px 6px",
                          color: "#1d4ed8",
                        }}
                      >
                        {cf.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Items List */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  margin: "10px 0",
                  border: "1px solid #f1f5f9",
                }}
              >
                <small style={{ fontWeight: 700, color: "#334155", display: "block" }}>
                  Sample Starter Catalogue:
                </small>
                <ul
                  style={{
                    margin: "4px 0 0 16px",
                    padding: 0,
                    fontSize: "12px",
                    color: "#475569",
                  }}
                >
                  {t.starter_items.slice(0, 3).map((it, idx) => (
                    <li key={idx} style={{ marginBottom: "2px" }}>
                      {it.name} — <b>₹{it.selling_price}</b> ({it.unit})
                    </li>
                  ))}
                  {t.starter_items.length > 3 && (
                    <li style={{ listStyle: "none", color: "#64748b", fontSize: "11px" }}>
                      + {t.starter_items.length - 3} more starter products
                    </li>
                  )}
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "14px" }}>
              <button
                type="button"
                className="primary"
                style={{
                  padding: "9px 10px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "#2563eb",
                  whiteSpace: "nowrap",
                }}
                onClick={() => launchDemo(t)}
              >
                ⚡ Live POS Demo
              </button>

              <button
                type="button"
                className="secondary"
                style={{
                  margin: 0,
                  padding: "9px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
                disabled={busy}
                onClick={() => createWorkspace(t)}
              >
                + Create Workspace
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
