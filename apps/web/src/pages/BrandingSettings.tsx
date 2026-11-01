import { FormEvent, useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";

export function BrandingSettings() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [business, setBusiness] = useState<any>(null);
  const [businessesList, setBusinessesList] = useState<any[]>([]);

  // Form State
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [invoiceFooter, setInvoiceFooter] = useState("Thank you for your business!");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");

  // Toggles
  const [showLogo, setShowLogo] = useState(true);
  const [showContact, setShowContact] = useState(true);
  const [showGstin, setShowGstin] = useState(true);
  const [showPlatformBranding, setShowPlatformBranding] = useState(false); // default to clean white-label
  const [brandingMode, setBrandingMode] = useState<"standard" | "business" | "white_label">("business");
  const [invoiceTemplate, setInvoiceTemplate] = useState("modern");

  // UI state
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preset theme colors
  const colorPresets = [
    { name: "Sapphire Blue", color: "#2563eb" },
    { name: "Emerald Green", color: "#059669" },
    { name: "Modern Dark", color: "#1e293b" },
    { name: "Royal Purple", color: "#7c3aed" },
    { name: "Crimson Red", color: "#dc2626" },
    { name: "Warm Amber", color: "#d97706" },
    { name: "Teal Cyan", color: "#0891b2" },
  ];

  async function load() {
    try {
      const bizs = await api<any[]>("/api/businesses").catch(() => []);
      setBusinessesList(bizs || []);
      const current = (bizs || []).find((b: any) => b.id === bid) || bizs[0];
      if (current) {
        if (!bid && current.id) {
          localStorage.setItem("nexus_business_id", current.id);
        }
        setBusiness(current);
        setBrandName(current.brand_name || current.name || "");
        setLogoUrl(current.logo_url || "");
        setBrandColor(current.brand_color || "#2563eb");
        setInvoiceFooter(current.invoice_footer || "Thank you for choosing us!");
        setPhone(current.phone || "");
        setAddress(current.address || "");
        setGstin(current.gstin || "");
        setShowLogo(current.show_logo ?? true);
        setShowContact(current.show_contact ?? true);
        setShowGstin(current.show_gstin ?? true);
        setShowPlatformBranding(current.show_platform_branding ?? false);
        setBrandingMode(current.branding_mode || "business");
        setInvoiceTemplate(current.invoice_template || "modern");
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [bid]);

  // Handle Logo Upload (Upload to Supabase Storage with Data URI fallback)
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Please upload a logo image under 2MB (transparent PNG recommended).");
      return;
    }

    setUploading(true);
    setMsg("");

    try {
      // 1. Read as high-res Data URI (ensures offline, jsPDF, and zero-CORS reliability)
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUri = reader.result as string;
        setLogoUrl(dataUri);

        // 2. Try uploading to Supabase Storage bucket 'business-logos'
        try {
          const fileExt = file.name.split(".").pop();
          const fileName = `${bid || "default"}/logo_${Date.now()}.${fileExt}`;
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from("business-logos")
            .upload(fileName, file, { upsert: true });

          if (!uploadErr && uploadData?.path) {
            const {
              data: { publicUrl },
            } = supabase.storage.from("business-logos").getPublicUrl(uploadData.path);
            if (publicUrl) setLogoUrl(publicUrl);
          }
        } catch {
          // If storage bucket isn't enabled yet, dataUri fallback works seamlessly
        }

        setUploading(false);
        setMsg("Logo loaded! Click 'Save Branding Settings' to apply.");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploading(false);
      setError("Failed to process logo file");
    }
  }

  function removeLogo() {
    setLogoUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const targetBid = business?.id || bid;
    if (!targetBid) {
      setError("Please select or create a business workspace first.");
      return;
    }

    setBusy(true);
    setMsg("");
    setError("");

    try {
      await api(
        "/api/branding",
        {
          method: "PATCH",
          body: JSON.stringify({
            business_id: targetBid,
            brand_name: brandName,
            logo_url: logoUrl,
            brand_color: brandColor,
            invoice_footer: invoiceFooter,
            phone: phone,
            address: address,
            gstin: gstin,
            show_logo: showLogo,
            show_contact: showContact,
            show_gstin: showGstin,
            show_platform_branding: showPlatformBranding,
            branding_mode: brandingMode,
            invoice_template: invoiceTemplate,
          }),
        },
        targetBid
      );

      setMsg("Invoice branding settings saved successfully!");
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to save branding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      {/* Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
            <span className="pill" style={{ background: "#dbeafe", color: "#1e40af" }}>
              Settings · Business Profile
            </span>
            <span className="pill" style={{ background: "#dcfce7", color: "#166534" }}>
              White-Label Invoices
            </span>
          </div>
          <h1>Custom Invoice Branding</h1>
          <p className="muted">
            Customize invoice logos, brand colors, header names, and contact details for your business receipts.
          </p>
        </div>

        {businessesList.length > 1 && (
          <div>
            <label style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              Active Workspace:
              <select
                style={{ marginLeft: "6px" }}
                value={business?.id || bid}
                onChange={(e) => {
                  localStorage.setItem("nexus_business_id", e.target.value);
                  window.location.reload();
                }}
              >
                {businessesList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {msg && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #34d399",
            color: "#065f46",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "1.2rem",
            fontWeight: 600,
          }}
        >
          ✅ {msg}
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
            marginBottom: "1.2rem",
            fontWeight: 600,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <div className="billing-layout" style={{ gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
        {/* Left Column: Form Settings */}
        <section className="panel">
          <form onSubmit={handleSave}>
            {/* Branding Mode Selector */}
            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ fontWeight: 700, marginBottom: "6px" }}>
                Branding Mode
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    border: brandingMode === "standard" ? "2px solid #2563eb" : undefined,
                    background: brandingMode === "standard" ? "#eff6ff" : undefined,
                  }}
                  onClick={() => {
                    setBrandingMode("standard");
                    setShowPlatformBranding(true);
                  }}
                >
                  <b>Standard</b>
                  <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>
                    Nexus Creative
                  </small>
                </button>

                <button
                  type="button"
                  className="secondary"
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    border: brandingMode === "business" ? "2px solid #2563eb" : undefined,
                    background: brandingMode === "business" ? "#eff6ff" : undefined,
                  }}
                  onClick={() => {
                    setBrandingMode("business");
                    setShowPlatformBranding(true);
                  }}
                >
                  <b>Business</b>
                  <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>
                    Logo + Custom Name
                  </small>
                </button>

                <button
                  type="button"
                  className="secondary"
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    border: brandingMode === "white_label" ? "2px solid #059669" : undefined,
                    background: brandingMode === "white_label" ? "#ecfdf5" : undefined,
                    color: brandingMode === "white_label" ? "#065f46" : undefined,
                  }}
                  onClick={() => {
                    setBrandingMode("white_label");
                    setShowPlatformBranding(false); // 100% white label
                  }}
                >
                  <b>White Label ⭐</b>
                  <small style={{ display: "block", color: "#059669", fontSize: "11px" }}>
                    100% Your Brand
                  </small>
                </button>
              </div>
            </div>

            {/* Business Logo Upload */}
            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ fontWeight: 700, marginBottom: "4px" }}>
                Business Logo (PNG, JPG, SVG)
              </label>
              <p className="muted" style={{ fontSize: "12px", margin: "2px 0 8px 0" }}>
                Recommended: Transparent PNG, minimum 300x120px for crisp receipt printing.
              </p>

              {logoUrl ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "10px",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                  }}
                >
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    style={{
                      maxHeight: "65px",
                      maxWidth: "160px",
                      objectFit: "contain",
                      background: "#fff",
                      padding: "4px",
                      borderRadius: "4px",
                      border: "1px solid #e2e8f0",
                    }}
                  />
                  <div>
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: "4px 8px", fontSize: "12px", color: "#ef4444" }}
                      onClick={removeLogo}
                    >
                      🗑️ Remove Logo
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    border: "2px dashed #cbd5e1",
                    borderRadius: "8px",
                    padding: "20px",
                    textAlign: "center",
                    background: "#f8fafc",
                    cursor: "pointer",
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span style={{ fontSize: "28px" }}>🖼️</span>
                  <p style={{ margin: "6px 0 2px 0", fontWeight: 600 }}>
                    Click to select logo image from your device
                  </p>
                  <small className="muted">Supports PNG, JPG, WebP, SVG (Max 2MB)</small>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/svg+xml, image/webp"
                style={{ display: "none" }}
                onChange={handleLogoUpload}
              />
            </div>

            {/* Brand Display Name */}
            <label>
              Invoice Header / Brand Display Name *
              <input
                required
                placeholder="e.g. ABC MULTISPECIALITY HOSPITAL / NEXUS MART"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <small className="muted">This name appears at the top of your bills and PDFs.</small>
            </label>

            {/* Theme Colors */}
            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ fontWeight: 700, marginBottom: "6px" }}>
                Invoice Accent Theme Colour
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                {colorPresets.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      border: brandColor === c.color ? "2px solid #000" : "1px solid #cbd5e1",
                      borderRadius: "6px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                    onClick={() => setBrandColor(c.color)}
                  >
                    <span
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: c.color,
                        display: "inline-block",
                      }}
                    />
                    {c.name}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  style={{ width: "42px", height: "36px", padding: "2px", cursor: "pointer" }}
                />
                <input
                  style={{ width: "120px", textTransform: "uppercase" }}
                  maxLength={7}
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                />
                <small className="muted">Custom Hex code for lines and banners</small>
              </div>
            </div>

            {/* Address & Contact Details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label>
                Contact Phone / WhatsApp
                <input
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>

              <label>
                GSTIN Number (optional)
                <input
                  placeholder="e.g. 33AAAAA0000A1Z5"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                />
              </label>
            </div>

            <label>
              Business Store Address
              <input
                placeholder="e.g. 104 Mount Road, Anna Salai, Chennai, Tamil Nadu"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            {/* Footer Message */}
            <label>
              Invoice Footer Message
              <input
                placeholder="e.g. Thank you for choosing ABC Hospital · Get well soon!"
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
              />
            </label>

            {/* Display Visibility Toggles */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "12px",
                borderRadius: "8px",
                marginTop: "12px",
              }}
            >
              <h3 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
                Visibility & White-Label Toggles
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showLogo}
                    onChange={(e) => setShowLogo(e.target.checked)}
                  />
                  <span>Show business logo on receipts & PDF</span>
                </label>

                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showContact}
                    onChange={(e) => setShowContact(e.target.checked)}
                  />
                  <span>Show business address and phone number</span>
                </label>

                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showGstin}
                    onChange={(e) => setShowGstin(e.target.checked)}
                  />
                  <span>Show GSTIN header when applicable</span>
                </label>

                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={showPlatformBranding}
                    onChange={(e) => setShowPlatformBranding(e.target.checked)}
                  />
                  <span>
                    Show Nexus Creative platform branding{" "}
                    <small style={{ color: "#64748b" }}>
                      (Uncheck for 100% white-label invoices)
                    </small>
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="primary full"
              disabled={busy || uploading}
              style={{ marginTop: "1.5rem", background: brandColor }}
            >
              {busy ? "Saving Settings…" : "💾 Save Branding Settings"}
            </button>
          </form>
        </section>

        {/* Right Column: Real-Time Live Invoice Preview */}
        <div>
          <div className="panel" style={{ position: "sticky", top: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h2 style={{ margin: 0 }}>Live Invoice Preview</h2>
              <span
                className="pill"
                style={{
                  background: brandingMode === "white_label" ? "#ecfdf5" : "#eff6ff",
                  color: brandingMode === "white_label" ? "#065f46" : "#1e40af",
                  fontWeight: 700,
                }}
              >
                {brandingMode === "white_label" ? "100% White Label" : "Branded Invoice"}
              </span>
            </div>
            <p className="muted" style={{ fontSize: "12px", margin: "0 0 14px 0" }}>
              This preview updates in real-time as you tweak your logo, colors, and layout.
            </p>

            {/* The Live Branded Receipt Container */}
            <div
              style={{
                background: "#fff",
                border: `2px solid ${brandColor}`,
                borderRadius: "10px",
                padding: "16px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                fontFamily: "monospace, sans-serif",
                fontSize: "12px",
                color: "#1e293b",
              }}
            >
              {/* Logo / Header */}
              {showLogo && logoUrl && (
                <div style={{ textAlign: "center", marginBottom: "8px" }}>
                  <img
                    src={logoUrl}
                    alt="Logo"
                    style={{
                      maxHeight: "55px",
                      maxWidth: "140px",
                      objectFit: "contain",
                      margin: "0 auto",
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: "15px",
                  color: brandColor,
                  letterSpacing: "0.5px",
                }}
              >
                {brandName || business?.name || "YOUR BUSINESS NAME"}
              </div>

              {showContact && (
                <div style={{ textAlign: "center", color: "#64748b", marginTop: "2px" }}>
                  <div>{address || "Chennai, Tamil Nadu"}</div>
                  {phone && <div>Tel: {phone}</div>}
                </div>
              )}

              {showGstin && gstin && (
                <div style={{ textAlign: "center", fontWeight: 600, marginTop: "2px" }}>
                  GSTIN: {gstin}
                </div>
              )}

              <div
                style={{
                  background: brandColor,
                  color: "#fff",
                  textAlign: "center",
                  fontWeight: 700,
                  padding: "3px 0",
                  margin: "8px 0",
                  borderRadius: "4px",
                  fontSize: "11px",
                  letterSpacing: "1px",
                }}
              >
                TAX INVOICE
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
                <span>Invoice: <b>{business?.invoice_prefix || "INV"}/2026-27/0001</b></span>
                <span>Date: {new Date().toLocaleDateString("en-IN")}</span>
              </div>

              <div>
                Customer: <b>Walk-in Patient / Client</b>
              </div>

              <div style={{ borderTop: "1px dashed #cbd5e1", margin: "8px 0" }} />

              {/* Sample Table */}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Description</span>
                <span>Amount</span>
              </div>
              <div style={{ borderTop: "1px solid #cbd5e1", margin: "4px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                <span>Consultation / Service</span>
                <span>₹500.00</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                <span>Diagnostic Test / Medicine</span>
                <span>₹800.00</span>
              </div>

              <div style={{ borderTop: "1px dashed #cbd5e1", margin: "8px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal</span>
                <span>₹1,300.00</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                <span>GST (0%)</span>
                <span>₹0.00</span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 800,
                  fontSize: "14px",
                  color: brandColor,
                  marginTop: "4px",
                  paddingTop: "4px",
                  borderTop: `1px solid ${brandColor}`,
                }}
              >
                <span>TOTAL</span>
                <span>₹1,300.00</span>
              </div>

              <div style={{ borderTop: "1px dashed #cbd5e1", margin: "10px 0 6px 0" }} />

              <div
                style={{
                  textAlign: "center",
                  fontStyle: "italic",
                  color: "#475569",
                  fontSize: "11px",
                }}
              >
                {invoiceFooter || "Thank you for choosing us!"}
              </div>

              {/* Nexus Platform Branding Watermark */}
              {showPlatformBranding && brandingMode !== "white_label" ? (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "9px",
                    color: "#94a3b8",
                    marginTop: "8px",
                  }}
                >
                  ⚡ Powered by Nexus Creative SaaS
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

