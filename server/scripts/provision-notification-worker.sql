\set ON_ERROR_STOP on

\if :{?worker_user}
\else
  \echo 'Missing worker_user. Pass -v worker_user=app_notification_worker_login'
  \quit
\endif

CREATE ROLE :"worker_user"
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

GRANT app_notification_worker TO :"worker_user";

\password :"worker_user"
