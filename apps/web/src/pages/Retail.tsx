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
  selling_price: number;
  gst_rate: number;
  stock_qty: number;
  category_id?: string | null;
  category_name?: string | null;
};

type Line = { product: Product; qty: number };

export function Retail() {
  const bid = localStorage.getItem("nexus_business_id") || "";
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

  async function load() {
    if (!bid) return;
    try {
      const [prods, cats] = await Promise.all([
        api<Product[]>("/api/tenant/retail/products", {}, bid),
        api<Category[]>("/api/tenant/categories", {}, bid).catch(() => []),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
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

  async function save() {
    setBusy(true);
    try {
      const inv: any = await api(
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

      const pdf = new jsPDF();
      pdf.text("NEXUS CREATIVE - RETAIL INVOICE", 14, 18);
      pdf.text(`Invoice: ${inv.invoice_number}`, 14, 30);
      pdf.text(`Customer: ${customer}`, 14, 38);
      let y = 52;
      lines.forEach((l) => {
        pdf.text(
          `${l.product.name} x ${l.qty}  Rs.${(
            Number(l.product.selling_price) * l.qty
          ).toFixed(2)}`,
          14,
          y
        );
        y += 8;
      });
      pdf.text(`Taxable: Rs.${Number(inv.subtotal).toFixed(2)}`, 14, y + 8);
      pdf.text(`CGST: Rs.${Number(inv.cgst_total || 0).toFixed(2)}`, 14, y + 16);
      pdf.text(`SGST: Rs.${Number(inv.sgst_total || 0).toFixed(2)}`, 14, y + 24);
      pdf.text(`IGST: Rs.${Number(inv.igst_total || 0).toFixed(2)}`, 14, y + 32);
      pdf.text(`Total: Rs.${Number(inv.total).toFixed(2)}`, 14, y + 42);
      pdf.save(`${inv.invoice_number}.pdf`);
      setMsg(`Invoice ${inv.invoice_number} created`);
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
      setMsg("Enter phone with country code");
      return;
    }
    window.open(
      `https://wa.me/${phone.replace(
        /\D/g,
        ""
      )}?text=${encodeURIComponent(
        "Your Nexus invoice total is Rs." + (taxable + tax).toFixed(2)
      )}`,
      "_blank"
    );
  }

  const displayedProducts =
    selectedCat === "all"
      ? products
      : products.filter((p) => p.category_id === selectedCat);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">BUSINESS MODULE · RETAIL & SUPERMARKET</p>
          <h1>Retail billing</h1>
          <p className="muted">
            Business ID: {bid || "Select a business from Workspace"}
          </p>
        </div>
      </header>
      <div className="billing-layout">
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
          <button
            className="primary full"
            disabled={busy || !lines.length}
            onClick={save}
          >
            {busy ? "Saving…" : "Save invoice & PDF"}
          </button>
          <button className="secondary full" onClick={whatsapp}>
            WhatsApp invoice message
          </button>
          {msg && <p className="muted">{msg}</p>}
        </section>
      </div>
    </>
  );
}
