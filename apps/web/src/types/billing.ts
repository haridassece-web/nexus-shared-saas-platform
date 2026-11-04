// ==============================================================================
// NEXUS CREATIVE BILLING ENGINE - PAPER SIZES & DOCUMENT TYPES
// ==============================================================================

export type PaperType =
  | "A4"
  | "A5"
  | "LETTER"
  | "THERMAL_80MM"
  | "THERMAL_58MM"
  | "CUSTOM";

export type InvoiceType =
  | "TAX_INVOICE"
  | "BILL_OF_SUPPLY"
  | "PROFORMA"
  | "ESTIMATE"
  | "CREDIT_NOTE"
  | "DELIVERY_CHALLAN";

export interface PaperConfig {
  key: PaperType;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm?: number; // undefined for continuous thermal roll
  isThermal: boolean;
  printClass: string;
  modalClass?: string;
}

export const PAPER_CONFIGS: Record<PaperType, PaperConfig> = {
  THERMAL_80MM: {
    key: "THERMAL_80MM",
    label: "80mm POS Roll (3-inch)",
    shortLabel: "80mm Roll",
    widthMm: 80,
    isThermal: true,
    printClass: "print-80mm",
  },
  THERMAL_58MM: {
    key: "THERMAL_58MM",
    label: "58mm Mini Roll (2-inch)",
    shortLabel: "58mm Mini",
    widthMm: 58,
    isThermal: true,
    printClass: "print-58mm",
  },
  A4: {
    key: "A4",
    label: "A4 Standard Sheet (210 × 297 mm)",
    shortLabel: "A4 Sheet",
    widthMm: 210,
    heightMm: 297,
    isThermal: false,
    printClass: "print-a4",
    modalClass: "a4-preview-mode",
  },
  A5: {
    key: "A5",
    label: "A5 Half Sheet (148 × 210 mm)",
    shortLabel: "A5 Sheet",
    widthMm: 148,
    heightMm: 210,
    isThermal: false,
    printClass: "print-a5",
    modalClass: "a5-preview-mode",
  },
  LETTER: {
    key: "LETTER",
    label: "US Letter (8.5 × 11 in)",
    shortLabel: "US Letter",
    widthMm: 215.9,
    heightMm: 279.4,
    isThermal: false,
    printClass: "print-letter",
    modalClass: "a4-preview-mode",
  },
  CUSTOM: {
    key: "CUSTOM",
    label: "Custom Dimensions",
    shortLabel: "Custom",
    widthMm: 80,
    isThermal: true,
    printClass: "print-80mm",
  },
};

export interface InvoiceTypeConfig {
  key: InvoiceType;
  title: string;
  badgeColor: string;
  description: string;
  subNotice?: string;
  taxExemptNotice?: string;
}

export const INVOICE_TYPE_CONFIGS: Record<InvoiceType, InvoiceTypeConfig> = {
  TAX_INVOICE: {
    key: "TAX_INVOICE",
    title: "TAX INVOICE",
    badgeColor: "#2563eb",
    description: "Standard GST Tax Invoice with CGST / SGST / IGST breakdown",
  },
  BILL_OF_SUPPLY: {
    key: "BILL_OF_SUPPLY",
    title: "BILL OF SUPPLY",
    badgeColor: "#059669",
    description: "For Composition Dealers or Exempted goods (No tax charged)",
    taxExemptNotice: "Composition taxable person, not eligible to collect tax on supplies.",
  },
  PROFORMA: {
    key: "PROFORMA",
    title: "PROFORMA INVOICE",
    badgeColor: "#d97706",
    description: "Quotation / Order estimate before actual delivery or payment",
    subNotice: "Proforma Invoice - Valid for 15 Days from date of issue.",
  },
  ESTIMATE: {
    key: "ESTIMATE",
    title: "ESTIMATE / QUOTATION",
    badgeColor: "#7c3aed",
    description: "Cost estimate for customer review. Not a legal tax document.",
    subNotice: "Estimate only - Subject to final confirmation of items and rates.",
  },
  CREDIT_NOTE: {
    key: "CREDIT_NOTE",
    title: "CREDIT NOTE",
    badgeColor: "#dc2626",
    description: "Issued for goods return, discounts, or invoice value adjustment",
    subNotice: "Credit Note - To be adjusted against original invoice reference.",
  },
  DELIVERY_CHALLAN: {
    key: "DELIVERY_CHALLAN",
    title: "DELIVERY CHALLAN",
    badgeColor: "#475569",
    description: "Transportation of goods without supply / job work movement",
    subNotice: "Delivery Challan - Goods transported not for sale / on approval.",
  },
};
