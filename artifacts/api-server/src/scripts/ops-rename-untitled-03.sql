-- Ops: rename "Untitled 03" → "A Cry For Help"
-- Applied: 2026-04-12

UPDATE artworks SET
  slug        = 'a-cry-for-help',
  title       = 'A Cry For Help',
  medium      = 'Acrylic and Oil on Canvas',
  dimensions  = '3'' by 4''',
  status      = 'sold',
  description = NULL
WHERE slug = 'untitled-03';
-- RETURNING confirmed: 1 row updated
