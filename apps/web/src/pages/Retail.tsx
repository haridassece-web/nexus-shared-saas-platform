import { FormEvent, useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { jsPDF } from "jspdf";
import {
  getTemplateForBusinessType,
  BusinessCategoryTemplate,
} from "../lib/businessTemplates";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  barcode: string | null;
  hsn_code?: string | null;
  selling_price: number;
  gst_rate: number;
  stock_qty: number;
  category_id?: string | null;
  category_name?: string | null;
};

type Line = {
  product: Product;
  qty: number;
};

type Receipt = {
  invoice_number: string;
  date: string;
  customer_name: string;
  customer_phone: string;
  customer_state: string;
  payment_method: string;
  payment_reference: string;
  order_type: string;
  custom_fields: Record<string, string>;
  items: Array<{
    name: string;
    hsn: string;
    qty: number;
    price: number;
    total: number;
    gst_rate: number;
  }>;
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total: number;
  cash_tendered: number;
  change_due: number;
};

type PastInvoice = {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  payment_method: string;
  created_at: string;
  custom_fields?: Record<string, string>;
  order_type?: string;
};

export function Retail() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [business, setBusiness] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [pastInvoices, setPastInvoices] = useState<PastInvoice[]>([]);

  // Category Template & Archetype Metadata
  const template: BusinessCategoryTemplate = getTemplateForBusinessType(
    business?.business_type || "retail_shop"
  );

  // Dynamic Custom Template Fields
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [extraCustomFields, setExtraCustomFields] = useState<
    Array<{ key: string; label: string; value: string }>
  >([]);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");

  // Search & Manual Entry States
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedManualId, setSelectedManualId] = useState("");

  // Customer & Billing Details
  const [customer, setCustomer] = useState("Walk-in");
  const [phone, setPhone] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [orderType, setOrderType] = useState("Counter Sale");
  const [method, setMethod] = useState("UPI");
  const [paymentReference, setPaymentReference] = useState("");
  const [discountAmount, setDiscountAmount] = useState<string>("0");
  const [autoRoundOff, setAutoRoundOff] = useState(true);
  const [cashTendered, setCashTendered] = useState<string>("");

  // Quick Add Item Modal
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickForm, setQuickForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    hsn_code: "",
    selling_price: "",
    gst_rate: "0",
    stock_qty: "100",
  });

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!bid) return;
    try {
      const [prods, cats, bizs, sales] = await Promise.all([
        api<Product[]>("/api/tenant/retail/products", {}, bid).catch(() => []),
        api<Category[]>("/api/tenant/categories", {}, bid).catch(() => []),
        api<any[]>("/api/businesses").catch(() => []),
        api<PastInvoice[]>("/api/tenant/retail/reports/sales", {}, bid).catch(() => []),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      setPastInvoices((sales || []).slice(0, 10));
      const current = (bizs || []).find((b: any) => b.id === bid);
      if (current) {
        setBusiness(current);
        if (current.state_code && !customerState) {
          setCustomerState(current.state_code);
        }
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [bid]);

  // Sync default order type when category template loads
  useEffect(() => {
    if (template.order_types && template.order_types.length > 0) {
      setOrderType(template.order_types[0]);
    }
  }, [business?.business_type]);

  // Live Smart Search Filter (matches Name, SKU/Item Code, or Barcode)
  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const matches = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
    setSearchResults(matches);
    setShowDropdown(matches.length > 0);
  }, [searchTerm, products]);

  function addProductToCart(p: Product, qty: number = 1) {
    setLines((old) => {
      const f = old.find((x) => x.product.id === p.id);
      if (f) {
        return old.map((x) =>
          x.product.id === p.id ? { ...x, qty: x.qty + qty } : x
        );
      }
      return [...old, { product: p, qty }];
    });
    setSearchTerm("");
    setShowDropdown(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }

  function updateQty(productId: string, newQty: number) {
    if (newQty <= 0) {
      setLines((old) => old.filter((x) => x.product.id !== productId));
    } else {
      setLines((old) =>
        old.map((x) =>
          x.product.id === productId ? { ...x, qty: newQty } : x
        )
      );
    }
  }

  // Handle Search Input Submission (Enter key)
  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = searchTerm.trim().toLowerCase();
    if (!q) return;

    // 1. Try exact barcode match
    let match = products.find((p) => p.barcode && p.barcode.toLowerCase() === q);
    // 2. Try exact SKU/Item Code match
    if (!match) {
      match = products.find((p) => p.sku && p.sku.toLowerCase() === q);
    }
    // 3. Try exact Name match or first search result
    if (!match && searchResults.length > 0) {
      match = searchResults[0];
    }

    if (match) {
      addProductToCart(match, 1);
    } else {
      setMsg(`Item "${searchTerm}" not found. You can add it using "+ Quick Add Item".`);
    }
    setSearchTerm("");
    setShowDropdown(false);
  }

  // Quick Add Item On-the-Fly
  async function handleQuickAddProduct(e: FormEvent) {
    e.preventDefault();
    if (!quickForm.name || !quickForm.selling_price) return;
    setBusy(true);
    try {
      const created: any = await api(
        "/api/tenant/retail/products",
        {
          method: "POST",
          body: JSON.stringify({
            ...quickForm,
            selling_price: Number(quickForm.selling_price),
            gst_rate: Number(quickForm.gst_rate || 0),
            stock_qty: Number(quickForm.stock_qty || 100),
          }),
        },
        bid
      );
      await load();
      addProductToCart(created, 1);
      setShowQuickAddModal(false);
      setQuickForm({
        name: "",
        sku: "",
        barcode: "",
        hsn_code: "",
        selling_price: "",
        gst_rate: "0",
        stock_qty: "100",
      });
      setMsg(`Item "${created.name}" added to bill.`);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Add Custom Field on the fly
  function handleAddCustomField(e: FormEvent) {
    e.preventDefault();
    if (!newFieldLabel.trim()) return;
    const key = newFieldKey.trim() || newFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, "_");
    setExtraCustomFields((prev) => [...prev, { key, label: newFieldLabel.trim(), value: "" }]);
    setNewFieldKey("");
    setNewFieldLabel("");
    setShowAddCustomModal(false);
  }

  // Tax and Totals Calculation
  const subtotal = lines.reduce(
    (s, l) => s + Number(l.product.selling_price) * l.qty,
    0
  );
  const tax = lines.reduce(
    (s, l) =>
      s +
      (Number(l.product.selling_price) * l.qty * Number(l.product.gst_rate)) /
        100,
    0
  );

  const discount = Math.max(0, Number(discountAmount) || 0);
  const rawTotal = Math.max(0, subtotal + tax - discount);
  const finalTotal = autoRoundOff ? Math.round(rawTotal) : rawTotal;
  const roundOffDelta = finalTotal - rawTotal;

  // Change Due Calculation for Cash Payments
  const cashNum = Number(cashTendered) || 0;
  const changeDue = method === "Cash" && cashNum > finalTotal ? cashNum - finalTotal : 0;

  async function createInvoice(): Promise<any> {
    const combinedCustomFields: Record<string, string> = { ...customFieldValues };
    extraCustomFields.forEach((f) => {
      if (f.key && f.value) combinedCustomFields[f.key] = f.value;
    });

    return api(
      "/api/tenant/retail/invoices",
      {
        method: "POST",
        body: JSON.stringify({
          customer_name: customer,
          customer_phone: phone,
          customer_state_code: customerState || null,
          payment_method: method,
          payment_reference: paymentReference || null,
          order_type: orderType,
          custom_fields: combinedCustomFields,
          items: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.qty,
          })),
        }),
      },
      bid
    );
  }

  function generateReceiptObject(inv: any): Receipt {
    const isInterstate =
      customerState &&
      business?.state_code &&
      customerState.trim() !== business.state_code.trim();

    const combinedCustomFields: Record<string, string> = { ...customFieldValues };
    extraCustomFields.forEach((f) => {
      if (f.key && f.value) combinedCustomFields[f.key] = f.value;
    });

    return {
      invoice_number: inv.invoice_number,
      date: new Date().toLocaleString("en-IN"),
      customer_name: customer || "Walk-in",
      customer_phone: phone,
      customer_state: customerState,
      payment_method: method,
      payment_reference: paymentReference,
      order_type: orderType,
      custom_fields: combinedCustomFields,
      items: lines.map((l) => ({
        name: l.product.name,
        hsn: l.product.hsn_code || "—",
        qty: l.qty,
        price: Number(l.product.selling_price),
        total: Number(l.product.selling_price) * l.qty,
        gst_rate: Number(l.product.gst_rate),
      })),
      subtotal: subtotal,
      discount: discount,
      cgst: isInterstate ? 0 : tax / 2,
      sgst: isInterstate ? 0 : tax / 2,
      igst: isInterstate ? tax : 0,
      round_off: roundOffDelta,
      total: finalTotal,
      cash_tendered: cashNum,
      change_due: changeDue,
    };
  }

  function downloadPdf(receipt: Receipt) {
    const pdf = new jsPDF();
    const brandColor = business?.brand_color || "#2563eb";
    const brandName = business?.brand_name || business?.name || "TAX INVOICE";
    const showLogo = business?.show_logo ?? true;
    const showContact = business?.show_contact ?? true;
    const showGstin = business?.show_gstin ?? true;
    const footerMsg = business?.invoice_footer || "Thank you for your business!";
    const isWhiteLabel =
      business?.branding_mode === "white_label" ||
      business?.show_platform_branding === false;

    // Convert hex color to rgb
    let r = 37, g = 99, b = 235;
    if (brandColor.startsWith("#") && brandColor.length === 7) {
      r = parseInt(brandColor.slice(1, 3), 16) || 37;
      g = parseInt(brandColor.slice(3, 5), 16) || 99;
      b = parseInt(brandColor.slice(5, 7), 16) || 235;
    }

    let y = 18;

    // Embed business logo if present
    if (showLogo && business?.logo_url) {
      try {
        pdf.addImage(business.logo_url, "PNG", 14, 10, 35, 16);
        y = 30;
      } catch {
        // Continue gracefully if image format fails
      }
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(r, g, b);
    pdf.text(brandName, 14, y);
    pdf.setTextColor(30, 41, 59);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    y += 5;
    pdf.text(`${template.name} · ${template.sector}`, 14, y);
    y += 5;

    if (showContact) {
      if (business?.address) {
        pdf.text(business.address, 14, y);
        y += 5;
      }
      if (business?.phone) {
        pdf.text(`Phone: ${business.phone}`, 14, y);
        y += 5;
      }
    }

    if (showGstin && business?.gstin) {
      pdf.text(`GSTIN: ${business.gstin}`, 14, y);
      y += 5;
    }

    // Color banner line
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(0.8);
    pdf.line(14, y, 196, y);
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(200, 200, 200);
    y += 6;

    pdf.setFont("helvetica", "bold");
    pdf.text(`Invoice: ${receipt.invoice_number}`, 14, y);
    pdf.text(`Date: ${receipt.date}`, 130, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.text(`Order Type: ${receipt.order_type}`, 14, y);
    pdf.text(`Payment: ${receipt.payment_method}`, 130, y);
    y += 5;
    pdf.text(`${template.customer_label}: ${receipt.customer_name}`, 14, y);
    if (receipt.customer_phone) {
      pdf.text(`Phone: ${receipt.customer_phone}`, 130, y);
    }
    y += 5;

    // Render custom template fields (Doctor, Patient ID, Vehicle No, Stylist, Table No, etc.)
    if (receipt.custom_fields && Object.keys(receipt.custom_fields).length > 0) {
      Object.entries(receipt.custom_fields).forEach(([k, v]) => {
        if (v) {
          const fieldDef = template.custom_fields.find((f) => f.name === k);
          const lbl = fieldDef?.label || k;
          pdf.text(`${lbl}: ${v}`, 14, y);
          y += 5;
        }
      });
    }

    y += 2;
    pdf.line(14, y, 196, y);
    y += 5;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(r, g, b);
    pdf.text(template.item_label, 14, y);
    pdf.text("HSN", 100, y);
    pdf.text("Qty", 125, y);
    pdf.text("Price", 145, y);
    pdf.text("Total", 175, y);
    pdf.setTextColor(30, 41, 59);
    y += 2;
    pdf.line(14, y, 196, y);
    pdf.setFont("helvetica", "normal");

    y += 6;
    receipt.items.forEach((l) => {
      pdf.text(l.name.slice(0, 36), 14, y);
      pdf.text(l.hsn || "—", 100, y);
      pdf.text(String(l.qty), 125, y);
      pdf.text(`Rs.${l.price.toFixed(2)}`, 145, y);
      pdf.text(`Rs.${l.total.toFixed(2)}`, 175, y);
      y += 6;
    });

    pdf.line(14, y, 196, y);
    y += 6;
    pdf.text(`Subtotal: Rs.${receipt.subtotal.toFixed(2)}`, 140, y);
    if (receipt.discount > 0) {
      y += 5;
      pdf.text(`Discount: -Rs.${receipt.discount.toFixed(2)}`, 140, y);
    }
    if (receipt.cgst > 0) {
      y += 5;
      pdf.text(`CGST: Rs.${receipt.cgst.toFixed(2)}`, 140, y);
    }
    if (receipt.sgst > 0) {
      y += 5;
      pdf.text(`SGST: Rs.${receipt.sgst.toFixed(2)}`, 140, y);
    }
    if (receipt.igst > 0) {
      y += 5;
      pdf.text(`IGST: Rs.${receipt.igst.toFixed(2)}`, 140, y);
    }
    if (Math.abs(receipt.round_off) > 0.001) {
      y += 5;
      pdf.text(
        `Round Off: Rs.${receipt.round_off > 0 ? "+" : ""}${receipt.round_off.toFixed(2)}`,
        140,
        y
      );
    }
    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(r, g, b);
    pdf.text(`Grand Total: Rs.${receipt.total.toFixed(2)}`, 140, y);
    pdf.setTextColor(30, 41, 59);

    // Custom footer message
    y += 12;
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.text(footerMsg, 14, y);

    if (!isWhiteLabel) {
      y += 5;
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text("Powered by Nexus Creative SaaS Platform", 14, y);
    }

    pdf.save(`${receipt.invoice_number.replace(/\//g, "-")}.pdf`);
  }

  // 1. Save and Print Bill
  async function saveAndPrint() {
    setBusy(true);
    setMsg("");
    try {
      const inv = await createInvoice();
      const receipt = generateReceiptObject(inv);
      setActiveReceipt(receipt);
      setMsg(`Invoice ${inv.invoice_number} saved.`);
      setLines([]);
      setDiscountAmount("0");
      setCashTendered("");
      await load();

      setTimeout(() => {
        window.print();
      }, 300);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  // 2. Save and Download PDF
  async function saveAndDownload() {
    setBusy(true);
    setMsg("");
    try {
      const inv = await createInvoice();
      const receipt = generateReceiptObject(inv);
      downloadPdf(receipt);
      setActiveReceipt(receipt);
      setMsg(`Invoice ${inv.invoice_number} created & PDF downloaded`);
      setLines([]);
      setDiscountAmount("0");
      setCashTendered("");
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  // 3. Share on WhatsApp
  function shareOnWhatsApp(targetReceipt?: Receipt) {
    const rec = targetReceipt || activeReceipt;
    const destPhone = (rec?.customer_phone || phone || "").replace(/\D/g, "");
    const cleanPhone = destPhone.length === 10 ? `91${destPhone}` : destPhone;
    const brandName = business?.brand_name || business?.name || "INVOICE";
    const footerMsg = business?.invoice_footer || "Thank you for choosing us!";
    const isWhiteLabel =
      business?.branding_mode === "white_label" ||
      business?.show_platform_branding === false;

    let text = `*${brandName.toUpperCase()}*\n`;
    text += `*Sector:* ${template.name} (${template.sector})\n`;
    text += `*Invoice:* ${rec ? rec.invoice_number : "Recent"}\n`;
    text += `*Date:* ${rec ? rec.date : new Date().toLocaleDateString()}\n`;
    text += `*${template.customer_label}:* ${rec ? rec.customer_name : customer}\n`;

    const cFields = rec?.custom_fields || customFieldValues;
    Object.entries(cFields).forEach(([k, v]) => {
      if (v) {
        const fieldDef = template.custom_fields.find((f) => f.name === k);
        const lbl = fieldDef?.label || k;
        text += `*${lbl}:* ${v}\n`;
      }
    });

    text += `-----------------------------\n`;
    const itemsList = rec
      ? rec.items
      : lines.map((l) => ({
          name: l.product.name,
          qty: l.qty,
          total: Number(l.product.selling_price) * l.qty,
        }));
    itemsList.forEach((it) => {
      text += `${it.name} x ${it.qty} = Rs. ${Number(it.total).toFixed(2)}\n`;
    });
    text += `-----------------------------\n`;
    const grand = rec ? rec.total : finalTotal;
    text += `*Total Amount:* Rs. ${grand.toFixed(2)}\n`;
    text += `*Payment Mode:* ${rec ? rec.payment_method : method}\n\n`;
    text += `${footerMsg}`;

    if (!isWhiteLabel) {
      text += `\n_Powered by Nexus Creative_`;
    }

    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function resetBill() {
    if (
      lines.length > 0 &&
      !window.confirm("Are you sure you want to clear current items from this bill?")
    ) {
      return;
    }
    setLines([]);
    setDiscountAmount("0");
    setCashTendered("");
    setCustomer("Walk-in");
    setPhone("");
    setCustomFieldValues({});
    setExtraCustomFields([]);
    setMsg("");
  }

  const displayedProducts =
    selectedCat === "all"
      ? products
      : products.filter((p) => p.category_id === selectedCat);

  return (
    <>
      <header className="page-head no-print">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="pill" style={{ background: "#dbeafe", color: "#1e40af", fontWeight: 700 }}>
              {template.sector}
            </span>
            <span className="pill" style={{ background: "#f1f5f9", color: "#475569" }}>
              {template.name} Template
            </span>
          </div>
          <h1>{business?.name || "Nexus Business Billing"}</h1>
          <p className="muted">
            {business?.invoice_prefix ? `Prefix: ${business.invoice_prefix} · ` : ""}
            Financial Year Sequence · Isolated Workspace
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowQuickAddModal(true)}
          >
            + Quick Add Item
          </button>
          <button
            type="button"
            className="secondary"
            style={{ color: "#dc2626" }}
            onClick={resetBill}
          >
            🗑️ Clear Bill
          </button>
        </div>
      </header>

      {/* Quick Add Product Modal */}
      {showQuickAddModal && (
        <div className="modal-overlay no-print">
          <div className="modal-content">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>➕ Quick Add Custom / Unlisted Item</h2>
              <button
                className="secondary"
                style={{ margin: 0, padding: "4px 8px" }}
                onClick={() => setShowQuickAddModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleQuickAddProduct} style={{ marginTop: "1rem" }}>
              <label>
                {template.item_label} Name *
                <input
                  required
                  placeholder={`e.g. ${template.starter_items[0]?.name || "Consultation Fee"}`}
                  value={quickForm.name}
                  onChange={(e) =>
                    setQuickForm({ ...quickForm, name: e.target.value })
                  }
                />
              </label>
              <label>
                Item Code / SKU (optional)
                <input
                  placeholder="e.g. SRV-01"
                  value={quickForm.sku}
                  onChange={(e) =>
                    setQuickForm({ ...quickForm, sku: e.target.value })
                  }
                />
              </label>
              <label>
                Barcode (optional)
                <input
                  placeholder="e.g. 890123000001"
                  value={quickForm.barcode}
                  onChange={(e) =>
                    setQuickForm({ ...quickForm, barcode: e.target.value })
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
                  Selling Price ₹ *
                  <input
                    required
                    type="number"
                    step="any"
                    placeholder="500"
                    value={quickForm.selling_price}
                    onChange={(e) =>
                      setQuickForm({
                        ...quickForm,
                        selling_price: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  GST Rate %
                  <select
                    value={quickForm.gst_rate}
                    onChange={(e) =>
                      setQuickForm({ ...quickForm, gst_rate: e.target.value })
                    }
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </label>
              </div>
              <button
                className="primary full"
                disabled={busy}
                style={{ marginTop: "1rem" }}
              >
                {busy ? "Saving…" : "Save & Add to Bill"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Field Modal */}
      {showAddCustomModal && (
        <div className="modal-overlay no-print">
          <div className="modal-content">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>➕ Add Custom Invoice Field</h2>
              <button
                className="secondary"
                style={{ margin: 0, padding: "4px 8px" }}
                onClick={() => setShowAddCustomModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddCustomField} style={{ marginTop: "1rem" }}>
              <label>
                Field Label (e.g. Discount Coupon, Delivery Boy, Bed Number) *
                <input
                  required
                  placeholder="e.g. Bed Number"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                />
              </label>
              <label>
                Field Identifier / Key (optional)
                <input
                  placeholder="e.g. bed_number"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                />
              </label>
              <button className="primary full" style={{ marginTop: "1rem" }}>
                Add Field
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bill Receipt Preview Modal */}
      {activeReceipt && (
        <div className="modal-overlay no-print">
          <div className="modal-content">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>🧾 Bill Receipt Generated</h2>
              <button
                className="secondary"
                style={{ margin: 0, padding: "4px 10px" }}
                onClick={() => setActiveReceipt(null)}
              >
                ✕ Close
              </button>
            </div>

            {/* Receipt Preview */}
            <div className="thermal-receipt">
              {(business?.show_logo ?? true) && business?.logo_url && (
                <div className="center" style={{ marginBottom: "8px" }}>
                  <img
                    src={business.logo_url}
                    alt={business.brand_name || business.name}
                    style={{ maxHeight: "48px", maxWidth: "160px", objectFit: "contain" }}
                  />
                </div>
              )}
              <div
                className="center biz-title"
                style={{ color: business?.brand_color || undefined }}
              >
                {business?.brand_name || business?.name || "NEXUS CREATIVE"}
              </div>
              <div className="center" style={{ fontSize: "11px", color: "#64748b" }}>
                {template.name} ({template.sector})
              </div>
              {(business?.show_contact ?? true) && business?.address && (
                <div className="center">{business.address}</div>
              )}
              {(business?.show_contact ?? true) && business?.phone && (
                <div className="center">Phone: {business.phone}</div>
              )}
              {(business?.show_gstin ?? true) && business?.gstin && (
                <div className="center">GSTIN: {business.gstin}</div>
              )}
              <div className="divider" />
              <div>
                <b>Invoice:</b> {activeReceipt.invoice_number}
              </div>
              <div>
                <b>Date:</b> {activeReceipt.date}
              </div>
              <div>
                <b>Order Type:</b> {activeReceipt.order_type}
              </div>
              <div>
                <b>{template.customer_label}:</b> {activeReceipt.customer_name}
              </div>
              {activeReceipt.customer_phone && (
                <div>
                  <b>Phone:</b> {activeReceipt.customer_phone}
                </div>
              )}

              {/* Custom Fields in Receipt */}
              {activeReceipt.custom_fields &&
                Object.entries(activeReceipt.custom_fields).map(([k, v]) => {
                  if (!v) return null;
                  const fieldDef = template.custom_fields.find(
                    (f) => f.name === k
                  );
                  const lbl = fieldDef?.label || k;
                  return (
                    <div key={k}>
                      <b>{lbl}:</b> {v}
                    </div>
                  );
                })}

              <div>
                <b>Payment:</b> {activeReceipt.payment_method}
              </div>
              <div className="divider" />

              <table>
                <thead>
                  <tr>
                    <th>{template.item_label}</th>
                    <th style={{ textAlign: "center" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {activeReceipt.items.map((it, idx) => (
                    <tr key={idx}>
                      <td>{it.name}</td>
                      <td style={{ textAlign: "center" }}>{it.qty}</td>
                      <td style={{ textAlign: "right" }}>
                        ₹{it.price.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        ₹{it.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="double-divider" />
              <div className="summary-row">
                <span>Subtotal</span>
                <span>₹{activeReceipt.subtotal.toFixed(2)}</span>
              </div>
              {activeReceipt.discount > 0 && (
                <div className="summary-row" style={{ color: "#b91c1c" }}>
                  <span>Discount</span>
                  <span>-₹{activeReceipt.discount.toFixed(2)}</span>
                </div>
              )}
              {activeReceipt.cgst > 0 && (
                <div className="summary-row">
                  <span>CGST</span>
                  <span>₹{activeReceipt.cgst.toFixed(2)}</span>
                </div>
              )}
              {activeReceipt.sgst > 0 && (
                <div className="summary-row">
                  <span>SGST</span>
                  <span>₹{activeReceipt.sgst.toFixed(2)}</span>
                </div>
              )}
              {activeReceipt.igst > 0 && (
                <div className="summary-row">
                  <span>IGST</span>
                  <span>₹{activeReceipt.igst.toFixed(2)}</span>
                </div>
              )}
              {Math.abs(activeReceipt.round_off) > 0.001 && (
                <div className="summary-row">
                  <span>Round Off</span>
                  <span>
                    {activeReceipt.round_off > 0 ? "+" : ""}₹
                    {activeReceipt.round_off.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="divider" />
              <div className="grand-total">
                <span>GRAND TOTAL</span>
                <span>₹{activeReceipt.total.toFixed(2)}</span>
              </div>
              {activeReceipt.cash_tendered > 0 && (
                <>
                  <div className="summary-row" style={{ marginTop: "4px" }}>
                    <span>Cash Tendered</span>
                    <span>₹{activeReceipt.cash_tendered.toFixed(2)}</span>
                  </div>
                  <div className="summary-row" style={{ fontWeight: 800 }}>
                    <span>Change Returned</span>
                    <span>₹{activeReceipt.change_due.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="double-divider" />
              <div className="center">
                {business?.invoice_footer || "*** THANK YOU FOR VISITING ***"}
              </div>
              {(business?.show_platform_branding ?? true) &&
                business?.branding_mode !== "white_label" && (
                  <div
                    className="center"
                    style={{ fontSize: "9px", color: "#94a3b8", marginTop: "4px" }}
                  >
                    ⚡ Powered by Nexus Creative Platform
                  </div>
                )}
            </div>

            {/* Modal action buttons */}
            <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
              <button
                className="primary full"
                style={{ background: "#059669", fontSize: "16px" }}
                onClick={() => window.print()}
              >
                🖨️ Print Bill Receipt (80mm)
              </button>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                }}
              >
                <button
                  className="secondary"
                  style={{ margin: 0 }}
                  onClick={() => downloadPdf(activeReceipt)}
                >
                  📥 Download PDF
                </button>
                <button
                  className="secondary"
                  style={{ margin: 0, color: "#16a34a" }}
                  onClick={() => shareOnWhatsApp(activeReceipt)}
                >
                  💬 Share WhatsApp
                </button>
              </div>
              <button
                className="secondary full"
                style={{ marginTop: "4px" }}
                onClick={() => setActiveReceipt(null)}
              >
                + New Customer Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable receipt for window.print() */}
      {activeReceipt && (
        <div id="printable-receipt" className="thermal-receipt">
          {(business?.show_logo ?? true) && business?.logo_url && (
            <div className="center" style={{ marginBottom: "6px" }}>
              <img
                src={business.logo_url}
                alt={business.brand_name || business.name}
                style={{ maxHeight: "44px", maxWidth: "150px", objectFit: "contain" }}
              />
            </div>
          )}
          <div
            className="center biz-title"
            style={{ color: business?.brand_color || undefined }}
          >
            {business?.brand_name || business?.name || "NEXUS CREATIVE"}
          </div>
          <div className="center" style={{ fontSize: "11px" }}>
            {template.name} ({template.sector})
          </div>
          {(business?.show_contact ?? true) && business?.address && (
            <div className="center">{business.address}</div>
          )}
          {(business?.show_contact ?? true) && business?.phone && (
            <div className="center">Phone: {business.phone}</div>
          )}
          {(business?.show_gstin ?? true) && business?.gstin && (
            <div className="center">GSTIN: {business.gstin}</div>
          )}
          <div className="divider" />
          <div>
            <b>Invoice:</b> {activeReceipt.invoice_number}
          </div>
          <div>
            <b>Date:</b> {activeReceipt.date}
          </div>
          <div>
            <b>Order Type:</b> {activeReceipt.order_type}
          </div>
          <div>
            <b>{template.customer_label}:</b> {activeReceipt.customer_name}
          </div>
          {activeReceipt.customer_phone && (
            <div>
              <b>Phone:</b> {activeReceipt.customer_phone}
            </div>
          )}

          {activeReceipt.custom_fields &&
            Object.entries(activeReceipt.custom_fields).map(([k, v]) => {
              if (!v) return null;
              const fieldDef = template.custom_fields.find(
                (f) => f.name === k
              );
              const lbl = fieldDef?.label || k;
              return (
                <div key={k}>
                  <b>{lbl}:</b> {v}
                </div>
              );
            })}

          <div>
            <b>Payment:</b> {activeReceipt.payment_method}
          </div>
          <div className="divider" />

          <table>
            <thead>
              <tr>
                <th>{template.item_label}</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {activeReceipt.items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.name}</td>
                  <td style={{ textAlign: "center" }}>{it.qty}</td>
                  <td style={{ textAlign: "right" }}>₹{it.price.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>₹{it.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="double-divider" />
          <div className="summary-row">
            <span>Subtotal</span>
            <span>₹{activeReceipt.subtotal.toFixed(2)}</span>
          </div>
          {activeReceipt.discount > 0 && (
            <div className="summary-row">
              <span>Discount</span>
              <span>-₹{activeReceipt.discount.toFixed(2)}</span>
            </div>
          )}
          {activeReceipt.cgst > 0 && (
            <div className="summary-row">
              <span>CGST</span>
              <span>₹{activeReceipt.cgst.toFixed(2)}</span>
            </div>
          )}
          {activeReceipt.sgst > 0 && (
            <div className="summary-row">
              <span>SGST</span>
              <span>₹{activeReceipt.sgst.toFixed(2)}</span>
            </div>
          )}
          {activeReceipt.igst > 0 && (
            <div className="summary-row">
              <span>IGST</span>
              <span>₹{activeReceipt.igst.toFixed(2)}</span>
            </div>
          )}
          {Math.abs(activeReceipt.round_off) > 0.001 && (
            <div className="summary-row">
              <span>Round Off</span>
              <span>
                {activeReceipt.round_off > 0 ? "+" : ""}₹
                {activeReceipt.round_off.toFixed(2)}
              </span>
            </div>
          )}
          <div className="divider" />
          <div className="grand-total">
            <span>GRAND TOTAL</span>
            <span>₹{activeReceipt.total.toFixed(2)}</span>
          </div>
          {activeReceipt.cash_tendered > 0 && (
            <>
              <div className="summary-row" style={{ marginTop: "4px" }}>
                <span>Cash Tendered</span>
                <span>₹{activeReceipt.cash_tendered.toFixed(2)}</span>
              </div>
              <div className="summary-row" style={{ fontWeight: 800 }}>
                <span>Change Returned</span>
                <span>₹{activeReceipt.change_due.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="double-divider" />
          <div className="center">
            {business?.invoice_footer || "*** THANK YOU FOR VISITING ***"}
          </div>
          {(business?.show_platform_branding ?? true) &&
            business?.branding_mode !== "white_label" && (
              <div
                className="center"
                style={{ fontSize: "9px", color: "#94a3b8", marginTop: "4px" }}
              >
                ⚡ Powered by Nexus Creative Platform
              </div>
            )}
        </div>
      )}

      {/* Main Billing POS Screen */}
      <div className="billing-layout no-print">
        {/* Left Column: Product Search, Catalogue & Categories */}
        <section className="panel">
          {/* Universal Smart Search (Barcode, SKU / Item Code, Product Name) */}
          <div className="smart-search-wrap">
            <form className="scan-row" onSubmit={handleSearchSubmit}>
              <input
                ref={searchInputRef}
                autoFocus
                placeholder={`🔍 Search ${template.item_label}, SKU, or Scan Barcode...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="primary" type="submit">
                Add / Enter
              </button>
            </form>

            {/* Live Autocomplete Results */}
            {showDropdown && searchResults.length > 0 && (
              <div className="search-results-dropdown">
                {searchResults.slice(0, 10).map((p) => (
                  <div
                    key={p.id}
                    className="search-result-item"
                    onClick={() => addProductToCart(p, 1)}
                  >
                    <div>
                      <b>{p.name}</b>
                      <small>
                        {p.sku ? `SKU: ${p.sku}` : ""}
                        {p.barcode ? ` · Barcode: ${p.barcode}` : ""}
                        {p.category_name ? ` · [${p.category_name}]` : ""}
                      </small>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="item-price">
                        ₹{Number(p.selling_price).toFixed(2)}
                      </span>
                      <small
                        style={{
                          color: p.stock_qty < 5 ? "#ef4444" : "#10b981",
                        }}
                      >
                        Stock: {p.stock_qty}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Dropdown Picker */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <select
              style={{ flex: 1 }}
              value={selectedManualId}
              onChange={(e) => setSelectedManualId(e.target.value)}
            >
              <option value="">-- Or Pick {template.item_label} from List --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""} — ₹{p.selling_price} (Stock: {p.stock_qty})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              disabled={!selectedManualId}
              onClick={() => {
                const prod = products.find((p) => p.id === selectedManualId);
                if (prod) addProductToCart(prod, 1);
                setSelectedManualId("");
              }}
            >
              + Add
            </button>
          </div>

          {/* Category filter tabs */}
          {categories.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                overflowX: "auto",
                padding: "0.5rem 0",
                marginBottom: "0.5rem",
              }}
            >
              <button
                type="button"
                className="secondary"
                style={{
                  padding: "0.3rem 0.6rem",
                  background: selectedCat === "all" ? "#2563eb" : undefined,
                  color: selectedCat === "all" ? "#fff" : undefined,
                }}
                onClick={() => setSelectedCat("all")}
              >
                All ({products.length})
              </button>
              {categories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className="secondary"
                  style={{
                    padding: "0.3rem 0.6rem",
                    background: selectedCat === c.id ? "#2563eb" : undefined,
                    color: selectedCat === c.id ? "#fff" : undefined,
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => setSelectedCat(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Visual Product Grid */}
          <div className="product-grid">
            {displayedProducts.map((p) => (
              <button
                className="product-tile"
                key={p.id}
                onClick={() => addProductToCart(p, 1)}
              >
                <b>{p.name}</b>
                {p.sku && (
                  <small style={{ color: "#64748b" }}>Code: {p.sku}</small>
                )}
                <span>₹{Number(p.selling_price).toFixed(2)}</span>
                <small>Stock {p.stock_qty}</small>
              </button>
            ))}
            {!displayedProducts.length && (
              <p className="muted" style={{ padding: "1rem" }}>
                No items found. Click "+ Quick Add Item" above to add your first item.
              </p>
            )}
          </div>
        </section>

        {/* Right Column: Bill Details, Template Custom Fields & Payment */}
        <section className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2>Current bill ({lines.length} items)</h2>
            <span
              className="pill"
              style={{ background: "#e0f2fe", color: "#0369a1" }}
            >
              {orderType}
            </span>
          </div>

          {/* Customer & Order Settings */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <label>
              {template.customer_label} *
              <input
                value={customer}
                placeholder={`e.g. John Doe / Walk-in`}
                onChange={(e) => setCustomer(e.target.value)}
              />
            </label>
            <label>
              Order Type
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
              >
                {template.order_types.map((ot) => (
                  <option key={ot} value={ot}>
                    {ot}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: "8px",
            }}
          >
            <label>
              WhatsApp / Phone Number
              <input
                placeholder="e.g. 919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label>
              Place of Supply (State Code)
              <input
                placeholder="e.g. 33"
                maxLength={2}
                value={customerState}
                onChange={(e) => setCustomerState(e.target.value)}
              />
            </label>
          </div>

          {/* Archetype Template Custom Fields (Doctor, Patient ID, Vehicle No, Stylist, Table No, etc.) */}
          {(template.custom_fields.length > 0 || extraCustomFields.length > 0) && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px",
                background: "#f0fdf4",
                borderRadius: "8px",
                border: "1px solid #bbf7d0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <small style={{ fontWeight: 700, color: "#166534" }}>
                  📋 {template.name} Details
                </small>
                <button
                  type="button"
                  className="secondary"
                  style={{
                    padding: "2px 6px",
                    fontSize: "11px",
                    margin: 0,
                    background: "#fff",
                  }}
                  onClick={() => setShowAddCustomModal(true)}
                >
                  + Add Custom Field
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                }}
              >
                {template.custom_fields.map((f) => (
                  <label key={f.name} style={{ margin: 0, fontSize: "12px" }}>
                    {f.label}
                    <input
                      style={{ padding: "6px", fontSize: "13px" }}
                      placeholder={f.placeholder || f.label}
                      value={customFieldValues[f.name] || ""}
                      onChange={(e) =>
                        setCustomFieldValues({
                          ...customFieldValues,
                          [f.name]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}

                {/* Extra on-the-fly custom fields */}
                {extraCustomFields.map((f, idx) => (
                  <label key={idx} style={{ margin: 0, fontSize: "12px" }}>
                    {f.label}
                    <input
                      style={{ padding: "6px", fontSize: "13px" }}
                      value={f.value}
                      placeholder={f.label}
                      onChange={(e) => {
                        const updated = [...extraCustomFields];
                        updated[idx].value = e.target.value;
                        setExtraCustomFields(updated);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Cart Table with Editable Quantity Stepper */}
          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              marginTop: "10px",
              paddingTop: "8px",
            }}
          >
            {lines.length === 0 && (
              <p
                className="muted"
                style={{ textAlign: "center", padding: "1.5rem" }}
              >
                Cart is empty. Scan barcode or type {template.item_label.toLowerCase()} name above.
              </p>
            )}

            {lines.map((l) => (
              <div
                key={l.product.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: "8px" }}>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    {l.product.name}
                  </div>
                  <small style={{ color: "#64748b" }}>
                    ₹{Number(l.product.selling_price).toFixed(2)} each · GST {l.product.gst_rate}%
                  </small>
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div className="qty-stepper">
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, l.qty - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) =>
                        updateQty(l.product.id, Number(e.target.value) || 1)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, l.qty + 1)}
                    >
                      +
                    </button>
                  </div>

                  <span
                    style={{
                      fontWeight: 700,
                      width: "65px",
                      textAlign: "right",
                    }}
                  >
                    ₹{(Number(l.product.selling_price) * l.qty).toFixed(2)}
                  </span>

                  <button
                    type="button"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "16px",
                      padding: "2px 6px",
                    }}
                    onClick={() => updateQty(l.product.id, 0)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bill-Related Adjustments & Options */}
          {lines.length > 0 && (
            <div
              style={{
                marginTop: "12px",
                background: "#f8fafc",
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <label style={{ margin: 0 }}>
                  Bill Discount (₹)
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                  />
                </label>

                <label
                  style={{
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    marginTop: "18px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoRoundOff}
                    onChange={(e) => setAutoRoundOff(e.target.checked)}
                  />
                  <span>Auto Round Off</span>
                </label>
              </div>

              {/* Payment Mode Selector */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  marginTop: "8px",
                }}
              >
                <label style={{ margin: 0 }}>
                  Payment Mode
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option>UPI</option>
                    <option>Cash</option>
                    <option>Card</option>
                    <option>Bank transfer</option>
                    <option>Credit / Pay Later</option>
                  </select>
                </label>

                <label style={{ margin: 0 }}>
                  UPI / Card Ref (optional)
                  <input
                    placeholder="Ref # or Txn ID"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </label>
              </div>

              {/* Cash Calculator Box (When Cash Selected) */}
              {method === "Cash" && (
                <div className="cash-calculator">
                  <label style={{ margin: 0 }}>
                    <b>Cash Tendered by Customer (₹)</b>
                    <input
                      type="number"
                      placeholder={`e.g. ${finalTotal}`}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                  </label>
                  {cashNum > 0 && (
                    <div className="change-due">
                      <span>Change to Return:</span>
                      <span>₹{changeDue.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Totals Breakdown */}
          <div className="totals">
            <div>
              Taxable Amount <b>₹{subtotal.toFixed(2)}</b>
            </div>
            {discount > 0 && (
              <div style={{ color: "#b91c1c" }}>
                Discount <b>-₹{discount.toFixed(2)}</b>
              </div>
            )}
            <div>
              GST Total <b>₹{tax.toFixed(2)}</b>
            </div>
            {autoRoundOff && Math.abs(roundOffDelta) > 0.001 && (
              <div>
                Round Off <b>{roundOffDelta > 0 ? "+" : ""}₹{roundOffDelta.toFixed(2)}</b>
              </div>
            )}
            <div className="grand">
              Grand Total <b>₹{finalTotal.toFixed(2)}</b>
            </div>
          </div>

          {/* Action buttons */}
          <button
            className="primary full"
            style={{
              background: "#059669",
              fontSize: "16px",
              marginBottom: "8px",
            }}
            disabled={busy || !lines.length}
            onClick={saveAndPrint}
          >
            {busy ? "Processing…" : "🖨️ Save & Print Bill Receipt"}
          </button>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <button
              className="primary"
              style={{ margin: 0 }}
              disabled={busy || !lines.length}
              onClick={saveAndDownload}
            >
              {busy ? "Saving…" : "📥 Save & PDF"}
            </button>

            <button
              className="secondary"
              style={{ margin: 0, color: "#16a34a", fontWeight: 700 }}
              onClick={() => shareOnWhatsApp()}
            >
              💬 WhatsApp Share
            </button>
          </div>

          {msg && (
            <p className="muted" style={{ marginTop: "8px" }}>
              {msg}
            </p>
          )}
        </section>
      </div>

      {/* Past Invoices & Re-print History */}
      {pastInvoices.length > 0 && (
        <section className="panel no-print" style={{ marginTop: "1.5rem" }}>
          <h2>Recent Invoices & Past Bills</h2>
          <p className="muted">
            Quickly re-print thermal receipts or download invoices for past customer orders.
          </p>
          <div className="tablewrap" style={{ marginTop: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pastInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <b>{inv.invoice_number}</b>
                    </td>
                    <td>{inv.customer_name}</td>
                    <td>
                      <span className="pill">{inv.order_type || "Sale"}</span>
                    </td>
                    <td>{new Date(inv.created_at).toLocaleDateString("en-IN")}</td>
                    <td>{inv.payment_method}</td>
                    <td>
                      <b>₹{Number(inv.total).toFixed(2)}</b>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 8px", fontSize: "12px", margin: 0 }}
                          onClick={() => {
                            setActiveReceipt({
                              invoice_number: inv.invoice_number,
                              date: new Date(inv.created_at).toLocaleString("en-IN"),
                              customer_name: inv.customer_name,
                              customer_phone: "",
                              customer_state: "",
                              payment_method: inv.payment_method,
                              payment_reference: "",
                              order_type: inv.order_type || "Sale",
                              custom_fields: inv.custom_fields || {},
                              items: [
                                {
                                  name: "Recorded Line Items",
                                  hsn: "—",
                                  qty: 1,
                                  price: Number(inv.total),
                                  total: Number(inv.total),
                                  gst_rate: 0,
                                },
                              ],
                              subtotal: Number(inv.total),
                              discount: 0,
                              cgst: 0,
                              sgst: 0,
                              igst: 0,
                              round_off: 0,
                              total: Number(inv.total),
                              cash_tendered: 0,
                              change_due: 0,
                            });
                          }}
                        >
                          🖨️ View / Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
