\set ON_ERROR_STOP on

\if :{?runtime_user}
\else
  \echo 'Missing runtime_user. Pass -v runtime_user=app_runtime_login'
  \quit
\endif

CREATE ROLE :"runtime_user"
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

GRANT app_runtime TO :"runtime_user";

\password :"runtime_user"
