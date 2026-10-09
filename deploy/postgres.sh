#!/usr/bin/env bash
# Provisions the app's PostgreSQL on this machine: a small-footprint config,
# a `launchpad` role and database, local connections only. Prints the
# DATABASE_URL for .env.production. Safe to re-run.
set -euo pipefail
command -v psql >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
PGCONF=$(ls -d /etc/postgresql/*/main | tail -1)
sudo tee "$PGCONF/conf.d/small.conf" >/dev/null <<'CONF'
shared_buffers = 32MB
work_mem = 2MB
maintenance_work_mem = 16MB
max_connections = 20
listen_addresses = '127.0.0.1'
CONF
sudo systemctl restart postgresql
SECRET=/home/deploy/.launchpad-db-password
[ -f "$SECRET" ] || (umask 077; head -c 24 /dev/urandom | base64 | tr -d '\n/+=' > "$SECRET")
PW=$(cat "$SECRET")
sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'launchpad') then
    create role launchpad login password '$PW';
  else
    alter role launchpad password '$PW';
  end if;
end \$\$;
SQL
sudo -u postgres psql -q -tc "select 1 from pg_database where datname = 'launchpad'" | grep -q 1 || sudo -u postgres createdb -O launchpad launchpad
echo "DATABASE_URL=postgres://launchpad:$PW@127.0.0.1:5432/launchpad"
