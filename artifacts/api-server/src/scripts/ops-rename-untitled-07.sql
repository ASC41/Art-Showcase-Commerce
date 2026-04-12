-- Ops: rename "Untitled 07" → "The Lights Too Bright, The Sound Too Loud"
-- Applied: 2026-04-12
-- This UPDATE was executed directly against the live database.

UPDATE artworks SET
  slug        = 'the-lights-too-bright-the-sound-too-loud',
  title       = 'The Lights Too Bright, The Sound Too Loud',
  medium      = 'Oil and Ink on Canvas',
  dimensions  = '4'' by 4''',
  status      = 'sold',
  description = NULL
WHERE slug = 'untitled-07';
-- RETURNING confirmed: 1 row updated
