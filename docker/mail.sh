#!/bin/sh
# The mail server of the demo, in one process group: Stalwart (SMTP :3025, IMAP :3143, management :8090) and
# the webmail (Roundcube on PHP's own web server, :8081/webmail/). The `mail` service of docker-compose.yml
# runs this and so does the prod image with DEMO_MAIL=1 (docker/start.sh). Mail, accounts and settings are
# kept in Postgres (a database `<name>_mail` next to the app's, made here), so nothing is lost on a restart.
# DEMO_MAIL_BIND: 0.0.0.0 for a container of its own, 127.0.0.1 inside the app's container.
# DEMO_MAIL_FILL=0: start with the mailboxes as they are, without the mock world of mock/mail/.
BIND="${DEMO_MAIL_BIND:-0.0.0.0}"
CONFIG=/tmp/stalwart.json
export STALWART_RECOVERY_ADMIN="${STALWART_RECOVERY_ADMIN:-admin:demo-admin}"  # the key to the management API

boq-mail --database "$CONFIG" || exit 1

php -q -S "$BIND:8081" -t /opt/www >/dev/null 2>&1 &
WEB=$!

up() {  # start the server, wait until its management API answers; a new database answers on :8080 at first
  stalwart --config "$CONFIG" &
  SERVER=$!
  for _ in $(seq 1 120); do
    for port in 8090 8080; do
      if curl -s -o /dev/null "http://127.0.0.1:$port/healthz/live"; then
        export DEMO_MAIL_URL="http://127.0.0.1:$port"
        return 0
      fi
    done
    sleep 0.5
  done
  echo "mail: the server did not come up" >&2
  return 1
}
trap 'kill $SERVER $WEB 2>/dev/null; exit 0' TERM INT

up || exit 1
boq-mail --settings "$BIND"
if [ $? -eq 3 ]; then  # listeners changed (the first start): only a restart takes them up
  kill $SERVER; wait $SERVER 2>/dev/null
  up || exit 1
fi
boq-mail "${SMTP_FROM:-kalkulation@polier.test}"  # our firm's own mailbox
echo "mail: ready (SMTP :3025, IMAP :3143, webmail :8081/webmail/)"
if [ "${DEMO_MAIL_FILL:-1}" = "1" ]; then  # the mock world (mock/mail/): what is there stays, what is missing goes in
  IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_TLS=0 IMAP_USER="${SMTP_FROM:-kalkulation@polier.test}" IMAP_PASSWORD=demo \
    boq-mail --fill || echo "mail: the mock mail was not put in" >&2
fi
wait $SERVER
