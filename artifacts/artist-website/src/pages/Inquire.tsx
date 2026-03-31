import { useState } from "react";
import Navbar from "@/components/Navbar";

const INQUIRY_TYPES = ["Exhibition", "Sales", "Commission"] as const;
type InquiryType = (typeof INQUIRY_TYPES)[number];

export default function Inquire() {
  const [type, setType] = useState<InquiryType>("Exhibition");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/inquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong.");
        setStatus("error");
      } else {
        setStatus("sent");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    padding: "14px 16px",
    fontFamily: "'Inter'",
    fontSize: "15px",
    fontWeight: 400,
    color: "#f5f5f5",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f5f5f5" }}>
      <Navbar />

      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "140px 40px 100px" }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(40px, 5vw, 64px)",
            fontWeight: 300,
            letterSpacing: "0.05em",
            color: "#f5f5f5",
            margin: "0 0 8px",
            lineHeight: 1,
          }}
        >
          Inquire
        </h1>

        <p
          style={{
            fontFamily: "'Inter'",
            fontSize: "13px",
            fontWeight: 400,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#555",
            margin: "0 0 56px",
          }}
        >
          Exhibition · Sales · Commission
        </p>

        {status === "sent" ? (
          <div>
            <div
              style={{
                width: "40px",
                height: "1px",
                background: "rgba(255,255,255,0.3)",
                marginBottom: "32px",
              }}
            />
            <p
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "24px",
                fontWeight: 300,
                lineHeight: 1.6,
                color: "rgba(245,245,245,0.85)",
                margin: "0 0 16px",
              }}
            >
              Thank you for reaching out.
            </p>
            <p
              style={{
                fontFamily: "'Inter'",
                fontSize: "15px",
                lineHeight: 1.7,
                color: "rgba(245,245,245,0.5)",
              }}
            >
              Your inquiry has been received. Ryan will be in touch shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Inquiry type */}
            <div style={{ marginBottom: "32px" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#555",
                  marginBottom: "12px",
                }}
              >
                Type of inquiry
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                {INQUIRY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    style={{
                      padding: "9px 20px",
                      background: type === t ? "rgba(245,245,245,0.1)" : "transparent",
                      border: `1px solid ${type === t ? "rgba(245,245,245,0.25)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: "4px",
                      fontFamily: "'Inter'",
                      fontSize: "12px",
                      fontWeight: 400,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: type === t ? "#f5f5f5" : "#666",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#555",
                  marginBottom: "10px",
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#555",
                  marginBottom: "10px",
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            {/* Message */}
            <div style={{ marginBottom: "36px" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Inter'",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#555",
                  marginBottom: "10px",
                }}
              >
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                placeholder="Tell us about your inquiry…"
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "140px",
                  lineHeight: 1.65,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            {errorMsg && (
              <p
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "13px",
                  color: "rgba(248,113,113,0.9)",
                  marginBottom: "20px",
                }}
              >
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                padding: "14px 40px",
                background: "transparent",
                border: "1px solid rgba(245,245,245,0.3)",
                borderRadius: "4px",
                fontFamily: "'Inter'",
                fontSize: "12px",
                fontWeight: 400,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: status === "sending" ? "#555" : "#f5f5f5",
                cursor: status === "sending" ? "default" : "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (status !== "sending") {
                  e.currentTarget.style.background = "rgba(245,245,245,0.08)";
                  e.currentTarget.style.borderColor = "rgba(245,245,245,0.5)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(245,245,245,0.3)";
              }}
            >
              {status === "sending" ? "Sending…" : "Send Inquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
