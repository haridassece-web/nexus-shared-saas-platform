import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Sale = {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  payment_method: string;
  created_at: string;
};

export function Reports() {
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [rows, setRows] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [printInvoice, setPrintInvoice] = useState<Sale | null>(null);

  useEffect(() => {
    if (!bid) return;
    api<Sale[]>("/api/tenant/retail/reports/sales", {}, bid)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [bid]);

  const total = rows.reduce((s, r) => s + Number(r.total), 0);

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
          <p className="eyebrow">BUSINESS ANALYTICS</p>
          <h1>Sales reports</h1>
          <p className="muted">Recent invoices and recorded sales.</p>
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

      <div className="stats-grid no-print">
        <div className="stat-card">
          <span>Total sales</span>
          <strong>₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
        </div>
        <div className="stat-card">
          <span>Invoices</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat-card">
          <span>Average invoice</span>
          <strong>₹{rows.length ? (total / rows.length).toFixed(2) : "0.00"}</strong>
        </div>
      </div>

      <div className="panel no-print">
        <h2>Recent invoices</h2>
        {error && <p className="warning">{error}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.invoice_number}</b></td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.payment_method}</td>
                  <td><b>₹{Number(r.total).toFixed(2)}</b></td>
                  <td>
                    <button
                      className="secondary"
                      style={{ margin: 0, padding: "5px 10px", fontSize: "12px" }}
                      onClick={() => handlePrint(r)}
                    >
                      🖨️ Print
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && !error && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>
                    No invoices recorded yet.
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
