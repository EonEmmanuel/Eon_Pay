import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const applicationService = readFileSync(
  new URL("../src/applications/applications.service.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../drizzle/0022_link_applications_to_customers.sql", import.meta.url),
  "utf8",
);

test("retailer-assisted applications resolve a canonical customer atomically", () => {
  assert.match(applicationService, /eq\(customers\.phone, input\.applicant\.phone\)/);
  assert.match(applicationService, /\.insert\(customers\)/);
  assert.match(applicationService, /customerId,\s+catalogProductId/);
  assert.match(applicationService, /"customer\.created"/);
});

test("legacy applicant-only applications are linked by tenant and normalized phone", () => {
  assert.match(migration, /INSERT INTO public\.customers/);
  assert.match(migration, /application\.tenant_id/);
  assert.match(migration, /application\.applicant ->> 'phone'/);
  assert.match(migration, /UPDATE public\.financing_applications application/);
  assert.match(migration, /customer_id = customer\.id/);
});
