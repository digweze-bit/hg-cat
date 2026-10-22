import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Paystack webhook. Set in the Paystack dashboard as:
//   https://gmukkxnxyvmywgrbkwnr.supabase.co/functions/v1/shop-paystack-webhook
// The body is signed with the secret key (HMAC SHA-512). We never trust the
// body's amount: we re-verify the transaction with Paystack first.

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function hmacSha512Hex(key: string, message: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!PAYSTACK_SECRET_KEY) return new Response("Not configured", { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  if (!timingSafeEqual(await hmacSha512Hex(PAYSTACK_SECRET_KEY, raw), signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (event?.event !== "charge.success") return new Response("ignored", { status: 200 });

  const reference = event.data?.reference;
  if (!reference) return new Response("ok", { status: 200 });

  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.status) {
    // Non-200 makes Paystack retry later, which is what we want here.
    console.error("Paystack verify failed", r.status, body);
    return new Response("verify failed", { status: 502 });
  }
  const d = body.data;
  const { data, error } = await db.rpc("shop_card_result", {
    p_reference: reference,
    p_success: d.status === "success",
    p_amount_subunits: d.amount,
    p_currency: d.currency,
    p_raw: { id: d.id, status: d.status, amount: d.amount, currency: d.currency, channel: d.channel,
             paid_at: d.paid_at, gateway_response: d.gateway_response, customer: d.customer?.email },
  });
  if (error) {
    console.error("shop_card_result failed", error);
    return new Response("db error", { status: 500 });
  }
  return new Response(JSON.stringify({ result: data }), { status: 200, headers: { "Content-Type": "application/json" } });
});
