import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db, artworksTable, ordersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import {
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  VerifyCheckoutBody,
  VerifyCheckoutResponse,
} from "@workspace/api-zod";
import { sendOrderNotification } from "../lib/mailer";
import { createPrintOrder } from "../lib/printify";

const router: IRouter = Router();

const PRINT_PRICE_CENTS = 4500; // $45
const TERMINAL_STATUSES = ["paid", "fulfilled", "failed"] as const;

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn("STRIPE_SECRET_KEY not set — checkout disabled");
    return null;
  }
  return new Stripe(key);
}

// POST /api/checkout/session — create a Stripe checkout session
router.post("/checkout/session", async (req, res) => {
  try {
    const body = CreateCheckoutSessionBody.parse(req.body);
    const { artworkSlug, purchaseType, customerEmail, successUrl, cancelUrl } = body;

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Payment processing not configured" });
      return;
    }

    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.slug, artworkSlug))
      .limit(1);

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    if (purchaseType === "original") {
      if (artwork.status !== "available") {
        res.status(400).json({ error: "This original is not available for purchase" });
        return;
      }
      if (!artwork.price) {
        res.status(400).json({ error: "This artwork has no price set" });
        return;
      }
    }

    const unitAmount = purchaseType === "original" ? artwork.price! : PRINT_PRICE_CENTS;
    const productName =
      purchaseType === "original"
        ? `${artwork.title} — Original`
        : `${artwork.title} — Fine Art Print`;
    const description =
      purchaseType === "original"
        ? `Original artwork by Ryan Cellar${artwork.medium ? ` · ${artwork.medium}` : ""}${artwork.dimensions ? ` · ${artwork.dimensions}` : ""}`
        : `Fine art giclee print by Ryan Cellar — archival quality`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: productName,
              description,
              images: [artwork.imageUrl],
            },
          },
        },
      ],
      metadata: {
        artworkSlug: artwork.slug,
        artworkId: String(artwork.id),
        purchaseType,
        artworkTitle: artwork.title,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // For print purchases, collect shipping address via Stripe Checkout
    if (purchaseType === "print") {
      sessionParams.shipping_address_collection = {
        allowed_countries: [
          "US", "CA", "GB", "AU", "DE", "FR", "NL", "SE", "NO", "DK",
          "FI", "BE", "AT", "CH", "IE", "NZ", "SG", "JP",
        ],
      };
      // Also collect phone (optional but helpful for couriers)
      sessionParams.phone_number_collection = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    const data = CreateCheckoutSessionResponse.parse({
      url: session.url,
      sessionId: session.id,
    });

    res.json(data);
  } catch (err) {
    console.error(
      "createCheckoutSession error:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/checkout/verify — verify payment and fulfill order
// Fully idempotent: any terminal order state short-circuits without re-triggering side effects.
router.post("/checkout/verify", async (req, res) => {
  try {
    const { sessionId } = VerifyCheckoutBody.parse(req.body);

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Payment processing not configured" });
      return;
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["shipping_details"],
    });

    if (session.payment_status !== "paid") {
      res.status(400).json({ error: "Payment not completed" });
      return;
    }

    const meta = session.metadata as {
      artworkSlug: string;
      artworkId: string;
      purchaseType: "original" | "print";
      artworkTitle: string;
    };
    const { artworkSlug, artworkId, purchaseType, artworkTitle } = meta;

    // Check for existing order in ANY terminal state — never re-run side effects
    const [existingOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.stripeSessionId, sessionId))
      .limit(1);

    if (existingOrder && (TERMINAL_STATUSES as readonly string[]).includes(existingOrder.status)) {
      res.json(
        VerifyCheckoutResponse.parse({
          success: true,
          purchaseType,
          artworkTitle,
          message: successMessage(purchaseType, existingOrder.status),
        })
      );
      return;
    }

    // ── Insert or set to "paid" ────────────────────────────────────────────
    if (!existingOrder) {
      await db.insert(ordersTable).values({
        artworkId: parseInt(artworkId, 10),
        type: purchaseType,
        stripeSessionId: sessionId,
        status: "paid",
        customerEmail: session.customer_details?.email ?? null,
      });
    } else {
      await db
        .update(ordersTable)
        .set({ status: "paid" })
        .where(eq(ordersTable.stripeSessionId, sessionId));
    }

    // ── Mark original as sold ─────────────────────────────────────────────
    if (purchaseType === "original") {
      await db
        .update(artworksTable)
        .set({ status: "sold" })
        .where(eq(artworksTable.slug, artworkSlug));
    }

    // ── Email notification (non-blocking, best-effort) ────────────────────
    sendOrderNotification({
      artworkTitle,
      purchaseType,
      customerEmail: session.customer_details?.email ?? null,
      stripeSessionId: sessionId,
    }).catch((e) =>
      console.error("Email notification failed:", e instanceof Error ? e.message : String(e))
    );

    // ── Printify fulfillment for prints ───────────────────────────────────
    if (purchaseType === "print") {
      // shipping_details is set on the session when shipping_address_collection was enabled
      const shipping = (session as any).shipping_details ?? (session as any).shipping;
      const addr = shipping?.address ?? session.customer_details?.address;
      const customerName =
        shipping?.name ?? session.customer_details?.name ?? "Customer";
      const customerEmail = session.customer_details?.email ?? "";

      const missingFields: string[] = [];
      if (!addr?.line1) missingFields.push("address line 1");
      if (!addr?.city) missingFields.push("city");
      if (!addr?.country) missingFields.push("country");
      if (!addr?.postal_code) missingFields.push("postal code");

      if (missingFields.length > 0) {
        // Payment is valid — log the gap and notify artist to fulfil manually
        console.warn(
          `Print fulfillment: missing shipping fields [${missingFields.join(", ")}] for session ${sessionId}. ` +
            `Artist will need to fulfil manually.`
        );
        // Update order to "failed" so we know fulfillment needs manual attention
        await db
          .update(ordersTable)
          .set({ status: "failed" })
          .where(eq(ordersTable.stripeSessionId, sessionId));
      } else {
        const nameParts = customerName.split(" ");
        const firstName = nameParts[0] ?? "Customer";
        const lastName = nameParts.slice(1).join(" ") || "Buyer";

        // Run asynchronously and update order status when done
        createPrintOrder({
          artworkTitle,
          artworkImageUrl: "",
          customerEmail,
          shippingAddress: {
            first_name: firstName,
            last_name: lastName,
            email: customerEmail,
            country: addr!.country ?? "US",
            region: addr!.state ?? "",
            address1: addr!.line1 ?? "",
            city: addr!.city ?? "",
            zip: addr!.postal_code ?? "",
          },
        })
          .then(async (printifyOrderId) => {
            if (printifyOrderId) {
              await db
                .update(ordersTable)
                .set({ printifyOrderId, status: "fulfilled" })
                .where(eq(ordersTable.stripeSessionId, sessionId));
              console.log(`Print order fulfilled: ${printifyOrderId}`);
            } else {
              // Printify not configured (missing env vars) — mark as fulfilled
              // since payment was taken and artist was notified via email
              await db
                .update(ordersTable)
                .set({ status: "fulfilled" })
                .where(eq(ordersTable.stripeSessionId, sessionId));
            }
          })
          .catch(async (e) => {
            console.error(
              "Printify order failed:",
              e instanceof Error ? e.message : String(e)
            );
            await db
              .update(ordersTable)
              .set({ status: "failed" })
              .where(eq(ordersTable.stripeSessionId, sessionId));
          });
      }
    } else {
      // Original purchase — mark as fulfilled (artist handles shipping manually)
      await db
        .update(ordersTable)
        .set({ status: "fulfilled" })
        .where(eq(ordersTable.stripeSessionId, sessionId));
    }

    res.json(
      VerifyCheckoutResponse.parse({
        success: true,
        purchaseType,
        artworkTitle,
        message: successMessage(purchaseType, "fulfilled"),
      })
    );
  } catch (err) {
    console.error(
      "verifyCheckout error:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

function successMessage(
  purchaseType: "original" | "print",
  status: string
): string {
  if (purchaseType === "original") {
    return "Ryan will be in touch shortly to arrange delivery of your original artwork.";
  }
  if (status === "failed") {
    return "Your payment was received. Our team will be in touch to arrange shipping of your print.";
  }
  return "Your fine art print is being prepared for shipping.";
}

export default router;
