\set ON_ERROR_STOP on

\if :{?user_id}
\else
  \echo 'Missing user_id. Pass -v user_id=<Supabase auth.users UUID>'
  \quit
\endif

SELECT EXISTS (
  SELECT 1 FROM public.user_profiles WHERE id = :'user_id'::uuid
) AS user_exists \gset

\if :user_exists
\else
  \echo 'User profile not found. Sign up through Supabase Auth first.'
  \quit
\endif

INSERT INTO public.platform_role_assignments (user_id, role_id, assigned_by)
VALUES (
  :'user_id'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  :'user_id'::uuid
)
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.audit_events (
  actor_user_id,
  action,
  resource_type,
  resource_id,
  details
)
VALUES (
  :'user_id'::uuid,
  'platform.owner.bootstrapped',
  'user',
  :'user_id',
  jsonb_build_object('method', 'owner migration connection')
);
