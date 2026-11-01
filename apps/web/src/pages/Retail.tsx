import { FormEvent, useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { jsPDF } from "jspdf";

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

export function Retail() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [business, setBusiness] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);

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
      const [prods, cats, bizs] = await Promise.all([
        api<Product[]>("/api/tenant/retail/products", {}, bid),
        api<Category[]>("/api/tenant/categories", {}, bid).catch(() => []),
        api<any[]>("/api/businesses").catch(() => []),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      const current = (bizs || []).find((b: any) => b.id === bid);
      if (current) setBusiness(current);
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [bid]);

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
      setMsg(`Product "${created.name}" added to bill.`);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
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

    return {
      invoice_number: inv.invoice_number,
      date: new Date().toLocaleString("en-IN"),
      customer_name: customer || "Walk-in",
      customer_phone: phone,
      customer_state: customerState,
      payment_method: method,
      payment_reference: paymentReference,
      order_type: orderType,
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
    pdf.setFont("helvetica", "bold");
    pdf.text(business?.name || "NEXUS CREATIVE RETAIL", 14, 18);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    if (business?.gstin) pdf.text(`GSTIN: ${business.gstin}`, 14, 24);
    pdf.text(`Invoice: ${receipt.invoice_number}`, 14, 30);
    pdf.text(`Date: ${receipt.date}`, 14, 36);
    pdf.text(`Customer: ${receipt.customer_name} | ${receipt.order_type}`, 14, 42);
    if (receipt.customer_phone) pdf.text(`Phone: ${receipt.customer_phone}`, 14, 48);

    let y = 58;
    pdf.line(14, y - 4, 196, y - 4);
    pdf.setFont("helvetica", "bold");
    pdf.text("Item", 14, y);
    pdf.text("Qty", 110, y);
    pdf.text("Price", 140, y);
    pdf.text("Total", 175, y);
    pdf.line(14, y + 2, 196, y + 2);
    pdf.setFont("helvetica", "normal");

    y += 10;
    receipt.items.forEach((l) => {
      pdf.text(l.name.slice(0, 32), 14, y);
      pdf.text(String(l.qty), 110, y);
      pdf.text(`Rs.${l.price.toFixed(2)}`, 140, y);
      pdf.text(`Rs.${l.total.toFixed(2)}`, 175, y);
      y += 8;
    });

    pdf.line(14, y, 196, y);
    y += 8;
    pdf.text(`Subtotal: Rs.${receipt.subtotal.toFixed(2)}`, 140, y);
    if (receipt.discount > 0) {
      y += 6;
      pdf.text(`Discount: -Rs.${receipt.discount.toFixed(2)}`, 140, y);
    }
    if (receipt.cgst > 0) {
      y += 6;
      pdf.text(`CGST: Rs.${receipt.cgst.toFixed(2)}`, 140, y);
    }
    if (receipt.sgst > 0) {
      y += 6;
      pdf.text(`SGST: Rs.${receipt.sgst.toFixed(2)}`, 140, y);
    }
    if (receipt.igst > 0) {
      y += 6;
      pdf.text(`IGST: Rs.${receipt.igst.toFixed(2)}`, 140, y);
    }
    if (Math.abs(receipt.round_off) > 0.001) {
      y += 6;
      pdf.text(`Round Off: Rs.${receipt.round_off > 0 ? "+" : ""}${receipt.round_off.toFixed(2)}`, 140, y);
    }
    y += 8;
    pdf.setFont("helvetica", "bold");
    pdf.text(`Grand Total: Rs.${receipt.total.toFixed(2)}`, 140, y);
    pdf.save(`${receipt.invoice_number}.pdf`);
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

  function whatsapp() {
    if (!phone) {
      setMsg("Enter customer phone with country code (e.g. 919876543210)");
      return;
    }
    const tot = activeReceipt ? activeReceipt.total : finalTotal;
    const invNo = activeReceipt ? activeReceipt.invoice_number : "Recent";
    const msgText = `Hello ${customer || "Valued Customer"},\nThank you for shopping at ${business?.name || "Nexus Mart"}.\nYour invoice #${invNo} total is Rs.${tot.toFixed(2)}.\nPayment Mode: ${method}.\nHave a wonderful day!`;
    window.open(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msgText)}`,
      "_blank"
    );
  }

  function resetBill() {
    if (lines.length > 0 && !window.confirm("Are you sure you want to clear current items from this bill?")) {
      return;
    }
    setLines([]);
    setDiscountAmount("0");
    setCashTendered("");
    setCustomer("Walk-in");
    setPhone("");
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
          <p className="eyebrow">SMART POS & RETAIL BILLING</p>
          <h1>Retail billing & checkout</h1>
          <p className="muted">
            {business?.name ? `Store: ${business.name}` : `Business ID: ${bid}`} · Cashier Terminal
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                Item Name *
                <input
                  required
                  placeholder="e.g. Cotton Shopping Bag"
                  value={quickForm.name}
                  onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
                />
              </label>
              <label>
                Item Code / SKU (optional)
                <input
                  placeholder="e.g. BAG-01"
                  value={quickForm.sku}
                  onChange={(e) => setQuickForm({ ...quickForm, sku: e.target.value })}
                />
              </label>
              <label>
                Barcode (optional)
                <input
                  placeholder="e.g. 890123000001"
                  value={quickForm.barcode}
                  onChange={(e) => setQuickForm({ ...quickForm, barcode: e.target.value })}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <label>
                  Selling Price ₹ *
                  <input
                    required
                    type="number"
                    step="any"
                    placeholder="20"
                    value={quickForm.selling_price}
                    onChange={(e) => setQuickForm({ ...quickForm, selling_price: e.target.value })}
                  />
                </label>
                <label>
                  GST Rate %
                  <select
                    value={quickForm.gst_rate}
                    onChange={(e) => setQuickForm({ ...quickForm, gst_rate: e.target.value })}
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </label>
              </div>
              <button className="primary full" disabled={busy} style={{ marginTop: "1rem" }}>
                {busy ? "Saving…" : "Save & Add to Bill"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bill Receipt Preview Modal */}
      {activeReceipt && (
        <div className="modal-overlay no-print">
          <div className="modal-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              <div className="center biz-title">{business?.name || "NEXUS STORE"}</div>
              {business?.address && <div className="center">{business.address}</div>}
              {business?.gstin && <div className="center">GSTIN: {business.gstin}</div>}
              <div className="divider" />
              <div><b>Invoice:</b> {activeReceipt.invoice_number}</div>
              <div><b>Date:</b> {activeReceipt.date}</div>
              <div><b>Type:</b> {activeReceipt.order_type}</div>
              <div><b>Customer:</b> {activeReceipt.customer_name}</div>
              {activeReceipt.customer_phone && (
                <div><b>Phone:</b> {activeReceipt.customer_phone}</div>
              )}
              <div><b>Payment:</b> {activeReceipt.payment_method}</div>
              <div className="divider" />

              <table>
                <thead>
                  <tr>
                    <th>Item</th>
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
                  <span>{activeReceipt.round_off > 0 ? "+" : ""}₹{activeReceipt.round_off.toFixed(2)}</span>
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
              <div className="center">*** THANK YOU FOR VISITING ***</div>
            </div>

            {/* Modal action buttons */}
            <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
              <button
                className="primary full"
                style={{ background: "#059669", fontSize: "16px" }}
                onClick={() => window.print()}
              >
                🖨️ Print Bill Now
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
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
                  onClick={whatsapp}
                >
                  💬 WhatsApp
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
          <div className="center biz-title">{business?.name || "NEXUS STORE"}</div>
          {business?.address && <div className="center">{business.address}</div>}
          {business?.gstin && <div className="center">GSTIN: {business.gstin}</div>}
          <div className="divider" />
          <div><b>Invoice:</b> {activeReceipt.invoice_number}</div>
          <div><b>Date:</b> {activeReceipt.date}</div>
          <div><b>Type:</b> {activeReceipt.order_type}</div>
          <div><b>Customer:</b> {activeReceipt.customer_name}</div>
          {activeReceipt.customer_phone && (
            <div><b>Phone:</b> {activeReceipt.customer_phone}</div>
          )}
          <div><b>Payment:</b> {activeReceipt.payment_method}</div>
          <div className="divider" />

          <table>
            <thead>
              <tr>
                <th>Item</th>
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
              <span>{activeReceipt.round_off > 0 ? "+" : ""}₹{activeReceipt.round_off.toFixed(2)}</span>
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
          <div className="center">*** THANK YOU FOR VISITING ***</div>
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
                placeholder="🔍 Search Product Name, SKU / Item Code, or Scan Barcode..."
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
                      <span className="item-price">₹{Number(p.selling_price).toFixed(2)}</span>
                      <small style={{ color: p.stock_qty < 5 ? "#ef4444" : "#10b981" }}>
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
              <option value="">-- Or Pick Product from List --</option>
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
                {p.sku && <small style={{ color: "#64748b" }}>Code: {p.sku}</small>}
                <span>₹{Number(p.selling_price).toFixed(2)}</span>
                <small>Stock {p.stock_qty}</small>
              </button>
            ))}
            {!displayedProducts.length && (
              <p className="muted" style={{ padding: "1rem" }}>
                No products found in this category.
              </p>
            )}
          </div>
        </section>

        {/* Right Column: Bill Details, Cart Controls & Payment */}
        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Current bill ({lines.length} items)</h2>
            <span className="pill" style={{ background: "#e0f2fe", color: "#0369a1" }}>
              {orderType}
            </span>
          </div>

          {/* Customer & Order Settings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <label>
              Customer Name
              <input
                value={customer}
                placeholder="Walk-in"
                onChange={(e) => setCustomer(e.target.value)}
              />
            </label>
            <label>
              Order Type
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option>Counter Sale</option>
                <option>Takeaway</option>
                <option>Home Delivery</option>
                <option>Wholesale</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "8px" }}>
            <label>
              WhatsApp Number
              <input
                placeholder="e.g. 919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label>
              Customer State Code
              <input
                placeholder="e.g. 33"
                maxLength={2}
                value={customerState}
                onChange={(e) => setCustomerState(e.target.value)}
              />
            </label>
          </div>

          {/* Cart Table with Editable Quantity Stepper */}
          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "10px", paddingTop: "8px" }}>
            {lines.length === 0 && (
              <p className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                Cart is empty. Scan barcode or type product name/item code above.
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
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{l.product.name}</div>
                  <small style={{ color: "#64748b" }}>
                    ₹{Number(l.product.selling_price).toFixed(2)} each · GST {l.product.gst_rate}%
                  </small>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="qty-stepper">
                    <button type="button" onClick={() => updateQty(l.product.id, l.qty - 1)}>
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => updateQty(l.product.id, Number(e.target.value) || 1)}
                    />
                    <button type="button" onClick={() => updateQty(l.product.id, l.qty + 1)}>
                      +
                    </button>
                  </div>

                  <span style={{ fontWeight: 700, width: "65px", textAlign: "right" }}>
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
            <div style={{ marginTop: "12px", background: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", alignItems: "center" }}>
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

                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", marginTop: "18px" }}>
                  <input
                    type="checkbox"
                    checked={autoRoundOff}
                    onChange={(e) => setAutoRoundOff(e.target.checked)}
                  />
                  <span>Auto Round Off</span>
                </label>
              </div>

              {/* Payment Mode Selector */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
                <label style={{ margin: 0 }}>
                  Payment Mode
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option>UPI</option>
                    <option>Cash</option>
                    <option>Card</option>
                    <option>Bank transfer</option>
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
            style={{ background: "#059669", fontSize: "16px", marginBottom: "8px" }}
            disabled={busy || !lines.length}
            onClick={saveAndPrint}
          >
            {busy ? "Processing…" : "🖨️ Save & Print Bill"}
          </button>

          <button
            className="primary full"
            disabled={busy || !lines.length}
            onClick={saveAndDownload}
          >
            {busy ? "Saving…" : "📥 Save & Download PDF"}
          </button>

          <button className="secondary full" onClick={whatsapp}>
            💬 WhatsApp invoice message
          </button>

          {msg && <p className="muted" style={{ marginTop: "8px" }}>{msg}</p>}
        </section>
      </div>
    </>
  );
}
