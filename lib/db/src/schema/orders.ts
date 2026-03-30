import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderTypeEnum = pgEnum("order_type", ["original", "print"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "fulfilled",
  "failed",
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  artworkId: integer("artwork_id").notNull(),
  type: orderTypeEnum("type").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  printifyOrderId: text("printify_order_id"),
  status: orderStatusEnum("status").notNull().default("pending"),
  customerEmail: text("customer_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
