"""The supplier who does not answer is phoned: a voice agent asks for the prices (ElevenLabs Agents).

What estimators do when an inquiry stays unanswered is pick up the phone (docs/05-voice-agent.md,
docs/09-price-inquiries.md). Here the call is made from the browser (WebRTC, no phone number): on stage a
person plays the supplier. The agent says in its first sentence that it is an AI and for whom it calls,
names the job and the items, asks for a net price per item, freight and validity, reads the numbers back
and hands each price to the page through a client tool while the call is still going. A price given by
phone is indicative: it is kept as a quote marked not binding, and the written quote is still asked for.
The agent never orders, never negotiates and never states anything about the firm it was not given.

API facts as read from the ElevenLabs docs on 2026-11-21 (local notes; not run against the API when this
was written, because no key was set): tools are created with POST /v1/convai/tools and referenced by
`tool_ids`; the agent with POST /v1/convai/agents/create; a WebRTC token for a private agent comes from
GET /v1/convai/conversation/token; German needs a v2.5 TTS model set explicitly.
"""
import json
import os
import urllib.error
import urllib.request

from sqlalchemy import delete, insert, select

from boq import db

BASE = "https://api.elevenlabs.io"
TOOL = "submit_price"

FIRST = ("Guten Tag, hier ist der digitale Assistent der Firma {{company_name}}. Ich bin eine KI und rufe wegen "
         "unserer Preisanfrage zum Bauvorhaben {{project_name}} an. Haben Sie kurz Zeit für ein paar Preise?")

PROMPT = """\
Du bist der digitale Assistent des Bauunternehmens {{company_name}} und rufst den Lieferanten \
{{supplier_name}} an. Das Unternehmen kalkuliert ein Angebot für das Bauvorhaben {{project_name}} und hat \
eine schriftliche Preisanfrage geschickt, auf die noch keine Antwort kam. Dein Ziel: für die folgenden \
Positionen einen Netto-Einheitspreis erfragen.

Positionen (Nummer | Menge und Einheit | Beschreibung):
{{items_text}}

Ansprechpartner im Unternehmen: {{contact_name}}. Das Angebot wird bis {{reply_by}} benötigt.

So führst du das Gespräch:
- Sprich Deutsch, höflich, in kurzen Sätzen. Stelle immer nur eine Frage.
- Du hast bereits gesagt, dass du eine KI bist und für wen du anrufst. Wenn dein Gegenüber nicht mit einer \
KI sprechen möchte, biete einen Rückruf durch {{contact_name}} an, bedanke dich und beende das Gespräch.
- Gehe die Positionen der Reihe nach durch. Nenne Beschreibung und Menge, frage nach dem Netto-Einheitspreis \
und in welcher Einheit er gilt. Frage nach, wenn ein anderes Produkt als das beschriebene angeboten wird.
- Wiederhole jede Zahl zur Bestätigung, Ziffer für Ziffer, mit Einheit. Erst nach der Bestätigung rufst du \
das Werkzeug submit_price für diese Position auf: pos ist die Positionsnummer genau wie oben.
- Wenn es für eine Position keinen Preis gibt, gehe zur nächsten. Rate nie einen Preis.
- Frage am Ende einmal: Sind die Preise frei Baustelle oder kommt Fracht dazu, und wie lange gelten sie? \
Gib die Antwort beim letzten Aufruf von submit_price im Feld note an.
- Bitte um eine schriftliche Bestätigung per E-Mail, bedanke dich und beende das Gespräch.

Grenzen: Du bestellst nichts und sagst keinen Auftrag zu. Du verhandelst nicht. Du nennst über das \
Unternehmen nichts, was hier nicht steht. Auf Fragen, die du nicht beantworten kannst, sagst du: „Das gebe \
ich an {{contact_name}} weiter.“
"""

TOOL_CONFIG = {
    "type": "client", "name": TOOL, "expects_response": True,
    "description": "Hand over the confirmed net unit price of one item of the inquiry. Call it once per item, "
                   "only after the supplier confirmed the number you read back.",
    "parameters": {
        "type": "object",
        "properties": {
            "pos": {"type": "string", "description": "The item number exactly as in the list, e.g. 3.2"},
            "unit_price": {"type": "number", "description": "Net price per unit in EUR"},
            "unit": {"type": "string", "description": "The unit the price is per: m, St, t, m3 ..."},
            "product": {"type": "string", "description": "Make and type offered, if the supplier named one; else empty"},
            "alternative": {"type": "boolean", "description": "True if another product than the described one is offered"},
            "note": {"type": "string", "description": "Freight, validity, delivery time or anything else said; else empty"},
        },
        "required": ["pos", "unit_price", "unit"],
    },
}


class VoiceUnavailable(RuntimeError):
    """No ElevenLabs key is set, or the API refused."""


def _key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise VoiceUnavailable("No ElevenLabs key is set. Put ELEVENLABS_API_KEY=... into .env and restart the server.")
    return key


def available() -> bool:
    return bool(os.environ.get("ELEVENLABS_API_KEY", "").strip())


def _call(method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"xi-api-key": _key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise VoiceUnavailable(f"ElevenLabs answered {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}") from exc
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise VoiceUnavailable(f"ElevenLabs could not be reached: {exc}") from exc


def agent_id() -> str:
    """The agent that makes the calls: the one named in .env, else one made here once and remembered."""
    named = os.environ.get("ELEVENLABS_AGENT_ID", "").strip()
    if named:
        return named
    with db.engine().connect() as conn:
        kept = conn.execute(select(db.settings.c.value).where(db.settings.c.key == "voice_agent")).scalar()
    if kept:
        return kept["agent_id"]
    tool = _call("POST", "/v1/convai/tools", {"tool_config": TOOL_CONFIG})
    placeholders = {"company_name": "Musterbau GmbH", "supplier_name": "Lieferant", "project_name": "Bauvorhaben",
                    "contact_name": "die Kalkulation", "reply_by": "Ende der Woche", "items_text": "1 | 10 m | Rohr DN 100"}
    made = _call("POST", "/v1/convai/agents/create", {
        "name": "Polier: price inquiry by phone",
        "conversation_config": {
            "agent": {"first_message": FIRST, "language": "de",
                      "prompt": {"prompt": PROMPT, "tool_ids": [tool["id"]],
                                 "built_in_tools": {"end_call": {"type": "system", "name": "end_call", "description": "",
                                                                 "params": {"system_tool_type": "end_call"}}}},
                      "dynamic_variables": {"dynamic_variable_placeholders": placeholders}},
            "tts": {"model_id": "eleven_flash_v2_5"}}})
    with db.engine().begin() as conn:
        conn.execute(delete(db.settings).where(db.settings.c.key == "voice_agent"))
        conn.execute(insert(db.settings).values(key="voice_agent", value={"agent_id": made["agent_id"], "tool_id": tool["id"]}))
    return made["agent_id"]


def token() -> dict:
    """What the page needs to start a call: a WebRTC token for the agent, and the conversation's id."""
    agent = agent_id()
    got = _call("GET", f"/v1/convai/conversation/token?agent_id={agent}")
    return {"token": got["token"], "conversation_id": got.get("conversation_id"), "agent_id": agent}
