/**
 * ops: INVESTIGATION — T-shirt left sleeve wordmark (Blueprint 706, Provider 217)
 *
 * FINDING: Sleeve printing is NOT supported for the Comfort Colors 1717 t-shirt
 * via Provider 217 (Fulfill Engine). All sleeve-related print area positions are
 * accepted by Printify's PUT product API but silently dropped from print_areas:
 *
 *   left_sleeve       → silently dropped (not supported)
 *   right_sleeve      → silently dropped (not supported)
 *   sleeve_left       → silently dropped (not supported)
 *   left_arm          → silently dropped (not supported)
 *   left_sleeve_dtf   → silently dropped (not supported)
 *   left_wrist_dtf    → silently dropped (not supported)
 *
 * Blueprint 706 + Provider 217 only supports "front" and "back" print areas.
 * The `person-3-left-sleeve` and `person-4-right-sleeve` camera angles exist
 * in Printify's mockup generator for this blueprint, but they always show a
 * blank sleeve — no design can be placed there via DTG with this provider.
 *
 * VARIANT DISCOVERY: Printify stores ALL 139 blueprint variant IDs in print_areas
 * (not just the 10 enabled ones). A PUT must cover all 139; splitting into 2 groups
 * (e.g. White vs Dark) works as long as every ID is covered somewhere.
 *
 * ALTERNATIVE: Printful (Provider 410) is known to support sleeve printing on
 * t-shirt blueprints. Switching would require recreating the product from scratch
 * with Printful-specific variant IDs, pricing, and potentially different shipping.
 *
 * STATUS: Product remains at original state (1 group, 139 variants, front=artwork only).
 *         No changes to the live Printify product. No changes to provision-merch.ts.
 */

export {};
