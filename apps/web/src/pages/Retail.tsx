import { FormEvent, useEffect, useState, useRef, useMemo } from "react";
import { api } from "../lib/api";
import { jsPDF } from "jspdf";
import { useNavigate } from "react-router-dom";
import { supabase, isSuperAdmin, checkIsAdmin } from "../lib/supabase";
import {
  getTemplateForBusinessType,
  BusinessCategoryTemplate,
  BUSINESS_TEMPLATES,
} from "../lib/businessTemplates";
import {
  PaperType,
  InvoiceType,
  PAPER_CONFIGS,
  INVOICE_TYPE_CONFIGS,
} from "../types/billing";

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
  paper_type?: PaperType;
  invoice_type?: InvoiceType;
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
  const navigate = useNavigate();
  const bid = localStorage.getItem("nexus_business_id") || "";
  const [isAdmin, setIsAdmin] = useState(false);
  const [business, setBusiness] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [pastInvoices, setPastInvoices] = useState<PastInvoice[]>([]);

  // Demo Template Switcher State (allows previewing all 60+ business templates - Super Admin only)
  const [activeDemoCode, setActiveDemoCode] = useState<string>(
    () => localStorage.getItem("nexus_demo_template") || ""
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (user) {
        if (isSuperAdmin(user)) {
          setIsAdmin(true);
        } else {
          checkIsAdmin(user).then((admin) => {
            setIsAdmin(admin);
            if (!admin) {
              setActiveDemoCode("");
              localStorage.removeItem("nexus_demo_template");
            }
          });
        }
      } else {
        setIsAdmin(false);
        setActiveDemoCode("");
        localStorage.removeItem("nexus_demo_template");
      }
    });
  }, []);

  // Category Template & Archetype Metadata
  const effectiveType = activeDemoCode || business?.business_type || "supermarket";
  const template: BusinessCategoryTemplate = getTemplateForBusinessType(effectiveType);

  // Demo business sync effect
  useEffect(() => {
    if (activeDemoCode) {
      const tmpl = BUSINESS_TEMPLATES[activeDemoCode];
      if (tmpl) {
        setBusiness({
          id: "demo-" + tmpl.code,
          name: `${tmpl.name} (Live Demo)`,
          business_type: tmpl.code,
          invoice_prefix: tmpl.prefix || "INV",
          state_code: "33",
          phone: "9884933079",
          address: "Live Demo Terminal, Nexus Cloud",
        });
        if (tmpl.order_types && tmpl.order_types.length > 0) {
          setOrderType(tmpl.order_types[0]);
        }
        setLines([]);
      }
    } else if (!business && !bid) {
      const tmpl = BUSINESS_TEMPLATES.supermarket;
      setBusiness({
        id: "demo-supermarket",
        name: "Supermarket (Live Demo)",
        business_type: "supermarket",
        invoice_prefix: "SMART",
        state_code: "33",
        phone: "9884933079",
        address: "Live Demo Terminal, Nexus Cloud",
      });
      if (tmpl.order_types && tmpl.order_types.length > 0) {
        setOrderType(tmpl.order_types[0]);
      }
    }
  }, [activeDemoCode, bid]);

  // When activeDemoCode is set, or if products table is empty, auto-populate from template starter items!
  const displayProducts: Product[] = useMemo(() => {
    if (products.length > 0 && !activeDemoCode) {
      return products;
    }
    return template.starter_items.map((it, idx) => ({
      id: `demo-${template.code}-${idx + 1}`,
      name: it.name,
      sku: `${template.prefix || "ITEM"}-${String(idx + 1).padStart(3, "0")}`,
      barcode: `890${String(100000000 + idx).slice(1)}`,
      hsn_code: "9983",
      selling_price: it.selling_price,
      gst_rate: it.gst_rate ?? 18,
      stock_qty: it.stock_qty || 100,
      category_id: null,
      category_name: template.name,
    }));
  }, [products, activeDemoCode, template]);

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
  const [paperType, setPaperType] = useState<PaperType>(() => {
    const saved = localStorage.getItem("nexus_paper_type");
    if (saved && saved in PAPER_CONFIGS) return saved as PaperType;
    const legacy = localStorage.getItem("nexus_print_format");
    if (legacy === "a4") return "A4";
    return "THERMAL_80MM";
  });
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(() => {
    const saved = localStorage.getItem("nexus_invoice_type");
    if (saved && saved in INVOICE_TYPE_CONFIGS) return saved as InvoiceType;
    return "TAX_INVOICE";
  });
  const [productView, setProductView] = useState<"horizontal" | "list" | "grid">(() => {
    return (
      (localStorage.getItem("nexus_product_view") as
        | "horizontal"
        | "list"
        | "grid") || "horizontal"
    );
  });

  // Backward compatibility alias
  const printFormat: "80mm" | "a4" =
    paperType === "A4" || paperType === "A5" || paperType === "LETTER" ? "a4" : "80mm";
  function setPrintFormat(fmt: "80mm" | "a4") {
    if (fmt === "80mm") {
      setPaperType("THERMAL_80MM");
      localStorage.setItem("nexus_paper_type", "THERMAL_80MM");
    } else {
      setPaperType("A4");
      localStorage.setItem("nexus_paper_type", "A4");
    }
  }

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
    const matches = displayProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
    setSearchResults(matches);
    setShowDropdown(matches.length > 0);
  }, [searchTerm, displayProducts]);

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
    let match = displayProducts.find((p) => p.barcode && p.barcode.toLowerCase() === q);
    // 2. Try exact SKU/Item Code match
    if (!match) {
      match = displayProducts.find((p) => p.sku && p.sku.toLowerCase() === q);
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

    if (!bid || bid === "demo" || activeDemoCode || business?.id?.startsWith("demo")) {
      const randomSeq = String(Math.floor(100 + Math.random() * 900));
      return {
        id: "demo-inv-" + Date.now(),
        invoice_number: `${template.prefix || "DEMO"}-2026-${randomSeq}`,
        created_at: new Date().toISOString(),
      };
    }

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
      paper_type: paperType,
      invoice_type: invoiceType,
    };
  }

  function download58mmPdf(receipt: Receipt, invType: InvoiceType = invoiceType) {
    const docConfig = INVOICE_TYPE_CONFIGS[invType] || INVOICE_TYPE_CONFIGS.TAX_INVOICE;
    const dynamicHeight = Math.max(
      140,
      95 +
        receipt.items.length * 7 +
        (receipt.custom_fields ? Object.keys(receipt.custom_fields).length * 4 : 0)
    );

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [58, dynamicHeight],
    });

    const brandColor = business?.brand_color || "#2563eb";
    const brandName = business?.brand_name || business?.name || docConfig.title;
    const footerMsg = business?.invoice_footer || "THANK YOU!";
    const isWhiteLabel =
      business?.branding_mode === "white_label" ||
      business?.show_platform_branding === false;

    let r = 37, g = 99, b = 235;
    if (brandColor.startsWith("#") && brandColor.length === 7) {
      r = parseInt(brandColor.slice(1, 3), 16) || 37;
      g = parseInt(brandColor.slice(3, 5), 16) || 99;
      b = parseInt(brandColor.slice(5, 7), 16) || 235;
    }

    let y = 6;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(r, g, b);
    pdf.text(brandName.slice(0, 24), 29, y, { align: "center" });
    pdf.setTextColor(30, 41, 59);

    y += 3.5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text(`*** ${docConfig.title} ***`, 29, y, { align: "center" });
    if (docConfig.subNotice) {
      y += 3;
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(5.5);
      pdf.text(docConfig.subNotice.slice(0, 38), 29, y, { align: "center" });
    }

    if (business?.phone) {
      y += 3;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.text(`Ph: ${business.phone}`, 29, y, { align: "center" });
    }

    if (business?.gstin && invType !== "BILL_OF_SUPPLY") {
      y += 3;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.text(`GST: ${business.gstin}`, 29, y, { align: "center" });
    }

    y += 2.5;
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.2);
    pdf.line(2, y, 56, y);
    y += 3;

    pdf.setFontSize(6.5);
    pdf.text(`Doc: ${receipt.invoice_number}`, 2, y);
    y += 3;
    pdf.text(`Date: ${receipt.date}`, 2, y);
    y += 3;
    pdf.text(`Cust: ${receipt.customer_name.slice(0, 20)}`, 2, y);
    if (receipt.customer_phone) {
      y += 3;
      pdf.text(`Ph: ${receipt.customer_phone}`, 2, y);
    }

    y += 2.5;
    pdf.line(2, y, 56, y);
    y += 3;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.text("ITEM", 2, y);
    pdf.text("QTY", 32, y, { align: "center" });
    pdf.text("TOTAL", 56, y, { align: "right" });
    y += 2.5;
    pdf.line(2, y, 56, y);
    y += 3;

    pdf.setFont("helvetica", "normal");
    receipt.items.forEach((it) => {
      pdf.text(it.name.slice(0, 15), 2, y);
      pdf.text(String(it.qty), 32, y, { align: "center" });
      pdf.text(`Rs.${it.total.toFixed(2)}`, 56, y, { align: "right" });
      y += 3.5;
    });

    y += 1.5;
    pdf.line(2, y, 56, y);
    y += 3.5;

    pdf.text(`Subtotal:`, 2, y);
    pdf.text(`Rs.${receipt.subtotal.toFixed(2)}`, 56, y, { align: "right" });

    if (receipt.discount > 0) {
      y += 3;
      pdf.text(`Disc:`, 2, y);
      pdf.text(`-Rs.${receipt.discount.toFixed(2)}`, 56, y, { align: "right" });
    }
    if (receipt.cgst > 0 && invType === "TAX_INVOICE") {
      y += 3;
      pdf.text(`Taxes:`, 2, y);
      pdf.text(`Rs.${(receipt.cgst + receipt.sgst + receipt.igst).toFixed(2)}`, 56, y, { align: "right" });
    }

    y += 2.5;
    pdf.line(2, y, 56, y);
    y += 4;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(`TOTAL:`, 2, y);
    pdf.text(`Rs.${receipt.total.toFixed(2)}`, 56, y, { align: "right" });

    y += 3.5;
    pdf.line(2, y, 56, y);
    y += 4;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.text(footerMsg, 29, y, { align: "center" });

    if (!isWhiteLabel) {
      y += 3;
      pdf.setFontSize(5.5);
      pdf.setTextColor(150, 150, 150);
      pdf.text("Nexus Creative POS", 29, y, { align: "center" });
    }

    pdf.save(`${receipt.invoice_number.replace(/\//g, "-")}-58mm.pdf`);
  }

  function download80mmPdf(receipt: Receipt, invType: InvoiceType = invoiceType) {
    const dynamicHeight = Math.max(
      150,
      90 +
        receipt.items.length * 8 +
        (receipt.custom_fields ? Object.keys(receipt.custom_fields).length * 5 : 0)
    );

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, dynamicHeight],
    });

    const brandColor = business?.brand_color || "#2563eb";
    const brandName = business?.brand_name || business?.name || "TAX INVOICE";
    const showLogo = business?.show_logo ?? true;
    const showContact = business?.show_contact ?? true;
    const showGstin = business?.show_gstin ?? true;
    const footerMsg = business?.invoice_footer || "*** THANK YOU FOR VISITING ***";
    const isWhiteLabel =
      business?.branding_mode === "white_label" ||
      business?.show_platform_branding === false;

    let r = 37, g = 99, b = 235;
    if (brandColor.startsWith("#") && brandColor.length === 7) {
      r = parseInt(brandColor.slice(1, 3), 16) || 37;
      g = parseInt(brandColor.slice(3, 5), 16) || 99;
      b = parseInt(brandColor.slice(5, 7), 16) || 235;
    }

    let y = 8;

    // Centered logo
    if (showLogo && business?.logo_url) {
      try {
        pdf.addImage(business.logo_url, "PNG", 26, y, 28, 12);
        y += 15;
      } catch {}
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(r, g, b);
    pdf.text(brandName, 40, y, { align: "center" });
    pdf.setTextColor(30, 41, 59);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    y += 4;
    pdf.text(`${template.name} (${template.sector})`, 40, y, { align: "center" });

    if (showContact) {
      if (business?.address) {
        y += 4;
        pdf.text(business.address.slice(0, 38), 40, y, { align: "center" });
      }
      if (business?.phone) {
        y += 4;
        pdf.text(`Phone: ${business.phone}`, 40, y, { align: "center" });
      }
    }

    if (showGstin && business?.gstin) {
      y += 4;
      pdf.text(`GSTIN: ${business.gstin}`, 40, y, { align: "center" });
    }

    y += 3;
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.3);
    pdf.line(4, y, 76, y);
    y += 4;

    pdf.setFontSize(8);
    pdf.text(`Invoice: ${receipt.invoice_number}`, 4, y);
    y += 4;
    pdf.text(`Date: ${receipt.date}`, 4, y);
    pdf.text(`Order: ${receipt.order_type}`, 45, y);
    y += 4;
    pdf.text(`${template.customer_label}: ${receipt.customer_name}`, 4, y);
    if (receipt.customer_phone) {
      y += 4;
      pdf.text(`Phone: ${receipt.customer_phone}`, 4, y);
    }

    if (receipt.custom_fields && Object.keys(receipt.custom_fields).length > 0) {
      Object.entries(receipt.custom_fields).forEach(([k, v]) => {
        if (v) {
          y += 4;
          const fieldDef = template.custom_fields.find((f) => f.name === k);
          const lbl = fieldDef?.label || k;
          pdf.text(`${lbl}: ${v}`, 4, y);
        }
      });
    }

    y += 4;
    pdf.text(`Payment: ${receipt.payment_method}`, 4, y);

    y += 3;
    pdf.line(4, y, 76, y);
    y += 4;

    // Header items
    pdf.setFont("helvetica", "bold");
    pdf.text("Item", 4, y);
    pdf.text("Qty", 46, y, { align: "center" });
    pdf.text("Rate", 58, y, { align: "right" });
    pdf.text("Total", 76, y, { align: "right" });
    y += 2;
    pdf.line(4, y, 76, y);

    pdf.setFont("helvetica", "normal");
    receipt.items.forEach((it) => {
      y += 4;
      pdf.text(it.name.slice(0, 18), 4, y);
      pdf.text(String(it.qty), 46, y, { align: "center" });
      pdf.text(`₹${it.price.toFixed(1)}`, 58, y, { align: "right" });
      pdf.text(`₹${it.total.toFixed(2)}`, 76, y, { align: "right" });
    });

    y += 3;
    pdf.line(4, y, 76, y);
    y += 4;

    pdf.text("Subtotal:", 44, y);
    pdf.text(`₹${receipt.subtotal.toFixed(2)}`, 76, y, { align: "right" });

    if (receipt.discount > 0) {
      y += 4;
      pdf.text("Discount:", 44, y);
      pdf.text(`-₹${receipt.discount.toFixed(2)}`, 76, y, { align: "right" });
    }

    if (receipt.cgst > 0) {
      y += 4;
      pdf.text("CGST:", 44, y);
      pdf.text(`₹${receipt.cgst.toFixed(2)}`, 76, y, { align: "right" });
    }

    if (receipt.sgst > 0) {
      y += 4;
      pdf.text("SGST:", 44, y);
      pdf.text(`₹${receipt.sgst.toFixed(2)}`, 76, y, { align: "right" });
    }

    if (receipt.igst > 0) {
      y += 4;
      pdf.text("IGST:", 44, y);
      pdf.text(`₹${receipt.igst.toFixed(2)}`, 76, y, { align: "right" });
    }

    if (Math.abs(receipt.round_off) > 0.001) {
      y += 4;
      pdf.text("Round Off:", 44, y);
      pdf.text(
        `${receipt.round_off > 0 ? "+" : ""}₹${receipt.round_off.toFixed(2)}`,
        76,
        y,
        { align: "right" }
      );
    }

    y += 2;
    pdf.line(4, y, 76, y);
    y += 4;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("TOTAL:", 4, y);
    pdf.text(`₹${receipt.total.toFixed(2)}`, 76, y, { align: "right" });

    if (receipt.cash_tendered > 0) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      y += 4;
      pdf.text(`Cash: ₹${receipt.cash_tendered.toFixed(2)}`, 4, y);
      pdf.text(`Change: ₹${receipt.change_due.toFixed(2)}`, 76, y, {
        align: "right",
      });
    }

    y += 4;
    pdf.line(4, y, 76, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text(footerMsg, 40, y, { align: "center" });

    if (!isWhiteLabel) {
      y += 4;
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(6.5);
      pdf.text("⚡ Powered by Nexus Creative Platform", 40, y, {
        align: "center",
      });
    }

    pdf.save(`${receipt.invoice_number.replace(/\//g, "-")}-80mm.pdf`);
  }

  function downloadSheetPdf(
    receipt: Receipt,
    paper: "A4" | "A5" | "LETTER" = "A4",
    invType: InvoiceType = invoiceType
  ) {
    const isA5 = paper === "A5";
    const docConfig = INVOICE_TYPE_CONFIGS[invType] || INVOICE_TYPE_CONFIGS.TAX_INVOICE;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: paper.toLowerCase(),
    });

    const pageWidth = isA5 ? 148 : paper === "LETTER" ? 215.9 : 210;
    const margin = isA5 ? 8 : 14;
    const contentWidth = pageWidth - margin * 2;
    const rightEdge = pageWidth - margin;

    const brandColor = business?.brand_color || "#2563eb";
    const brandName = business?.brand_name || business?.name || docConfig.title;
    const showLogo = business?.show_logo ?? true;
    const showContact = business?.show_contact ?? true;
    const showGstin = business?.show_gstin ?? true;
    const footerMsg = business?.invoice_footer || "Thank you for your business!";
    const isWhiteLabel =
      business?.branding_mode === "white_label" ||
      business?.show_platform_branding === false;

    let r = 37, g = 99, b = 235;
    if (brandColor.startsWith("#") && brandColor.length === 7) {
      r = parseInt(brandColor.slice(1, 3), 16) || 37;
      g = parseInt(brandColor.slice(3, 5), 16) || 99;
      b = parseInt(brandColor.slice(5, 7), 16) || 235;
    }

    let y = isA5 ? 12 : 18;

    // Header left: Logo & Business Info
    if (showLogo && business?.logo_url) {
      try {
        pdf.addImage(business.logo_url, "PNG", margin, isA5 ? 8 : 12, isA5 ? 24 : 32, isA5 ? 10 : 14);
        y = isA5 ? 22 : 30;
      } catch {}
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isA5 ? 12 : 16);
    pdf.setTextColor(r, g, b);
    pdf.text(brandName, margin, y);
    pdf.setTextColor(30, 41, 59);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(isA5 ? 7.5 : 9);
    y += 4.5;
    pdf.text(`${template.name} · ${template.sector}`, margin, y);
    y += 4.5;

    if (showContact) {
      if (business?.address) {
        pdf.text(business.address.slice(0, isA5 ? 40 : 60), margin, y);
        y += 4;
      }
      if (business?.phone) {
        pdf.text(`Phone: ${business.phone}`, margin, y);
        y += 4;
      }
    }

    if (showGstin && business?.gstin && invType !== "BILL_OF_SUPPLY") {
      pdf.setFont("helvetica", "bold");
      pdf.text(`GSTIN: ${business.gstin}`, margin, y);
      y += 4;
    }

    // Top Right Header: Official Invoice Title & Meta Box
    let metaY = isA5 ? 12 : 18;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isA5 ? 11 : 15);
    pdf.setTextColor(r, g, b);
    pdf.text(docConfig.title, rightEdge, metaY, { align: "right" });
    pdf.setTextColor(30, 41, 59);

    if (docConfig.subNotice) {
      metaY += 4;
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(isA5 ? 6 : 7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(docConfig.subNotice.slice(0, 45), rightEdge, metaY, { align: "right" });
    }

    metaY += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(isA5 ? 7.5 : 8.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Doc #: ${receipt.invoice_number}`, rightEdge, metaY, { align: "right" });
    metaY += 4;
    pdf.text(`Date: ${receipt.date}`, rightEdge, metaY, { align: "right" });
    metaY += 4;
    pdf.text(`Order: ${receipt.order_type}`, rightEdge, metaY, { align: "right" });
    metaY += 4;
    pdf.text(`Payment: ${receipt.payment_method}`, rightEdge, metaY, { align: "right" });

    y = Math.max(y + 2, metaY + 6);

    // Bill To Customer Details Box
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, y, contentWidth, isA5 ? 16 : 20, 2, 2, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isA5 ? 7.5 : 8.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text("BILLED TO:", margin + 4, y + 4.5);
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(isA5 ? 8.5 : 10);
    pdf.text(receipt.customer_name, margin + 4, y + (isA5 ? 8.5 : 10));

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(isA5 ? 7 : 8.5);
    if (receipt.customer_phone) {
      pdf.text(`Phone: ${receipt.customer_phone}`, margin + 4, y + (isA5 ? 12.5 : 15));
    }
    if (customerState) {
      pdf.text(`State Code: ${customerState}`, margin + (isA5 ? 55 : 70), y + (isA5 ? 12.5 : 15));
    }

    y += isA5 ? 20 : 25;

    // Table Header
    pdf.setFillColor(r, g, b);
    pdf.rect(margin, y, contentWidth, isA5 ? 6 : 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isA5 ? 7.5 : 8.5);
    pdf.setTextColor(255, 255, 255);

    const cNum = margin + 3;
    const cItem = margin + (isA5 ? 10 : 16);
    const cHSN = isA5 ? 68 : 110;
    const cQty = isA5 ? 88 : 135;
    const cRate = isA5 ? 108 : 160;
    const cTot = rightEdge - 3;

    pdf.text("#", cNum, y + (isA5 ? 4.2 : 5));
    pdf.text(template.item_label, cItem, y + (isA5 ? 4.2 : 5));
    pdf.text("HSN", cHSN, y + (isA5 ? 4.2 : 5));
    pdf.text("Qty", cQty, y + (isA5 ? 4.2 : 5), { align: "center" });
    pdf.text("Rate", cRate, y + (isA5 ? 4.2 : 5), { align: "right" });
    pdf.text("Amount (Rs.)", cTot, y + (isA5 ? 4.2 : 5), { align: "right" });

    y += isA5 ? 6 : 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(isA5 ? 7.5 : 8.5);
    pdf.setTextColor(30, 41, 59);

    receipt.items.forEach((it, idx) => {
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y + 5.5, rightEdge, y + 5.5);

      pdf.text(String(idx + 1), cNum, y + 4);
      pdf.text(it.name.slice(0, isA5 ? 24 : 42), cItem, y + 4);
      pdf.text(it.hsn || "—", cHSN, y + 4);
      pdf.text(String(it.qty), cQty, y + 4, { align: "center" });
      pdf.text(`Rs.${it.price.toFixed(2)}`, cRate, y + 4, { align: "right" });
      pdf.text(`Rs.${it.total.toFixed(2)}`, cTot, y + 4, { align: "right" });
      y += isA5 ? 5.5 : 6.5;
    });

    y += 3;
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, rightEdge, y);
    y += 4;

    // Totals Block
    const totLabelX = isA5 ? 80 : 130;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(isA5 ? 7.5 : 8.5);

    pdf.text("Subtotal:", totLabelX, y);
    pdf.text(`Rs.${receipt.subtotal.toFixed(2)}`, rightEdge - 3, y, { align: "right" });

    if (receipt.discount > 0) {
      y += 4;
      pdf.text("Discount:", totLabelX, y);
      pdf.text(`-Rs.${receipt.discount.toFixed(2)}`, rightEdge - 3, y, { align: "right" });
    }

    if (receipt.cgst > 0 && invType === "TAX_INVOICE") {
      y += 4;
      pdf.text("CGST:", totLabelX, y);
      pdf.text(`Rs.${receipt.cgst.toFixed(2)}`, rightEdge - 3, y, { align: "right" });
    }
    if (receipt.sgst > 0 && invType === "TAX_INVOICE") {
      y += 4;
      pdf.text("SGST:", totLabelX, y);
      pdf.text(`Rs.${receipt.sgst.toFixed(2)}`, rightEdge - 3, y, { align: "right" });
    }
    if (receipt.igst > 0 && invType === "TAX_INVOICE") {
      y += 4;
      pdf.text("IGST:", totLabelX, y);
      pdf.text(`Rs.${receipt.igst.toFixed(2)}`, rightEdge - 3, y, { align: "right" });
    }

    if (receipt.round_off !== 0) {
      y += 4;
      pdf.text("Round Off:", totLabelX, y);
      pdf.text(
        `${receipt.round_off > 0 ? "+" : ""}Rs.${receipt.round_off.toFixed(2)}`,
        rightEdge - 3,
        y,
        { align: "right" }
      );
    }

    y += 3;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(totLabelX, y, rightEdge, y);
    y += 4;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isA5 ? 10 : 11);
    pdf.setTextColor(r, g, b);
    pdf.text("Grand Total:", totLabelX, y);
    pdf.text(`Rs.${receipt.total.toFixed(2)}`, rightEdge - 3, y, { align: "right" });
    pdf.setTextColor(30, 41, 59);

    // Footer
    y += isA5 ? 8 : 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(isA5 ? 7 : 8);
    pdf.text("Terms & Conditions:", margin, y);
    pdf.setFont("helvetica", "italic");
    pdf.text(footerMsg, margin, y + 3.5);

    pdf.setFont("helvetica", "normal");
    pdf.text(
      `For ${business?.brand_name || business?.name || "Business"}`,
      rightEdge,
      y,
      { align: "right" }
    );
    pdf.line(rightEdge - 40, y + 12, rightEdge, y + 12);
    pdf.text("Authorized Signatory", rightEdge, y + 15, { align: "right" });

    if (!isWhiteLabel) {
      const bottomY = isA5 ? 202 : 285;
      pdf.setFontSize(6.5);
      pdf.setTextColor(150, 150, 150);
      pdf.text("⚡ Powered by Nexus Creative SaaS Platform", margin, bottomY);
    }

    pdf.save(`${receipt.invoice_number.replace(/\//g, "-")}-${paper}.pdf`);
  }

  function downloadA4Pdf(receipt: Receipt) {
    downloadSheetPdf(receipt, "A4", invoiceType);
  }

  function downloadPdf(
    receipt: Receipt,
    formatOverride?: PaperType | "80mm" | "a4",
    invOverride?: InvoiceType
  ) {
    const activeDocType = invOverride || receipt.invoice_type || invoiceType;
    let targetPaper: PaperType = receipt.paper_type || paperType;
    if (formatOverride) {
      if (formatOverride === "80mm") targetPaper = "THERMAL_80MM";
      else if (formatOverride === "a4") targetPaper = "A4";
      else targetPaper = formatOverride;
    }

    if (targetPaper === "THERMAL_58MM") {
      download58mmPdf(receipt, activeDocType);
    } else if (targetPaper === "A5") {
      downloadSheetPdf(receipt, "A5", activeDocType);
    } else if (targetPaper === "LETTER") {
      downloadSheetPdf(receipt, "LETTER", activeDocType);
    } else if (targetPaper === "A4") {
      downloadSheetPdf(receipt, "A4", activeDocType);
    } else {
      download80mmPdf(receipt, activeDocType);
    }
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
      ? displayProducts
      : displayProducts.filter((p) => p.category_id === selectedCat);

  return (
    <>
      {/* 60+ Business Live Demo Quick-Switcher Banner (Super Admin Only) */}
      {isAdmin && (
        <div
          className="panel no-print"
          style={{
            background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
            border: "1px solid #bfdbfe",
            padding: "12px 18px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>🎭</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <b style={{ color: "#1e40af", fontSize: "15px" }}>60+ Live Business Demo Mode</b>
                <span className="pill" style={{ background: "#2563eb", color: "#fff", fontWeight: 700 }}>
                  {template.name}
                </span>
                <span className="pill" style={{ background: "#f1f5f9", color: "#475569" }}>
                  {template.sector}
                </span>
              </div>
              <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "12px" }}>
                Custom fields: <b>{template.custom_fields.map((f) => f.label).join(", ") || "Standard"}</b> · Prefix: <b>{template.prefix}</b>
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>Switch Business:</span>
              <select
                value={effectiveType}
                onChange={(e) => {
                  setActiveDemoCode(e.target.value);
                  localStorage.setItem("nexus_demo_template", e.target.value);
                }}
                style={{
                  padding: "6px 10px",
                  fontSize: "13px",
                  borderRadius: "8px",
                  border: "1px solid #93c5fd",
                  background: "#ffffff",
                  fontWeight: 600,
                }}
              >
                {Object.values(BUSINESS_TEMPLATES).map((tmpl) => (
                  <option key={tmpl.code} value={tmpl.code}>
                    {tmpl.name} ({tmpl.sector})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="secondary"
              style={{ margin: 0, padding: "6px 12px", fontSize: "12px", fontWeight: 600 }}
              onClick={() => navigate("/demo")}
            >
              Showroom (All 62) →
            </button>
          </div>
        </div>
      )}

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
          <h1>{business?.name || `${template.name} (Live Demo)`}</h1>
          <p className="muted">
            Prefix: {business?.invoice_prefix || template.prefix} · Financial Year Sequence · Isolated Workspace
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
          <div
            className={`modal-content ${
              paperType === "A4" || paperType === "LETTER"
                ? "a4-preview-mode"
                : paperType === "A5"
                ? "a5-preview-mode"
                : ""
            }`}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ margin: 0 }}>🧾 Document Preview</h2>
                <span
                  style={{
                    background: INVOICE_TYPE_CONFIGS[invoiceType].badgeColor + "22",
                    color: INVOICE_TYPE_CONFIGS[invoiceType].badgeColor,
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: `1px solid ${INVOICE_TYPE_CONFIGS[invoiceType].badgeColor}44`,
                  }}
                >
                  {INVOICE_TYPE_CONFIGS[invoiceType].title}
                </span>
              </div>
              <button
                className="secondary"
                style={{ margin: 0, padding: "4px 10px" }}
                onClick={() => setActiveReceipt(null)}
              >
                ✕ Close
              </button>
            </div>

            {/* Document Type & Paper Size Switchers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: "8px",
                marginTop: "12px",
                marginBottom: "12px",
                alignItems: "center",
              }}
            >
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "3px" }}>
                  Document Type:
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => {
                    const newType = e.target.value as InvoiceType;
                    setInvoiceType(newType);
                    localStorage.setItem("nexus_invoice_type", newType);
                  }}
                  style={{
                    padding: "6px 8px",
                    fontSize: "12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    width: "100%",
                    background: "white",
                    fontWeight: 700,
                  }}
                >
                  {(Object.keys(INVOICE_TYPE_CONFIGS) as InvoiceType[]).map((k) => (
                    <option key={k} value={k}>
                      {INVOICE_TYPE_CONFIGS[k].title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "3px" }}>
                  Paper Format:
                </label>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {(["THERMAL_80MM", "THERMAL_58MM", "A4", "A5", "LETTER"] as PaperType[]).map((pt) => {
                    const active = paperType === pt;
                    return (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => {
                          setPaperType(pt);
                          localStorage.setItem("nexus_paper_type", pt);
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          borderRadius: "6px",
                          border: active ? "1px solid #0f172a" : "1px solid #cbd5e1",
                          cursor: "pointer",
                          background: active ? "#0f172a" : "#f8fafc",
                          color: active ? "white" : "#475569",
                          margin: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {PAPER_CONFIGS[pt].shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 1. POS Thermal Receipt Preview (80mm or 58mm Mini) */}
            {PAPER_CONFIGS[paperType].isThermal && (
              <div className={`thermal-receipt ${paperType === "THERMAL_58MM" ? "compact-58mm" : ""}`}>
                <div
                  className="center"
                  style={{
                    fontWeight: 800,
                    fontSize: paperType === "THERMAL_58MM" ? "12px" : "14px",
                    margin: "4px 0 2px 0",
                    color: INVOICE_TYPE_CONFIGS[invoiceType].badgeColor,
                  }}
                >
                  *** {INVOICE_TYPE_CONFIGS[invoiceType].title} ***
                </div>
                {INVOICE_TYPE_CONFIGS[invoiceType].subNotice && (
                  <div
                    className="center"
                    style={{
                      fontSize: paperType === "THERMAL_58MM" ? "9px" : "11px",
                      fontStyle: "italic",
                      color: "#64748b",
                      marginBottom: "6px",
                    }}
                  >
                    {INVOICE_TYPE_CONFIGS[invoiceType].subNotice}
                  </div>
                )}
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
            )}

            {/* 2. Standard Sheet Invoice Preview (A4 / A5 / Letter) */}
            {!PAPER_CONFIGS[paperType].isThermal && (
              <div className="a4-invoice">
                <div className="a4-header">
                  <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                    {(business?.show_logo ?? true) && business?.logo_url && (
                      <img
                        src={business.logo_url}
                        alt={business.brand_name || business.name}
                        style={{ maxHeight: "56px", maxWidth: "160px", objectFit: "contain" }}
                      />
                    )}
                    <div>
                      <div
                        className="a4-brand-name"
                        style={{ color: business?.brand_color || "#0f172a" }}
                      >
                        {business?.brand_name || business?.name || "NEXUS CREATIVE"}
                      </div>
                      <div className="a4-tagline">
                        {template.name} · {template.sector}
                      </div>
                      {(business?.show_contact ?? true) && business?.address && (
                        <div style={{ fontSize: "12px", color: "#475569" }}>{business.address}</div>
                      )}
                      {(business?.show_contact ?? true) && business?.phone && (
                        <div style={{ fontSize: "12px", color: "#475569" }}>Phone: {business.phone}</div>
                      )}
                      {(business?.show_gstin ?? true) && business?.gstin && (
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                          GSTIN: {business.gstin}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="a4-meta-box">
                    <div
                      className="a4-invoice-title"
                      style={{ color: business?.brand_color || "#0f172a" }}
                    >
                      {INVOICE_TYPE_CONFIGS[invoiceType].title}
                    </div>
                    {INVOICE_TYPE_CONFIGS[invoiceType].subNotice && (
                      <div style={{ fontSize: "10px", fontStyle: "italic", color: "#64748b", marginBottom: "4px" }}>
                        {INVOICE_TYPE_CONFIGS[invoiceType].subNotice}
                      </div>
                    )}
                    <div><b>Invoice #:</b> {activeReceipt.invoice_number}</div>
                    <div><b>Date:</b> {activeReceipt.date}</div>
                    <div><b>Order:</b> {activeReceipt.order_type}</div>
                    <div><b>Payment:</b> {activeReceipt.payment_method}</div>
                  </div>
                </div>

                <div className="a4-bill-to-grid">
                  <div>
                    <div style={{ fontWeight: 800, color: "#475569", marginBottom: "4px", textTransform: "uppercase" }}>
                      Billed To
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{activeReceipt.customer_name}</div>
                    {activeReceipt.customer_phone && <div>Phone: {activeReceipt.customer_phone}</div>}
                    {customerState && <div>State Code: {customerState}</div>}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, color: "#475569", marginBottom: "4px", textTransform: "uppercase" }}>
                      Details
                    </div>
                    {activeReceipt.custom_fields &&
                      Object.entries(activeReceipt.custom_fields).map(([k, v]) => {
                        if (!v) return null;
                        const fieldDef = template.custom_fields.find((f) => f.name === k);
                        const lbl = fieldDef?.label || k;
                        return (
                          <div key={k}>
                            <b>{lbl}:</b> {v}
                          </div>
                        );
                      })}
                  </div>
                </div>

                <table className="a4-table">
                  <thead>
                    <tr style={{ background: business?.brand_color || "#0f172a" }}>
                      <th style={{ width: "40px", textAlign: "center" }}>#</th>
                      <th>{template.item_label}</th>
                      <th style={{ width: "90px" }}>HSN/SAC</th>
                      <th style={{ width: "60px", textAlign: "center" }}>Qty</th>
                      <th style={{ width: "100px", textAlign: "right" }}>Rate (₹)</th>
                      <th style={{ width: "110px", textAlign: "right" }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReceipt.items.map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                        <td><b>{it.name}</b></td>
                        <td>{it.hsn || "—"}</td>
                        <td style={{ textAlign: "center" }}>{it.qty}</td>
                        <td style={{ textAlign: "right" }}>₹{it.price.toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>₹{it.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="a4-totals-grid">
                  <div>
                    {activeReceipt.cash_tendered > 0 && (
                      <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px", marginBottom: "12px" }}>
                        <div><b>Cash Tendered:</b> ₹{activeReceipt.cash_tendered.toFixed(2)}</div>
                        <div style={{ color: "#15803d", fontWeight: 700 }}><b>Change Returned:</b> ₹{activeReceipt.change_due.toFixed(2)}</div>
                      </div>
                    )}
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      <b>Terms & Conditions:</b>
                      <p style={{ margin: "2px 0 0 0" }}>{business?.invoice_footer || "Goods once sold cannot be taken back or exchanged. Thank you for your business!"}</p>
                    </div>
                  </div>

                  <div>
                    <table className="a4-totals-table">
                      <tbody>
                        <tr>
                          <td>Subtotal:</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>₹{activeReceipt.subtotal.toFixed(2)}</td>
                        </tr>
                        {activeReceipt.discount > 0 && (
                          <tr style={{ color: "#b91c1c" }}>
                            <td>Discount:</td>
                            <td style={{ textAlign: "right" }}>-₹{activeReceipt.discount.toFixed(2)}</td>
                          </tr>
                        )}
                        {activeReceipt.cgst > 0 && (
                          <tr>
                            <td>CGST:</td>
                            <td style={{ textAlign: "right" }}>₹{activeReceipt.cgst.toFixed(2)}</td>
                          </tr>
                        )}
                        {activeReceipt.sgst > 0 && (
                          <tr>
                            <td>SGST:</td>
                            <td style={{ textAlign: "right" }}>₹{activeReceipt.sgst.toFixed(2)}</td>
                          </tr>
                        )}
                        {activeReceipt.igst > 0 && (
                          <tr>
                            <td>IGST:</td>
                            <td style={{ textAlign: "right" }}>₹{activeReceipt.igst.toFixed(2)}</td>
                          </tr>
                        )}
                        {Math.abs(activeReceipt.round_off) > 0.001 && (
                          <tr>
                            <td>Round Off:</td>
                            <td style={{ textAlign: "right" }}>
                              {activeReceipt.round_off > 0 ? "+" : ""}₹{activeReceipt.round_off.toFixed(2)}
                            </td>
                          </tr>
                        )}
                        <tr className="a4-grand-row">
                          <td><b>GRAND TOTAL:</b></td>
                          <td style={{ textAlign: "right", color: business?.brand_color || "#0f172a" }}>
                            ₹{activeReceipt.total.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="a4-footer-sign">
                  <div>
                    {(business?.show_platform_branding ?? true) &&
                      business?.branding_mode !== "white_label" && (
                        <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                          ⚡ Powered by Nexus Creative SaaS Platform
                        </div>
                      )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "32px" }}>
                      For <b>{business?.brand_name || business?.name || "Business"}</b>
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 700, borderTop: "1px solid #cbd5e1", paddingTop: "4px" }}>
                      Authorized Signatory
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal action buttons */}
            <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
              <button
                className="primary full"
                style={{ background: "#059669", fontSize: "16px" }}
                onClick={() => window.print()}
              >
                🖨️ Print {PAPER_CONFIGS[paperType].shortLabel} ({INVOICE_TYPE_CONFIGS[invoiceType].title})
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
                  📥 Download {PAPER_CONFIGS[paperType].shortLabel} PDF
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
        PAPER_CONFIGS[paperType].isThermal ? (
          <div
            id="printable-receipt"
            className={`${PAPER_CONFIGS[paperType].printClass} thermal-receipt ${
              paperType === "THERMAL_58MM" ? "compact-58mm" : ""
            }`}
          >
            <div
              className="center"
              style={{
                fontWeight: 800,
                fontSize: paperType === "THERMAL_58MM" ? "12px" : "13px",
                marginBottom: "4px",
              }}
            >
              *** {INVOICE_TYPE_CONFIGS[invoiceType].title} ***
            </div>
            {INVOICE_TYPE_CONFIGS[invoiceType].subNotice && (
              <div
                className="center"
                style={{
                  fontSize: paperType === "THERMAL_58MM" ? "8.5px" : "10px",
                  fontStyle: "italic",
                  color: "#475569",
                  marginBottom: "4px",
                }}
              >
                {INVOICE_TYPE_CONFIGS[invoiceType].subNotice}
              </div>
            )}
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
        ) : (
          <div id="printable-receipt" className={`${PAPER_CONFIGS[paperType].printClass} a4-invoice`}>
            <div className="a4-header">
              <div>
                {(business?.show_logo ?? true) && business?.logo_url && (
                  <img
                    src={business.logo_url}
                    alt={business.brand_name || business.name}
                    className="a4-logo"
                  />
                )}
                <div
                  className="a4-brand-name"
                  style={{ color: business?.brand_color || "#1e293b" }}
                >
                  {business?.brand_name || business?.name || "NEXUS CREATIVE"}
                </div>
                <div className="a4-tagline">
                  {template.name} ({template.sector})
                </div>
                {(business?.show_contact ?? true) && business?.address && (
                  <div className="a4-biz-meta">{business.address}</div>
                )}
                {(business?.show_contact ?? true) && business?.phone && (
                  <div className="a4-biz-meta">Phone: {business.phone}</div>
                )}
                {(business?.show_gstin ?? true) && business?.gstin && (
                  <div className="a4-biz-meta"><b>GSTIN:</b> {business.gstin}</div>
                )}
              </div>

              <div className="a4-meta-box">
                <div
                  className="a4-title-pill"
                  style={{
                    color: business?.brand_color || "#2563eb",
                    borderColor: business?.brand_color || "#2563eb",
                  }}
                >
                  {INVOICE_TYPE_CONFIGS[invoiceType].title}
                </div>
                {INVOICE_TYPE_CONFIGS[invoiceType].subNotice && (
                  <div style={{ fontSize: "10px", fontStyle: "italic", color: "#64748b", margin: "2px 0 4px 0" }}>
                    {INVOICE_TYPE_CONFIGS[invoiceType].subNotice}
                  </div>
                )}
                <div><b>Invoice No:</b> {activeReceipt.invoice_number}</div>
                <div><b>Date:</b> {activeReceipt.date}</div>
                <div><b>Order Type:</b> {activeReceipt.order_type}</div>
                <div><b>Payment:</b> {activeReceipt.payment_method}</div>
              </div>
            </div>

            <div className="a4-bill-to-grid">
              <div className="a4-bill-box">
                <span className="a4-bill-label">Billed To ({template.customer_label})</span>
                <div style={{ fontWeight: 700, fontSize: "14px" }}>{activeReceipt.customer_name}</div>
                {activeReceipt.customer_phone && (
                  <div style={{ color: "#475569" }}>Phone: {activeReceipt.customer_phone}</div>
                )}
              </div>
              <div className="a4-bill-box">
                <span className="a4-bill-label">Sector & Order Details</span>
                <div><b>Sector:</b> {template.sector}</div>
                {activeReceipt.custom_fields &&
                  Object.entries(activeReceipt.custom_fields).map(([k, v]) => {
                    if (!v) return null;
                    const fieldDef = template.custom_fields.find((f) => f.name === k);
                    const lbl = fieldDef?.label || k;
                    return (
                      <div key={k}>
                        <b>{lbl}:</b> {v}
                      </div>
                    );
                  })}
              </div>
            </div>

            <table className="a4-table">
              <thead>
                <tr>
                  <th style={{ width: "40px", textAlign: "center" }}>#</th>
                  <th>{template.item_label} Description</th>
                  <th style={{ width: "60px", textAlign: "center" }}>Qty</th>
                  <th style={{ width: "90px", textAlign: "right" }}>Unit Price</th>
                  <th style={{ width: "60px", textAlign: "center" }}>GST %</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {activeReceipt.items.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                    <td><b>{it.name}</b></td>
                    <td style={{ textAlign: "center" }}>{it.qty}</td>
                    <td style={{ textAlign: "right" }}>₹{it.price.toFixed(2)}</td>
                    <td style={{ textAlign: "center" }}>{it.gst_rate}%</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>₹{it.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="a4-totals-grid">
              <div>
                {activeReceipt.cash_tendered > 0 && (
                  <div style={{ marginBottom: "8px", fontSize: "12px", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
                    <div><b>Cash Tendered:</b> ₹{activeReceipt.cash_tendered.toFixed(2)}</div>
                    <div style={{ color: "#15803d", fontWeight: 700 }}><b>Change Returned:</b> ₹{activeReceipt.change_due.toFixed(2)}</div>
                  </div>
                )}
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  <b>Terms & Conditions:</b>
                  <p style={{ margin: "2px 0 0 0" }}>{business?.invoice_footer || "Goods once sold cannot be taken back or exchanged. Thank you for your business!"}</p>
                </div>
              </div>

              <div>
                <table className="a4-totals-table">
                  <tbody>
                    <tr>
                      <td>Subtotal:</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>₹{activeReceipt.subtotal.toFixed(2)}</td>
                    </tr>
                    {activeReceipt.discount > 0 && (
                      <tr style={{ color: "#b91c1c" }}>
                        <td>Discount:</td>
                        <td style={{ textAlign: "right" }}>-₹{activeReceipt.discount.toFixed(2)}</td>
                      </tr>
                    )}
                    {activeReceipt.cgst > 0 && (
                      <tr>
                        <td>CGST:</td>
                        <td style={{ textAlign: "right" }}>₹{activeReceipt.cgst.toFixed(2)}</td>
                      </tr>
                    )}
                    {activeReceipt.sgst > 0 && (
                      <tr>
                        <td>SGST:</td>
                        <td style={{ textAlign: "right" }}>₹{activeReceipt.sgst.toFixed(2)}</td>
                      </tr>
                    )}
                    {activeReceipt.igst > 0 && (
                      <tr>
                        <td>IGST:</td>
                        <td style={{ textAlign: "right" }}>₹{activeReceipt.igst.toFixed(2)}</td>
                      </tr>
                    )}
                    {Math.abs(activeReceipt.round_off) > 0.001 && (
                      <tr>
                        <td>Round Off:</td>
                        <td style={{ textAlign: "right" }}>
                          {activeReceipt.round_off > 0 ? "+" : ""}₹{activeReceipt.round_off.toFixed(2)}
                        </td>
                      </tr>
                    )}
                    <tr className="a4-grand-row">
                      <td><b>GRAND TOTAL:</b></td>
                      <td style={{ textAlign: "right", color: business?.brand_color || "#0f172a" }}>
                        ₹{activeReceipt.total.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="a4-footer-sign">
              <div>
                {(business?.show_platform_branding ?? true) &&
                  business?.branding_mode !== "white_label" && (
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      ⚡ Powered by Nexus Creative SaaS Platform
                    </div>
                  )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "32px" }}>
                  For <b>{business?.brand_name || business?.name || "Business"}</b>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, borderTop: "1px solid #cbd5e1", paddingTop: "4px" }}>
                  Authorized Signatory
                </div>
              </div>
            </div>
          </div>
        )
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
              {displayProducts.map((p) => (
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
                const prod = displayProducts.find((p) => p.id === selectedManualId);
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
                All ({displayProducts.length})
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

          {/* View Mode Switcher Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "6px 0 10px 0",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
              {template.item_label} Catalogue ({displayedProducts.length})
            </span>
            <div className="view-mode-toggle">
              <button
                type="button"
                className={`view-mode-btn ${
                  productView === "horizontal" ? "active" : ""
                }`}
                onClick={() => {
                  setProductView("horizontal");
                  localStorage.setItem("nexus_product_view", "horizontal");
                }}
                title="Horizontal Card Tiles (Name left, Price & Stock right)"
              >
                ▤ Horizontal
              </button>
              <button
                type="button"
                className={`view-mode-btn ${
                  productView === "list" ? "active" : ""
                }`}
                onClick={() => {
                  setProductView("list");
                  localStorage.setItem("nexus_product_view", "list");
                }}
                title="Full-width Horizontal Rows"
              >
                ☰ List
              </button>
              <button
                type="button"
                className={`view-mode-btn ${
                  productView === "grid" ? "active" : ""
                }`}
                onClick={() => {
                  setProductView("grid");
                  localStorage.setItem("nexus_product_view", "grid");
                }}
                title="Square Grid Tiles"
              >
                ▦ Grid
              </button>
            </div>
          </div>

          {/* Product Items Display (Horizontal Cards / List / Grid) */}
          <div
            className={`product-grid ${
              productView === "horizontal"
                ? "horizontal"
                : productView === "list"
                ? "list-view"
                : ""
            }`}
          >
            {displayedProducts.map((p) =>
              productView === "grid" ? (
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
              ) : (
                <button
                  className="product-tile horizontal"
                  key={p.id}
                  onClick={() => addProductToCart(p, 1)}
                  title={`Add ${p.name} - ₹${Number(p.selling_price).toFixed(2)}`}
                >
                  <div className="tile-info">
                    <div className="tile-name">{p.name}</div>
                    <div className="tile-meta">
                      {p.sku && <span>Code: {p.sku}</span>}
                      {p.category_name && (
                        <span className="cat-badge">{p.category_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="tile-pricing">
                    <div className="tile-price">
                      ₹{Number(p.selling_price).toFixed(2)}
                    </div>
                    <div
                      className={`tile-stock ${
                        p.stock_qty < 5 ? "low-stock" : "in-stock"
                      }`}
                    >
                      Stock {p.stock_qty}
                    </div>
                  </div>
                </button>
              )
            )}
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

          {/* Document Type & Print Paper Format Selector */}
          <div
            style={{
              background: "#f1f5f9",
              padding: "8px 10px",
              borderRadius: "8px",
              marginBottom: "10px",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>
                📑 Doc Type:
              </span>
              <select
                value={invoiceType}
                onChange={(e) => {
                  const newType = e.target.value as InvoiceType;
                  setInvoiceType(newType);
                  localStorage.setItem("nexus_invoice_type", newType);
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "white",
                  fontWeight: 700,
                  flex: 1,
                  margin: 0,
                }}
              >
                {(Object.keys(INVOICE_TYPE_CONFIGS) as InvoiceType[]).map((k) => (
                  <option key={k} value={k}>
                    {INVOICE_TYPE_CONFIGS[k].title}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>
                🖨️ Format:
              </span>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
                {(["THERMAL_80MM", "THERMAL_58MM", "A4", "A5", "LETTER"] as PaperType[]).map((pt) => {
                  const active = paperType === pt;
                  return (
                    <button
                      key={pt}
                      type="button"
                      className={`format-toggle-btn ${active ? "active" : ""}`}
                      style={{
                        padding: "3px 8px",
                        fontSize: "11px",
                        borderRadius: "5px",
                        border: active ? "1px solid #2563eb" : "1px solid #cbd5e1",
                        background: active ? "#2563eb" : "#ffffff",
                        color: active ? "#ffffff" : "#475569",
                        fontWeight: 700,
                        cursor: "pointer",
                        margin: 0,
                      }}
                      onClick={() => {
                        setPaperType(pt);
                        localStorage.setItem("nexus_paper_type", pt);
                      }}
                    >
                      {PAPER_CONFIGS[pt].shortLabel}
                    </button>
                  );
                })}
              </div>
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
            {busy
              ? "Processing…"
              : `🖨️ Save & Print ${PAPER_CONFIGS[paperType].shortLabel}`}
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
              {busy ? "Saving…" : `📥 ${PAPER_CONFIGS[paperType].shortLabel} PDF`}
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
