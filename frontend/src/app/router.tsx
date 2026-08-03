import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { Overview } from "./pages/Overview";
import { Customers } from "./pages/Customers";
import { CustomerProfile } from "./pages/CustomerProfile";
import { Applications } from "./pages/Applications";
import { ApplicationReview } from "./pages/ApplicationReview";
import { NewApplication } from "./pages/NewApplication";
import { Inventory } from "./pages/Inventory";
import { Contracts } from "./pages/Contracts";
import { ContractDetail } from "./pages/ContractDetail";
import { Payments } from "./pages/Payments";
import { Reconciliation } from "./pages/Reconciliation";
import { Collections } from "./pages/Collections";
import { Devices } from "./pages/Devices";
import { DeviceDetail } from "./pages/DeviceDetail";
import { Reports } from "./pages/Reports";
import { Branches } from "./pages/Branches";
import { Staff } from "./pages/Staff";
import { BusinessProfile } from "./pages/BusinessProfile";
import { AdminLayout } from "./components/layout/AdminLayout";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { Tenants } from "./pages/admin/Tenants";
import { TenantDetail } from "./pages/admin/TenantDetail";
import { Billing } from "./pages/admin/Billing";
import { PlatformUsers } from "./pages/admin/PlatformUsers";
import { DeviceFleet } from "./pages/admin/DeviceFleet";
import { RiskConfig } from "./pages/admin/RiskConfig";
import { SystemHealth } from "./pages/admin/SystemHealth";
import { AuditLogs } from "./pages/admin/AuditLogs";
import { PlatformSettings } from "./pages/admin/PlatformSettings";
import { CustomerLayout } from "./components/layout/CustomerLayout";
import { Home } from "./pages/app/Home";
import { Pay } from "./pages/app/Pay";
import { Contract as CustomerContract } from "./pages/app/Contract";
import { Device as CustomerDevice } from "./pages/app/Device";
import { Profile } from "./pages/app/Profile";
import { Onboarding } from "./pages/app/Onboarding";
import { RouteError } from "./components/common/RouteError";
import {
  RequireAuthenticated,
  RequirePlatformAccess,
  RequirePlatformPermission,
  RequireTenantAccess,
  RequireTenantPermission,
} from "./lib/auth";
import { Login } from "./pages/Login";
import { PlatformMfa } from "./pages/PlatformMfa";
import { KybQueue } from "./pages/admin/KybQueue";
import { KybCase } from "./pages/admin/KybCase";

import { InvitationAcceptance } from "./pages/InvitationAcceptance";
export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
    errorElement: <RouteError />,
  },
  {
    path: "/mfa",
    element: (
      <RequireAuthenticated>
        <PlatformMfa />
      </RequireAuthenticated>
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/accept-invitation",
    element: (
      <RequireAuthenticated>
        <InvitationAcceptance />
      </RequireAuthenticated>
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/",
    element: (
      <RequireTenantAccess>
        <DashboardLayout />
      </RequireTenantAccess>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Overview /> },
      { path: "customers", element: <Customers /> },
      { path: "customers/:id", element: <CustomerProfile /> },
      { path: "applications", element: <Applications /> },
      { path: "applications/new", element: <NewApplication /> },
      { path: "applications/:id", element: <ApplicationReview /> },
      { path: "inventory", element: <Inventory /> },
      { path: "contracts", element: <Contracts /> },
      { path: "contracts/:id", element: <ContractDetail /> },
      { path: "payments", element: <Payments /> },
      {
        path: "reconciliation",
        element: (
          <RequireTenantPermission permission="payments.reconcile">
            <Reconciliation />
          </RequireTenantPermission>
        ),
      },
      { path: "collections", element: <Collections /> },
      { path: "devices", element: <Devices /> },
      { path: "devices/:id", element: <DeviceDetail /> },
      { path: "reports", element: <Reports /> },
      {
        path: "business-profile",
        element: (
          <RequireTenantPermission permission="tenant.manage">
            <BusinessProfile />
          </RequireTenantPermission>
        ),
      },
      {
        path: "branches",
        element: (
          <RequireTenantPermission permission="branches.read">
            <Branches />
          </RequireTenantPermission>
        ),
      },
      {
        path: "staff",
        element: (
          <RequireTenantPermission permission="memberships.read">
            <Staff />
          </RequireTenantPermission>
        ),
      },
    ],
  },
  {
    path: "/admin",
    element: (
      <RequirePlatformAccess>
        <AdminLayout />
      </RequirePlatformAccess>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: (
          <RequirePlatformPermission permission="platform.tenants.read">
            <AdminOverview />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "tenants",
        element: (
          <RequirePlatformPermission permission="platform.tenants.read">
            <Tenants />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "tenants/:id",
        element: (
          <RequirePlatformPermission permission="platform.tenants.read">
            <TenantDetail />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "billing",
        element: (
          <RequirePlatformPermission permission="platform.billing.read">
            <Billing />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "kyb",
        element: (
          <RequirePlatformPermission permission="platform.kyb.read">
            <KybQueue />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "kyb/:id",
        element: (
          <RequirePlatformPermission permission="platform.kyb.read">
            <KybCase />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "users",
        element: (
          <RequirePlatformPermission permission="platform.users.read">
            <PlatformUsers />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "fleet",
        element: (
          <RequirePlatformPermission permission="platform.devices.read">
            <DeviceFleet />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "risk",
        element: (
          <RequirePlatformPermission permission="platform.risk.read">
            <RiskConfig />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "health",
        element: (
          <RequirePlatformPermission permission="platform.health.read">
            <SystemHealth />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "audit",
        element: (
          <RequirePlatformPermission permission="platform.audit.read">
            <AuditLogs />
          </RequirePlatformPermission>
        ),
      },
      {
        path: "settings",
        element: (
          <RequirePlatformPermission permission="platform.settings.read">
            <PlatformSettings />
          </RequirePlatformPermission>
        ),
      },
    ],
  },
  {
    path: "/onboarding",
    element: (
      <RequireTenantAccess>
        <Onboarding />
      </RequireTenantAccess>
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/customer",
    element: (
      <RequireTenantAccess>
        <CustomerLayout />
      </RequireTenantAccess>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: "pay", element: <Pay /> },
      { path: "contract", element: <CustomerContract /> },
      { path: "device", element: <CustomerDevice /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);
