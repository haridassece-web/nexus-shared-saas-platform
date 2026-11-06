import { FormEvent, useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import {
  BUSINESS_SECTOR_PRESETS,
  ALL_BUSINESS_CATEGORIES,
  getCategoriesForTemplate,
} from "../lib/businessCategories";
import { BUSINESS_TEMPLATES } from "../lib/businessTemplates";

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
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [showSectorPresets, setShowSectorPresets] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("supermarket");
  const [includeStarterItems, setIncludeStarterItems] = useState(true);
  const [starterStockQty, setStarterStockQty] = useState(50);

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

  // Product Counts per Category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      if (item.category_id) {
        counts[item.category_id] = (counts[item.category_id] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  const uncategorizedCount = useMemo(() => {
    return items.filter((i) => !i.category_id).length;
  }, [items]);

  // Filtered Categories based on search
  const displayedCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return categories;
    const q = categorySearchQuery.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearchQuery]);

  // Add a single category
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
      setMessage(`Category "${newCatName.trim()}" created successfully`);
      await loadCategories();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // 1-Click Add All Categories Across All Sectors
  async function addAllBusinessCategories() {
    if (
      !window.confirm(
        `Add all ${ALL_BUSINESS_CATEGORIES.length} standard business categories across all 18 sectors (Supermarket, Fruits & Veg, Garments, Healthcare, Salon, Restaurant, Auto, Hardware, Electronics, etc.)?`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res: any = await api(
        "/api/tenant/categories/bulk",
        {
          method: "POST",
          body: JSON.stringify({ names: ALL_BUSINESS_CATEGORIES }),
        },
        bid
      );
      setMessage(
        `⚡ Successfully added & synchronized ${res.count || ALL_BUSINESS_CATEGORIES.length} business categories across all sectors!`
      );
      await loadCategories();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Add Categories for a Specific Business Sector
  async function addSectorCategories(sectorId: string) {
    const sector = BUSINESS_SECTOR_PRESETS.find((s) => s.id === sectorId);
    if (!sector) return;
    setBusy(true);
    setMessage("");
    try {
      const res: any = await api(
        "/api/tenant/categories/bulk",
        {
          method: "POST",
          body: JSON.stringify({ names: sector.categories }),
        },
        bid
      );
      setMessage(
        `Added ${res.count || sector.categories.length} categories for ${sector.name} (${sector.icon})!`
      );
      await loadCategories();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Delete Category
  async function deleteCategory(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete category "${name}"? Any products assigned to this category will become Uncategorized.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(
        `/api/tenant/categories/${id}`,
        {
          method: "DELETE",
        },
        bid
      );
      if (selectedCategoryFilter === id) {
        setSelectedCategoryFilter("all");
      }
      setMessage(`Category "${name}" removed`);
      await loadCategories();
      await loadProducts();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Seed Business Template & Starter Items
  async function executeSeedTemplate() {
    const t = BUSINESS_TEMPLATES[selectedTemplateKey];
    if (!t) return;
    setBusy(true);
    setMessage("");
    try {
      const templateCats = Array.from(
        new Set([t.name, ...getCategoriesForTemplate(selectedTemplateKey)])
      );

      // 1. Bulk insert categories
      await api(
        "/api/tenant/categories/bulk",
        {
          method: "POST",
          body: JSON.stringify({ names: templateCats }),
        },
        bid
      );

      // Reload categories to get the newly created IDs
      const updatedCats = await api<Category[]>("/api/tenant/categories", {}, bid);
      setCategories(updatedCats || []);

      // 2. If starter items selected, seed products
      if (includeStarterItems && t.starter_items?.length) {
        // Find matching category ID
        const primaryCat =
          updatedCats.find((c) => c.name.toLowerCase() === t.name.toLowerCase()) ||
          updatedCats.find((c) =>
            templateCats.some((tc) => tc.toLowerCase() === c.name.toLowerCase())
          );

        const itemsToInsert = t.starter_items.map((item, idx) => ({
          name: item.name,
          sku: `${t.prefix || "ITEM"}-${String(idx + 1).padStart(3, "0")}`,
          barcode: null,
          hsn_code: null,
          category_id: primaryCat?.id || null,
          unit: item.unit || "pcs",
          selling_price: item.selling_price || 0,
          purchase_price: Math.round((item.selling_price || 0) * 0.75),
          gst_rate: item.gst_rate ?? 18,
          stock_qty: starterStockQty || item.stock_qty || 50,
          low_stock_threshold: 5,
        }));

        await api(
          "/api/tenant/retail/products/bulk",
          {
            method: "POST",
            body: JSON.stringify(itemsToInsert),
          },
          bid
        );
      }

      setMessage(
        `⚡ Successfully seeded template "${t.name}" with ${templateCats.length} categories${
          includeStarterItems ? ` and ${t.starter_items.length} starter products` : ""
        }!`
      );
      setShowTemplateModal(false);
      await loadProducts();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Add Individual Product
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

  // Stock Adjustment
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
Basmati Rice 1kg,RICE-01,890123456010,1006,Rice, Atta & Grains,120,95,5,100,20
Toor Dal 1kg,DAL-01,890123456011,0713,Pulses & Dals,140,115,0,80,15
Sunflower Oil 1L,OIL-01,890123456012,1512,Cooking Oils & Ghee,150,130,5,50,10
Full Cream Milk 500ml,MILK-01,890123456013,0401,Dairy, Milk & Eggs,32,27,0,40,10
Marie Biscuits 200g,BIS-01,890123456014,1905,Snacks, Biscuits & Namkeen,25,18,18,120,25`;
    parseCsv(sample);
  }

  // Filter products by selected category
  const filteredItems = useMemo(() => {
    if (selectedCategoryFilter === "all") return items;
    if (selectedCategoryFilter === "uncategorized") {
      return items.filter((i) => !i.category_id);
    }
    return items.filter((i) => i.category_id === selectedCategoryFilter);
  }, [items, selectedCategoryFilter]);

  const activeTemplate = BUSINESS_TEMPLATES[selectedTemplateKey];

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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="primary link-btn"
            style={{ background: "#2563eb", fontWeight: 700 }}
            onClick={addAllBusinessCategories}
            disabled={busy}
          >
            ⚡ Add All Business Categories
          </button>
          <button
            className="secondary link-btn"
            style={{ fontWeight: 600, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
            onClick={() => setShowTemplateModal(true)}
          >
            🏢 Business Templates & Starter Items
          </button>
          <button
            className="secondary link-btn"
            onClick={() => setShowBulkModal(!showBulkModal)}
          >
            {showBulkModal ? "Close CSV Import" : "📁 Bulk CSV Import"}
          </button>
        </div>
      </header>

      {message && (
        <div className="panel" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
          <b>{message}</b>
        </div>
      )}

      {/* Template Seeder Modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: "600px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>🏢 Seed Business Template & Starter Items</h2>
              <button
                type="button"
                className="secondary"
                style={{ margin: 0, padding: "4px 8px" }}
                onClick={() => setShowTemplateModal(false)}
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: "8px 0 16px 0" }}>
              Select your business type from 60+ pre-configured industries to auto-load standard categories and starter catalogue products.
            </p>

            <label style={{ display: "grid", gap: "6px", fontWeight: 650, fontSize: "13px" }}>
              Select Business Template
              <select
                value={selectedTemplateKey}
                onChange={(e) => setSelectedTemplateKey(e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                {Object.values(BUSINESS_TEMPLATES).map((tmpl) => (
                  <option key={tmpl.code} value={tmpl.code}>
                    {tmpl.name} ({tmpl.sector})
                  </option>
                ))}
              </select>
            </label>

            {activeTemplate && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "14px",
                  margin: "14px 0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div>
                    <b>{activeTemplate.name}</b>
                    <span className="pill" style={{ marginLeft: "8px" }}>
                      {activeTemplate.sector}
                    </span>
                  </div>
                  <small className="muted">Prefix: {activeTemplate.prefix}</small>
                </div>

                <p style={{ margin: "4px 0 10px 0", fontSize: "12px", color: "#64748b" }}>
                  Item Label: <b>{activeTemplate.item_label}</b> | Customer Label: <b>{activeTemplate.customer_label}</b>
                </p>

                <div style={{ marginTop: "10px" }}>
                  <small style={{ fontWeight: 700, color: "#334155" }}>
                    Starter Products ({activeTemplate.starter_items.length} items):
                  </small>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: "13px", color: "#475569" }}>
                    {activeTemplate.starter_items.map((it, idx) => (
                      <li key={idx} style={{ marginBottom: "3px" }}>
                        <b>{it.name}</b> — ₹{it.selling_price} (GST {it.gst_rate}%) [{it.unit}]
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: "14px", display: "flex", gap: "12px", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={includeStarterItems}
                      onChange={(e) => setIncludeStarterItems(e.target.checked)}
                    />
                    <span>Also add starter items to catalogue</span>
                  </label>
                  {includeStarterItems && (
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0, fontSize: "12px" }}>
                      <span>Initial Stock:</span>
                      <input
                        type="number"
                        value={starterStockQty}
                        onChange={(e) => setStarterStockQty(Number(e.target.value))}
                        style={{ width: "65px", padding: "4px 6px" }}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                className="secondary"
                style={{ margin: 0 }}
                onClick={() => setShowTemplateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={executeSeedTemplate}
              >
                {busy ? "Seeding…" : "⚡ Seed Categories & Starter Items"}
              </button>
            </div>
          </div>
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
        <div className="category-manager-header">
          <div>
            <h2 style={{ margin: "0 0 4px 0" }}>
              Business Categories ({categories.length})
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Pre-seeded templates and custom categories for all business types.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary"
              style={{
                background: "#2563eb",
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: 700,
              }}
              onClick={addAllBusinessCategories}
              disabled={busy}
            >
              ⚡ 1-Click Add All Categories ({ALL_BUSINESS_CATEGORIES.length})
            </button>

            <button
              type="button"
              className="secondary"
              style={{
                margin: 0,
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 600,
              }}
              onClick={() => setShowSectorPresets(!showSectorPresets)}
            >
              {showSectorPresets ? "▲ Hide Sector Presets" : "▼ 18 Sector Presets"}
            </button>

            <form onSubmit={addCategory} style={{ display: "flex", gap: "0.5rem", margin: 0 }}>
              <input
                required
                placeholder="New category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                style={{ padding: "8px 10px", fontSize: "13px" }}
              />
              <button
                className="primary"
                disabled={busy}
                style={{ padding: "8px 12px", fontSize: "12px" }}
              >
                + Add
              </button>
            </form>
          </div>
        </div>

        {/* 18 Sector Presets Bar */}
        {showSectorPresets && (
          <div className="sector-preset-bar">
            <div style={{ width: "100%", marginBottom: "4px" }}>
              <small style={{ fontWeight: 700, color: "#475569" }}>
                Click any sector below to instantly load its standardized categories:
              </small>
            </div>
            {BUSINESS_SECTOR_PRESETS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                className="sector-preset-btn"
                onClick={() => addSectorCategories(sec.id)}
                disabled={busy}
                title={sec.description}
              >
                <span>{sec.icon}</span>
                <span>{sec.name}</span>
                <span style={{ opacity: 0.7, fontSize: "10px" }}>({sec.categories.length})</span>
              </button>
            ))}
          </div>
        )}

        {/* Search & Active Category Pills */}
        <div style={{ margin: "14px 0 10px 0", display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            placeholder="🔍 Filter / search categories..."
            value={categorySearchQuery}
            onChange={(e) => setCategorySearchQuery(e.target.value)}
            style={{
              maxWidth: "280px",
              padding: "7px 12px",
              fontSize: "12px",
              borderRadius: "8px",
            }}
          />
          {categorySearchQuery && (
            <button
              type="button"
              className="secondary"
              style={{ margin: 0, padding: "5px 10px", fontSize: "11px" }}
              onClick={() => setCategorySearchQuery("")}
            >
              Clear Search
            </button>
          )}
          <small className="muted">
            Showing {displayedCategories.length} of {categories.length} categories
          </small>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
          {/* All Categories reset pill */}
          <span
            className={`category-pill-tag ${selectedCategoryFilter === "all" ? "active" : ""}`}
            onClick={() => setSelectedCategoryFilter("all")}
          >
            All Categories
            <span className="cat-count">{items.length}</span>
          </span>

          {/* Uncategorized pill */}
          <span
            className={`category-pill-tag ${
              selectedCategoryFilter === "uncategorized" ? "active" : ""
            }`}
            onClick={() => setSelectedCategoryFilter("uncategorized")}
          >
            Uncategorized
            <span className="cat-count">{uncategorizedCount}</span>
          </span>

          {displayedCategories.map((c) => {
            const count = categoryCounts[c.id] || 0;
            const isSelected = selectedCategoryFilter === c.id;
            return (
              <span
                key={c.id}
                className={`category-pill-tag ${isSelected ? "active" : ""}`}
                onClick={() =>
                  setSelectedCategoryFilter(isSelected ? "all" : c.id)
                }
              >
                <span>{c.name}</span>
                <span className="cat-count">{count}</span>
                <span
                  className="cat-delete"
                  title={`Delete category "${c.name}"`}
                  onClick={(e) => deleteCategory(c.id, c.name, e)}
                >
                  ✕
                </span>
              </span>
            );
          })}

          {!categories.length && (
            <p className="muted" style={{ padding: "0.5rem 0" }}>
              No categories configured yet. Click <b>"⚡ 1-Click Add All Categories"</b> or select a sector preset above to populate!
            </p>
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
              placeholder="e.g. Basmati Rice 1kg / Apple / Haircut"
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
                  {c.name} ({categoryCounts[c.id] || 0})
                </option>
              ))}
            </select>
          </label>

          <label>
            SKU
            <input
              placeholder="e.g. PROD-001"
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
                  {c.name} ({categoryCounts[c.id] || 0})
                </option>
              ))}
              <option value="uncategorized">
                Uncategorized ({uncategorizedCount})
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
