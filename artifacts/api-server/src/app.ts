import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import router from "./routes";
import { handleStripeWebhook } from "./routes/checkout";

const app: Express = express();

// Security headers — remove X-Powered-By, add X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy, Strict-Transport-Security, etc.
// contentSecurityPolicy disabled: this is a JSON API, not an HTML app.
// crossOriginEmbedderPolicy disabled: would block cross-origin image fetches
// used by the live mockup generation route.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors());

// Stripe webhook must receive the raw request body (not JSON-parsed) so that
// signature verification with stripe.webhooks.constructEvent() works correctly.
// Registered BEFORE the global express.json() middleware.
app.post(
  "/api/checkout/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
