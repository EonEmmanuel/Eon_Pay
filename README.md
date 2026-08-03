# Investor-Ready Financial Dashboard

EonPay's multi-tenant phone-financing platform is maintained as an npm workspace
with a separate Android device-owner agent.

## Repository structure

- `frontend/` — authenticated React, Vite and Tailwind web application
- `server/` — NestJS API, Drizzle domain model and provider integrations
- `device-agent/` — first-party Android Device Policy Controller

The original interface design is available in
[Figma](https://www.figma.com/design/b6BWLe1qPivvl1BEMOEFk5/Investor-Ready-Financial-Dashboard).

## Local setup

Install the frontend and backend workspace dependencies from the repository root:

```bash
npm install
```

Copy `frontend/.env.example` to `frontend/.env` and
`server/.env.example` to `server/.env`, then replace every placeholder with
the appropriate local or hosted value. Never commit either runtime environment
file. Browser variables prefixed with `VITE_` must never contain a Supabase
secret or service-role key.

Apply the database migrations, validate the two database connections and start
the API:

```bash
npm run db:migrate
npm run db:check
npm run dev:server
```

Start the frontend in another terminal:

```bash
npm run dev
```

Backend setup, least-privilege database-role provisioning, platform bootstrap,
security guarantees and API routes are documented in
[server/README.md](server/README.md).

## Android device agent

Open `device-agent/` as an Android Studio project. Copy the non-SDK entries
from `device-agent/local.properties.example` into the ignored
`device-agent/local.properties`, provide the HTTPS API address, Ed25519 public
key and certificate pins, and build with the Gradle wrapper.

The release keystore, signing passwords, generated APK and deployment-specific
`local.properties` must remain outside version control. Device-agent setup and
provisioning details are documented in
[device-agent/README.md](device-agent/README.md).

## Verification

Run the web and API checks from the repository root:

```bash
npm run typecheck:server
npm run typecheck:frontend
npm run test:server
npm run test:e2e
npm run build:server
npm run build
npm run format:check
```

Run the Android checks from `device-agent/` on Windows:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

Review [SECURITY.md](SECURITY.md) before publishing or deploying the project.
