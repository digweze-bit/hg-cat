import { useEffect, useRef, useState } from "react";

/**
 * Embeds the WordPress artwork-inquiry WPForms page in an iframe,
 * passing the artwork's title as a URL parameter so it lands in the
 * hidden "Artwork" field (dynamic population) and shows up in the
 * notification email automatically.
 *
 * Usage:
 *   <ArtworkInquiryEmbed artworkTitle={artwork.title} artworkId={artwork.id} />
 */
export default function ArtworkInquiryEmbed({ artworkTitle, artworkId }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(600); // sensible starting height

  // Build the embed URL with the artwork name as a query param.
  // Adjust the base URL/path to match whatever slug you gave the
  // WordPress embed page (Part 1, step 4).
  const embedBaseUrl = "https://www.hourglassgallery.com/artwork-inquiry-embed/";
  const params = new URLSearchParams();
  if (artworkTitle) params.set("artwork", artworkTitle);
  if (artworkId) params.set("artwork_id", artworkId);
  const embedUrl = `${embedBaseUrl}?${params.toString()}`;

  useEffect(() => {
    // WPForms doesn't natively post its height, so this listens for a
    // generic resize-message convention. If your WordPress page doesn't
    // send one, the iframe just falls back to the fixed height below —
    // still functional, just not auto-resizing.
    function handleMessage(event) {
      if (event.origin !== "https://www.hourglassgallery.com") return;
      if (event.data && event.data.type === "wpforms-embed-height") {
        setHeight(event.data.height);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="artwork-inquiry-embed" style={{ width: "100%" }}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Inquire about this artwork"
        style={{
          width: "100%",
          height: `${height}px`,
          border: "none",
          display: "block",
        }}
        loading="lazy"
      />
    </div>
  );
}
