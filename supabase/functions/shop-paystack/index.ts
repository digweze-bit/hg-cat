import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Called from the buyer's order page.
//   { action: "init", token }       → starts a Paystack checkout, returns { url }
//   { action: "verify", reference } → checks a returning payment, returns { result }
// Both only touch shop_* tables, through shop_card_prepare / shop_card_result.
//
// Secret: PAYSTACK_SECRET_KEY. NGN and USD only (USD must be enabled on the
// Paystack account).

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const DEFAULT_SITE = "https://hgcat.vercel.app";
// Where Paystack may send the buyer back to. Anything else falls back to the live site.
const ALLOWED_ORIGINS = [/^https:\/\/hgcat\.vercel\.app$/, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyWithPaystack(reference: string) {
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.status) throw new Error(body?.message || `Paystack verify failed (${r.status})`);
  const d = body.data;
  const { data, error } = await db.rpc("shop_card_result", {
    p_reference: reference,
    p_success: d.status === "success",
    p_amount_subunits: d.amount,
    p_currency: d.currency,
    p_raw: { id: d.id, status: d.status, amount: d.amount, currency: d.currency, channel: d.channel,
             paid_at: d.paid_at, gateway_response: d.gateway_response, customer: d.customer?.email },
  });
  if (error) throw new Error(error.message);
  return { result: data as string, paystackStatus: d.status as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!PAYSTACK_SECRET_KEY) return json({ error: "Card payments are not set up yet — please pay by bank transfer." }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    if (body.action === "init") {
      const token = String(body.token || "");
      const reference = `${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const { data: order, error } = await db.rpc("shop_card_prepare", { p_token: token, p_reference: reference });
      if (error) return json({ error: error.message }, 400);

      const origin = req.headers.get("origin") || "";
      const site = ALLOWED_ORIGINS.some((re) => re.test(origin)) ? origin : DEFAULT_SITE;
      const r = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: order.email,
          amount: Math.round(Number(order.amount) * 100),
          currency: order.currency,
          reference,
          callback_url: `${site}/shop/order/${token}`,
          metadata: {
            order_ref: order.ref,
            custom_fields: [
              { display_name: "Order", variable_name: "order_ref", value: order.ref },
              { display_name: "Buyer", variable_name: "buyer", value: order.name },
            ],
          },
        }),
      });
      const init = await r.json().catch(() => null);
      if (!r.ok || !init?.status) {
        console.error("Paystack init failed", r.status, init);
        return json({ error: init?.message || "Could not start card payment" }, 502);
      }
      return json({ url: init.data.authorization_url, reference });
    }

    if (body.action === "verify") {
      const reference = String(body.reference || "");
      if (!reference) return json({ error: "Missing reference" }, 400);
      return json(await verifyWithPaystack(reference));
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
