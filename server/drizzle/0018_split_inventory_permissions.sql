INSERT INTO public.permissions (code, description)
VALUES
  ('inventory.catalog.manage', 'Create and update shared product catalog entries'),
  ('inventory.stock.manage', 'Receive and update stock in assigned branches')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.roles role
JOIN public.permissions permission
  ON permission.code IN ('inventory.catalog.manage', 'inventory.stock.manage')
WHERE role.scope = 'tenant'
  AND role.key IN ('tenant_owner', 'tenant_admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT role.id, 'inventory.stock.manage'
FROM public.roles role
WHERE role.scope = 'tenant'
  AND role.key = 'branch_manager'
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions assignment
USING public.roles role
WHERE assignment.role_id = role.id
  AND role.scope = 'tenant'
  AND assignment.permission_code = 'inventory.manage';

DROP POLICY catalog_products_insert ON public.catalog_products;
DROP POLICY catalog_products_update ON public.catalog_products;
DROP POLICY inventory_units_insert ON public.inventory_units;
DROP POLICY inventory_units_update ON public.inventory_units;

CREATE POLICY catalog_products_insert ON public.catalog_products
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.catalog.manage')
);

CREATE POLICY catalog_products_update ON public.catalog_products
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.catalog.manage')
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.catalog.manage')
);

CREATE POLICY inventory_units_insert ON public.inventory_units
FOR INSERT TO app_runtime
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.stock.manage')
  AND public.app_can_access_branch(branch_id, tenant_id)
);

CREATE POLICY inventory_units_update ON public.inventory_units
FOR UPDATE TO app_runtime
USING (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.stock.manage')
  AND public.app_can_access_branch(branch_id, tenant_id)
)
WITH CHECK (
  tenant_id = public.app_tenant_id()
  AND public.app_has_permission('inventory.stock.manage')
  AND public.app_can_access_branch(branch_id, tenant_id)
);
