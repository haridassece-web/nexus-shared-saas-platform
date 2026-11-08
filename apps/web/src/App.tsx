import { useEffect, useState } from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { supabase, checkIsAdmin, isSuperAdmin } from "./lib/supabase";
import { Login } from "./pages/Login";
import { Workspace } from "./pages/Workspace";
import { BusinessSetup } from "./pages/BusinessSetup";
import { Retail } from "./pages/Retail";
import { PlatformAdmin } from "./pages/PlatformAdmin";
import { Subscription } from "./pages/Subscription";
import { Inventory } from "./pages/Inventory";
import { Reports } from "./pages/Reports";
import { BrandingSettings } from "./pages/BrandingSettings";
import { LiveDemoShowroom } from "./pages/LiveDemoShowroom";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        if (isSuperAdmin(data.session.user)) {
          setIsAdmin(true);
        } else {
          checkIsAdmin(data.session.user).then(setIsAdmin);
        }
      } else {
        setIsAdmin(false);
      }
      setReady(true);
    });

    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        if (isSuperAdmin(s.user)) {
          setIsAdmin(true);
        } else {
          checkIsAdmin(s.user).then(setIsAdmin);
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => l.subscription.unsubscribe();
  }, []);

  function handleSignOut() {
    localStorage.removeItem("nexus_guest_demo");
    localStorage.removeItem("nexus_demo_template");
    supabase.auth.signOut();
  }

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
          {isAdmin && (
            <Link
              to="/demo"
              style={{
                color: "#38bdf8",
                fontWeight: 800,
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              🎭 60+ Live Demos
            </Link>
          )}
          <Link to="/">Workspace</Link>
          <Link to="/setup">Add business</Link>
          <Link to="/retail">Retail Billing</Link>
          <Link to="/inventory">Inventory</Link>
          <Link to="/reports">Sales Reports</Link>
          <Link to="/branding">Invoice Branding</Link>
          <Link to="/subscription">Subscription</Link>
          {isAdmin && <Link to="/platform">Super Admin</Link>}
        </nav>
        <button className="logout" onClick={handleSignOut}>
          Sign out
        </button>
        <small className="muted">Connecting Businesses. Empowering Growth.</small>
      </aside>

      <main className="content">
        <Routes>
          <Route
            path="/demo"
            element={isAdmin ? <LiveDemoShowroom /> : <Navigate to="/" />}
          />
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
          <Route
            path="/platform"
            element={isAdmin ? <PlatformAdmin /> : <Navigate to="/" />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
