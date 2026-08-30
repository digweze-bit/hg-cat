import { useState } from "react";
import { supabase } from "../lib/supabase";

const INPUT_STYLE = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e8e3db",
  borderRadius: 3,
  fontSize: 13,
  color: "#1a1714",
  background: "#fff",
  fontFamily: "'Inter',-apple-system,sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

const LABEL_STYLE = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#9a9490",
  marginBottom: 6,
};

/**
 * Native inquiry form for an artwork. Inserts directly into the
 * Supabase "inquiries" table (RLS: anonymous inserts only).
 *
 * Usage:
 *   <ArtworkInquiryEmbed artworkId={artwork.id} artworkTitle={artwork.title} artistName={artist?.name} />
 */
export default function ArtworkInquiryEmbed({ artworkId, artworkTitle, artistName }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");
    const { error } = await supabase.from("inquiries").insert({
      artwork_id: artworkId,
      artwork_title: artworkTitle || null,
      artist_name: artistName || null,
      name: name.trim() || null,
      email: email.trim(),
      phone: phone.trim() || null,
      message: message.trim() || null,
    });

    if (error) {
      console.error("Inquiry submit failed:", error);
      setStatus("error");
      return;
    }

    setStatus("success");
    setName("");
    setEmail("");
    setPhone("");
    setMessage("");
  }

  if (status === "success") {
    return (
      <div
        className="artwork-inquiry-embed"
        style={{
          fontFamily: "'Inter',-apple-system,sans-serif",
          background: "#f7f4ef",
          border: "1px solid #e8e3db",
          borderRadius: 3,
          padding: "24px 26px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1714", marginBottom: 4 }}>
          Thank you for your inquiry
        </div>
        <div style={{ fontSize: 13, color: "#5a5550" }}>
          We&rsquo;ll be in touch shortly.
        </div>
      </div>
    );
  }

  return (
    <div className="artwork-inquiry-embed" style={{ fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "#9a9490",
          marginBottom: 14,
        }}
      >
        Inquire about this work
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={LABEL_STYLE} htmlFor="inquiry-name">Name</label>
          <input
            id="inquiry-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label style={LABEL_STYLE} htmlFor="inquiry-email">Email *</label>
          <input
            id="inquiry-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label style={LABEL_STYLE} htmlFor="inquiry-phone">Phone</label>
          <input
            id="inquiry-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label style={LABEL_STYLE} htmlFor="inquiry-message">Message</label>
          <textarea
            id="inquiry-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ ...INPUT_STYLE, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {status === "error" && (
          <div style={{ fontSize: 12, color: "#c0392b" }}>
            Something went wrong sending your inquiry. Please try again.
          </div>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            alignSelf: "flex-start",
            padding: "10px 22px",
            borderRadius: 3,
            border: "none",
            background: status === "submitting" ? "#e8a988" : "#E05C2A",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: ".03em",
            textTransform: "uppercase",
            cursor: status === "submitting" ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {status === "submitting" ? "Sending..." : "Send inquiry"}
        </button>
      </form>
    </div>
  );
}
