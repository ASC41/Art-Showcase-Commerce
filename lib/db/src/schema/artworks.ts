import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const artworkStatusEnum = pgEnum("artwork_status", [
  "available",
  "sold",
  "unavailable",
]);

export const artworksTable = pgTable("artworks", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  medium: text("medium"),
  dimensions: text("dimensions"),
  price: integer("price"),
  status: artworkStatusEnum("status").notNull().default("available"),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  isFeatured: boolean("is_featured").notNull().default(false),
  year: integer("year"),
  printifyMatteProductId: text("printify_matte_product_id"),
  printifyFramedProductId: text("printify_framed_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertArtworkSchema = createInsertSchema(artworksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type Artwork = typeof artworksTable.$inferSelect;
