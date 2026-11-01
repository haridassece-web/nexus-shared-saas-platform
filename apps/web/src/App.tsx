import { useEffect, useState } from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { Login } from "./pages/Login";
import { Workspace } from "./pages/Workspace";
import { BusinessSetup } from "./pages/BusinessSetup";
import { Retail } from "./pages/Retail";
import { PlatformAdmin } from "./pages/PlatformAdmin";
import { Subscription } from "./pages/Subscription";
import { Inventory } from "./pages/Inventory";
import { Reports } from "./pages/Reports";
import { BrandingSettings } from "./pages/BrandingSettings";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => l.subscription.unsubscribe();
  }, []);

  if (!ready) return <main className="center">Loading Nexus Cloud…</main>;
  if (!session) return <Login />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          NEXUS <span>CREATIVE</span>
          <small>SHARED SaaS PLATFORM</small>
        </div>
        <nav>
          <Link to="/">Workspace</Link>
          <Link to="/setup">Add business</Link>
          <Link to="/retail">Retail Billing</Link>
          <Link to="/inventory">Inventory</Link>
          <Link to="/reports">Sales Reports</Link>
          <Link to="/branding">Invoice Branding</Link>
          <Link to="/subscription">Subscription</Link>
          <Link to="/platform">Super Admin</Link>
        </nav>
        <button className="logout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
        <small className="muted">Connecting Businesses. Empowering Growth.</small>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/setup" element={<BusinessSetup />} />
          <Route path="/retail" element={<Retail />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/branding" element={<BrandingSettings />} />
          <Route
            path="/subscription"
            element={
              <Subscription
                businessId={localStorage.getItem("nexus_business_id") || ""}
              />
            }
          />
          <Route path="/platform" element={<PlatformAdmin />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
