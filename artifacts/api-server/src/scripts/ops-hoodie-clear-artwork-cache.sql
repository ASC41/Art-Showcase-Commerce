-- ops: clear cached artwork-specific Printify products for the hoodie.
--
-- Run this after any change to the hoodie carousel image order or variant selection
-- so that the next artwork selection regenerates mockup images using the current logic.
--
-- Safe to run repeatedly; re-generation happens automatically on next request.

DELETE FROM merch_artwork_products
WHERE merch_product_id = (SELECT id FROM merch_products WHERE slug = 'hoodie');
