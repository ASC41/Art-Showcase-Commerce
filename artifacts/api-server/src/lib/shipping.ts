import type Stripe from "stripe";
import { type BlueprintShippingRates, shippingCostForCountry } from "./printify";

type ShippingOption = Stripe.Checkout.SessionCreateParams.ShippingOption;

// Countries Printify ships to — used for Stripe shipping_address_collection.
export const PRINTIFY_SHIP_TO_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
  [
    "US","CA","GB","AU","NZ",
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE",
    "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
    "NO","CH","IS","LI",
    "JP","KR","SG","HK","TW","TH","MY","PH","VN","IN","AE","SA","IL",
    "MX","BR","AR","CL","CO","PE",
    "ZA","NG","KE","EG","MA",
  ];

function makeOption(
  displayName: string,
  costCents: number,
  minDays: number,
  maxDays: number
): ShippingOption {
  return {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: costCents, currency: "usd" },
      display_name: displayName,
      delivery_estimate: {
        minimum: { unit: "business_day" as const, value: minDays },
        maximum: { unit: "business_day" as const, value: maxDays },
      },
    },
  };
}

export function buildStripeShippingOptions(
  rates: BlueprintShippingRates
): ShippingOption[] {
  const usCost = shippingCostForCountry(rates, "US");
  const caCost = shippingCostForCountry(rates, "CA");
  const euCost = shippingCostForCountry(rates, "GB");
  const intlCost = shippingCostForCountry(rates, "REST_OF_THE_WORLD");

  const options: ShippingOption[] = [];

  if (usCost === intlCost) {
    options.push(makeOption("Standard Shipping", usCost, 7, 21));
  } else {
    options.push(makeOption("US Standard Shipping", usCost, 7, 14));
    options.push(makeOption("International Standard Shipping", intlCost, 14, 28));
  }

  if (caCost !== usCost && caCost !== intlCost && caCost !== euCost) {
    options.push(makeOption("Canada Standard Shipping", caCost, 10, 18));
  }

  if (euCost !== usCost && euCost !== intlCost) {
    options.push(makeOption("Europe Standard Shipping", euCost, 10, 21));
  }

  options.sort((a, b) => {
    const costA = (a.shipping_rate_data as Stripe.Checkout.SessionCreateParams.ShippingOptionShippingRateData).fixed_amount!.amount as number;
    const costB = (b.shipping_rate_data as Stripe.Checkout.SessionCreateParams.ShippingOptionShippingRateData).fixed_amount!.amount as number;
    return costA - costB;
  });

  return options;
}
