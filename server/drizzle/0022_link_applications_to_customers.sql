-- Repair legacy retailer-assisted applications that stored only an applicant snapshot.
INSERT INTO public.customers (
  tenant_id,
  branch_id,
  full_name,
  phone,
  email,
  national_id_reference
)
SELECT DISTINCT ON (application.tenant_id, application.applicant ->> 'phone')
  application.tenant_id,
  application.branch_id,
  application.applicant ->> 'fullName',
  application.applicant ->> 'phone',
  NULLIF(application.applicant ->> 'email', ''),
  NULLIF(application.applicant ->> 'nationalIdReference', '')
FROM public.financing_applications application
WHERE application.customer_id IS NULL
  AND NULLIF(application.applicant ->> 'phone', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.tenant_id = application.tenant_id
      AND customer.phone = application.applicant ->> 'phone'
  )
ORDER BY
  application.tenant_id,
  application.applicant ->> 'phone',
  application.created_at
ON CONFLICT (tenant_id, phone) DO NOTHING;

UPDATE public.financing_applications application
SET
  customer_id = customer.id,
  version = application.version + 1,
  updated_at = now()
FROM public.customers customer
WHERE application.customer_id IS NULL
  AND customer.tenant_id = application.tenant_id
  AND customer.phone = application.applicant ->> 'phone';
