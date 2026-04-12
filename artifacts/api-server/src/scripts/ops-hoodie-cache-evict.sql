-- ops-hoodie-cache-evict.sql
-- Run once after the hoodie redesign (Task #7) to evict all cached per-artwork
-- mockup rows for the hoodie. The hoodie's printAreaPosition changed from "front"
-- to "back" and a signatureConfig was added, making all previously generated
-- merch_artwork_products rows for this slug stale.
--
-- Safe to re-run: DELETE WHERE is idempotent.
-- After running this, the next request to POST /merch/:slug/artwork-products
-- will regenerate fresh mockups using the new back-print + signature layout.

DELETE FROM merch_artwork_products
WHERE merch_product_id = (
  SELECT id FROM merch_products WHERE slug = 'hoodie'
);
