import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useVerifyCheckout } from "@workspace/api-client-react";
import { Link } from "wouter";
import Navbar from "@/components/Navbar";

export default function OrderSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session_id");

  const verifyMutation = useVerifyCheckout();

  useEffect(() => {
    if (sessionId && !verifyMutation.isSuccess && !verifyMutation.isPending && !verifyMutation.isError) {
      verifyMutation.mutate({ data: { sessionId } });
    }
  }, [sessionId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        color: "#f5f5f5",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Navbar />

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 40px",
        }}
      >
        <div style={{ maxWidth: "520px", textAlign: "center" }}>
          {verifyMutation.isPending && (
            <>
              <div
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "13px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#555",
                  marginBottom: "24px",
                }}
              >
                Confirming your order…
              </div>
            </>
          )}

          {verifyMutation.isSuccess && (
            <>
              {/* Success checkmark */}
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  border: "1px solid rgba(74,222,128,0.3)",
                  background: "rgba(74,222,128,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 40px",
                  fontSize: "24px",
                  color: "#4ade80",
                }}
              >
                ✓
              </div>

              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "clamp(32px, 4vw, 48px)",
                  fontWeight: 300,
                  letterSpacing: "0.04em",
                  color: "#f5f5f5",
                  margin: "0 0 16px",
                }}
              >
                Thank you
              </h1>

              <p
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "20px",
                  fontWeight: 300,
                  color: "rgba(245,245,245,0.7)",
                  margin: "0 0 8px",
                  letterSpacing: "0.02em",
                }}
              >
                {verifyMutation.data.artworkTitle}
              </p>

              <p
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "14px",
                  lineHeight: 1.7,
                  color: "#666",
                  margin: "0 0 56px",
                }}
              >
                {verifyMutation.data.message}
              </p>

              <div
                style={{
                  width: "40px",
                  height: "1px",
                  background: "rgba(255,255,255,0.12)",
                  margin: "0 auto 56px",
                }}
              />
            </>
          )}

          {verifyMutation.isError && (
            <>
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "40px",
                  fontWeight: 300,
                  color: "#f5f5f5",
                  margin: "0 0 16px",
                }}
              >
                Something went wrong
              </h1>
              <p
                style={{
                  fontFamily: "'Inter'",
                  fontSize: "14px",
                  color: "#666",
                  margin: "0 0 48px",
                }}
              >
                We couldn't confirm your order. Please contact{" "}
                <a href="mailto:ryancellart@gmail.com" style={{ color: "#f5f5f5" }}>
                  ryancellart@gmail.com
                </a>{" "}
                and we'll sort it out.
              </p>
            </>
          )}

          <Link href="/portfolio" style={{ textDecoration: "none" }}>
            <span
              style={{
                display: "inline-block",
                padding: "12px 32px",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "4px",
                fontFamily: "'Inter'",
                fontSize: "13px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#888",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Return to Portfolio
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
