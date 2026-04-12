-- ops: update hoodie mockup_images to mix Black variant (front/collar/person) with
--       White variant (back/folded) for maximum visual clarity.
--
-- Problem: Printify's mockup generator does not render the front_left_chest print area
--          in front-facing shots for the White variant. All White-variant front images
--          show a blank white hoodie. The wordmark is invisible.
--
-- Fix:    Swap front/collar/person images to use Black variant (32920=Black/L).
--         The white wordmark on black fabric is clearly visible at high contrast.
--         Back images remain White variant (32912=White/L) — artwork shows best there.
--
-- Final carousel order:
--   1. back          (White variant 32912) — full artwork view
--   2. collar-close  (Black variant 32920) — white wordmark clearly visible on chest
--   3. front         (Black variant 32920) — white wordmark on black hoodie
--   4. person-1      (Black variant 32920) — lifestyle shot, wordmark visible
--   5. back-2        (White variant 32912) — secondary back angle, artwork
--   6. folded        (White variant 32912) — product shot

UPDATE merch_products
SET mockup_images = ARRAY[
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98425/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=back',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/100685/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=front-collar-closeup',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/98424/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=front',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/98427/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=person-1',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98426/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=back-2',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98432/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=folded'
]::text[]
WHERE slug = 'hoodie';
