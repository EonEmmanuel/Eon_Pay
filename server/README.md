# Investor-Ready API server

NestJS API for the financing platform. It uses Drizzle ORM, Supabase
PostgreSQL, Supabase Auth JWTs, permission-based RBAC, PostgreSQL row-level
security, immutable schedules and journals, and double-entry accounting.

## Security boundaries

- The frontend authenticates with Supabase Auth and sends its access token as
  `Authorization: Bearer <token>`.
- The API verifies asymmetric Supabase JWTs with the project's JWKS endpoint.
  It never accepts a tenant or application role from JWT custom metadata.
- Tenant endpoints require `X-Tenant-Id`. The value is an untrusted selector:
  active membership and permissions are resolved from PostgreSQL.
- Every business transaction executes as `app_runtime` with transaction-local
  `app.user_id` and `app.tenant_id` settings.
- RLS is both enabled and forced on every application table. Business foreign
  keys contain `tenant_id`, and tenant IDs cannot be updated.
- The runtime role has no `DELETE`, `TRUNCATE`, `TRIGGER`, `REFERENCES`,
  superuser, or `BYPASSRLS` capability.
- Installments, allocations, journal entries, journal lines, reconciliation
  evidence, provider-event evidence, and audit events are immutable.
  Corrections are explicit reversal entries.
- Audit events form a per-tenant SHA-256 hash chain that can be verified
  through the authorized API.
- Platform-owner, operations, compliance, finance, support, and auditor roles
  have separate permissions. Staff invitations, role changes, access-state
  changes, and self/last-owner lockout protections are enforced in PostgreSQL.
- When `requireStaffMfa` is enabled, every platform route except access
  discovery requires a Supabase JWT at authenticator assurance level `aal2`.
- Platform administration events use their own hash chain and platform-only
  endpoints; platform audit access never opens a tenant audit chain.
- Provider webhooks resolve a tenant from an existing provider reference
  inside PostgreSQL while running as the narrow `app_provider` role. They
  cannot select an arbitrary tenant.
- Payment, settlement, reversal, fee assessment, and waiver commands are
  idempotent and atomic.
- Deferred database constraints enforce full payment allocation and prevent
  concurrent over-allocation of installments, fees, and down payments.

The Supabase `service_role` key is not used by this server.
Retailer and staff invitations use Supabase passwordless email with the public
publishable key; invitation acceptance is authorized by the verified JWT email.

## Local configuration

From the repository root:

```bash
copy server\.env.example server\.env
npm install
```

Set these server environment values:

- `DATABASE_URL`: a dedicated runtime PostgreSQL login that inherits
  `app_runtime`. Use the Direct endpoint for a persistent IPv6-capable host, or
  the Supavisor Session endpoint on port `5432` for an IPv4-only host.
- `DATABASE_MIGRATION_URL`: the Supabase owner/direct connection used only by
  migrations.
- `SUPABASE_URL`: `https://<project-ref>.supabase.co`.
- `SUPABASE_JWT_AUDIENCE`: normally `authenticated`.
- `CORS_ORIGINS`: comma-separated exact frontend origins.

Provider integrations are optional as groups, but partial credential groups
are rejected during startup:

- Supabase invitation email: `SUPABASE_PUBLISHABLE_KEY` and
  `SUPABASE_INVITE_REDIRECT_URL`. Add the redirect URL to the Supabase Auth
  redirect allow list.
- Supabase Storage S3:
  `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_REGION`,
  `SUPABASE_STORAGE_ACCESS_KEY_ID`, and
  `SUPABASE_STORAGE_SECRET_ACCESS_KEY`. Keep `SUPABASE_STORAGE_BUCKET`
  private for customer documents. Create `SUPABASE_PRODUCT_IMAGE_BUCKET` as a
  public bucket for non-sensitive catalog images; uploads still require
  tenant-authorized, short-lived signed URLs.
- Didit KYC: `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, and
  `DIDIT_WEBHOOK_SECRET`; `DIDIT_CALLBACK_URL` is optional.
- Didit retailer KYB: add `DIDIT_KYB_WORKFLOW_ID`; use
  `DIDIT_KYB_CALLBACK_URL` for the retailer return route. Configure the signed
  webhook destination separately. For localhost testing only, set
  `DIDIT_KYB_POLLING_FALLBACK_ENABLED=true`; production rejects this setting
  and remains webhook-only.
  webhook destination as `/api/v1/webhooks/kyb/didit`.
- Esper MDM: `ESPER_TENANT_NAME`, `ESPER_API_KEY`, and
  `ESPER_ENTERPRISE_ID`.
- Payment ingress: configure the secret for every enabled webhook route with
  `MTN_MOMO_WEBHOOK_SECRET` and/or `ORANGE_MONEY_WEBHOOK_SECRET`.

The API fails closed with `503` when an optional provider-backed operation is
called without its credentials.

Use Supabase asymmetric JWT signing keys (ES256 or RS256). Legacy shared
`HS256` secrets are deliberately not accepted by the API.

## Provision Supabase

1. Create a Supabase project and select asymmetric JWT signing keys.
2. Put the owner connection in `DATABASE_MIGRATION_URL`.
3. Apply the schema and security migrations:

   ```bash
   npm run db:migrate
   ```

   In Supabase Storage, create a private `private-documents` bucket and a public
   `product-images` bucket. Limit product images to 5 MB and allow only JPEG, PNG,
   and WebP. Keep the environment bucket names aligned if you use different names.

4. Provision the runtime login using `psql` and the owner connection. The
   script prompts for the password without putting it in the command:

   ```bash
   psql "$env:DATABASE_MIGRATION_URL" `
     -v runtime_user=app_runtime_login `
     -f server\scripts\provision-runtime-role.sql
   ```

5. Put that login's Direct or Supavisor Session URL in `DATABASE_URL`. Do not use
   the Supabase transaction pooler because request context must remain bound to
   one database transaction.
6. Verify that PostgreSQL uses TLS, the runtime login cannot bypass RLS, and
   Supabase exposes asymmetric Auth signing keys:

   ```bash
   npm run db:check
   ```

7. Sign up the first platform owner through Supabase Auth.
8. Bootstrap that existing Auth user once through the owner connection:

   ```bash
   psql "$env:DATABASE_MIGRATION_URL" `
     -v user_id="<auth-user-uuid>" `
     -f server\scripts\bootstrap-platform-owner.sql
   ```

The bootstrap script is intentionally not an HTTP endpoint.

## Run and verify

```bash
npm run dev:server
npm run typecheck:server
npm run test:server
npm run build:server
npm run test:e2e
```

The API listens on port `3001` by default.

- Readiness: `GET /api/v1/health/ready`
- Liveness: `GET /api/v1/health/live`
- OpenAPI UI: `/api/docs`

Disable OpenAPI in production with `API_DOCS_ENABLED=false`.

## API groups

All tenant endpoints require a bearer token and `X-Tenant-Id`.

- `GET /api/v1/auth/me`
- `/api/v1/auth/platform-invitations` and
  `/api/v1/auth/platform-invitations/:id/accept`
- `/api/v1/platform/users`, `/api/v1/platform/roles`, and
  `/api/v1/platform/invitations`
- `/api/v1/platform/audit-events` and
  `/api/v1/platform/audit-events/verify`
- `/api/v1/platform/tenants`
- `/api/v1/branches`
- `/api/v1/customers`
- `/api/v1/memberships` and `/api/v1/roles`
- `/api/v1/applications`
- `/api/v1/contracts` and `/api/v1/contracts/:id/installments`
- `/api/v1/payments`
- `/api/v1/reconciliation/runs`
- Public signed payment ingress at `/api/v1/webhooks/payments/:provider`
- `/api/v1/fees`
- `/api/v1/ledger/accounts` and `/api/v1/ledger/entries`
- `/api/v1/audit-events` and `/api/v1/audit-events/verify`
- `/api/v1/documents`
- `/api/v1/applications/:id/kyc/session`
- Public signed Didit ingress at `/api/v1/webhooks/kyc/didit`
- `/api/v1/devices`
- Customer-scoped `/api/v1/me/contracts`, `/api/v1/me/payments`, and
  `/api/v1/me/fees`
- Customer-scoped `/api/v1/me/applications`, `/api/v1/me/branches`, and
  `/api/v1/me/profile`

Every POST that records or posts money requires an `Idempotency-Key` header.
There is no generic journal-posting endpoint.

## Database migrations

The baseline generated structural schema is in
`drizzle/0000_tan_magdalene.sql`, with reviewed RLS in
`drizzle/0001_security_and_rls.sql`. Provider and operational tables are in
`drizzle/0002_shallow_killmonger.sql`; the reviewed provider-role, hash-chain,
immutability, allocation, cross-entity, and RLS protections are in
`drizzle/0003_operational_integrity.sql`.

Generate a structural migration after changing `src/database/schema.ts`:

```bash
npm run db:generate
```

Review every generated migration before applying it. In particular, a schema
change must not omit `tenant_id`, tenant-inclusive foreign keys, RLS, or
immutability protections.

## Production notes

- Store both database URLs and runtime passwords in the deployment secret
  manager.
- Keep the migration URL out of the running API environment when migrations
  are not running.
- Use an exact HTTPS `CORS_ORIGINS` allow-list and `TRUST_PROXY=true` only
  behind a trusted single reverse proxy.
- Keep database and API logs free of JWTs, passwords, national identity
  documents, and payment-provider secrets.
- Configure Didit and payment-provider webhook endpoints only over HTTPS.
- Keep the customer-document bucket private. Only the non-sensitive product-image
  bucket is public; its writes still use short-lived, tenant-prefixed signed URLs
  after authorization.
- Treat an Esper wipe command as irreversible and reserve the permission for
  a tightly controlled operational role.
- Run the test suite and a real PostgreSQL tenant-isolation integration suite
  against a disposable Supabase branch before every production migration.
