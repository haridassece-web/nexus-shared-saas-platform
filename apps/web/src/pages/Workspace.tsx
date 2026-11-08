import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { getTemplateForBusinessType, BUSINESS_TEMPLATES } from "../lib/businessTemplates";
import { supabase, isSuperAdmin, checkIsAdmin } from "../lib/supabase";

type Biz = {
  id: string;
  name: string;
  business_type: string;
  role: string;
  gstin: string | null;
};

export function Workspace() {
  const [rows, setRows] = useState<Biz[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  function loadBusinesses() {
    api<Biz[]>("/api/businesses")
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadBusinesses();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (user) {
        if (isSuperAdmin(user)) {
          setIsAdmin(true);
        } else {
          checkIsAdmin(user).then(setIsAdmin);
        }
      }
    });
  }, []);

  function choose(id: string) {
    localStorage.setItem("nexus_business_id", id);
    localStorage.removeItem("nexus_demo_template");
    navigate("/retail");
  }

  // Seed All 62 Demo Workspaces
  async function seedAllWorkspaces() {
    if (
      !window.confirm(
        "Seed all 62 pre-configured business templates as workspaces into your account? This allows testing every industry directly."
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("Seeding all 62 demo workspaces… please wait a moment.");
    try {
      const templates = Object.values(BUSINESS_TEMPLATES);
      const payload = templates.map((t) => ({
        name: `${t.name} (Demo)`,
        business_type: t.code,
      }));

      const res: any = await api("/api/businesses/seed-all", {
        method: "POST",
        body: JSON.stringify({ businesses: payload }),
      });

      setMsg(`🎉 Created ${res.count || templates.length} business workspaces!`);
      loadBusinesses();
    } catch (e: any) {
      setError(e.message || "Failed to seed workspaces");
    } finally {
      setBusy(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => {
      const tmpl = getTemplateForBusinessType(b.business_type);
      return (
        b.name.toLowerCase().includes(q) ||
        b.business_type.toLowerCase().includes(q) ||
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.sector.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">NEXUS CLOUD · MULTI-TENANT WORKSPACE</p>
          <h1>Your workspace ({rows.length})</h1>
          <p className="muted">
            {isAdmin
              ? "Select an active business workspace or test any of our 60+ pre-built industry engines."
              : "Select your active business workspace to start billing and operations."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {isAdmin && (
            <>
              <button
                type="button"
                className="primary link-btn"
                style={{ background: "#2563eb", fontWeight: 700 }}
                onClick={() => navigate("/demo")}
              >
                🎭 60+ Live Demo Showroom
              </button>
              <button
                type="button"
                className="secondary link-btn"
                style={{ fontWeight: 600 }}
                onClick={seedAllWorkspaces}
                disabled={busy}
              >
                ⚡ Seed All 62 Demo Workspaces
              </button>
            </>
          )}
          <Link className="secondary link-btn" to="/setup">
            + Add business
          </Link>
        </div>
      </header>

      {/* Live Demo Banner for Super Admin */}
      {isAdmin && (
        <div
          className="panel"
          style={{
            background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
            border: "1px solid #bfdbfe",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            padding: "16px 20px",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px 0", color: "#1e3a8a", fontSize: "17px" }}>
              🎭 Explore All 60+ Ready-to-Bill Industry POS Engines
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
              Healthcare, Gyms, Salons, Supermarkets, Restaurants, Automobile Workshops, Tailoring, Education, and IT.
            </p>
          </div>
          <button
            type="button"
            className="primary"
            style={{ background: "#1d4ed8", padding: "8px 16px", fontSize: "13px" }}
            onClick={() => navigate("/demo")}
          >
            Open 60+ Demo Showroom →
          </button>
        </div>
      )}

      {msg && (
        <div className="panel" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
          <b>{msg}</b>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {rows.length > 0 && (
        <div style={{ margin: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <input
            placeholder="🔍 Filter your workspaces by name or industry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: "340px", padding: "8px 12px", borderRadius: "8px" }}
          />
          <small className="muted">
            Showing {filteredRows.length} of {rows.length} workspaces
          </small>
        </div>
      )}

      <section className="business-grid">
        {filteredRows.map((b) => {
          const tmpl = getTemplateForBusinessType(b.business_type);
          return (
            <article className="panel business-card" key={b.id}>
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                <span className="pill" style={{ background: "#dbeafe", color: "#1e40af" }}>
                  {tmpl.name}
                </span>
                <span className="pill" style={{ background: "#f1f5f9", color: "#64748b" }}>
                  {tmpl.sector}
                </span>
              </div>
              <h2>{b.name}</h2>
              <p className="muted" style={{ margin: "6px 0 12px 0" }}>
                Role: <b>{b.role}</b> · GSTIN: {b.gstin || "Not added"}
              </p>
              <button className="primary full" onClick={() => choose(b.id)}>
                Open Point of Sale (POS)
              </button>
            </article>
          );
        })}
      </section>

      {!rows.length && !error && (
        <section className="panel" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h2>No business workspace created yet</h2>
          <p className="muted" style={{ maxWidth: "500px", margin: "8px auto 18px auto" }}>
            {isAdmin
              ? "You can create a custom business account or test our 60+ pre-built business demo templates immediately."
              : "Get started by adding your business workspace to begin billing and inventory management."}
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="primary link-btn" to="/setup">
              + Add your business
            </Link>
            {isAdmin && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => navigate("/demo")}
                >
                  🎭 Explore 60+ Live Demos
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={seedAllWorkspaces}
                  disabled={busy}
                >
                  ⚡ Seed All 62 Workspaces
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
