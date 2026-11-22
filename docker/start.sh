#!/bin/sh
# What the prod image runs. With DEMO_MAIL=1 the mail server of the demo and its webmail (docker/mail.sh)
# run inside this container, since a host like Render free gives one container and one HTTP port: the app's
# own mailbox is the firm's account there, and the webmail is served by the app under /webmail/.
if [ "$DEMO_MAIL" = "1" ]; then
  export SMTP_FROM="${SMTP_FROM:-kalkulation@polier.test}"
  export SMTP_HOST=127.0.0.1 SMTP_PORT=3025 SMTP_USER="$SMTP_FROM" SMTP_PASSWORD=demo
  export IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USER="$SMTP_FROM" IMAP_PASSWORD=demo IMAP_TLS=0
  export DEMO_MAIL_URL=http://127.0.0.1:8090 WEBMAIL_URL=http://127.0.0.1:8081
  DEMO_MAIL_BIND=127.0.0.1 /app/mail.sh &
fi
exec uvicorn boq.api:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
