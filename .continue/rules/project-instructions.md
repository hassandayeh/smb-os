- Build a modular web app for SMBs. One app, many companies (“tenants”). Each tenant can have different modules (Inventory, Invoices, etc.). 
- Start local-only (no domain, no online payments). Manual activations now; easy switch to online payments later.

SMB OS — Project Instructions v1.0
Mission
Build a modular web app for SMBs. One app, many companies (“tenants”). Each tenant can have different modules (Inventory, Invoices, etc.). Start local-only (no domain, no online payments). Manual activations now; easy switch to online payments later.

How we work (rules for the assistant):
Plain English. Define any term the first time it appears. Avoid unexplained acronyms.
Short, actionable steps. Provide checklists + where-to-paste paths.
Deliver full files (not fragments) when patching code.
Always include quick “How to test” steps at the end.
Default to local-first solutions; no external services unless requested.
Be practical, direct, and concise. If trade-offs exist, say which one we’re choosing and why.
Assume Windows unless stated; add macOS/Linux notes when needed.

Key terms:
Tenant: a customer company; their data is isolated.
Module: a feature bundle (e.g., Inventory, Invoices, Timesheets).
Entitlement: a rule saying “Tenant X can use Module Y”.
Admin Console: screens only Hassan can access to manage tenants, users, and entitlements.

Architecture (local now, cloud-ready later):
Frontend + Backend: Next.js (App Router, React).
Database: SQLite locally → Postgres later with minimal changes.
ORM: Prisma.
UI: Tailwind + shadcn/ui components.
Auth: email/password (local) → providers later if needed.
Payments: manual (cash/bank); future-ready for Stripe/Paddle without rewrites.

Must-haves (non-negotiable):
Multi-tenant from day one.
Entitlements/feature flags per tenant.
Audit log for critical actions.
Soft delete (where sensible).
Clear error messages and empty states.

Core data (initial tables):
Tenants(id, name, status, activatedUntil, createdAt)
Users(id, tenantId, name, email, passwordHash, role)
Modules(key, name, description)
Entitlements(tenantId, moduleKey, isEnabled, limitsJson)
AuditLog(id, tenantId, actorUserId, action, metaJson, createdAt)

Gatekeeping rule (server-side):
If Entitlements.isEnabled is false/missing → return 403 and hide related UI.

Modules roadmap:
Horizontal (everyone): Products/Services, Customers/Suppliers, Invoices, Payments, Expenses, Inventory, Reports, Audit Log.

Industry packs (add-ons):
Pharmacy (batches, expiry, FEFO, controlled log)
Consulting/Agencies (clients, engagements, timesheets, utilization)
Retail/Restaurant (POS, shifts, recipes/BOM)
Services/Workshops (work orders, parts, technician calendar)
Clinics/Dental (appointments, treatments, lab orders)
Education (courses, enrollments, attendance)
Real Estate (units, leases, rent schedules)
Logistics (shipments, routes, POD, COD)
Legal/Accounting (matters, retainers, disbursements)
Nonprofit (programs, grants, donor reports)

Environment setup (Phase 0 — before any code):
Assistant must provide exact commands and verification each time.
Install: Node.js LTS, Git, VS Code.
Verify: node -v, npm -v, git --version must show versions.
VS Code extensions: ESLint, Prettier, Prisma, Tailwind IntelliSense, Error Lens, SQLite Viewer.

Project scaffold (Phase 0.5):
Create workspace smb-os/ → Next.js app in smb-os/app/.
Add Tailwind + shadcn/ui.
Add Prisma, initialize SQLite (dev.db).
Scripts: db:push, db:studio.
Git init with a first commit.
MVP deliveries (in order)
Auth (local): sign up/in, protected routes, roles (admin vs member).
Tenants: create tenant, set activatedUntil.
Modules registry: seed standard modules.
Entitlements: toggle modules per tenant.
Admin Console: screens for 2–4, with search/sort.
Dashboard shell: shows only enabled modules; blocked routes return 403.
Inventory & Invoices: empty shells with nav; visible only if entitled.
Manual activation flow: extend activatedUntil + notes for cash/wire.
Each delivery comes with: migrations (Prisma), routes/pages, API handlers, UI forms, and a Test checklist (run dev, create tenant, toggle module, verify visibility, etc.).

Payment approach (now vs later):
Now: record payment method (cash/wire) as a note; manual toggle + extend activatedUntil.
Later: add Stripe/Paddle; hook webhooks to auto-toggle/extend—no changes to UI logic.


Naming & keys:
Module keys: lowercase kebab (e.g., inventory, invoices, timesheets).
Tenant subfeatures: module:feature (e.g., inventory:batches).
Environment variables: documented in .env.example.

Multilingual UI (i18n) — Phase-0 Addendum
Goal

Ship a UI where every visible string comes from a translation key, scalable to many languages, with first-class RTL support.
Decisions (simple + future-proof)
Library: next-intl (works cleanly with Next.js App Router).
Message format: ICU (supports plurals, dates, numbers).
Storage: /src/messages/{en,ar,de}.json (add more later).
Key style: dot-notation, lowercase:
nav.dashboard, modules.inventory.title, actions.save, errors.required.
What NOT to translate: database fields, IDs, numeric formats/units in data storage.
Minimal data model (add now)
Tenants: defaultLocale (e.g., "en").
Users: optional localeOverride (falls back to tenant default).
(Derive RTL via a map: rtlLocales = ['ar', 'fa', 'he'].)
App wiring (skeleton the assistant will deliver later)
Locale routing: /[locale]/… with middleware to pick locale (user → tenant → browser).
Provider: top-level IntlProvider wrapping the app.
Helper: t('key') + <T id="key" values={{…}} />.
HTML direction: set <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'}>.
Tailwind RTL: add tailwindcss-rtl plugin so you can use rtl: variants (e.g., rtl:text-right) and logical spacing (ps-, pe- if enabled).
UI rules (to avoid RTL pain)
Prefer flex + gap; avoid hard left/right positioning. Use start/end (or ps- pe- if plugin enabled).
Icons with arrows/chevrons: add rtl:rotate-180 where direction matters.
Don’t bake text into images/SVGs—label via props and translate.
Dates, numbers, currency: format with Intl.DateTimeFormat / Intl.NumberFormat (translation ≠ formatting).

Translation workflow
Source of truth: English (en.json).
New UI string = add a key; never hard-code text.
Missing translations show as ⟨key⟩ or __MISSING__ (assistant will set a clear fallback).
Arabic (RTL) can be filled later without code changes.
Acceptance checklist (Phase-0)
Language switcher exists (temporary in Admin).
Switching to ar flips both text and layout direction (no broken spacing).
All top-nav labels, buttons, page titles render via t('…').
No hard-coded user-visible strings remain in scaffolded pages.