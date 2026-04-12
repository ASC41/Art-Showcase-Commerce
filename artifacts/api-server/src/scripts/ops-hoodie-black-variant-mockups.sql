-- ops: update hoodie mockup_images — variant mix, cuff-free camera angles, and carousel order.
--
-- Problem 1 (variant):
--         Printify's mockup generator does not render the front_left_chest print area
--         in front-facing shots for the White variant. White-variant front images show a
--         blank hoodie; the wordmark is invisible. Fix: use Black variant (32920=Black/L)
--         for person/collar shots so the white wordmark is high-contrast on dark fabric.
--
-- Problem 2 (ghost front):
--         The flat "front" ghost/mannequin shot (camera 98424) does NOT render
--         front_left_chest in Printify's mockup generator for any variant.
--         Excluded entirely.
--
-- Problem 3 (cuff prints):
--         The "back-2" shot (camera 98426) is a three-quarter back view that captures
--         the sleeve cuff area. Printify's blueprint defines left_wrist_dtf and
--         right_wrist_dtf print positions, and this camera angle makes them visible
--         even though no design is placed there — Printify renders default/empty cuff
--         areas in a way that looks like an unintended print. Excluded entirely.
--         Replaced with "person-4-back" (camera 100682): a lifestyle back shot of a
--         person wearing the hoodie — shows the full artwork, no cuff issue.
--
-- Final carousel order (5 images):
--   1. back          (White/32912) — flat back view, full artwork
--   2. person-1      (Black/32920) — model front; white wordmark on left chest
--   3. collar-close  (Black/32920) — close-up of collar/chest area
--   4. person-4-back (Black/32920) — model back; full artwork in lifestyle context
--   5. folded        (White/32912) — product flat shot
--
-- Color-aware carousel (client-side): MerchLightbox.tsx swaps the variant ID in all
-- URLs when the user selects a color (Black/Navy/White), keeping the carousel unified.

UPDATE merch_products
SET mockup_images = ARRAY[
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98425/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=back',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/98427/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=person-1',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/100685/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=front-collar-closeup',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/100682/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=person-4-back',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98432/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=folded'
]::text[]
WHERE slug = 'hoodie';
