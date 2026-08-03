import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { Server } from "node:http";
import { startStaticServer, stopStaticServer } from "./static-server";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const contractId = "44444444-4444-4444-8444-444444444444";
const branchId = "77777777-7777-4777-8777-777777777777";
const productId = "abababab-abab-4bab-8bab-abababababab";
const inventoryUnitId = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const installmentId = "dededede-dede-4ded-8ded-dededededede";
const staffMembershipId = "12121212-1212-4121-8121-121212121212";
let staticServer: Server;

function tokenPart(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessToken(): string {
  return `${tokenPart({ alg: "HS256", typ: "JWT" })}.${tokenPart({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1_000) + 3_600,
    sub: userId,
    email: "owner@example.com",
    role: "authenticated",
  })}.test-signature`;
}

const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:4175",
  "access-control-allow-headers":
    "authorization,apikey,content-type,x-client-info,x-tenant-id,idempotency-key",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

test.beforeAll(async () => {
  staticServer = await startStaticServer(4175);
});

test.afterAll(async () => {
  await stopStaticServer(staticServer);
});

async function json(route: Route, value: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify(value),
  });
}

async function installAuthMock(page: Page) {
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await json(route, {
      access_token: accessToken(),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1_000) + 3_600,
      refresh_token: "test-refresh-token",
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "owner@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    });
  });
}

async function installApiMock(page: Page) {
  const payments = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      customerId,
      contractId,
      amount: 25_000,
      channel: "cash",
      status: "settled",
      externalReference: null,
      createdAt: new Date().toISOString(),
    },
  ];
  const retailerBranches = [
    {
      id: branchId,
      tenantId,
      code: "MAIN",
      name: "Main branch",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const staffRoles = [
    {
      id: "00000000-0000-4000-8000-000000000101",
      key: "tenant_owner",
      name: "Retailer owner",
      system: true,
      permissions: ["tenant.owners.manage", "memberships.manage"],
      accessPolicy: "tenant_wide" as const,
      requiresOwnerAuthority: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      key: "underwriter",
      name: "Underwriter",
      system: true,
      permissions: ["applications.review"],
      accessPolicy: "flexible" as const,
      requiresOwnerAuthority: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000106",
      key: "cashier",
      name: "Cashier",
      system: true,
      permissions: ["payments.create"],
      accessPolicy: "branch_required" as const,
      requiresOwnerAuthority: false,
    },
  ];
  const staffMembers = [
    {
      id: staffMembershipId,
      userId: "13131313-1313-4131-8131-131313131313",
      email: "underwriter@example.com",
      displayName: "Credit Underwriter",
      status: "active",
      allBranches: true,
      createdAt: new Date().toISOString(),
      isCurrentUser: false,
      roles: [
        {
          id: staffRoles[1]!.id,
          key: staffRoles[1]!.key,
          name: staffRoles[1]!.name,
        },
      ],
      branches: [] as Array<(typeof retailerBranches)[number]>,
    },
  ];
  const staffInvitations: Array<Record<string, unknown>> = [];
  const businessProfile: {
    tenantId: string;
    tenantName: string;
    onboardingStatus: string;
    profile: Record<string, unknown> | null;
  } = {
    tenantId,
    tenantName: "Test Retailer",
    onboardingStatus: "business_profile_required",
    profile: null,
  };
  await page.route("http://127.0.0.1:3001/api/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/memberships")) {
      await json(route, [
        {
          id: "66666666-6666-4666-8666-666666666666",
          tenantId,
          status: "active",
          tenantName: "Test Retailer",
          tenantSlug: "test-retailer",
        },
      ]);
      return;
    }
    if (path.endsWith("/auth/tenant-access")) {
      await json(route, {
        allowed: true,
        permissions: [
          "tenant.manage",
          "branches.read",
          "branches.manage",
          "memberships.read",
          "memberships.manage",
          "tenant.owners.manage",
          "customers.read",
          "applications.read",
          "applications.create",
          "contracts.read",
          "installments.read",
          "payments.read",
          "payments.record",
          "payments.settle",
          "payments.reconcile",
          "inventory.read",
          "inventory.manage",
          "contracts.create",
          "contracts.activate",
          "contracts.transition",
          "kyc.manage",
          "devices.read",
          "devices.manage",
          "audit.read",
        ],
      });
      return;
    }
    if (path.endsWith("/auth/platform-access")) {
      await json(route, {
        allowed: false,
        permissions: [],
        mfaRequired: false,
        mfaSatisfied: true,
      });
      return;
    }
    if (path.endsWith("/platform/system-health")) {
      await json(route, {
        checkedAt: new Date().toISOString(),
        services: [
          {
            name: "API",
            status: "operational",
            detail: "NestJS application",
          },
          {
            name: "PostgreSQL",
            status: "operational",
            detail: "3 ms health query",
          },
          {
            name: "Didit KYC",
            status: "not_configured",
            detail: "KYC and KYB verification sessions",
          },
        ],
      });
      return;
    }
    if (path.endsWith("/notifications/preferences")) {
      await json(route, {
        userId,
        soundEnabled: false,
        soundMinimumSeverity: "warning",
        emailEnabled: false,
        emailMinimumSeverity: "critical",
        quietHoursStart: null,
        quietHoursEnd: null,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (path.endsWith("/notifications")) {
      await json(route, { items: [], unreadCount: 0 });
      return;
    }
    if (path.endsWith("/business-profile")) {
      if (request.method() === "PUT") {
        const input = request.postDataJSON() as Record<string, unknown>;
        businessProfile.onboardingStatus = "kyb_required";
        businessProfile.profile = {
          tenantId,
          ...input,
          updatedBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      await json(route, businessProfile);
      return;
    }
    if (path.endsWith("/platform/analytics")) {
      await json(route, {
        generatedAt: new Date().toISOString(),
        summary: {
          tenants: 1,
          activeTenants: 1,
          archivedTenants: 0,
          customers: 4,
          contracts: 3,
          activeContracts: 1,
          overdueContracts: 1,
          writtenOffContracts: 1,
          writtenOffBalance: 50_000,
          financedVolume: 500_000,
          collectedVolume: 300_000,
          pendingApplications: 1,
          managedDevices: 2,
          restrictedDevices: 1,
        },
        tenants: [],
        monthly: [],
      });
      return;
    }
    if (path.endsWith("/inventory/products")) {
      await json(route, [
        {
          id: productId,
          tenantId,
          sku: "SAMSUNG-A55-128-BLK",
          brand: "Samsung",
          model: "A55",
          storage: "128 GB",
          color: "Black",
          cashPrice: 250_000,
          imagePath: "tenant/catalog/product/phone.webp",
          imageUrl:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%2310b981'/%3E%3C/svg%3E",
          active: true,
          version: 1,
          availableUnits: 1,
        },
      ]);
      return;
    }
    if (path.endsWith("/inventory/units")) {
      await json(route, [
        {
          id: inventoryUnitId,
          tenantId,
          branchId,
          catalogProductId: productId,
          imei: "356938035643809",
          serialNumber: "A55-TEST-001",
          status: "available",
          version: 1,
          product: {
            id: productId,
            sku: "SAMSUNG-A55-128-BLK",
            brand: "Samsung",
            model: "A55",
            storage: "128 GB",
            color: "Black",
            cashPrice: 250_000,
            imagePath: "tenant/catalog/product/phone.webp",
            imageUrl:
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%2310b981'/%3E%3C/svg%3E",
            active: true,
            version: 1,
            availableUnits: 0,
          },
          branch: { id: branchId, name: "Main branch" },
        },
      ]);
      return;
    }
    if (path.endsWith("/branches")) {
      if (request.method() === "POST") {
        const input = request.postDataJSON() as { code: string; name: string };
        const branch = {
          id: "14141414-1414-4141-8141-141414141414",
          tenantId,
          code: input.code,
          name: input.name,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        retailerBranches.push(branch);
        await json(route, branch);
        return;
      }
      await json(route, retailerBranches);
      return;
    }
    if (/\/branches\/[0-9a-f-]+$/.test(path) && request.method() === "PATCH") {
      const id = path.split("/").at(-1);
      const branch = retailerBranches.find((candidate) => candidate.id === id)!;
      Object.assign(branch, request.postDataJSON(), {
        updatedAt: new Date().toISOString(),
      });
      await json(route, branch);
      return;
    }
    if (path.endsWith("/roles")) {
      await json(route, staffRoles);
      return;
    }
    if (path.endsWith("/memberships")) {
      await json(route, staffMembers);
      return;
    }
    if (path.endsWith("/membership-invitations")) {
      if (request.method() === "POST") {
        const input = request.postDataJSON() as {
          email: string;
          fullName: string;
          roleId: string;
          allBranches: boolean;
          branchIds: string[];
        };
        expect(input).toMatchObject({
          roleId: staffRoles[2]!.id,
          allBranches: false,
          branchIds: [branchId],
        });
        const role = staffRoles.find((candidate) => candidate.id === input.roleId)!;
        const invitation = {
          id: "15151515-1515-4151-8151-151515151515",
          ...input,
          roleKey: role.key,
          roleName: role.name,
          status: "pending",
          deliveryStatus: "sent",
          deliveryError: null,
          requiresPasswordSetup: true,
          sentAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          acceptedAt: null,
          createdAt: new Date().toISOString(),
          branches: retailerBranches.filter((branch) =>
            input.branchIds.includes(branch.id),
          ),
        };
        staffInvitations.push(invitation);
        await json(route, invitation);
        return;
      }
      await json(route, staffInvitations);
      return;
    }
    if (/\/membership-invitations\/[0-9a-f-]+\/(resend|revoke)$/.test(path)) {
      const action = path.split("/").at(-1);
      const invitationId = path.split("/").at(-2);
      const invitation = staffInvitations.find(
        (candidate) => candidate.id === invitationId,
      )!;
      if (action === "revoke") invitation.status = "revoked";
      await json(route, invitation);
      return;
    }
    if (/\/memberships\/[0-9a-f-]+\/access$/.test(path)) {
      const membershipId = path.split("/").at(-2);
      const member = staffMembers.find((candidate) => candidate.id === membershipId)!;
      const input = request.postDataJSON() as {
        allBranches: boolean;
        branchIds: string[];
      };
      member.allBranches = input.allBranches;
      member.branches = retailerBranches.filter((branch) =>
        input.branchIds.includes(branch.id),
      );
      await json(route, { membershipId, ...input });
      return;
    }
    if (/\/memberships\/[0-9a-f-]+\/roles\/[0-9a-f-]+$/.test(path)) {
      const parts = path.split("/");
      const membershipId = parts.at(-3);
      const roleId = parts.at(-1);
      const member = staffMembers.find((candidate) => candidate.id === membershipId)!;
      member.roles = member.roles.filter((role) => role.id !== roleId);
      await json(route, { membershipId, roleId, revoked: true });
      return;
    }
    if (/\/memberships\/[0-9a-f-]+\/roles$/.test(path)) {
      const membershipId = path.split("/").at(-2);
      const member = staffMembers.find((candidate) => candidate.id === membershipId)!;
      const input = request.postDataJSON() as { roleId: string };
      const role = staffRoles.find((candidate) => candidate.id === input.roleId)!;
      member.roles.push({ id: role.id, key: role.key, name: role.name });
      await json(route, { membershipId, roleId: input.roleId });
      return;
    }
    if (/\/memberships\/[0-9a-f-]+$/.test(path) && request.method() === "PATCH") {
      const membershipId = path.split("/").at(-1);
      const member = staffMembers.find((candidate) => candidate.id === membershipId)!;
      const input = request.postDataJSON() as {
        status: "active" | "suspended" | "revoked";
      };
      member.status = input.status;
      await json(route, member);
      return;
    }
    if (path.endsWith("/customers")) {
      await json(route, [{ id: customerId, fullName: "Ada Customer" }]);
      return;
    }
    if (path.endsWith(`/contracts/${contractId}/installments`)) {
      await json(route, [
        {
          id: installmentId,
          tenantId,
          contractId,
          sequence: 1,
          dueDate: "2026-08-31",
          principalDue: 250_000,
          financeChargeDue: 0,
          principalPaid: 0,
          financeChargePaid: 0,
        },
      ]);
      return;
    }
    if (path.endsWith("/contracts")) {
      await json(route, [{ id: contractId, customerId, status: "active" }]);
      return;
    }
    if (path.endsWith("/applications")) {
      if (request.method() === "POST") {
        const input = request.postDataJSON() as Record<string, unknown>;
        expect(input).toMatchObject({
          branchId,
          catalogProductId: productId,
        });
        expect(input).not.toHaveProperty("device");
        await json(route, { id: "88888888-8888-4888-8888-888888888888" });
        return;
      }
      await json(route, [
        {
          id: "88888888-8888-4888-8888-888888888888",
          applicant: { fullName: "Ada Customer" },
          device: { deviceId: productId, brand: "Samsung", model: "A55" },
          requestedTerms: {
            deviceCashPrice: { minorUnits: 250_000 },
            proposedDownPayment: { minorUnits: 50_000 },
            requestedInstallmentCount: 6,
            requestedRepaymentFrequency: "monthly",
          },
          status: "submitted",
          submittedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }
    if (/\/applications\/[0-9a-f-]+\/submit$/.test(path)) {
      await json(route, { status: "submitted" });
      return;
    }
    if (path.endsWith("/payments") && request.method() === "GET") {
      await json(route, payments);
      return;
    }
    if (path.endsWith("/payments") && request.method() === "POST") {
      await json(route, {
        ...payments[0],
        id: "99999999-9999-4999-8999-999999999999",
        status: "initiated",
      });
      return;
    }
    if (path.endsWith("/settle") && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({
        allocations: [{ targetType: "installment_principal", installmentId }],
      });
      await json(route, {
        ...payments[0],
        id: "99999999-9999-4999-8999-999999999999",
      });
      return;
    }
    await json(route, { message: `Unhandled test route ${path}` }, 404);
  });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.beforeEach(async ({ page }) => {
  await installAuthMock(page);
  await installApiMock(page);
});

test("login and application queue meet critical accessibility rules", async ({
  page,
}) => {
  test.slow();
  await page.goto("/login");
  const loginResults = await new AxeBuilder({ page }).analyze();
  expect(
    loginResults.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  await signIn(page);
  await page.goto("/applications");
  await expect(
    page.getByRole("heading", { name: "Financing Applications" }),
  ).toBeVisible();
  await expect(page.getByText("Ada Customer")).toBeVisible();
  const applicationResults = await new AxeBuilder({ page }).analyze();
  expect(
    applicationResults.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("retail stock drives applications without manual UUID entry", async ({ page }) => {
  await signIn(page);
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Retail Stock" })).toBeVisible();
  await expect(page.getByText("Samsung A55")).toBeVisible();

  await page.goto("/applications/new");
  await page.getByLabel("Full name").fill("Ada Customer");
  await page.getByLabel("Phone").fill("+237600000001");
  await page.getByLabel("Branch").click();
  await page.getByRole("option", { name: "Main branch" }).click();
  await page.getByLabel("Available product").click();
  await page.getByRole("option", { name: /Samsung A55/ }).click();
  await expect(page.getByRole("img", { name: "Samsung A55" })).toBeVisible();
  await page.getByLabel("Proposed down payment (XAF)").fill("50000");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
});

test("cash payment is created and settled without simulated timers", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Payments & Ledger" })).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: "Ada Customer" }).click();
  await page.getByRole("combobox", { name: "Contract" }).click();
  await page.getByRole("option", { name: contractId }).click();
  await page.getByLabel("Amount (XAF)").fill("25000");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByText("Cash payment settled")).toBeVisible();
});

test("retailer owner completes the authoritative business profile", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/business-profile");
  await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
  await page.getByLabel(/Legal name/).fill("Example Retail Cameroon SARL");
  await page.getByLabel(/Registration number/).fill("RC/DLA/2026/B/1234");
  await page.getByLabel(/Tax identification number/).fill("M012345678901A");
  await page.getByLabel(/Registered address/).fill("123 Avenue de la Liberté");
  await page.getByLabel(/City/).fill("Douala");
  await page.getByLabel(/Contact email/).fill("compliance@example.com");
  await page.getByLabel(/Contact phone/).fill("+237600000000");
  await page.getByRole("button", { name: "Save business profile" }).click();
  await expect(page.getByText("kyb required", { exact: true })).toBeVisible();
  await expect(page.getByText(/KYB verification is the next step/)).toBeVisible();
});

test("cashier navigation hides administration when no administrative item is allowed", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:3001/api/v1/auth/tenant-access", (route) =>
    json(route, {
      allowed: true,
      permissions: [
        "contracts.read",
        "customers.read",
        "installments.read",
        "payments.read",
        "payments.record",
        "payments.settle",
      ],
    }),
  );

  await signIn(page);
  await expect(page.getByText("Administration", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Business Profile" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Branches" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Retailer Staff" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Payments & Ledger" })).toBeVisible();
});

test("retailer owner manages branches and branch-scoped staff", async ({ page }) => {
  test.slow();
  await signIn(page);

  await page.goto("/branches");
  await expect(page.getByRole("heading", { name: "Branches" })).toBeVisible();
  await expect(page.getByText("Main branch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add branch" }).click();
  await page.getByLabel("Branch code").fill("DOUALA-02");
  await page.getByLabel("Branch name").fill("Douala airport");
  await page.getByRole("button", { name: "Create branch" }).click();
  await expect(page.getByText("Douala airport", { exact: true })).toBeVisible();

  await page.goto("/staff");
  await expect(
    page.getByRole("heading", { name: "Retailer Staff", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Credit Underwriter")).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  await page.getByLabel("Full name").fill("Branch Cashier");
  await page.getByLabel("Email").fill("cashier@example.com");
  await page.getByLabel("Initial role").click();
  await page.getByRole("option", { name: "Cashier" }).click();
  await page.getByRole("checkbox", { name: /Main branch/ }).check();
  await page.getByRole("button", { name: "Send invitation" }).click();
  const invitationRow = page
    .getByRole("row")
    .filter({ hasText: "cashier@example.com" });
  await expect(invitationRow).toContainText("Main branch (MAIN)");
  await invitationRow.getByRole("button", { name: "Resend" }).click();
  await expect(page.getByText("Staff invitation resent.")).toBeVisible();

  const staffRow = page.getByRole("row").filter({ hasText: "Credit Underwriter" });
  await staffRow.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Selected branches" }).click();
  await page.getByRole("checkbox", { name: /Main branch/ }).check();
  await page.getByRole("button", { name: "Save branch access" }).click();
  await expect(staffRow).toContainText("Main branch (MAIN)");

  await staffRow.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(staffRow).toContainText("suspended");
  await staffRow.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(staffRow).toContainText("active");

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
test("retailer owner accepts a pending email invitation", async ({ page }) => {
  let accepted = false;
  const invitationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  await page.route("http://127.0.0.1:3001/api/v1/auth/memberships", (route) =>
    json(
      route,
      accepted
        ? [
            {
              id: "66666666-6666-4666-8666-666666666666",
              tenantId,
              status: "active",
              tenantName: "Invited Retailer",
              tenantSlug: "invited-retailer",
            },
          ]
        : [],
    ),
  );
  await page.route("http://127.0.0.1:3001/api/v1/auth/invitations**", async (route) => {
    if (route.request().method() === "POST") {
      accepted = true;
      await json(route, {
        tenantId,
        membershipId: "66666666-6666-4666-8666-666666666666",
      });
      return;
    }
    await json(
      route,
      accepted
        ? []
        : [
            {
              id: invitationId,
              tenantId,
              tenantName: "Invited Retailer",
              tenantSlug: "invited-retailer",
              email: "owner@example.com",
              fullName: "Retailer Owner",
              roleId: "00000000-0000-4000-8000-000000000101",
              roleName: "Tenant owner",
              requiresPasswordSetup: true,
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ],
    );
  });

  await page.route("http://127.0.0.1:3001/api/v1/auth/platform-invitations", (route) =>
    json(route, []),
  );
  await page.route("http://127.0.0.1:54321/auth/v1/user", (route) =>
    json(
      route,
      {
        code: "same_password",
        error_code: "same_password",
        message: "New password should be different from the old password.",
      },
      422,
    ),
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/accept-invitation$/);
  await expect(page.getByText("Invited Retailer")).toBeVisible();
  await page.getByLabel("Choose a password").fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("platform owner without a tenant can list and onboard retailers", async ({
  page,
}) => {
  test.slow();
  const refWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Function components cannot be given refs")) {
      refWarnings.push(message.text());
    }
  });

  const platformTenants = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      slug: "test-retailer",
      name: "Test Retailer",
      active: false,
      createdAt: new Date().toISOString(),
      onboardingStatus: "pending_owner" as const,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      ownerInvitation: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        email: "test-owner@example.com",
        fullName: "Test Owner",
        status: "pending" as const,
        deliveryStatus: "failed" as const,
        deliveryError: "not_configured" as const,
        requiresPasswordSetup: true,
        sentAt: null,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
  ];

  await page.route("http://127.0.0.1:3001/api/v1/auth/memberships", (route) =>
    json(route, []),
  );
  await page.route("http://127.0.0.1:3001/api/v1/auth/platform-access", (route) =>
    json(route, {
      allowed: true,
      permissions: [
        "platform.tenants.create",
        "platform.tenants.read",
        "platform.tenants.manage",
        "platform.users.read",
        "platform.users.invite",
        "platform.users.update",
        "platform.users.disable",
        "platform.users.roles.manage",
        "platform.owners.manage",
        "platform.audit.read",
        "platform.settings.read",
        "platform.settings.manage",
        "platform.risk.read",
        "platform.risk.manage",
        "platform.health.read",
        "platform.billing.read",
        "platform.devices.read",
        "platform.kyb.read",
        "platform.kyb.manage",
      ],
      mfaRequired: false,
      mfaSatisfied: true,
    }),
  );
  await page.route("http://127.0.0.1:3001/api/v1/platform/tenants/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }
    const tenantIdToArchive = new URL(route.request().url()).pathname.split("/").at(-1);
    const tenant = platformTenants.find((row) => row.id === tenantIdToArchive);
    expect(tenant).toBeDefined();
    const input = route.request().postDataJSON() as { reason: string };
    Object.assign(tenant!, {
      active: false,
      archivedAt: new Date().toISOString(),
      archivedBy: userId,
      archiveReason: input.reason,
    });
    await json(route, tenant);
  });
  let resendRequested = false;
  await page.route(
    "http://127.0.0.1:3001/api/v1/platform/tenants/*/owner-invitation/resend",
    async (route) => {
      resendRequested = true;
      expect(route.request().method()).toBe("POST");
      await json(route, {
        ...platformTenants[0]!.ownerInvitation,
        deliveryStatus: "sent",
        deliveryError: null,
        sentAt: new Date().toISOString(),
      });
    },
  );
  await page.route("http://127.0.0.1:3001/api/v1/platform/tenants", async (route) => {
    const request = route.request();
    expect(request.headers()["x-tenant-id"]).toBeUndefined();

    if (request.method() === "POST") {
      const input = request.postDataJSON() as {
        name: string;
        slug: string;
        ownerName: string;
        ownerEmail: string;
      };
      expect(input).toMatchObject({
        ownerName: "Retailer Owner",
        ownerEmail: "retailer-owner@example.com",
      });
      expect(input).not.toHaveProperty("ownerUserId");

      const tenant = {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        slug: input.slug,
        name: input.name,
        active: false,
        createdAt: new Date().toISOString(),
        onboardingStatus: "pending_owner" as const,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        ownerInvitation: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          email: "retailer-owner@example.com",
          fullName: "Retailer Owner",
          status: "pending" as const,
          deliveryStatus: "sent" as const,
          deliveryError: null,
          requiresPasswordSetup: true,
          sentAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      platformTenants.push(tenant);
      await json(route, tenant);
      return;
    }

    await json(route, platformTenants);
  });

  const platformUsers = [
    {
      id: userId,
      email: "owner@example.com",
      displayName: "Platform Owner",
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: [
        {
          roleId: "00000000-0000-4000-8000-000000000001",
          roleKey: "platform_owner",
          roleName: "Platform owner",
        },
      ],
    },
  ];
  const platformRoles = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      key: "platform_owner",
      name: "Platform owner",
      permissions: ["platform.owners.manage"],
      assignable: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000005",
      key: "platform_support",
      name: "Platform support officer",
      permissions: ["platform.users.read", "platform.health.read"],
      assignable: true,
    },
  ];
  const platformInvitations: Array<Record<string, unknown>> = [];

  await page.route("http://127.0.0.1:3001/api/v1/platform/users", (route) =>
    json(route, platformUsers),
  );
  await page.route("http://127.0.0.1:3001/api/v1/platform/roles", (route) =>
    json(route, platformRoles),
  );
  await page.route(
    "http://127.0.0.1:3001/api/v1/platform/invitations",
    async (route) => {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON() as {
          email: string;
          fullName: string;
          roleId: string;
        };
        const role = platformRoles.find((candidate) => candidate.id === input.roleId)!;
        const invitation = {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          ...input,
          roleKey: role.key,
          roleName: role.name,
          status: "pending",
          deliveryStatus: "sent",
          deliveryError: null,
          requiresPasswordSetup: true,
          sentAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          acceptedAt: null,
          createdAt: new Date().toISOString(),
        };
        platformInvitations.push(invitation);
        await json(route, invitation);
        return;
      }
      await json(route, platformInvitations);
    },
  );
  await page.route(
    "http://127.0.0.1:3001/api/v1/platform/audit-events/verify",
    (route) =>
      json(route, {
        valid: true,
        checkedEvents: 2,
        firstInvalidEventId: null,
      }),
  );
  await page.route("http://127.0.0.1:3001/api/v1/platform/audit-events", (route) =>
    json(route, [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        actionCode: "platform.invitation.created",
        actionLabel: "Platform staff invitation created",
        message: "Platform Owner — Platform staff invitation created.",
        actor: {
          id: userId,
          name: "Platform Owner",
          email: "owner@example.com",
          label: "Platform Owner",
        },
        resource: {
          type: "platform_invitation",
          label: "Platform invitation",
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        },
        requestId: "request-e2e",
        details: {},
        eventHash: "a".repeat(64),
        previousHash: null,
        occurredAt: new Date().toISOString(),
      },
    ]),
  );
  await page.route("http://127.0.0.1:3001/api/v1/platform/kyb/cases", (route) =>
    json(route, [
      {
        id: "abababab-abab-4bab-8bab-abababababab",
        tenantId: platformTenants[0]!.id,
        tenantName: "Test Retailer",
        tenantSlug: "test-retailer",
        status: "provider_approved",
        providerStatus: "APPROVED",
        riskScore: 12,
        decisionReason: null,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legalName: "Test Retail Cameroon SARL",
        countryCode: "CM",
        registrationNumber: "RC/DLA/2026/B/1234",
      },
    ]),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Written-off contracts")).toBeVisible();
  await expect(page.getByText("Written-off balance")).toBeVisible();

  await page.goto("/admin/tenants");
  await expect(page.getByRole("heading", { name: "Retailers" })).toBeVisible();
  await expect(page.getByText("Test Retailer")).toBeVisible();
  await expect(page.getByText("Provider setup incomplete")).toBeVisible();
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("The owner invitation was sent")).toBeVisible();
  expect(resendRequested).toBe(true);
  await page.getByRole("button", { name: "Onboard retailer" }).click();
  await page.getByLabel("Retailer name").fill("Beta Retailer");
  await page.getByLabel("Retailer slug").fill("beta-retailer");
  await page.getByLabel("Owner name").fill("Retailer Owner");
  await page.getByLabel("Owner email").fill("retailer-owner@example.com");
  await page.getByLabel("Initial branch code").fill("MAIN");
  await page.getByLabel("Initial branch name").fill("Main branch");
  await page.getByRole("button", { name: "Create retailer" }).click();

  await expect(page.getByText("Beta Retailer", { exact: true })).toBeVisible();
  const betaRow = page.getByRole("row").filter({ hasText: "Beta Retailer" });
  await betaRow.getByRole("button", { name: "Archive" }).click();
  await page.getByLabel("Type beta-retailer to confirm").fill("beta-retailer");
  await page.getByLabel("Reason").fill("End-to-end archival verification");
  await page.getByRole("button", { name: "Archive retailer" }).click();
  await expect(betaRow.getByText("Archived")).toBeVisible();
  await expect(betaRow.getByText("End-to-end archival verification")).toBeVisible();

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Platform Users" })).toBeVisible();
  await page.getByRole("button", { name: "Invite platform staff" }).click();
  await page.getByLabel("Full name").fill("Support Officer");
  await page.getByLabel("Email").fill("support@example.com");
  await page.getByLabel("Initial role").click();
  await page.getByRole("option", { name: "Platform support officer" }).click();
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("support@example.com")).toBeVisible();

  await page.goto("/admin/kyb");
  await expect(page.getByRole("heading", { name: "Retailer KYB" })).toBeVisible();
  await expect(page.getByText("Test Retail Cameroon SARL")).toBeVisible();
  await expect(page.getByText("provider approved")).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByText("2 events verified")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("Platform staff invitation created", {
      exact: true,
    }),
  ).toBeVisible({
    timeout: 15_000,
  });
  expect(refWarnings).toEqual([]);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
