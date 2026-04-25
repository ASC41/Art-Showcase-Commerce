/**
 * verify-stripe-webhook.ts
 *
 * Verifies and, if missing, registers the Stripe webhook endpoint for the
 * deployed API server. Run this whenever Stripe keys are rotated to ensure
 * the webhook endpoint is registered and the signing secret is current.
 *
 * What it checks:
 *   1. STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set
 *   2. A webhook endpoint exists in Stripe for the production URL
 *   3. The endpoint is enabled and listening for checkout.session.completed
 *
 * If the endpoint is missing it registers one and prints the new signing secret.
 * The operator must then update STRIPE_WEBHOOK_SECRET in Replit Secrets and
 * re-deploy the API server.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/scripts/verify-stripe-webhook.ts
 */

import Stripe from "stripe";

const PRODUCTION_URL = "https://art-showcase-commerce.replit.app";
const WEBHOOK_PATH = "/api/checkout/webhook";
const REQUIRED_EVENT = "checkout.session.completed";

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) {
    console.error("❌ STRIPE_SECRET_KEY is not set");
    process.exit(1);
  }

  const keyMode = stripeKey.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`✅ STRIPE_SECRET_KEY present (${keyMode} mode)`);

  if (!webhookSecret) {
    console.warn(`⚠️  STRIPE_WEBHOOK_SECRET is not set — will need updating after endpoint registration`);
  } else {
    console.log(`✅ STRIPE_WEBHOOK_SECRET present`);
  }

  const stripe = new Stripe(stripeKey);
  const targetUrl = `${PRODUCTION_URL}${WEBHOOK_PATH}`;

  console.log(`\nChecking Stripe webhook endpoints for: ${targetUrl}`);

  // Paginate through all endpoints to ensure we don't miss the target
  let existing: Stripe.WebhookEndpoint | undefined;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.webhookEndpoints.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    existing = page.data.find((ep) => ep.url === targetUrl);
    if (existing || !page.has_more) {
      hasMore = false;
    } else {
      startingAfter = page.data[page.data.length - 1]?.id;
    }
  }

  if (existing) {
    console.log(`✅ Webhook endpoint found (id: ${existing.id})`);
    console.log(`   Status: ${existing.status}`);
    console.log(`   Events: ${existing.enabled_events.join(", ")}`);

    if (existing.status !== "enabled") {
      console.warn(`⚠️  Webhook endpoint status is '${existing.status}' — should be 'enabled'`);
    }

    if (!existing.enabled_events.includes(REQUIRED_EVENT)) {
      console.error(`❌ Endpoint is missing required event: ${REQUIRED_EVENT}`);
      console.error(`   Current events: ${existing.enabled_events.join(", ")}`);
      process.exit(1);
    }

    console.log(`\n✅ Webhook configuration looks correct.`);
    console.log(`   Remember: STRIPE_WEBHOOK_SECRET must match the signing secret for endpoint ${existing.id}.`);
    console.log(`   If you rotated keys, re-register the endpoint or retrieve the secret from the Stripe Dashboard.`);
  } else {
    console.log(`⚠️  No webhook endpoint found for ${targetUrl}`);
    console.log(`   Registering now...`);

    const created = await stripe.webhookEndpoints.create({
      url: targetUrl,
      enabled_events: [REQUIRED_EVENT],
      description: "Ryan Cellar Art — purchase fulfillment & email notification",
    });

    console.log(`✅ Webhook endpoint registered!`);
    console.log(`   ID:     ${created.id}`);
    console.log(`   URL:    ${created.url}`);
    console.log(`   Status: ${created.status}`);
    console.log(``);
    console.log(`⚠️  ACTION REQUIRED: Update STRIPE_WEBHOOK_SECRET in Replit Secrets to:`);
    console.log(`   ${created.secret}`);
    console.log(``);
    console.log(`   Then re-deploy the API server for the change to take effect.`);
  }

  console.log(`\nVerification complete.`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
