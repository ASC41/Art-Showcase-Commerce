-- Ops: rename "Untitled 01" → "She Runs These Hills"
-- Applied: 2026-04-12

UPDATE artworks SET
  slug       = 'she-runs-these-hills',
  title      = 'She Runs These Hills',
  medium     = 'Acrylic and Oil on Canvas',
  dimensions = '6'' by 4'''
WHERE slug = 'untitled-01';
-- RETURNING confirmed: 1 row updated
