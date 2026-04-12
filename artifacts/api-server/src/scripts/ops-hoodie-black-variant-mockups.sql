-- ops: update hoodie mockup_images to mix Black variant (front/collar/person) with
--       White variant (back/folded) for maximum visual clarity.
--
-- Problem: Printify's mockup generator does not render the front_left_chest print area
--          in front-facing shots for the White variant. All White-variant front images
--          show a blank white hoodie. The wordmark is invisible.
--
-- Fix:    Swap front/collar/person images to use Black variant (32920=Black/L).
--         Note: task doc mentioned 32918 (Black/S) but Printify's API returns variant 32920
--         (Black/L) in the CDN mockup URLs for the Black color group — both are in the same
--         darkVariantIds set and render the same image. 32920 is used here because it is
--         the representative variant ID that Printify embeds in the CDN URL path.
--         The white wordmark on black fabric is clearly visible at high contrast.
--         Back images remain White variant (32912=White/L) — artwork shows best there.
--
-- Additional fix: The flat "front" ghost/mannequin shot (camera 98424) does NOT render
--         the front_left_chest print area in Printify's mockup generator regardless of
--         variant color. The wordmark is only visible in person/lifestyle shots (person-1,
--         person-2) where a real person wearing the hoodie shows the left chest area.
--         The flat front shot has been removed and replaced with two person shots.
--
-- Final carousel order:
--   1. back          (White variant 32912) — full artwork view
--   2. collar-close  (Black variant 32920) — close-up of collar/chest area
--   3. person-1      (Black variant 32920) — person wearing hoodie; white wordmark on chest
--   4. person-2      (Black variant 32920) — second person shot; wordmark visible
--   5. back-2        (White variant 32912) — secondary back angle, artwork
--   6. folded        (White variant 32912) — product flat shot
--
-- Color-aware carousel (client-side): MerchLightbox.tsx swaps the variant ID in all URLs
-- when the user selects a color (Black/Navy/White), so the whole carousel stays unified.

UPDATE merch_products
SET mockup_images = ARRAY[
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98425/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=back',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/100685/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=front-collar-closeup',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/98427/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=person-1',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32920/98428/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=person-2',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98426/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=back-2',
  'https://images-api.printify.com/mockup/69db36a8cca0c3b3780bb3a2/32912/98432/grin-and-bear-it-gildan-pullover-hoodie.jpg?camera_label=folded'
]::text[]
WHERE slug = 'hoodie';
