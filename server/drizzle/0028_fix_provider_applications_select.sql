CREATE POLICY provider_applications_select ON public.financing_applications
FOR SELECT TO app_provider
USING (tenant_id = public.app_tenant_id());
