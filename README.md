# Nexus Creative Billing — Shared Multi-Tenant SaaS MVP

A shared cloud billing application for multiple customer businesses. One deployed application and one Supabase database serve all tenants; each business's records are isolated using membership checks and PostgreSQL Row Level Security (RLS).

## Technology
- Frontend: React 18, TypeScript, Vite, React Router, jsPDF
- Backend: Node.js, Express, TypeScript, Zod
- Data/auth: Supabase Auth + PostgreSQL
- Tenant selection: `x-business-id` header, verified against `business_users`
- Security: Supabase user JWT passed to the API and RLS-enabled tenant tables

## Included in this development release
- Email/password registration and login through Supabase Auth
- Multiple business workspaces per user
- 14-day trial, Starter/Growth/Business plan catalogue, customer subscription page and Nexus Super Admin scaffold
- Product catalogue with SKU, barcode, HSN, unit, selling/purchase price, GST rate and opening stock
- Inventory stock adjustment RPC and stock movement history API
- Retail billing with barcode text-scanner input
- Server-side GST invoice creation: product prices and GST rates are read from database; stock is locked and decremented atomically
- Intra-state CGST/SGST split and inter-state IGST split based on business and customer state codes
- Payment recording for UPI, cash, card and bank transfer
- Client-side PDF draft and WhatsApp click-to-chat message
- Sales report and recent invoice list
- Tenant-aware API middleware and database RLS policies

## Project layout
```text
nexus-shared-saas-platform/
├── apps/
│   ├── web/                  # React + Vite frontend
│   │   └── src/
│   │       ├── pages/        # Login, workspace, setup, billing, inventory, reports, subscriptions, admin
│   │       ├── lib/          # Supabase and API clients
│   │       ├── App.tsx
│   │       └── styles.css
│   └── api/                  # Express API
│       └── src/
│           ├── middleware/   # JWT authentication and tenant membership
│           ├── routes.ts
│           └── server.ts
├── supabase/migrations/      # Run in numeric order
├── .env.example
└── package.json
```

## Step-by-step local setup

### 1. Create Supabase project
Create a project at https://supabase.com/dashboard. Keep the project URL and **anon/public key** available. Never put the service-role key in the browser.

### 2. Run database migrations
In Supabase Dashboard → SQL Editor, run these files in order:
1. `supabase/migrations/001_shared_saas_schema.sql`
2. `supabase/migrations/002_subscriptions_platform_admin.sql`
3. `supabase/migrations/003_gst_customers_and_hardening.sql`

### 3. Configure environment files
Create `apps/web/.env.local`:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_API_URL=http://localhost:4000
```
Create `apps/api/.env`:
```env
PORT=4000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
APP_ORIGIN=http://localhost:5173
```

### 4. Install and run
From the project root:
```bash
npm install
npm run dev
```
Open http://localhost:5173. Register an account, create a business workspace, then open Retail Billing, Inventory and Sales Reports.

### 5. Grant Nexus Super Admin (optional)
Register the authorized Nexus Creative administrator account. In Supabase SQL Editor:
```sql
select id, email from auth.users where email = 'YOUR_ADMIN_EMAIL';
insert into public.platform_admins(user_id)
values ('YOUR_AUTH_USER_UUID') on conflict do nothing;
```
Sign out and sign in again, then open Super Admin. Never grant this role to customer accounts.

## API routes
All `/api/tenant/*` routes require a valid Supabase access token and `x-business-id` header. The API verifies membership before executing tenant routes.

| Method | Route | Description |
|---|---|---|
| GET | `/health` | API health |
| GET/POST | `/api/businesses` | List/create workspaces |
| GET | `/api/tenant/retail/products` | List products |
| POST | `/api/tenant/retail/products` | Create product |
| POST | `/api/tenant/retail/invoices` | Create GST invoice and record payment |
| GET | `/api/tenant/retail/reports/sales` | Sales report data |
| GET/POST | `/api/tenant/customers` | Customer records |
| POST | `/api/tenant/inventory/adjust` | Atomic stock adjustment |
| GET | `/api/tenant/inventory/movements` | Stock movement history |
| GET | `/api/tenant/payments` | Payment history |
| GET | `/api/tenant/subscription` | Tenant subscription |
| GET | `/api/platform/overview` | Super Admin overview |

## Important behavior and limits
- The invoice RPC ignores browser-supplied prices/tax totals and recalculates using saved product prices and tax rates. It locks product rows while decrementing stock.
- Customer state code determines place of supply. If omitted, the current SQL defaults to the business state code; enter the buyer state code for accurate inter-state IGST handling.
- Current GST support is a foundation, not a certification of compliance. It does not implement every GST scenario, including tax-inclusive pricing, discounts, cess, reverse charge, exports, credit/debit notes, e-invoice IRN, e-way bills or all invoice-prescription rules. Have a qualified Indian GST professional review the workflow before issuing live invoices.
- PDF is a basic client-side draft. Configure legal business details, invoice footer, tax display, buyer address and printer layout before production.
- Barcode support currently works with USB/Bluetooth keyboard-wedge scanners that type the barcode into the scan field. Camera scanning is not included in this MVP.
- WhatsApp sharing opens a click-to-chat message. Automatic PDF delivery requires WhatsApp Business Platform, template/consent compliance and server-side media delivery.
- UPI is recorded as a payment method/reference; there is no automatic bank settlement or payment gateway verification yet.
- The current customer UI and reports are starter screens. Add invoice detail/reprint, returns, purchase receiving, supplier management, payment reconciliation, advanced date filters, exports and audit-log UI before commercial launch.
- Role-based permissions are not yet fine-grained. The membership middleware proves business membership, but the production release must enforce owner/admin/manager/cashier permissions on each operation.
- Subscription checkout and automatic renewals are not connected. Trial/plan enforcement and Super Admin manual controls are starter functionality. Integrate Razorpay/other provider using signed webhooks before accepting subscription payments.
- Test RLS with at least two unrelated test accounts, including attempts to read/write another tenant's IDs. Perform security review, backup/restore testing, rate limiting, monitoring, MFA, privacy/terms and penetration testing before public launch.

## Deployment outline
- Frontend: Vercel, root directory `apps/web`, build `npm run build`, output `dist`.
- API: Render, root directory `apps/api`, build `npm install && npm run build`, start `npm start`.
- Database/auth: Supabase.
- Set `VITE_API_URL` to the deployed API URL and `APP_ORIGIN` to the deployed frontend origin.
