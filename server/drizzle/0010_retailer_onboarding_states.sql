CREATE TYPE public.business_legal_form AS ENUM (
  'sole_proprietorship',
  'limited_liability_company',
  'public_limited_company',
  'partnership',
  'cooperative',
  'other'
);

ALTER TYPE public.tenant_onboarding_status ADD VALUE 'business_profile_required' BEFORE 'active';
ALTER TYPE public.tenant_onboarding_status ADD VALUE 'kyb_required' BEFORE 'active';
ALTER TYPE public.tenant_onboarding_status ADD VALUE 'kyb_in_review' BEFORE 'active';
ALTER TYPE public.tenant_onboarding_status ADD VALUE 'branch_setup_required' BEFORE 'active';
ALTER TYPE public.tenant_onboarding_status ADD VALUE 'configuration_required' BEFORE 'active';
ALTER TYPE public.tenant_onboarding_status ADD VALUE 'pending_approval' BEFORE 'active';
ALTER TYPE public.tenant_onboarding_status ADD VALUE 'rejected';
