import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { artworksTable, ordersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  VerifyCheckoutBody,
  VerifyCheckoutResponse,
} from "@workspace/api-zod";
import { sendOrderNotification } from "../lib/mailer";
import { createPrintOrder } from "../lib/printify";

const router: IRouter = Router();

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

    // Look up the artwork
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

    // Determine price
    const PRINT_PRICE_CENTS = 4500; // $45 for a print
    const unitAmount = purchaseType === "original" ? artwork.price! : PRINT_PRICE_CENTS;
    const productName =
      purchaseType === "original"
        ? `${artwork.title} — Original`
        : `${artwork.title} — Fine Art Print`;
    const description =
      purchaseType === "original"
        ? `Original artwork by Ryan Cellar${artwork.medium ? ` · ${artwork.medium}` : ""}${artwork.dimensions ? ` · ${artwork.dimensions}` : ""}`
        : `Fine art print by Ryan Cellar — archival quality giclee print`;

    const session = await stripe.checkout.sessions.create({
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
    });

    const data = CreateCheckoutSessionResponse.parse({
      url: session.url,
      sessionId: session.id,
    });

    res.json(data);
  } catch (err) {
    console.error("createCheckoutSession error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/checkout/verify — verify payment and fulfill order
router.post("/checkout/verify", async (req, res) => {
  try {
    const { sessionId } = VerifyCheckoutBody.parse(req.body);

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Payment processing not configured" });
      return;
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      res.status(400).json({ error: "Payment not completed" });
      return;
    }

    const { artworkSlug, artworkId, purchaseType, artworkTitle } =
      session.metadata as {
        artworkSlug: string;
        artworkId: string;
        purchaseType: "original" | "print";
        artworkTitle: string;
      };

    // Check if this session was already processed
    const existingOrder = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.stripeSessionId, sessionId))
      .limit(1);

    if (existingOrder.length > 0 && existingOrder[0].status === "paid") {
      // Already fulfilled — return success idempotently
      const data = VerifyCheckoutResponse.parse({
        success: true,
        purchaseType,
        artworkTitle,
        message:
          purchaseType === "original"
            ? "Ryan will be in touch shortly to arrange delivery of your original artwork."
            : "Your fine art print is being prepared for shipping.",
      });
      res.json(data);
      return;
    }

    // Create or update order record
    if (existingOrder.length === 0) {
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

    // If original, mark artwork as sold
    if (purchaseType === "original") {
      await db
        .update(artworksTable)
        .set({ status: "sold" })
        .where(eq(artworksTable.slug, artworkSlug));
    }

    // Send email notification (non-blocking)
    sendOrderNotification({
      artworkTitle,
      purchaseType,
      customerEmail: session.customer_details?.email ?? null,
      stripeSessionId: sessionId,
    }).catch(console.error);

    // Create Printify order for prints (non-blocking)
    if (purchaseType === "print" && session.customer_details) {
      const details = session.customer_details;
      const addr = details.address;

      if (addr) {
        const nameParts = (details.name ?? "Customer").split(" ");
        const firstName = nameParts[0] ?? "Customer";
        const lastName = nameParts.slice(1).join(" ") || "Buyer";

        createPrintOrder({
          artworkTitle,
          artworkImageUrl: "", // Printify uses product variant, not direct URL
          customerEmail: details.email ?? "",
          shippingAddress: {
            first_name: firstName,
            last_name: lastName,
            email: details.email ?? "",
            country: addr.country ?? "US",
            region: addr.state ?? "",
            address1: addr.line1 ?? "",
            city: addr.city ?? "",
            zip: addr.postal_code ?? "",
          },
        })
          .then(async (printifyOrderId) => {
            if (printifyOrderId) {
              await db
                .update(ordersTable)
                .set({ printifyOrderId, status: "fulfilled" })
                .where(eq(ordersTable.stripeSessionId, sessionId));
            }
          })
          .catch(console.error);
      }
    }

    const data = VerifyCheckoutResponse.parse({
      success: true,
      purchaseType,
      artworkTitle,
      message:
        purchaseType === "original"
          ? "Ryan will be in touch shortly to arrange delivery of your original artwork."
          : "Your fine art print is being prepared for shipping.",
    });

    res.json(data);
  } catch (err) {
    console.error("verifyCheckout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
