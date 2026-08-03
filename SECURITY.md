# Security notes

## Dependency audit exception

`npm audit --omit=dev` reports
[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
for React Router 7.18.0. The advisory affects React Server Components action
request handling. This repository ships a static Vite single-page application
using `createHashRouter`; it has no RSC runtime, server actions, framework
action endpoints, SSR, or React Router server request handler, so the affected
execution path is absent.

React Router 7.18.0 is intentionally retained because older 7.x versions carry
client-side navigation and redirect advisories that are relevant to this
application. React Router 8.3.0 clears the audit advisory but requires React
19.2.7; that major framework upgrade should be performed and regression-tested
as a separate change.

Re-evaluate this exception if the frontend adopts SSR, RSC, React Router
framework mode, action routes, or user-controlled redirect destinations.

## Reporting and operations

- Do not commit `.env` files, provider secrets, database URLs, private
  documents, or Supabase Storage S3 credentials.
- Rotate a provider secret immediately if a signed webhook is accepted from an
  unknown source.
- Verify the relevant tenant or platform audit chain after privileged operational changes.
- Keep platform staff MFA enabled and preserve at least two active platform owners before planned owner-account maintenance.
- Apply migrations with the owner connection, then run the API with only the
  dedicated runtime login.
