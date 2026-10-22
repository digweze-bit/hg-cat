import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Called by public.shop_notify() (pg_net) whenever something happens in the
// online shop. Emails staff and/or the buyer via Resend, and sends staff a
// WhatsApp alert when the Cloud API is configured.
//
// Secrets: WEBHOOK_SECRET, RESEND_API_KEY, NOTIFY_TO (shared with
// send-inquiry-email). Optional WhatsApp: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
// MANAGER_WHATSAPP (comma-separated, international format without +),
// WHATSAPP_TEMPLATE (default "hg_shop_alert", one {{1}} body parameter),
// WHATSAPP_LANG (default "en").

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const NOTIFY_TO = (Deno.env.get("NOTIFY_TO") || "info@hourglassgallery.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const FROM = "Hourglass Gallery <orders@notify.hourglassgallery.com>";

const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const WA_TO = (Deno.env.get("MANAGER_WHATSAPP") || "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") || "hg_shop_alert";
const WA_LANG = Deno.env.get("WHATSAPP_LANG") || "en";

const esc = (s: unknown) =>
  String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const SYMBOL: Record<string, string> = { NGN: "₦", USD: "$" };
const money = (amount: unknown, cur: string) =>
  (SYMBOL[cur] || cur + " ") + Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function layout(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1714;line-height:1.6;max-width:560px">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:.02em;margin-bottom:4px">Hourglass Gallery</div>
    <h2 style="margin:0 0 16px;font-weight:normal;font-size:17px">${esc(title)}</h2>
    ${body}
    <p style="margin-top:28px;color:#9a9490;font-size:12px">Hourglass Gallery · Lagos</p>
  </div>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#1a1714;color:#fff;padding:10px 20px;text-decoration:none;border-radius:3px;display:inline-block">${esc(label)}</a></p>`;
}

function rows(pairs: [string, unknown][]) {
  return `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">${
    pairs.filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `<tr><td style="color:#9a9490;vertical-align:top">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")
  }</table>`;
}

async function sendEmail(to: string[], subject: string, html: string, replyTo?: string) {
  if (!RESEND_API_KEY || to.length === 0) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: replyTo || undefined }),
  });
  if (!r.ok) console.error("Resend error", r.status, await r.text());
}

async function sendWhatsApp(text: string) {
  if (!WA_TOKEN || !WA_PHONE_ID || WA_TO.length === 0) return;
  // Template parameters may not contain newlines, tabs or 4+ spaces in a row.
  const param = text.replace(/[\n\t]+/g, " · ").replace(/ {4,}/g, "   ").slice(0, 1000);
  for (const to of WA_TO) {
    const r = await fetch(`https://graph.facebook.com/v22.0/${WA_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: WA_TEMPLATE,
          language: { code: WA_LANG },
          components: [{ type: "body", parameters: [{ type: "text", text: param }] }],
        },
      }),
    });
    if (!r.ok) console.error("WhatsApp error", r.status, await r.text());
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: any;
  try { payload = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const { event, order: o, inquiry: q, payment: p } = payload;
  const site = String(payload.site_url || "https://hgcat.vercel.app").replace(/\/$/, "");
  const admin = `${site}/admin/shop`;
  const orderLink = o ? `${site}/shop/order/${o.access_token}` : "";
  const price = o ? money(o.amount, o.currency) : "";
  const work = o ? `${o.title}${o.artist_name ? ` by ${o.artist_name}` : ""}` : "";
  const staffDetails = o ? rows([
    ["Order", o.ref], ["Artwork", work], ["Price", price],
    ["Buyer", o.buyer_name], ["Email", o.buyer_email], ["Phone", o.buyer_phone], ["Message", o.message],
  ]) : "";

  const jobs: Promise<unknown>[] = [];
  const staff = (subject: string, html: string, wa: string, replyTo?: string) => {
    jobs.push(sendEmail(NOTIFY_TO, subject, html, replyTo));
    jobs.push(sendWhatsApp(wa));
  };
  const buyer = (subject: string, html: string) => {
    if (o?.buyer_email) jobs.push(sendEmail([o.buyer_email], subject, html, NOTIFY_TO[0]));
  };

  switch (event) {
    case "order_requested":
      staff(`Buy request: ${o.title} (${o.ref})`,
        layout("New buy request — needs your confirmation", staffDetails + button(admin, "Review in HG Cat")),
        `Buy request ${o.ref}: ${work}, ${price}, from ${o.buyer_name} (${o.buyer_email}). Review: ${admin}`,
        o.buyer_email);
      buyer(`We've received your request — ${o.ref}`,
        layout("Thank you — your request is with the gallery",
          `<p>We're confirming <strong>${esc(work)}</strong> (${esc(price)}) for you. Once it's confirmed, you'll get an email with payment options: card or bank transfer.</p>
           <p>You can check the status at any time:</p>${button(orderLink, "View your order")}
           <p style="color:#9a9490;font-size:12px">Reference: ${esc(o.ref)}</p>`));
      break;

    case "order_approved": {
      const until = o.hold_expires_at ? new Date(o.hold_expires_at).toUTCString().replace(" GMT", " UTC") : "";
      buyer(`Approved — ${o.title} is held for you (${o.ref})`,
        layout("Your purchase is approved",
          `<p><strong>${esc(work)}</strong> is now on hold for you at ${esc(price)}.</p>
           <p>Pay by card or by bank transfer from your order page${until ? ` before <strong>${esc(until)}</strong>` : ""}.</p>
           ${button(orderLink, "Pay now")}
           <p style="color:#9a9490;font-size:12px">Reference: ${esc(o.ref)}</p>`));
      jobs.push(sendWhatsApp(`Order ${o.ref} approved. Payment link sent to ${o.buyer_name} (${o.buyer_email}).`));
      break;
    }

    case "order_declined":
      buyer(`About your request for ${o.title} (${o.ref})`,
        layout("We couldn't confirm this purchase",
          `<p>Sorry — we weren't able to confirm <strong>${esc(work)}</strong> for you.</p>
           ${o.decline_reason ? `<p>${esc(o.decline_reason)}</p>` : ""}
           <p>Reply to this email and we'll be glad to help you find something else.</p>`));
      break;

    case "receipt_uploaded":
      staff(`Transfer receipt: ${o.ref}`,
        layout("A buyer has uploaded a transfer receipt",
          staffDetails + rows([["Amount stated", p?.amount ? money(p.amount, o.currency) : "—"],
                               ["Bank", p?.bank_name], ["Transfer date", p?.transfer_date], ["Note", p?.note]])
          + `<p>Check the gallery account, then confirm or reject the receipt.</p>` + button(admin, "Review receipt")),
        `Transfer receipt for ${o.ref} from ${o.buyer_name}${p?.amount ? `, ${money(p.amount, o.currency)}` : ""}. Review: ${admin}`,
        o.buyer_email);
      buyer(`Receipt received — ${o.ref}`,
        layout("We've received your transfer receipt",
          `<p>Thank you. We'll check it against our account and confirm by email.</p>${button(orderLink, "View your order")}`));
      break;

    case "payment_card":
      staff(`Paid by card: ${o.title} (${o.ref})`,
        layout("Card payment received via Paystack",
          staffDetails + rows([["Paystack ref", p?.reference]]) + `<p>Post it to HG Cat to create the invoice.</p>` + button(admin, "Open order")),
        `Payment confirmed: ${price} for ${work}. Order ${o.ref} from ${o.buyer_name} via Paystack.`);
      buyer(`Payment received — ${o.ref}`,
        layout("Payment received — thank you",
          `<p>We've received ${esc(price)} for <strong>${esc(work)}</strong>. The gallery will be in touch about collection or delivery.</p>
           ${button(orderLink, "View your order")}`));
      break;

    case "transfer_confirmed":
      staff(`Transfer confirmed: ${o.ref}`,
        layout("Transfer confirmed", staffDetails + `<p>Post it to HG Cat to create the invoice.</p>` + button(admin, "Open order")),
        `Payment confirmed: ${price} for ${work}. Order ${o.ref} from ${o.buyer_name} via bank transfer.`);
      buyer(`Payment confirmed — ${o.ref}`,
        layout("Your transfer is confirmed — thank you",
          `<p>We've confirmed your payment for <strong>${esc(work)}</strong>. The gallery will be in touch about collection or delivery.</p>
           ${button(orderLink, "View your order")}`));
      break;

    case "transfer_rejected":
      buyer(`About your transfer receipt — ${o.ref}`,
        layout("We couldn't match your transfer",
          `<p>We weren't able to confirm the receipt you uploaded${p?.reject_reason ? `: ${esc(p.reject_reason)}` : "."}</p>
           <p>Please upload a clearer receipt from your order page, or reply to this email.</p>${button(orderLink, "Open your order")}`));
      break;

    case "payment_mismatch":
      staff(`Check payment: ${o.ref}`,
        layout("Paystack payment didn't match the order", staffDetails + rows([["Note", p?.note], ["Paystack ref", p?.reference]]) + button(admin, "Open order")),
        `Check Paystack payment for ${o.ref}: ${p?.note || "amount or currency mismatch"}.`);
      break;

    case "inquiry_new":
      staff(`Question: ${q.title || "artwork"}`,
        layout("New question about an artwork", rows([
          ["Artwork", `${q.title || ""}${q.artist_name ? ` by ${q.artist_name}` : ""}`],
          ["Name", q.name], ["Email", q.email], ["Phone", q.phone], ["Message", q.message],
        ]) + button(admin, "Open in HG Cat")),
        `Question about ${q.title || "an artwork"} from ${q.name}${q.phone ? ` (${q.phone})` : ""}: ${q.message}`,
        q.email || undefined);
      break;

    default:
      return new Response(`Unknown event ${event}`, { status: 400 });
  }

  await Promise.allSettled(jobs);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
