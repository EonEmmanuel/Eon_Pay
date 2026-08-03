CREATE TYPE "public"."inventory_unit_status" AS ENUM('available', 'reserved', 'financed', 'sold', 'returned', 'damaged');
CREATE TABLE "catalog_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"storage" text NOT NULL,
	"color" text NOT NULL,
	"cash_price" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_products_cash_price_positive" CHECK ("catalog_products"."cash_price" > 0),
	CONSTRAINT "catalog_products_version_positive" CHECK ("catalog_products"."version" > 0)
);

CREATE TABLE "inventory_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"catalog_product_id" uuid NOT NULL,
	"imei" text NOT NULL,
	"serial_number" text,
	"status" "inventory_unit_status" DEFAULT 'available' NOT NULL,
	"reserved_application_id" uuid,
	"contract_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_units_imei_valid" CHECK ("inventory_units"."imei" ~ '^[0-9]{15}$'),
	CONSTRAINT "inventory_units_version_positive" CHECK ("inventory_units"."version" > 0),
	CONSTRAINT "inventory_units_assignment_consistent" CHECK ((
        ("inventory_units"."status" = 'reserved' and "inventory_units"."reserved_application_id" is not null and "inventory_units"."contract_id" is null)
        or ("inventory_units"."status" = 'financed' and "inventory_units"."contract_id" is not null)
        or ("inventory_units"."status" not in ('reserved', 'financed') and "inventory_units"."reserved_application_id" is null and "inventory_units"."contract_id" is null)
      ))
);

ALTER TABLE "financing_applications" ADD COLUMN "catalog_product_id" uuid;
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_application_fk" FOREIGN KEY ("tenant_id","reserved_application_id") REFERENCES "public"."financing_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_contract_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."financing_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "catalog_products_tenant_sku_unique" ON "catalog_products" USING btree ("tenant_id","sku");
CREATE UNIQUE INDEX "catalog_products_tenant_id_unique" ON "catalog_products" USING btree ("tenant_id","id");
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_catalog_product_fk" FOREIGN KEY ("tenant_id","catalog_product_id") REFERENCES "public"."catalog_products"("tenant_id","id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "catalog_products_tenant_active_idx" ON "catalog_products" USING btree ("tenant_id","active");
CREATE UNIQUE INDEX "inventory_units_tenant_id_unique" ON "inventory_units" USING btree ("tenant_id","id");
CREATE UNIQUE INDEX "inventory_units_imei_unique" ON "inventory_units" USING btree ("imei");
CREATE UNIQUE INDEX "inventory_units_tenant_contract_unique" ON "inventory_units" USING btree ("tenant_id","contract_id") WHERE "inventory_units"."contract_id" is not null;
CREATE INDEX "inventory_units_branch_status_idx" ON "inventory_units" USING btree ("tenant_id","branch_id","status");
CREATE INDEX "inventory_units_product_status_idx" ON "inventory_units" USING btree ("tenant_id","catalog_product_id","status");

-- Preserve existing applications by promoting their embedded device snapshots into the product catalog.
INSERT INTO public.catalog_products (
  id, tenant_id, sku, brand, model, storage, color, cash_price
)
SELECT
  gen_random_uuid(),
  source.tenant_id,
  source.sku,
  source.brand,
  source.model,
  source.storage,
  source.color,
  source.cash_price
FROM (
  SELECT DISTINCT ON (
    application.tenant_id,
    COALESCE(NULLIF(application.device ->> 'sku', ''), 'LEGACY-' || left(application.id::text, 8))
  )
    application.tenant_id,
    COALESCE(NULLIF(application.device ->> 'sku', ''), 'LEGACY-' || left(application.id::text, 8)) AS sku,
    COALESCE(NULLIF(application.device ->> 'brand', ''), 'Unknown') AS brand,
    COALESCE(NULLIF(application.device ->> 'model', ''), 'Legacy device') AS model,
    COALESCE(NULLIF(application.device ->> 'storage', ''), 'Unknown') AS storage,
    COALESCE(NULLIF(application.device ->> 'color', ''), 'Unknown') AS color,
    CASE
      WHEN application.requested_terms #>> '{deviceCashPrice,minorUnits}' ~ '^[0-9]+$'
        THEN GREATEST((application.requested_terms #>> '{deviceCashPrice,minorUnits}')::bigint, 1)
      ELSE 1
    END AS cash_price
  FROM public.financing_applications application
  ORDER BY
    application.tenant_id,
    COALESCE(NULLIF(application.device ->> 'sku', ''), 'LEGACY-' || left(application.id::text, 8)),
    application.created_at
) source
ON CONFLICT (tenant_id, sku) DO NOTHING;

UPDATE public.financing_applications application
SET
  catalog_product_id = product.id,
  device = jsonb_set(application.device, '{deviceId}', to_jsonb(product.id::text), true)
FROM public.catalog_products product
WHERE product.tenant_id = application.tenant_id
  AND product.sku = COALESCE(
    NULLIF(application.device ->> 'sku', ''),
    'LEGACY-' || left(application.id::text, 8)
  );

UPDATE public.financing_contracts contract
SET device = jsonb_set(contract.device, '{deviceId}', to_jsonb(application.catalog_product_id::text), true)
FROM public.financing_applications application
WHERE application.tenant_id = contract.tenant_id
  AND application.id = contract.source_application_id
  AND application.catalog_product_id IS NOT NULL;

ALTER TABLE public.financing_applications
  ALTER COLUMN catalog_product_id SET NOT NULL;

ALTER TABLE "financing_applications" ADD CONSTRAINT "applications_catalog_product_fk" FOREIGN KEY ("tenant_id","catalog_product_id") REFERENCES "public"."catalog_products"("tenant_id","id") ON DELETE no action ON UPDATE no action;

INSERT INTO public.permissions (code, description)
VALUES
  ('inventory.read', 'View product catalog and branch stock'),
  ('inventory.manage', 'Create products and receive or update branch stock')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.roles role
JOIN public.permissions permission ON permission.code IN ('inventory.read', 'inventory.manage')
WHERE role.scope = 'tenant'
  AND role.key IN ('tenant_owner', 'tenant_admin', 'branch_manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.roles role
JOIN public.permissions permission ON permission.code = 'inventory.read'
WHERE role.scope = 'tenant'
  AND role.key IN ('underwriter', 'cashier')
ON CONFLICT DO NOTHING;

-- Cashiers originate branch sales applications but cannot underwrite or activate contracts.
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.roles role
JOIN public.permissions permission ON permission.code IN (
  'customers.create',
  'customers.update',
  'applications.read',
  'applications.create',
  'applications.submit'
)
WHERE role.scope = 'tenant'
  AND role.key = 'cashier'
ON CONFLICT DO NOTHING;

CREATE TRIGGER catalog_products_set_updated_at
BEFORE UPDATE ON public.catalog_products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER catalog_products_tenant_immutable
BEFORE UPDATE ON public.catalog_products
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();

CREATE TRIGGER inventory_units_set_updated_at
BEFORE UPDATE ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER inventory_units_tenant_immutable
BEFORE UPDATE ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_reassignment();

ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_units FORCE ROW LEVEL SECURITY;

CREATE POLICY catalog_products_select ON public.catalog_products
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    public.app_has_permission('inventory.read')
    OR public.app_has_permission('self.applications.create')
  )
);

CREATE POLICY catalog_products_insert ON public.catalog_products
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.manage')
);

CREATE POLICY catalog_products_update ON public.catalog_products
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.manage')
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.manage')
);

CREATE POLICY inventory_units_select ON public.inventory_units
FOR SELECT TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND (
    (
      public.app_has_permission('inventory.read')
      AND public.app_can_access_branch(branch_id, tenant_id)
    )
    OR public.app_has_permission('self.applications.create')
  )
);

CREATE POLICY inventory_units_insert ON public.inventory_units
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.manage')
  AND public.app_can_access_branch(branch_id, tenant_id)
);

CREATE POLICY inventory_units_update ON public.inventory_units
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.manage')
  AND public.app_can_access_branch(branch_id, tenant_id)
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.manage')
  AND public.app_can_access_branch(branch_id, tenant_id)
);

GRANT SELECT, INSERT, UPDATE ON public.catalog_products TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.inventory_units TO app_runtime;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.catalog_products, public.inventory_units FROM app_runtime;
