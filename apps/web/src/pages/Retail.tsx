import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { jsPDF } from "jspdf";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  hsn_code?: string | null;
  selling_price: number;
  gst_rate: number;
  stock_qty: number;
  category_id?: string | null;
  category_name?: string | null;
};

type Line = { product: Product; qty: number };

type Receipt = {
  invoice_number: string;
  date: string;
  customer_name: string;
  customer_phone: string;
  customer_state: string;
  payment_method: string;
  payment_reference: string;
  items: Array<{
    name: string;
    hsn: string;
    qty: number;
    price: number;
    total: number;
    gst_rate: number;
  }>;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export function Retail() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [business, setBusiness] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [barcode, setBarcode] = useState("");
  const [customer, setCustomer] = useState("Walk-in");
  const [phone, setPhone] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [method, setMethod] = useState("UPI");
  const [paymentReference, setPaymentReference] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

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

  function add(p: Product) {
    setLines((old) => {
      const f = old.find((x) => x.product.id === p.id);
      return f
        ? old.map((x) =>
            x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x
          )
        : [...old, { product: p, qty: 1 }];
    });
  }

  function scan(e: FormEvent) {
    e.preventDefault();
    const p = products.find((x) => x.barcode === barcode);
    if (p) add(p);
    else setMsg("Barcode not found");
    setBarcode("");
  }

  const taxable = lines.reduce(
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
    return {
      invoice_number: inv.invoice_number,
      date: new Date().toLocaleString("en-IN"),
      customer_name: customer || "Walk-in",
      customer_phone: phone,
      customer_state: customerState,
      payment_method: method,
      payment_reference: paymentReference,
      items: lines.map((l) => ({
        name: l.product.name,
        hsn: l.product.hsn_code || "—",
        qty: l.qty,
        price: Number(l.product.selling_price),
        total: Number(l.product.selling_price) * l.qty,
        gst_rate: Number(l.product.gst_rate),
      })),
      subtotal: Number(inv.subtotal || taxable),
      cgst: Number(inv.cgst_total || 0),
      sgst: Number(inv.sgst_total || 0),
      igst: Number(inv.igst_total || 0),
      total: Number(inv.total || taxable + tax),
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
    pdf.text(`Customer: ${receipt.customer_name}`, 14, 42);
    if (receipt.customer_phone) pdf.text(`Phone: ${receipt.customer_phone}`, 14, 48);

    let y = 60;
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
    pdf.text(`Taxable: Rs.${receipt.subtotal.toFixed(2)}`, 140, y);
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
      await load();

      // Trigger print automatically
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
    const tot = activeReceipt ? activeReceipt.total : taxable + tax;
    const invNo = activeReceipt ? activeReceipt.invoice_number : "Recent";
    const msgText = `Hello ${customer || "Valued Customer"},\nThank you for shopping at ${business?.name || "Nexus Mart"}.\nYour invoice #${invNo} total is Rs.${tot.toFixed(2)}.\nHave a great day!`;
    window.open(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msgText)}`,
      "_blank"
    );
  }

  const displayedProducts =
    selectedCat === "all"
      ? products
      : products.filter((p) => p.category_id === selectedCat);

  return (
    <>
      <header className="page-head no-print">
        <div>
          <p className="eyebrow">BUSINESS MODULE · RETAIL & SUPERMARKET</p>
          <h1>Retail billing</h1>
          <p className="muted">
            {business?.name ? `Store: ${business.name}` : `Business ID: ${bid}`}
          </p>
        </div>
      </header>

      {/* Bill Receipt Modal */}
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
                <span>Taxable Amount</span>
                <span>₹{activeReceipt.subtotal.toFixed(2)}</span>
              </div>
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
              <div className="divider" />
              <div className="grand-total">
                <span>GRAND TOTAL</span>
                <span>₹{activeReceipt.total.toFixed(2)}</span>
              </div>
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
            <span>Taxable Amount</span>
            <span>₹{activeReceipt.subtotal.toFixed(2)}</span>
          </div>
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
          <div className="divider" />
          <div className="grand-total">
            <span>GRAND TOTAL</span>
            <span>₹{activeReceipt.total.toFixed(2)}</span>
          </div>
          <div className="double-divider" />
          <div className="center">*** THANK YOU FOR VISITING ***</div>
        </div>
      )}

      {/* POS Billing Screen */}
      <div className="billing-layout no-print">
        <section className="panel">
          <form className="scan-row" onSubmit={scan}>
            <input
              autoFocus
              placeholder="Scan barcode and press Enter"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <button className="primary">Scan</button>
          </form>

          {/* Category quick filters */}
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

          <div className="product-grid">
            {displayedProducts.map((p) => (
              <button
                className="product-tile"
                key={p.id}
                onClick={() => add(p)}
              >
                <b>{p.name}</b>
                {p.category_name && (
                  <small style={{ color: "#2563eb" }}>{p.category_name}</small>
                )}
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

        <section className="panel">
          <h2>Current bill</h2>
          <label>
            Customer
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </label>
          <label>
            WhatsApp number
            <input
              placeholder="e.g. 919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Customer state code (GST)
            <input
              placeholder="e.g. 33 for Tamil Nadu"
              value={customerState}
              onChange={(e) => setCustomerState(e.target.value)}
            />
          </label>
          <label>
            Payment
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option>UPI</option>
              <option>Cash</option>
              <option>Card</option>
              <option>Bank transfer</option>
            </select>
          </label>
          <label>
            UPI / transaction reference
            <input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Optional UPI reference"
            />
          </label>

          {lines.map((l) => (
            <div className="cart-line" key={l.product.id}>
              <span>
                {l.product.name} × {l.qty}
              </span>
              <button
                onClick={() =>
                  setLines((old) =>
                    old.filter((x) => x.product.id !== l.product.id)
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}

          <div className="totals">
            <div>
              Taxable <b>₹{taxable.toFixed(2)}</b>
            </div>
            <div>
              GST <b>₹{tax.toFixed(2)}</b>
            </div>
            <div className="grand">
              Total <b>₹{(taxable + tax).toFixed(2)}</b>
            </div>
          </div>

          {/* Action buttons */}
          <button
            className="primary full"
            style={{ background: "#059669", fontSize: "15px", marginBottom: "8px" }}
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

          {msg && <p className="muted">{msg}</p>}
        </section>
      </div>
    </>
  );
}
