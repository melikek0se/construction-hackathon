"""The mail server of the demo: accounts and settings.

For a demo nobody wants to work with real mailboxes. So the app can run against a mail server of its own
(Stalwart; `mail` in docker-compose.yml, inside the prod image with DEMO_MAIL=1, D-052): our firm, the client
who sends the tender and every supplier and subcontractor have an account there, the app sends and reads as
the firm, and a person is any of the others through the webmail. The server keeps its mail in Postgres, so
it is still there after a restart.

This module talks to the server's management API (JMAP over HTTP, `x:<Object>/get|set`):
- `settings()` puts the server into the shape the demo needs (plain SMTP and IMAP on fixed ports, no spam
  filter, no bans); `docker/mail.sh` calls it at every start, it changes only what differs.
- `ensure(address)` makes the account of an address (and its domain) where it is missing. Every password is
  PASSWORD. The app calls it before it writes to someone, so a supplier's mailbox arises with the first
  inquiry; `boq-mail ADDRESS…` does it by hand.
- `prepare_database()` makes the server's own database next to the app's and writes its config file.

Nothing here runs unless DEMO_MAIL_URL is set: with a real mail account in .env this module is not used.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import unquote, urlsplit

PASSWORD = "demo"  # of every account on the demo server
SMTP_PORT, IMAP_PORT, HTTP_PORT = 3025, 3143, 8090
# handed over as a hash: the server takes no clear password under eight characters
_HASH = "{SHA512}" + base64.b64encode(hashlib.sha512(PASSWORD.encode()).digest()).decode()
OWN = "kalkulation@polier.test"  # our firm, unless SMTP_FROM says otherwise
_USING = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"]


class DemoMailError(RuntimeError):
    pass


def url() -> str | None:
    """Where the demo server's management API is; None: no demo server, a real account or none at all."""
    base = os.environ.get("DEMO_MAIL_URL", "").strip().rstrip("/")
    return base if base.startswith("http") else None


def _admin() -> str:
    return os.environ.get("STALWART_RECOVERY_ADMIN", "").strip() or "admin:demo-admin"


def call(method: str, args: dict) -> dict:
    """One call to the management API; the answer of that call. Raises DemoMailError with the reason."""
    base = url()
    if base is None:
        raise DemoMailError("No demo mail server is set (DEMO_MAIL_URL).")
    request = urllib.request.Request(
        base + "/jmap/", method="POST",
        data=json.dumps({"using": _USING, "methodCalls": [[method, args, "c"]]}).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Basic " + base64.b64encode(_admin().encode()).decode()})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            name, answer, _ = json.load(response)["methodResponses"][0]
    except (urllib.error.URLError, OSError, ValueError, KeyError, IndexError) as exc:
        raise DemoMailError(f"The demo mail server did not answer: {exc}") from exc
    if name == "error":
        raise DemoMailError(f"The demo mail server refused {method}: {answer}")
    return answer


def _set(kind: str, **args) -> dict:
    """x:<kind>/set; raises where the server did not create, update or destroy one of the objects."""
    answer = call(f"x:{kind}/set", args)
    for key in ("notCreated", "notUpdated", "notDestroyed"):
        if answer.get(key):
            raise DemoMailError(f"The demo mail server refused {kind}: {answer[key]}")
    return answer


def _all(kind: str) -> list[dict]:
    return call(f"x:{kind}/get", {}).get("list") or []


# ------------------------------------------------------------------ accounts

def _domain(name: str) -> str:
    """The id of this domain on the server, made where missing. Without it the server would look for the
    domain on the internet instead of delivering to its own mailbox."""
    for d in _all("Domain"):
        if d["name"].casefold() == name.casefold():
            return d["id"]
    made = _set("Domain", create={"d": {
        "name": name, "aliases": {}, "certificateManagement": {"@type": "Manual"},
        "dnsManagement": {"@type": "Manual"}, "dkimManagement": {"@type": "Manual"},
        "subAddressing": {"@type": "Enabled"}}})
    return made["created"]["d"]["id"]


def accounts() -> list[str]:
    """The addresses that have a mailbox on the demo server."""
    domains = {d["id"]: d["name"] for d in _all("Domain")}
    return sorted(f"{a['name']}@{domains[a['domainId']]}" for a in _all("Account")
                  if a.get("@type") == "User" and a.get("domainId") in domains)


def ensure(*addresses: str) -> list[str]:
    """Make the mailbox of each address where it is missing (password PASSWORD); the ones made."""
    have, made = None, []
    for address in addresses:
        local, _, domain = address.strip().casefold().partition("@")
        if not local or "." not in domain:
            continue
        have = set(accounts()) if have is None else have
        if f"{local}@{domain}" in have:
            continue
        _set("Account", create={"a": {
            "@type": "User", "name": local, "domainId": _domain(domain), "description": f"{local}@{domain}",
            "credentials": {"0": {"@type": "Password", "secret": _HASH}}, "aliases": {},
            "roles": {"@type": "User"}, "permissions": {"@type": "Inherit"},
            "encryptionAtRest": {"@type": "Disabled"}}})
        have.add(f"{local}@{domain}")
        made.append(f"{local}@{domain}")
    return made


def ensure_quietly(*addresses: str) -> None:
    """`ensure` for the app on its way to sending: does nothing without a demo server, and a server that
    does not answer is the sending's problem to report, not this one's."""
    if url() is None:
        return
    try:
        ensure(*addresses)
    except DemoMailError:
        pass


# ------------------------------------------------------------------ settings

def _listeners(bind: str) -> dict:
    return {"smtp": {"name": "smtp", "protocol": "smtp", "bind": {f"{bind}:{SMTP_PORT}": True}, "useTls": False},
            "imap": {"name": "imap", "protocol": "imap", "bind": {f"{bind}:{IMAP_PORT}": True}, "useTls": False},
            "http": {"name": "http", "protocol": "http", "bind": {f"{bind}:{HTTP_PORT}": True}, "useTls": False}}


# Singletons of the server and what the demo wants of each. Plain text: nothing here crosses a network that
# is not the laptop's or the container's own.
_SINGLETONS: dict[str, dict] = {
    "Imap": {"allowPlainTextAuth": True},
    # log in on every port, without TLS; the sender may be any address (the webmail and scripts send as whom they say)
    "MtaStageAuth": {"saslMechanisms": {"match": {}, "else": "[plain, login]"}, "require": {"match": {}, "else": "true"},
                     "mustMatchSender": {"match": {}, "else": "false"}},
    "SpamSettings": {"enable": False},
    "Security": {"authBanRate": None, "abuseBanRate": None, "loiterBanRate": None, "scanBanRate": None, "scanBanPaths": {}},
    # caches sized for a 512 MB container shared with the app
    "Cache": {"messages": 16 << 20, "messagesLarge": 0, "groupwareLarge": 0, "events": 2 << 20, "contacts": 2 << 20, "files": 2 << 20},
    "SystemSettings": {"maxBufferedMemory": 32 << 20, "defaultHostname": "mail.polier.test"},
}


def settings(bind: str = "0.0.0.0") -> bool:
    """Put the server into the shape of the demo; True where a listener changed, which only a restart of
    the server takes up."""
    want, restart = _listeners(bind), False
    have = {listener["name"]: listener for listener in _all("NetworkListener")}
    gone = [l["id"] for name, l in have.items() if name not in want]
    new = {name: l for name, l in want.items() if name not in have}
    changed = {have[name]["id"]: {k: v for k, v in l.items() if k != "name"} for name, l in want.items()
               if name in have and any(have[name].get(k) != v for k, v in l.items())}
    if gone or new or changed:
        _set("NetworkListener", create=new, update=changed, destroy=gone)
        restart = True
    own = (os.environ.get("SMTP_FROM", "").strip() or OWN).partition("@")[2]
    for kind, values in _SINGLETONS.items():
        if kind == "SystemSettings":  # the server wants a domain of its own: the firm's
            values = {**values, "defaultDomainId": _domain(own)}
        now = (call(f"x:{kind}/get", {"ids": ["singleton"]}).get("list") or [{}])[0]
        if any(now.get(k) != v for k, v in values.items()):
            _set(kind, update={"singleton": values})
    call("x:Action/set", {"create": {"r": {"@type": "ReloadSettings"}}})
    return restart


# ------------------------------------------------------------------ the server's database

def prepare_database(config_path: str) -> None:
    """The server keeps everything (mail, accounts, settings) in a Postgres database of its own next to the
    app's: `<name>_mail` on the server DATABASE_URL names (or DEMO_MAIL_DATABASE). Make it where missing and write the server's
    config file, which holds nothing but this connection."""
    import psycopg

    target = os.environ.get("DATABASE_URL", "").strip()
    parts = urlsplit(target)
    if not parts.scheme.startswith("postgres") or not parts.hostname:
        raise DemoMailError("The demo mail server keeps its mail in Postgres: DATABASE_URL must name one.")
    name = os.environ.get("DEMO_MAIL_DATABASE", "").strip() or (parts.path.lstrip("/") or "postgres") + "_mail"
    with psycopg.connect(target, autocommit=True) as connection:
        if not connection.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
            connection.execute(f'CREATE DATABASE "{name}"')
    local = parts.hostname in ("db", "localhost", "127.0.0.1")
    config = {"@type": "PostgreSql", "host": parts.hostname, "port": parts.port or 5432, "database": name,
              "authUsername": unquote(parts.username or ""),
              "authSecret": {"@type": "Value", "secret": unquote(parts.password or "")},
              "useTls": not local and "sslmode=disable" not in parts.query, "poolMaxConnections": 4}
    with open(config_path, "w") as out:
        json.dump(config, out)
    os.chmod(config_path, 0o600)


# ------------------------------------------------------------------ command line

def main() -> None:
    """boq-mail                      the accounts on the demo server
    boq-mail ADDRESS…             make these accounts (password "demo")
    boq-mail --database FILE      make the server's database, write its config file   (docker/mail.sh)
    boq-mail --settings [BIND]    apply the demo's settings; exit code 3: a restart is needed (docker/mail.sh)"""
    args = sys.argv[1:]
    try:
        if args[:1] == ["--database"]:
            prepare_database(args[1])
        elif args[:1] == ["--settings"]:
            sys.exit(3 if settings(*args[1:2]) else 0)
        else:
            for address in ensure(*args):
                print(f"made {address}")
            if not args:
                print("\n".join(accounts()) or "no accounts yet")
    except DemoMailError as exc:
        sys.exit(str(exc))


if __name__ == "__main__":
    main()
