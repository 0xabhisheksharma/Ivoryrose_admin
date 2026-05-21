# PROJECT ADMIN AUDIT REPORT

**Date:** Verification run against current codebase  
**Scope:** Enterprise admin improvements across 12 architecture layers  
**Method:** Read-only analysis; no code modified.

---

## SECTION 1 - Admin Design System

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/presentation/components/admin/AdminCard.tsx`
- `src/presentation/components/admin/AdminTable.tsx` (with HeaderRow, HeaderCell, Body, Row, Cell)
- `src/presentation/components/admin/AdminButton.tsx`
- `src/presentation/components/admin/AdminModal.tsx`
- `src/presentation/components/admin/AdminConfirmDialog.tsx`
- `src/presentation/components/admin/AdminSearch.tsx`
- `src/presentation/components/admin/AdminPagination.tsx`
- `src/presentation/components/admin/AdminBadge.tsx`
- `src/presentation/components/admin/AdminStatCard.tsx`
- `src/presentation/components/admin/AdminDrawer.tsx` (present in folder; not in audit list)

**Findings:**
- All nine expected components exist under `src/presentation/components/admin/`.
- Components use midnight-style theme (e.g. `#0F172A`, `#111827`, `#E5E7EB`, `#D4AF37`, slate borders).
- AdminCard, AdminTable, AdminButton, AdminSearch, AdminPagination, AdminBadge, AdminStatCard are used on admin pages (dashboard, products, gold-rate, settings, sync-logs, bulk-import).
- Gold rate and other confirm flows use `@/presentation/components/ui/ConfirmDialog` and `useConfirmAction` instead of `AdminConfirmDialog`; AdminConfirmDialog exists but is not used in admin routes.
- AdminModal is used only via AdminConfirmDialog; no standalone AdminModal usage found on admin pages.

**Recommended fix:**
- Standardize confirm flows on admin pages to use `AdminConfirmDialog` and admin design tokens for consistency.

---

## SECTION 2 - Admin Layout

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/app/admin/layout.tsx`
- `src/config/admin-navigation.ts`

**Findings:**
- Layout includes: sidebar (`<aside>`), top header (Home link + page title), main content wrapper (`<main className="flex-1 overflow-auto p-6">`).
- Sidebar items: Dashboard, Products, Tags, Rates, Gold Rate, Bulk Import, Sync Logs, Settings - all present and driven by `ADMIN_NAVIGATION`.
- Active state: `pathname === href` or `pathname.startsWith(href + "/")` with `bg-slate-700/60 text-[#D4AF37]`.
- Hover: `hover:bg-slate-700/50 hover:text-[#E5E7EB]` for inactive items.
- Sidebar is collapsible via state `sidebarCollapsed`; width toggles 72px / 256px; toggle button with aria-label.

**Problems found:** None.

**Recommended fix:** None.

---

## SECTION 3 - Dashboard Metrics

**STATUS:** [WARN] Partially implemented

**Files involved:**
- `src/app/admin/page.tsx`
- `src/application/use-cases/dashboard/getDashboardStats.ts`
- `src/app/api/admin/dashboard/route.ts`

**Findings:**
- Summary cards present: Total Products, Total Tags, Total Rate Records, Current Gold Rate (with updated time), Last product update (labeled "Approx. last import").
- Audit expected "Last Import Time": implemented as "Last product update" with helper "Approx. last import"; data is `getLatestProductUpdatedAt()` (last product doc `updatedAt`), not a dedicated import timestamp.
- Data sources: `productsRepo.listProducts()`, `tagsRepo.listTags()`, `ratesRepo.listRates()`, `getGoldRate()`, `productsRepo.getLatestProductUpdatedAt()` - i.e. products collection, tags collection, Rate collection, GoldRate/currentRate.

**Problems found:**
- "Last Import Time" is approximated from last product update; no dedicated import-run timestamp is stored or displayed.

**Recommended fix:**
- If "Last Import Time" must reflect actual import jobs, add an import log or timestamp (e.g. in Firestore or admin_logs) and expose it in dashboard stats.

---

## SECTION 4 - Product Table

**STATUS:** [OK] Implemented correctly (with one caveat)

**Files involved:**
- `src/app/admin/products/page.tsx`
- `src/presentation/components/admin/*` (AdminCard, AdminTable, AdminSearch, AdminPagination, AdminBadge, AdminButton)

**Findings:**
- Product search: `AdminSearch` with client-side filter by productId, name, category, tags (`matchProduct`).
- Pagination: `AdminPagination` with page, pageSize, total, pageSizeOptions (10, 25, 50); client-side slice over sorted/filtered list.
- Sortable columns: ProductId, Category, Tags, Active, UpdatedAt via `sortableHeader` and `compareProducts`.
- Sticky header: `<thead className="sticky top-0 z-10 bg-slate-900/95 shadow-sm">`.
- Loading state: skeleton rows (e.g. `SKELETON_ROWS`) with pulse placeholders.
- Table columns: ProductId, Category, Tags, Active, UpdatedAt, Actions - match audit.

**Problems found:**
- Products list is loaded with a single `GET /api/admin/products` (no cursor/limit params), so only the first page (default 20) is fetched. All search/sort/pagination run client-side on those 20 items; tables with more than 20 products do not show the rest.

**Recommended fix:**
- Either request more pages (e.g. follow `X-Next-Cursor`) or pass `limit` (e.g. 100) when loading the products list so the table can show a larger set, or implement server-driven pagination in the UI.

---

## SECTION 5 - Product Rows

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/infrastructure/repositories/products.repository.ts` (`getProductRows`, `setProductRows`)
- `src/application/use-cases/products/getProduct.ts` (merges product + rows)
- `src/application/use-cases/products/updateProductRows.ts`
- `src/app/api/admin/products/[productId]/route.ts`, `src/app/api/admin/products/[productId]/rows/route.ts`
- `src/app/admin/products/[productId]/page.tsx`

**Findings:**
- Firestore structure: `products/{productId}` and `products/{productId}/rows/{productId}` (rows doc id = productId) - matches audit.
- `getProductRows(productId)` reads from the rows subcollection and returns `{ rows, updatedAt }`.
- `setProductRows(productId, rowsDocId, rows)` writes to the same subcollection; `updateProductRows` use case calls it with `productId, productId, rows`.
- GET product API returns merged product + rows via `getProduct` use case; product edit page shows and edits rows (editable table, PATCH to `/rows`).

**Problems found:** None.

**Recommended fix:** None.

---

## SECTION 6 - Rs_Rate Encryption

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/infrastructure/services/encryption/rate-encryption.ts` - `encryptRsRate()`, `decryptRsRate()`
- `src/application/use-cases/rates/updateRate.ts` (encrypts before update)
- `src/application/use-cases/rates/syncRatesFromSheet.ts` (encrypts on write)
- `src/application/use-cases/rates/listRates.ts`, `src/application/use-cases/rates/getRate.ts` (decrypt for output)
- `src/infrastructure/repositories/rates.repository.ts` (stores/reads raw string; use cases handle encrypt/decrypt)
- `src/app/admin/rates/page.tsx` (displays decrypted Rs_Rate)

**Findings:**
- AES-256-CBC encryption with key from config (`RATE_ENCRYPTION_KEY`); encrypted value stored in Firestore as base64 string in `Rs_Rate`.
- Admin rates UI receives decrypted numeric values via listRates/getRate and shows them.

**Problems found:** None.

**Recommended fix:** None.

---

## SECTION 7 - Gold Rate Management

**STATUS:** [WARN] Partially implemented

**Files involved:**
- `src/app/admin/gold-rate/page.tsx`
- `src/app/api/admin/gold-rate/route.ts`
- `src/application/use-cases/rates/getGoldRate.ts`, `setGoldRate.ts`
- `src/infrastructure/repositories/gold-rate.repository.ts`
- Firestore: `GoldRate/currentRate` (via `GOLD_RATE_DOC_PATH`)

**Findings:**
- View current gold rate: card shows rate, updatedAt, updatedBy.
- Update rate: form with input and confirm dialog; PATCH to `/api/admin/gold-rate`.
- Last updated timestamp: shown in current-rate card and in history table.
- Firestore doc `GoldRate/currentRate` is read/updated by repository.
- History table: UI calls `GET /api/admin/gold-rate/history`; there is no `src/app/api/admin/gold-rate/history/route.ts`, so this endpoint does not exist and history will be empty or error-handled as "No history yet."

**Problems found:**
- Gold rate history API is not implemented; history table has no backend.

**Recommended fix:**
- Add `src/app/api/admin/gold-rate/history/route.ts` that reads from an admin_logs or dedicated gold-rate-history source and returns `{ history: [...] }` (or array) with rate, updatedAt, updatedBy.

---

## SECTION 8 - Activity Logging

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/shared/constants/firestore.ts` - `COLLECTION_ADMIN_LOGS = "admin_logs"`
- `src/infrastructure/repositories/admin-logs.repository.ts` - `createAdminLog(entry)` with adminId, action, collection, documentId?, updatedField?, timestamp (serverTimestamp)
- `src/application/use-cases/admin-logs/logAdminAction.ts` - swallows errors so logging never fails the request
- `src/shared/auth/admin-id.ts` - `getAdminIdFromRequest(request)` (X-Admin-Id header or "unknown")
- API routes: products PATCH, products/rows PATCH, tags POST, tags/[tagId] PATCH/DELETE, rates PATCH, gold-rate PATCH, import-products POST - all call `logAdminAction` after success

**Findings:**
- `admin_logs` collection used; document shape includes adminId, action, collection, documentId (optional), updatedField (optional), timestamp.
- Logged actions: product_updated, rows_updated, tag_created, tag_updated, tag_deleted, rate_updated, gold_rate_updated, import_triggered.

**Problems found:** None.

**Recommended fix:** None.

---

## SECTION 9 - Role-Based Access Architecture

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/domain/auth/permissions.ts`

**Findings:**
- Roles: SuperAdmin, Admin, Editor, Viewer (type and ROLES constant).
- Helpers: `canEditProducts(role)`, `canEditTags(role)`, `canEditRates(role)`, `canRunImport(role)`.
- Permission matrix: SuperAdmin/Admin/Editor can edit products/tags/rates; SuperAdmin/Admin can run import; Viewer has no edit/import.
- No authentication implementation; callers are expected to pass a role when auth is added.

**Problems found:**
- Permission helpers are not used in any API route yet; no 403 checks based on role.

**Recommended fix:**
- When adding auth, resolve role from session/header and call the permission helpers in each admin API route; return 403 when not allowed.

---

## SECTION 10 - Firestore Query Performance

**STATUS:** [WARN] Partially implemented

**Files involved:**
- `src/infrastructure/repositories/products.repository.ts` - `listProducts()` full get; `listProductsPaginated({ limit, cursor })` with orderBy("updatedAt","desc"), orderBy(FieldPath.documentId()), limit(limit+1), startAfter for cursor
- `src/app/api/admin/products/route.ts` - uses listProductsPaginated with limit/cursor; response body is array, X-Next-Cursor header when more
- `src/application/use-cases/dashboard/getDashboardStats.ts` - uses listProducts(), listTags(), listRates() (full collection reads)
- `src/infrastructure/repositories/tags.repository.ts` - listTags() does full `.get()`
- `src/infrastructure/repositories/rates.repository.ts` - listRates() does full `.get()`
- `src/infrastructure/repositories/gold-rate.repository.ts` - getLatestProductUpdatedAt uses orderBy + limit(1)

**Findings:**
- Product list API uses cursor-based pagination with limit and orderBy(updatedAt); full collection read avoided for that API.
- Dashboard and any other callers still use listProducts(), listTags(), listRates() with no limit; large collections are read in full for dashboard counts.

**Problems found:**
- Dashboard triggers full reads of products, tags, and Rate for counts; no pagination or aggregation for those collections.
- Admin products page does not use cursor pagination (it fetches once without cursor and only gets first page).

**Recommended fix:**
- For dashboard: consider Firestore aggregation/count or a stored "total" doc updated on writes so dashboard does not need full listProducts/listTags/listRates.
- For admin products UI: either request multiple pages using X-Next-Cursor or a higher limit so the table can show more than the first page.

---

## SECTION 11 - Admin Navigation Config

**STATUS:** [OK] Implemented correctly

**Files involved:**
- `src/config/admin-navigation.ts` - `ADMIN_NAVIGATION` array with href, label, icon key
- `src/app/admin/layout.tsx` - imports ADMIN_NAVIGATION, maps over it for sidebar links, uses NAV_ICONS[iconKey] for icons

**Findings:**
- All eight items defined: Dashboard, Products, Tags, Rates, Gold Rate, Bulk Import, Sync Logs, Settings.
- Sidebar is dynamically generated from this config; adding or reordering entries only requires editing the config.

**Problems found:** None.

**Recommended fix:** None.

---

## SECTION 12 - Bulk Import Architecture

**STATUS:** [WARN] Partially implemented

**Files involved:**
- `src/infrastructure/importers/product-importer.ts` 
- `src/application/use-cases/products/runProductImport.ts` - imports and invokes the infrastructure importer
- `src/app/api/import-products/route.ts` - POST calls runProductImport

**Findings:**
- Import logic lives in a single file `src/infrastructure/importers/product-importer.ts` (~770 lines): config, Firebase init, Google Auth, path helpers, product-id/style parsing, category detection, stone summary, Drive listing, Excel parsing, image handling, Firestore writes. Single entry point runs the full pipeline.
- Code is modular in sections but not split into separate importer services yet.

**Problems found:**
- Monolithic file; no separate services for drive, excel-parser, product-builder, image-upload, import-runner. Importer still owns some duplicated config (e.g. Firebase credential) relative to `src/config` and `src/infrastructure/firebase/admin`.

**Recommended fix:**
- Split into services under e.g. `src/infrastructure/services/import/`: drive.service.ts, excel-parser.service.ts, product-builder.service.ts, image-upload.service.ts, import-runner.ts; reuse `src/config` and `src/infrastructure/firebase/admin` to avoid duplication and improve testability.

---

## SCORES

| Dimension              | Score (1-10) | Notes |
|------------------------|-------------|--------|
| **Overall architecture** | 7.5         | Strong admin UI, logging, permissions, and navigation; dashboard and products still rely on full reads and some UI/API gaps (history, product list pagination). |
| **Scalability**        | 6.5         | Product list API is paginated; dashboard and tags/rates still full-read; bulk import is a single large module. |
| **Security**           | 6           | Rs_Rate encrypted; admin_logs and X-Admin-Id in place; no auth or permission checks on routes yet. |

---

## NEXT 3 IMPROVEMENTS FOR PRODUCTION READINESS

1. **Authentication and permission enforcement**  
   Implement auth (e.g. session or JWT), resolve role per request, and call `canEditProducts`, `canEditTags`, `canEditRates`, `canRunImport` in the corresponding admin API routes; return 403 when the role is not allowed. Remove or restrict reliance on optional `X-Admin-Id` once identity comes from auth.

2. **Gold rate history and dashboard "Last Import"**  
   Add `GET /api/admin/gold-rate/history` (e.g. from admin_logs or a dedicated collection) so the gold rate history table is backed by real data. Optionally add a dedicated "Last import time" (or last run timestamp) for bulk import and show it on the dashboard instead of approximating from last product update.

3. **Dashboard and products scalability**  
   Avoid full collection reads for dashboard: use Firestore count/aggregation or maintained totals. For the admin products page, either use cursor-based pagination (follow `X-Next-Cursor` and request next page) or request a larger initial limit so the table can show more than the first 20 products.
