#!/usr/bin/env bash
# A local stand-in for Supabase's REST API, for testing before a Supabase
# project exists: Postgres + PostgREST behind Caddy at http://127.0.0.1:54321,
# with the same roles (anon, authenticated, service_role) and JWT auth that
# supabase-js expects. Prints the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
# to use. Realtime is not emulated (the coin grid falls back to polling).
set -euo pipefail
cd "$(dirname "$0")/.."
PGRST=/home/deploy/tools/postgrest/postgrest
STATE=/home/deploy/.local-supabase
mkdir -p "$STATE"
chmod 700 "$STATE"

if ! command -v psql >/dev/null; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
fi
PGCONF=$(ls -d /etc/postgresql/*/main | tail -1)
# Small footprint for a 1 GB machine.
sudo tee "$PGCONF/conf.d/small.conf" >/dev/null <<'CONF'
shared_buffers = 32MB
work_mem = 2MB
maintenance_work_mem = 16MB
max_connections = 20
listen_addresses = '127.0.0.1'
CONF
sudo systemctl restart postgresql

[ -f "$STATE/jwt_secret" ] || head -c 48 /dev/urandom | base64 | tr -d '\n/+=' > "$STATE/jwt_secret"
[ -f "$STATE/db_password" ] || head -c 24 /dev/urandom | base64 | tr -d '\n/+=' > "$STATE/db_password"
JWT_SECRET=$(cat "$STATE/jwt_secret")
DB_PASSWORD=$(cat "$STATE/db_password")

sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password '$DB_PASSWORD';
  else
    alter role authenticator password '$DB_PASSWORD';
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
SQL
sudo -u postgres psql -q -tc "select 1 from pg_database where datname = 'launchpad'" | grep -q 1 || sudo -u postgres createdb launchpad
sudo -u postgres psql -q -d launchpad -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
sudo -u postgres psql -q -d launchpad -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
# Supabase grants these by default; the migration's revoke then narrows burn_leaf.
sudo -u postgres psql -q -d launchpad -v ON_ERROR_STOP=1 <<'SQL'
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on function burn_leaf(bigint, smallint, text, text, text) to service_role;
SQL

cat > "$STATE/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:$DB_PASSWORD@127.0.0.1:5432/launchpad"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3001
db-pool = 5
CONF
chmod 600 "$STATE/postgrest.conf"

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/postgrest.service <<UNIT
[Unit]
Description=PostgREST (local Supabase stand-in)
After=network.target

[Service]
ExecStart=$PGRST $STATE/postgrest.conf
Restart=always
MemoryMax=80M

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now postgrest >/dev/null 2>&1
systemctl --user restart postgrest
sudo loginctl enable-linger deploy

# supabase-js calls <url>/rest/v1/…; PostgREST serves at /.
if ! grep -q "127.0.0.1:54321" /etc/caddy/Caddyfile; then
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'CADDY'

# Local Supabase stand-in (testing only; not reachable from outside).
http://127.0.0.1:54321 {
	bind 127.0.0.1
	handle_path /rest/v1/* {
		reverse_proxy 127.0.0.1:3001
	}
}
CADDY
  sudo systemctl reload caddy
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() {
  local header payload sig
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"local","iat":%d,"exp":%d}' "$1" "$(date +%s)" "$(( $(date +%s) + 10*365*86400 ))" | b64url)
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}
echo "SUPABASE_URL=http://127.0.0.1:54321"
echo "SUPABASE_SERVICE_ROLE_KEY=$(jwt service_role)"
echo "SUPABASE_ANON_KEY=$(jwt anon)"
