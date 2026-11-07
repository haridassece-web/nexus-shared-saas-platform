import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";

export type InvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  taxable_amount: number;
  tax_amount: number;
  line_total: number;
  hsn_code?: string | null;
};

export type Sale = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone?: string | null;
  order_type?: string | null;
  subtotal?: number;
  tax_total?: number;
  cgst_total?: number;
  sgst_total?: number;
  igst_total?: number;
  total: number;
  payment_method: string;
  payment_status?: string | null;
  custom_fields?: Record<string, string>;
  created_at: string;
  invoice_items?: InvoiceItem[];
};

export function Reports() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [rows, setRows] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<Sale | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Filter States
  const [rangePreset, setRangePreset] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");

  async function loadSales(from?: string, to?: string) {
    if (!bid) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const url = `/api/tenant/retail/reports/sales${q.toString() ? `?${q.toString()}` : ""}`;
      const data = await api<Sale[]>(url, {}, bid);
      setRows(data || []);
    } catch (e: any) {
      setError(e.message || "Failed to load sales report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, [bid]);

  // Compute Filtered Sales based on search, preset, payment mode
  const filteredSales = useMemo(() => {
    let list = [...rows];

    // Date Filtering
    if (rangePreset !== "all") {
      const now = new Date();
      let start = new Date();
      let end = new Date();

      if (rangePreset === "today") {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (rangePreset === "yesterday") {
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
      } else if (rangePreset === "week") {
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
      } else if (rangePreset === "month") {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
      } else if (rangePreset === "custom") {
        if (customFrom) {
          start = new Date(`${customFrom}T00:00:00`);
        } else {
          start = new Date("2000-01-01");
        }
        if (customTo) {
          end = new Date(`${customTo}T23:59:59.999`);
        } else {
          end = new Date("2100-01-01");
        }
      }

      list = list.filter((r) => {
        const d = new Date(r.created_at);
        return d >= start && d <= end;
      });
    }

    // Payment Mode Filter
    if (paymentFilter !== "all") {
      list = list.filter(
        (r) => r.payment_method.toLowerCase() === paymentFilter.toLowerCase()
      );
    }

    // Search Query (Invoice #, Customer Name, Phone)
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        return (
          r.invoice_number.toLowerCase().includes(q) ||
          r.customer_name.toLowerCase().includes(q) ||
          (r.customer_phone && r.customer_phone.toLowerCase().includes(q)) ||
          (r.order_type && r.order_type.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [rows, rangePreset, customFrom, customTo, paymentFilter, search]);

  // Financial Metrics
  const metrics = useMemo(() => {
    let grandTotal = 0;
    let subtotal = 0;
    let taxTotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const paymentCounts: Record<string, { count: number; sum: number }> = {};

    filteredSales.forEach((r) => {
      const tot = Number(r.total || 0);
      const sub = Number(r.subtotal || tot);
      const tax = Number(r.tax_total || 0);
      grandTotal += tot;
      subtotal += sub;
      taxTotal += tax;
      cgst += Number(r.cgst_total || 0);
      sgst += Number(r.sgst_total || 0);
      igst += Number(r.igst_total || 0);

      const m = r.payment_method || "Other";
      if (!paymentCounts[m]) paymentCounts[m] = { count: 0, sum: 0 };
      paymentCounts[m].count += 1;
      paymentCounts[m].sum += tot;
    });

    const avg = filteredSales.length > 0 ? grandTotal / filteredSales.length : 0;
    return { grandTotal, subtotal, taxTotal, cgst, sgst, igst, avg, paymentCounts };
  }, [filteredSales]);

  // CSV Escaper for Microsoft Excel Compatibility
  function escapeCsv(val: any): string {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  }

  // Trigger File Download
  function downloadBlob(content: string, filename: string) {
    // \uFEFF is the UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 properly without font corruption
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 1. Export Invoice Summary Excel Backup
  function exportSummaryExcel() {
    if (!filteredSales.length) {
      alert("No sales records to export for the selected filter.");
      return;
    }

    const headers = [
      "Invoice Number",
      "Date",
      "Time",
      "Customer Name",
      "Customer Phone",
      "Order Type",
      "Payment Mode",
      "Payment Status",
      "Subtotal (INR)",
      "CGST (INR)",
      "SGST (INR)",
      "IGST (INR)",
      "Total Tax (INR)",
      "Grand Total (INR)",
      "Items Count",
      "Custom Fields",
    ];

    const rowsCsv = [headers.join(",")];

    filteredSales.forEach((r) => {
      const d = new Date(r.created_at);
      const dateStr = d.toLocaleDateString("en-IN");
      const timeStr = d.toLocaleTimeString("en-IN");
      const sub = Number(r.subtotal || r.total).toFixed(2);
      const c = Number(r.cgst_total || 0).toFixed(2);
      const s = Number(r.sgst_total || 0).toFixed(2);
      const i = Number(r.igst_total || 0).toFixed(2);
      const tax = Number(r.tax_total || 0).toFixed(2);
      const tot = Number(r.total).toFixed(2);
      const itemsCount = r.invoice_items ? r.invoice_items.length : 1;

      const customStr = r.custom_fields
        ? Object.entries(r.custom_fields)
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ")
        : "";

      rowsCsv.push(
        [
          escapeCsv(r.invoice_number),
          escapeCsv(dateStr),
          escapeCsv(timeStr),
          escapeCsv(r.customer_name),
          escapeCsv(r.customer_phone || ""),
          escapeCsv(r.order_type || "Counter Sale"),
          escapeCsv(r.payment_method),
          escapeCsv(r.payment_status || "paid"),
          sub,
          c,
          s,
          i,
          tax,
          tot,
          itemsCount,
          escapeCsv(customStr),
        ].join(",")
      );
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadBlob(rowsCsv.join("\r\n"), `Sales_Report_Summary_${dateStamp}.csv`);
  }

  // 2. Export Detailed Item-Wise Sales Excel Backup
  function exportItemizedExcel() {
    if (!filteredSales.length) {
      alert("No sales records to export for the selected filter.");
      return;
    }

    const headers = [
      "Invoice Number",
      "Date",
      "Customer Name",
      "Customer Phone",
      "Item / Service Description",
      "HSN Code",
      "Quantity",
      "Unit Price (INR)",
      "GST Rate (%)",
      "Taxable Amount (INR)",
      "Tax Amount (INR)",
      "Line Total (INR)",
      "Payment Mode",
      "Order Type",
    ];

    const rowsCsv = [headers.join(",")];

    filteredSales.forEach((r) => {
      const dateStr = new Date(r.created_at).toLocaleDateString("en-IN");

      if (r.invoice_items && r.invoice_items.length > 0) {
        r.invoice_items.forEach((it) => {
          rowsCsv.push(
            [
              escapeCsv(r.invoice_number),
              escapeCsv(dateStr),
              escapeCsv(r.customer_name),
              escapeCsv(r.customer_phone || ""),
              escapeCsv(it.description),
              escapeCsv(it.hsn_code || "—"),
              it.quantity,
              Number(it.unit_price).toFixed(2),
              Number(it.gst_rate).toFixed(2),
              Number(it.taxable_amount || it.unit_price * it.quantity).toFixed(2),
              Number(it.tax_amount || 0).toFixed(2),
              Number(it.line_total || it.unit_price * it.quantity).toFixed(2),
              escapeCsv(r.payment_method),
              escapeCsv(r.order_type || "Counter Sale"),
            ].join(",")
          );
        });
      } else {
        // Fallback for single line sales without item breakdown
        rowsCsv.push(
          [
            escapeCsv(r.invoice_number),
            escapeCsv(dateStr),
            escapeCsv(r.customer_name),
            escapeCsv(r.customer_phone || ""),
            escapeCsv("General Sale"),
            escapeCsv("—"),
            1,
            Number(r.subtotal || r.total).toFixed(2),
            0,
            Number(r.subtotal || r.total).toFixed(2),
            Number(r.tax_total || 0).toFixed(2),
            Number(r.total).toFixed(2),
            escapeCsv(r.payment_method),
            escapeCsv(r.order_type || "Counter Sale"),
          ].join(",")
        );
      }
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadBlob(rowsCsv.join("\r\n"), `Detailed_Item_Sales_Backup_${dateStamp}.csv`);
  }

  // Load Sample Demo Sales Data for testing Excel export
  function loadDemoSales() {
    const demoItems: Sale[] = [
      {
        id: "demo-1",
        invoice_number: "INV-2026-001",
        customer_name: "Rahul Sharma",
        customer_phone: "9876543210",
        order_type: "Counter Sale",
        subtotal: 1250,
        tax_total: 150,
        cgst_total: 75,
        sgst_total: 75,
        igst_total: 0,
        total: 1400,
        payment_method: "UPI",
        payment_status: "paid",
        created_at: new Date().toISOString(),
        invoice_items: [
          {
            description: "Basmati Rice 5kg",
            quantity: 2,
            unit_price: 490,
            gst_rate: 5,
            taxable_amount: 980,
            tax_amount: 49,
            line_total: 1029,
            hsn_code: "1006",
          },
          {
            description: "Sunflower Cooking Oil 1L",
            quantity: 2,
            unit_price: 135,
            gst_rate: 5,
            taxable_amount: 270,
            tax_amount: 13.5,
            line_total: 283.5,
            hsn_code: "1512",
          },
        ],
      },
      {
        id: "demo-2",
        invoice_number: "INV-2026-002",
        customer_name: "Priya Sundaram",
        customer_phone: "9884933079",
        order_type: "Home Delivery",
        subtotal: 2400,
        tax_total: 432,
        cgst_total: 216,
        sgst_total: 216,
        igst_total: 0,
        total: 2832,
        payment_method: "Card",
        payment_status: "paid",
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        invoice_items: [
          {
            description: "Hair Cut & Blowdry",
            quantity: 1,
            unit_price: 750,
            gst_rate: 18,
            taxable_amount: 750,
            tax_amount: 135,
            line_total: 885,
            hsn_code: "9997",
          },
          {
            description: "Gold Facial Treatment",
            quantity: 1,
            unit_price: 1650,
            gst_rate: 18,
            taxable_amount: 1650,
            tax_amount: 297,
            line_total: 1947,
            hsn_code: "9997",
          },
        ],
      },
      {
        id: "demo-3",
        invoice_number: "INV-2026-003",
        customer_name: "Karthik Raja",
        customer_phone: "9840123456",
        order_type: "Express Billing",
        subtotal: 650,
        tax_total: 0,
        cgst_total: 0,
        sgst_total: 0,
        igst_total: 0,
        total: 650,
        payment_method: "Cash",
        payment_status: "paid",
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        invoice_items: [
          {
            description: "Fresh Red Onion 5kg",
            quantity: 5,
            unit_price: 35,
            gst_rate: 0,
            taxable_amount: 175,
            tax_amount: 0,
            line_total: 175,
            hsn_code: "0703",
          },
          {
            description: "Shimla Apple Premium 2kg",
            quantity: 2,
            unit_price: 180,
            gst_rate: 0,
            taxable_amount: 360,
            tax_amount: 0,
            line_total: 360,
            hsn_code: "0808",
          },
          {
            description: "Robusta Banana 2 Dozen",
            quantity: 2,
            unit_price: 50,
            gst_rate: 0,
            taxable_amount: 100,
            tax_amount: 0,
            line_total: 100,
            hsn_code: "0803",
          },
        ],
      },
      {
        id: "demo-4",
        invoice_number: "INV-2026-004",
        customer_name: "Dr. Ananya Roy",
        customer_phone: "9176001122",
        order_type: "Consultation",
        subtotal: 4500,
        tax_total: 0,
        cgst_total: 0,
        sgst_total: 0,
        igst_total: 0,
        total: 4500,
        payment_method: "UPI",
        payment_status: "paid",
        created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
        invoice_items: [
          {
            description: "Root Canal Treatment (RCT)",
            quantity: 1,
            unit_price: 4500,
            gst_rate: 0,
            taxable_amount: 4500,
            tax_amount: 0,
            line_total: 4500,
            hsn_code: "9993",
          },
        ],
      },
    ];

    setRows(demoItems);
  }

  function handlePrint(sale: Sale) {
    setPrintInvoice(sale);
    setTimeout(() => {
      window.print();
    }, 200);
  }

  return (
    <>
      <header className="page-head no-print">
        <div>
          <p className="eyebrow">BUSINESS ANALYTICS & COMPLIANCE</p>
          <h1 style={{ fontSize: "28px", margin: "4px 0" }}>
            Sales Reports & Excel Backup
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Audit-ready sales summaries, tax calculations, and 1-click Excel (.csv) backups.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="primary link-btn"
            style={{
              background: "#16a34a",
              color: "#ffffff",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={exportSummaryExcel}
            title="Download full invoice summary backup for Microsoft Excel"
          >
            📊 Export Excel Backup (.csv)
          </button>

          <button
            type="button"
            className="secondary link-btn"
            style={{
              background: "#f0fdf4",
              color: "#15803d",
              borderColor: "#86efac",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={exportItemizedExcel}
            title="Download every sold item & HSN code in detailed Excel sheet"
          >
            📦 Item-Wise Sales Backup
          </button>

          <button
            type="button"
            className="secondary link-btn"
            onClick={() => window.print()}
          >
            🖨️ Print Report
          </button>
        </div>
      </header>

      {/* Hidden printable receipt for past invoices */}
      {printInvoice && (
        <div id="printable-receipt" className="thermal-receipt">
          <div className="center biz-title">NEXUS RETAIL SALE</div>
          <div className="divider" />
          <div><b>Invoice:</b> {printInvoice.invoice_number}</div>
          <div><b>Date:</b> {new Date(printInvoice.created_at).toLocaleString("en-IN")}</div>
          <div><b>Customer:</b> {printInvoice.customer_name}</div>
          <div><b>Payment:</b> {printInvoice.payment_method}</div>
          <div className="divider" />
          <div className="grand-total">
            <span>TOTAL PAID</span>
            <span>₹{Number(printInvoice.total).toFixed(2)}</span>
          </div>
          <div className="double-divider" />
          <div className="center">*** DUPLICATE RECEIPT ***</div>
        </div>
      )}

      {/* Date & Filter Bar */}
      <div
        className="panel no-print"
        style={{
          padding: "16px",
          marginBottom: "18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          {/* Quick Date Range Buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "Last 7 Days" },
              { id: "month", label: "This Month" },
              { id: "custom", label: "Custom Range" },
            ].map((p) => {
              const isActive = rangePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="secondary"
                  style={{
                    margin: 0,
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? "#2563eb" : "#f8fafc",
                    color: isActive ? "#ffffff" : "#334155",
                    borderColor: isActive ? "#2563eb" : "#cbd5e1",
                  }}
                  onClick={() => setRangePreset(p.id as any)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Quick Stats Pill */}
          <span className="muted" style={{ fontSize: "13px" }}>
            Showing <b>{filteredSales.length}</b> of <b>{rows.length}</b> Invoices
          </span>
        </div>

        {/* Custom Date Pickers (when custom range is chosen) */}
        {rangePreset === "custom" && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ margin: 0, fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>From Date:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "12px" }}
              />
            </label>
            <label style={{ margin: 0, fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>To Date:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "12px" }}
              />
            </label>
            <button
              type="button"
              className="primary"
              style={{ padding: "6px 12px", fontSize: "12px" }}
              onClick={() => loadSales(customFrom, customTo)}
            >
              Apply Filter
            </button>
          </div>
        )}

        {/* Search & Payment Mode Filters */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="🔍 Search by Invoice #, Customer Name, or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 280px",
              padding: "8px 12px",
              fontSize: "13px",
              borderRadius: "8px",
            }}
          />

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={{ padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
          >
            <option value="all">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Bank transfer">Bank Transfer</option>
          </select>

          {rows.length === 0 && (
            <button
              type="button"
              className="secondary"
              style={{ margin: 0, padding: "8px 12px", fontSize: "12px", fontWeight: 600 }}
              onClick={loadDemoSales}
            >
              ✨ Load Sample Sales Data
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="stats-grid no-print" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="stat-card">
          <span>Total Sales Revenue</span>
          <strong style={{ color: "#16a34a" }}>
            ₹{metrics.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
          <small className="muted" style={{ marginTop: "4px" }}>
            Subtotal: ₹{metrics.subtotal.toFixed(2)}
          </small>
        </div>

        <div className="stat-card">
          <span>Invoices Recorded</span>
          <strong>{filteredSales.length}</strong>
          <small className="muted" style={{ marginTop: "4px" }}>
            Avg Ticket: ₹{metrics.avg.toFixed(2)}
          </small>
        </div>

        <div className="stat-card">
          <span>Total GST Tax</span>
          <strong style={{ color: "#2563eb" }}>
            ₹{metrics.taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
          <small className="muted" style={{ marginTop: "4px" }}>
            CGST: ₹{metrics.cgst.toFixed(2)} | SGST: ₹{metrics.sgst.toFixed(2)}
          </small>
        </div>

        <div className="stat-card">
          <span>Payment Mode Split</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
            {Object.entries(metrics.paymentCounts).map(([mode, data]) => (
              <span
                key={mode}
                className="pill"
                style={{
                  fontSize: "11px",
                  background: mode === "UPI" ? "#dbeafe" : mode === "Cash" ? "#dcfce7" : "#f1f5f9",
                  color: mode === "UPI" ? "#1e40af" : mode === "Cash" ? "#166534" : "#334155",
                }}
              >
                {mode}: {data.count} (₹{data.sum.toFixed(0)})
              </span>
            ))}
            {Object.keys(metrics.paymentCounts).length === 0 && (
              <span className="muted">No sales yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="panel no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ margin: "0 0 2px 0" }}>Sales Transactions ({filteredSales.length})</h2>
            <p className="muted" style={{ margin: 0 }}>
              Click any invoice row to inspect line items and breakdown.
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="primary"
              style={{ background: "#16a34a", padding: "6px 12px", fontSize: "12px", fontWeight: 700 }}
              onClick={exportSummaryExcel}
            >
              📥 Download Excel (.csv)
            </button>
            <button
              type="button"
              className="secondary"
              style={{ margin: 0, padding: "6px 12px", fontSize: "12px" }}
              onClick={exportItemizedExcel}
            >
              📦 Items Excel
            </button>
          </div>
        </div>

        {error && <p className="warning">{error}</p>}
        {loading && <p className="muted">Loading sales records…</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Order Type</th>
                <th>Payment</th>
                <th>Subtotal</th>
                <th>GST</th>
                <th>Grand Total</th>
                <th>Items</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((r) => {
                const isExpanded = expandedInvoiceId === r.id;
                return (
                  <tr
                    key={r.id}
                    style={{
                      background: isExpanded ? "#f8fafc" : undefined,
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedInvoiceId(isExpanded ? null : r.id)}
                  >
                    <td>
                      <b style={{ color: "#2563eb" }}>{r.invoice_number}</b>
                    </td>
                    <td>
                      <div>{new Date(r.created_at).toLocaleDateString("en-IN")}</div>
                      <small className="muted">
                        {new Date(r.created_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </td>
                    <td>
                      <b>{r.customer_name}</b>
                      {r.customer_phone && <small className="muted">{r.customer_phone}</small>}
                    </td>
                    <td>
                      <span className="pill" style={{ fontSize: "10px" }}>
                        {r.order_type || "Counter Sale"}
                      </span>
                    </td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          background: r.payment_method === "UPI" ? "#dbeafe" : r.payment_method === "Cash" ? "#dcfce7" : "#f1f5f9",
                          color: r.payment_method === "UPI" ? "#1e40af" : r.payment_method === "Cash" ? "#166534" : "#334155",
                        }}
                      >
                        {r.payment_method}
                      </span>
                    </td>
                    <td>₹{Number(r.subtotal || r.total).toFixed(2)}</td>
                    <td>₹{Number(r.tax_total || 0).toFixed(2)}</td>
                    <td>
                      <b style={{ fontSize: "14px", color: "#0f172a" }}>
                        ₹{Number(r.total).toFixed(2)}
                      </b>
                    </td>
                    <td>
                      <span className="pill" style={{ fontSize: "10px" }}>
                        {r.invoice_items?.length || 1} items {isExpanded ? "▲" : "▼"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        style={{ margin: 0, padding: "5px 10px", fontSize: "12px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrint(r);
                        }}
                      >
                        🖨️ Print
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!filteredSales.length && !loading && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "2.5rem" }}>
                    <p style={{ margin: "0 0 10px 0" }}>No sales records match this filter.</p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={loadDemoSales}
                    >
                      ✨ Load Sample Sales Data to Test Excel Backup
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded Invoice Items Breakdown */}
        {expandedInvoiceId && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
            }}
          >
            {(() => {
              const current = filteredSales.find((s) => s.id === expandedInvoiceId);
              if (!current) return null;
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <b>Line Items for {current.invoice_number} ({current.customer_name})</b>
                    <button
                      type="button"
                      className="secondary"
                      style={{ margin: 0, padding: "2px 8px", fontSize: "11px" }}
                      onClick={() => setExpandedInvoiceId(null)}
                    >
                      Close ✕
                    </button>
                  </div>
                  {current.invoice_items && current.invoice_items.length > 0 ? (
                    <table style={{ background: "#ffffff", borderRadius: "8px" }}>
                      <thead>
                        <tr>
                          <th>Item Description</th>
                          <th>HSN</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>GST Rate</th>
                          <th>Tax Amount</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.invoice_items.map((it, idx) => (
                          <tr key={idx}>
                            <td><b>{it.description}</b></td>
                            <td>{it.hsn_code || "—"}</td>
                            <td>{it.quantity}</td>
                            <td>₹{Number(it.unit_price).toFixed(2)}</td>
                            <td>{it.gst_rate}%</td>
                            <td>₹{Number(it.tax_amount || 0).toFixed(2)}</td>
                            <td><b>₹{Number(it.line_total || it.unit_price * it.quantity).toFixed(2)}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>
                      No item-level breakdown recorded for this transaction. Total: ₹{Number(current.total).toFixed(2)}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </>
  );
}
