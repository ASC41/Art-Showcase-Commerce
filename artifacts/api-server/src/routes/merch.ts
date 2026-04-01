import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { merchProductsTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";

const router: IRouter = Router();

function mapMerchProduct(p: typeof merchProductsTable.$inferSelect) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    priceCents: p.priceCents,
    blueprintId: p.blueprintId,
    printProviderId: p.printProviderId,
    printAreaPosition: p.printAreaPosition,
    printAreaWidth: p.printAreaWidth ?? null,
    printAreaHeight: p.printAreaHeight ?? null,
    printifyProductId: p.printifyProductId ?? null,
    mockupImages: p.mockupImages ?? [],
    variants: (p.variants as Array<{ id: number; title: string; color: string; size: string }>) ?? [],
    category: p.category,
    displayOrder: p.displayOrder,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /api/merch — list all active merch products
router.get("/merch", async (_req, res) => {
  try {
    const products = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.isActive, true))
      .orderBy(asc(merchProductsTable.displayOrder));

    res.json(products.map(mapMerchProduct));
  } catch (err) {
    console.error("listMerch error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/merch/:slug — get single merch product
router.get("/merch/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [product] = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.slug, slug))
      .limit(1);

    if (!product || !product.isActive) {
      res.status(404).json({ error: "Merch product not found" });
      return;
    }

    res.json(mapMerchProduct(product));
  } catch (err) {
    console.error("getMerch error:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
