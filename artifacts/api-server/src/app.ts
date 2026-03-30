import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { handleStripeWebhook } from "./routes/checkout";

const app: Express = express();

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
