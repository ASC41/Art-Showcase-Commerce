import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export interface MerchVariant {
  id: number;
  title: string;
  color: string;
  size: string;
  /** Per-variant print area dimensions (used for giclée-style per-size scaling) */
  areaW?: number;
  areaH?: number;
}

/**
 * Per-product signature/wordmark placement config.
 * When present, the product has a secondary print area (e.g. front_left_chest)
 * with a color-aware wordmark: dark variants get the white wordmark, light
 * variants get the black wordmark.
 */
export interface SignatureConfig {
  position: string;
  whiteWordmarkUrl: string;
  blackWordmarkUrl: string;
  /** Variant IDs that should receive the white wordmark (dark garments) */
  darkVariantIds: number[];
  /** Variant IDs that should receive the black wordmark (light garments) */
  lightVariantIds: number[];
  areaWidth: number;
  areaHeight: number;
  /**
   * Optional placement overrides. Defaults: x=0.5, y=0.5 (centered).
   * signatureScale overrides the computed contain-scale — use when the wordmark
   * should be smaller than a full contain-fit of the print area (e.g. a small
   * upper-back logo on a large back print area).
   */
  signatureX?: number;
  signatureY?: number;
  signatureScale?: number;
  /**
   * When the wordmark should appear on multiple print areas simultaneously
   * (e.g. both wrists of a crewneck), list all positions here.
   * If set, overrides `position` for the purposes of placeholder generation.
   * `position` is still used for camera-priority and variant-preference logic.
   */
  signaturePositions?: string[];
}

export const merchProductsTable = pgTable("merch_products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  estimatedCostCents: integer("estimated_cost_cents"),
  blueprintId: integer("blueprint_id").notNull(),
  printProviderId: integer("print_provider_id").notNull(),
  printAreaPosition: text("print_area_position").notNull().default("front"),
  printAreaWidth: integer("print_area_width"),
  printAreaHeight: integer("print_area_height"),
  printifyProductId: text("printify_product_id"),
  mockupImages: text("mockup_images").array(),
  variants: jsonb("variants").$type<MerchVariant[]>(),
  signatureConfig: jsonb("signature_config").$type<SignatureConfig>(),
  category: text("category").notNull().default("apparel"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MerchProduct = typeof merchProductsTable.$inferSelect;

// ── Lazy per-artwork product cache ──────────────────────────────────────────
// Created on first purchase of a given artwork × merch combination
export const merchArtworkProductsTable = pgTable("merch_artwork_products", {
  id: serial("id").primaryKey(),
  merchProductId: integer("merch_product_id").notNull(),
  artworkId: integer("artwork_id").notNull(),
  printifyProductId: text("printify_product_id").notNull(),
  mockupImages: text("mockup_images").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Merch orders ──────────────────────────────────────────────────────────────
export const merchOrderStatusEnum = pgEnum("merch_order_status", [
  "pending",
  "paid",
  "fulfilled",
  "failed",
]);

export const merchOrdersTable = pgTable("merch_orders", {
  id: serial("id").primaryKey(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  merchProductId: integer("merch_product_id").notNull(),
  artworkId: integer("artwork_id").notNull(),
  variantId: integer("variant_id").notNull(),
  printifyOrderId: text("printify_order_id"),
  status: merchOrderStatusEnum("status").notNull().default("pending"),
  customerEmail: text("customer_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MerchOrder = typeof merchOrdersTable.$inferSelect;
