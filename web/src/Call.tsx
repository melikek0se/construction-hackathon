/* A supplier phoned by the voice agent, from the browser (src/boq/voice.py; ElevenLabs, WebRTC, no phone
   number: on stage a person plays the supplier). The agent says it is an AI and for whom it calls, asks
   for a price per item, reads each number back and hands it over while the call is going: the prices
   show here as they come and stand in the comparison when the call ends, marked not binding. */
import { useEffect, useRef, useState } from "react";
import type { Conversation as Session } from "@elevenlabs/client";
import "./supply.css";

type Line = { who: "agent" | "supplier"; text: string };
type Price = { pos: string; unit_price: number; unit: string };

const say = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "The call failed.");
const post = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `The server answered ${response.status}.`);
  return data;
};

export default function CallPanel({ analysisId, pkg, supplier, supplierName, onDone }: { analysisId: string; pkg: string; supplier: string; supplierName: string; onDone: () => void }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [speaking, setSpeaking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const mailId = useRef<string | null>(null);
  const said = useRef<Line[]>([]);
  const closed = useRef(false);

  /** The call is over, however it ended: what was said is kept with it, once. */
  async function finish() {
    if (closed.current || !mailId.current) return;
    closed.current = true;
    setStatus("ended");
    const transcript = said.current.map((l) => `${l.who === "agent" ? "Polier" : supplierName}: ${l.text}`).join("\n");
    await post(`/api/mails/${mailId.current}/call-end`, { transcript }).catch(() => undefined);
    onDone();
  }

  async function start() {
    setError(null);
    setStatus("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }); // asked for before the call, so a refusal is said here
      const call = await post(`/api/analyses/${analysisId}/supply/call`, { package: pkg, supplier_id: supplier });
      mailId.current = call.mail_id;
      const { Conversation } = await import("@elevenlabs/client");
      session.current = await Conversation.startSession({
        conversationToken: call.token,
        connectionType: "webrtc",
        dynamicVariables: call.variables,
        clientTools: {
          // the agent hands over one confirmed price; what the server answers is what the agent hears
          submit_price: async (p: { pos: string; unit_price: number; unit?: string; product?: string; alternative?: boolean; note?: string }) => {
            const got = await post(`/api/mails/${call.mail_id}/call-price`, p).catch((e) => ({ ok: false, say: say(e) }));
            if (got.ok) setPrices((list) => [...list.filter((x) => x.pos !== p.pos), { pos: p.pos, unit_price: p.unit_price, unit: p.unit ?? "" }]);
            return got.say as string;
          },
        },
        onConnect: () => setStatus("live"),
        onDisconnect: () => void finish(),
        onError: (message: unknown) => setError(say(message)),
        onModeChange: (mode: { mode: string }) => setSpeaking(mode.mode === "speaking"),
        onMessage: (m: { message?: string; source?: string; role?: string }) => {
          if (!m.message) return;
          const line: Line = { who: (m.source ?? m.role) === "user" ? "supplier" : "agent", text: m.message };
          said.current = [...said.current, line];
          setLines(said.current);
        },
      });
    } catch (e) {
      setError(say(e));
      setStatus(mailId.current ? "ended" : "idle");
      void finish();
    }
  }

  // leaving the panel hangs up
  useEffect(() => () => void session.current?.endSession().catch(() => undefined), []);

  return (
    <div className="sup-compose sup-call q-mail">
      <header>
        <b>Call {supplierName}</b>
        <span>
          {status === "idle" && "The voice agent calls from this browser; whoever answers plays the supplier."}
          {status === "connecting" && "Connecting…"}
          {status === "live" && (speaking ? "Polier is speaking" : "Polier is listening")}
          {status === "ended" && `The call is over: ${prices.length} price${prices.length === 1 ? "" : "s"} noted.`}
        </span>
      </header>
      {error && <p className="q-error">{error}</p>}
      {prices.length > 0 && (
        <ul className="sup-call-prices">
          {prices.map((p) => (
            <li key={p.pos}>
              <b>{p.pos}</b>
              <span className="num">
                {p.unit_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € / {p.unit || "unit"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <ol className="sup-call-said" lang="de">
          {lines.slice(-8).map((l, i) => (
            <li key={i} className={`is-${l.who}`}>
              <b>{l.who === "agent" ? "Polier" : supplierName}</b> {l.text}
            </li>
          ))}
        </ol>
      )}
      <div className="q-actions">
        {status === "idle" && (
          <button className="btn q-send" onClick={() => void start()}>
            Start the call
          </button>
        )}
        {(status === "connecting" || status === "live") && (
          <button className="btn q-file" onClick={() => void session.current?.endSession().then(finish, finish)}>
            Hang up
          </button>
        )}
        <small>A price by phone is indicative: it is kept as not binding, and the written quote is still asked for.</small>
      </div>
    </div>
  );
}
