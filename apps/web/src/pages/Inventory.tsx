import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Category = {
  id: string;
  name: string;
  description: string | null;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  hsn_code: string | null;
  selling_price: number;
  purchase_price?: number;
  gst_rate: number;
  stock_qty: number;
  low_stock_threshold: number;
  category_id: string | null;
  category_name?: string | null;
};

export function Inventory() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [newCatName, setNewCatName] = useState("");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkParsed, setBulkParsed] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    hsn_code: "",
    category_id: "",
    selling_price: "",
    purchase_price: "",
    gst_rate: "18",
    stock_qty: "0",
    low_stock_threshold: "5",
  });

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadCategories() {
    if (!bid) return;
    try {
      const cats = await api<Category[]>("/api/tenant/categories", {}, bid);
      setCategories(cats || []);
    } catch (e: any) {
      console.warn("Categories load:", e.message);
    }
  }

  async function loadProducts() {
    if (!bid) return;
    try {
      const prods = await api<Product[]>("/api/tenant/retail/products", {}, bid);
      setItems(prods || []);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [bid]);

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api(
        "/api/tenant/retail/products",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            category_id: form.category_id || null,
            selling_price: Number(form.selling_price),
            purchase_price: Number(form.purchase_price || 0),
            gst_rate: Number(form.gst_rate),
            stock_qty: Number(form.stock_qty),
            low_stock_threshold: Number(form.low_stock_threshold),
          }),
        },
        bid
      );
      setMessage("Product saved successfully");
      setForm({
        name: "",
        sku: "",
        barcode: "",
        hsn_code: "",
        category_id: "",
        selling_price: "",
        purchase_price: "",
        gst_rate: "18",
        stock_qty: "0",
        low_stock_threshold: "5",
      });
      await loadProducts();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setBusy(true);
    try {
      await api(
        "/api/tenant/categories",
        {
          method: "POST",
          body: JSON.stringify({ name: newCatName.trim() }),
        },
        bid
      );
      setNewCatName("");
      setMessage(`Category "${newCatName.trim()}" created`);
      await loadCategories();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function adjust(p: Product, delta: number) {
    try {
      await api(
        "/api/tenant/inventory/adjust",
        {
          method: "POST",
          body: JSON.stringify({
            product_id: p.id,
            quantity_change: delta,
            note: "Inventory screen adjustment",
          }),
        },
        bid
      );
      await loadProducts();
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  // Parse CSV text
  function parseCsv(text: string) {
    setBulkCsvText(text);
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setBulkParsed([]);
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });

      // Match category name to category_id
      const catName = row.category || row.category_name || "";
      const matchedCat = categories.find(
        (c) => c.name.toLowerCase() === catName.toLowerCase()
      );

      return {
        name: row.name || row.product_name || "Untitled Item",
        sku: row.sku || null,
        barcode: row.barcode || null,
        hsn_code: row.hsn_code || row.hsn || null,
        category_id: matchedCat?.id || null,
        category_name: matchedCat?.name || catName || "None",
        selling_price: Number(row.selling_price || row.price || 0),
        purchase_price: Number(row.purchase_price || 0),
        gst_rate: Number(row.gst_rate || row.gst || 0),
        stock_qty: Number(row.stock_qty || row.stock || 0),
        low_stock_threshold: Number(row.low_stock_threshold || 5),
      };
    });

    setBulkParsed(rows);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      parseCsv(evt.target?.result as string);
    };
    reader.readAsText(file);
  }

  async function executeBulkImport() {
    if (!bulkParsed.length) return;
    setBusy(true);
    setMessage("");
    try {
      const res: any = await api(
        "/api/tenant/retail/products/bulk",
        {
          method: "POST",
          body: JSON.stringify(bulkParsed),
        },
        bid
      );
      setMessage(`Successfully imported ${res.count || bulkParsed.length} products!`);
      setShowBulkModal(false);
      setBulkCsvText("");
      setBulkParsed([]);
      await loadProducts();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  function sampleCsv() {
    const sample = `name,sku,barcode,hsn_code,category,selling_price,purchase_price,gst_rate,stock_qty,low_stock_threshold
Basmati Rice 1kg,RICE-01,890123456010,1006,Rice & Grains,120,95,5,100,20
Toor Dal 1kg,DAL-01,890123456011,0713,Pulses & Dals,140,115,0,80,15
Sunflower Oil 1L,OIL-01,890123456012,1512,Oils & Ghee,150,130,5,50,10
Full Cream Milk 500ml,MILK-01,890123456013,0401,Dairy Products,32,27,0,40,10
Marie Biscuits 200g,BIS-01,890123456014,1905,Snacks & Biscuits,25,18,18,120,25`;
    parseCsv(sample);
  }

  // Filter products by selected category
  const filteredItems =
    selectedCategoryFilter === "all"
      ? items
      : selectedCategoryFilter === "uncategorized"
      ? items.filter((i) => !i.category_id)
      : items.filter((i) => i.category_id === selectedCategoryFilter);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">INVENTORY MANAGEMENT</p>
          <h1>Products & stock</h1>
          <p className="muted">
            Manage your categories, product catalogue, and stock levels.
          </p>
        </div>
        <button
          className="primary link-btn"
          onClick={() => setShowBulkModal(!showBulkModal)}
        >
          {showBulkModal ? "Close CSV Import" : "⚡ Bulk CSV Import"}
        </button>
      </header>

      {message && (
        <div className="panel" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
          <b>{message}</b>
        </div>
      )}

      {/* 1. Bulk Import Panel */}
      {showBulkModal && (
        <div className="panel" style={{ border: "2px dashed #3b82f6" }}>
          <h2>⚡ Bulk Product Import (Excel / CSV)</h2>
          <p className="muted">
            Upload or paste CSV rows with:{" "}
            <code>name, sku, barcode, hsn_code, category, selling_price, purchase_price, gst_rate, stock_qty</code>
          </p>
          <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
            <label className="primary link-btn" style={{ cursor: "pointer" }}>
              📁 Choose CSV file
              <input
                type="file"
                accept=".csv,.txt"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
            </label>
            <button className="secondary" type="button" onClick={sampleCsv}>
              📋 Load Sample Supermarket CSV
            </button>
          </div>
          <textarea
            rows={6}
            style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem", padding: "0.5rem" }}
            placeholder="Paste CSV data here..."
            value={bulkCsvText}
            onChange={(e) => parseCsv(e.target.value)}
          />

          {bulkParsed.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3>Preview ({bulkParsed.length} items ready to import)</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Barcode</th>
                      <th>Price</th>
                      <th>GST</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsed.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.category_name}</td>
                        <td>{r.barcode || "—"}</td>
                        <td>₹{r.selling_price}</td>
                        <td>{r.gst_rate}%</td>
                        <td>{r.stock_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bulkParsed.length > 8 && (
                  <p className="muted" style={{ padding: "0.5rem" }}>
                    ... and {bulkParsed.length - 8} more items
                  </p>
                )}
              </div>
              <button
                className="primary full"
                style={{ marginTop: "1rem" }}
                disabled={busy}
                onClick={executeBulkImport}
              >
                {busy ? "Importing…" : `Import All ${bulkParsed.length} Products`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Business Categories Section */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2>Business Categories ({categories.length})</h2>
            <p className="muted">
              Pre-seeded templates and custom categories for your business.
            </p>
          </div>
          <form onSubmit={addCategory} style={{ display: "flex", gap: "0.5rem" }}>
            <input
              required
              placeholder="New category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              + Add Category
            </button>
          </form>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
          {categories.map((c) => (
            <span
              key={c.id}
              className="pill"
              style={{
                cursor: "pointer",
                background: selectedCategoryFilter === c.id ? "#2563eb" : "#f1f5f9",
                color: selectedCategoryFilter === c.id ? "#ffffff" : "#334155",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
              }}
              onClick={() =>
                setSelectedCategoryFilter(
                  selectedCategoryFilter === c.id ? "all" : c.id
                )
              }
            >
              {c.name}
            </span>
          ))}
          {!categories.length && (
            <p className="muted">No categories configured yet.</p>
          )}
        </div>
      </div>

      {/* 3. Add Individual Product */}
      <div className="panel">
        <h2>Add individual product</h2>
        <form className="form-grid" onSubmit={addProduct}>
          <label>
            Product name *
            <input
              required
              placeholder="e.g. Basmati Rice 1kg"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            Category
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">-- Select Category --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            SKU
            <input
              placeholder="e.g. RICE-01"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </label>

          <label>
            Barcode
            <input
              placeholder="e.g. 890123456010"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </label>

          <label>
            HSN code
            <input
              placeholder="e.g. 1006"
              value={form.hsn_code}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
            />
          </label>

          <label>
            Selling price ₹ *
            <input
              required
              type="number"
              step="any"
              value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
            />
          </label>

          <label>
            Purchase price ₹
            <input
              type="number"
              step="any"
              value={form.purchase_price}
              onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
            />
          </label>

          <label>
            GST rate %
            <input
              type="number"
              step="any"
              value={form.gst_rate}
              onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
            />
          </label>

          <label>
            Opening stock
            <input
              type="number"
              value={form.stock_qty}
              onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
            />
          </label>

          <label>
            Low stock alert
            <input
              type="number"
              value={form.low_stock_threshold}
              onChange={(e) =>
                setForm({ ...form, low_stock_threshold: e.target.value })
              }
            />
          </label>

          <button className="primary" disabled={busy} style={{ alignSelf: "end" }}>
            {busy ? "Saving…" : "Save Product"}
          </button>
        </form>
      </div>

      {/* 4. Product List with Category Filter */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <h2>Stock list ({filteredItems.length} of {items.length} items)</h2>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <span>Filter by Category:</span>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories ({items.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({items.filter((i) => i.category_id === c.id).length})
                </option>
              ))}
              <option value="uncategorized">
                Uncategorized ({items.filter((i) => !i.category_id).length})
              </option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Barcode</th>
                <th>GST</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Adjust</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <small>{p.hsn_code ? `HSN: ${p.hsn_code}` : "No HSN"}</small>
                  </td>
                  <td>
                    <span className="pill" style={{ fontSize: "0.75rem" }}>
                      {p.category_name || "General"}
                    </span>
                  </td>
                  <td>{p.barcode || "—"}</td>
                  <td>{p.gst_rate}%</td>
                  <td>₹{Number(p.selling_price).toFixed(2)}</td>
                  <td>
                    {p.stock_qty}
                    {p.stock_qty <= p.low_stock_threshold && (
                      <small className="warning">Low stock</small>
                    )}
                  </td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => adjust(p, -1)}
                      disabled={p.stock_qty < 1}
                    >
                      −
                    </button>{" "}
                    <button className="secondary" onClick={() => adjust(p, 1)}>
                      +
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredItems.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2rem" }}>
                    No products found in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
