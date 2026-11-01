import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";

export function BusinessSetup() {
  const [name, setName] = useState("");
  const [type, setType] = useState("retail");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("33");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const b: any = await api("/api/businesses", {
        method: "POST",
        body: JSON.stringify({
          name,
          business_type: type,
          gstin: gstin || null,
          state_code: state,
        }),
      });
      localStorage.setItem("nexus_business_id", b.id);
      setMsg(`Business created: ${b.name}. Redirecting to Workspace…`);
      setTimeout(() => navigate("/"), 1200);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">TENANT ONBOARDING</p>
      <h1>Add your business</h1>
      <p className="muted">
        Each business receives its own isolated workspace, categories, and records.
      </p>
      <form onSubmit={submit}>
        <label>
          Business name
          <input
            required
            placeholder="e.g. Nexus Supermarket"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Business category
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="retail">Retail Shop</option>
            <option value="supermarket">Supermarket</option>
            <option value="salon">Salon</option>
            <option value="gym">Gym</option>
            <option value="clinic">Clinic</option>
            <option value="barbershop">Barbershop</option>
            <option value="general_pos">General POS</option>
          </select>
        </label>
        <label>
          GSTIN (optional)
          <input
            maxLength={15}
            placeholder="e.g. 33AAAAA0000A1Z5"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          GST state code
          <input
            maxLength={2}
            value={state}
            onChange={(e) => setState(e.target.value)}
          />
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? "Creating…" : "Create business workspace"}
        </button>
      </form>
      {msg && <p className="muted" style={{ marginTop: "1rem" }}>{msg}</p>}
    </section>
  );
}
