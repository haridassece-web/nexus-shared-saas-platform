import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { getTemplateForBusinessType } from "../lib/businessTemplates";

type Biz = {
  id: string;
  name: string;
  business_type: string;
  role: string;
  gstin: string | null;
};

export function Workspace() {
  const [rows, setRows] = useState<Biz[]>([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api<Biz[]>("/api/businesses")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  function choose(id: string) {
    localStorage.setItem("nexus_business_id", id);
    navigate("/retail");
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">NEXUS CLOUD</p>
          <h1>Your workspace</h1>
          <p className="muted">
            Select a business or create another business account.
          </p>
        </div>
        <Link className="primary link-btn" to="/setup">
          + Add business
        </Link>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="business-grid">
        {rows.map((b) => {
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
              <p className="muted">
                Role: {b.role} · GSTIN: {b.gstin || "Not added"}
              </p>
              <button className="primary" onClick={() => choose(b.id)}>
                Open workspace
              </button>
            </article>
          );
        })}
      </section>
      {!rows.length && !error && (
        <section className="panel">
          <h2>No business added yet</h2>
          <p className="muted">
            Create your first business workspace to start billing.
          </p>
          <Link to="/setup" className="primary link-btn">
            Create business
          </Link>
        </section>
      )}
    </>
  );
}
