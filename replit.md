# Ryan Cellar — Artist Gallery Website

A full-stack contemporary art gallery website for artist Ryan Cellar (ryancellart@gmail.com).

## Architecture

### Artifacts
- **`artifacts/artist-website/`** — React + Vite frontend at `/` (port 18258)
- **`artifacts/api-server/`** — Express API server at `/api` (port 8080)

### Shared Packages
- **`lib/db/`** — Drizzle ORM PostgreSQL schema and client (`@workspace/db`)
- **`lib/api-spec/`** — OpenAPI 3.1 spec with orval codegen
- **`lib/api-client-react/`** — Generated React Query hooks (`@workspace/api-client-react`)
- **`lib/api-zod/`** — Generated Zod validation schemas (`@workspace/api-zod`)

## Database Schema

### `artworks` table
- `id`, `slug`, `title`, `medium`, `dimensions`
- `price` — in cents (e.g. 75000 = $750)
- `status` — enum: `available | sold | unavailable`
- `image_url`, `is_featured`, `year`, `description`
- `created_at`

### `orders` table
- `id`, `artwork_id`, `type` (original | print), `stripe_session_id`
- `printify_order_id`, `status` (pending | paid | fulfilled | failed)
- `customer_email`, `created_at`, `updated_at`

### `merch_products` table
- `id`, `slug`, `name`, `description`, `price_cents`
- `blueprint_id`, `print_provider_id`, `print_area_position`
- `print_area_width`, `print_area_height`
- `printify_product_id` — template Printify product ID
- `mockup_images` — array of Printify-generated mockup image URLs
- `variants` — JSONB array of `{ id, title, color, size }`
- `category` — "apparel" | "accessories" | "print"
- `display_order`, `is_active`, `created_at`

### `merch_artwork_products` table
- Per-artwork Printify product cache (created lazily at first purchase)
- `merch_product_id`, `artwork_id`, `printify_product_id`

### `merch_orders` table
- `id`, `stripe_session_id`, `merch_product_id`, `artwork_id`, `variant_id`
- `printify_order_id`, `status` (pending | paid | fulfilled | failed)
- `customer_email`, `created_at`, `updated_at`

## Frontend Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Landing.tsx` | GalleryX Framer — infinite draggable 3D grid |
| `/portfolio` | `Portfolio.tsx` | ScrollGrid with 3D animation + ArtworkLightbox |
| `/merch` | `Merch.tsx` | Merch shop with animated product grid + MerchLightbox |
| `/about` | `About.tsx` | Artist bio, contact info |
| `/order/success` | `OrderSuccess.tsx` | Post-purchase confirmation with verify call |

### Key Components
- **`GalleryX`** — Framer component at `src/framer/gallery-x.jsx` (unframer package). Used on landing page with real artwork data.
- **`ScrollGrid`** — Adapted FramerScroll3DGrid with framer-motion scroll animations, 6 animation styles, hover overlays, and onclick handling.
- **`ArtworkLightbox`** — Full-screen overlay with artwork details, status/price, Buy Original/Buy Print CTAs, keyboard nav (arrows + Escape).
- **`MerchLightbox`** — Full-screen overlay with product mockup, artwork selector (thumbnail grid), size/color picker, and Buy Now CTA.
- **`Navbar`** — Fixed top nav with Ryan Cellar wordmark and Gallery/Portfolio/Merch/Inquire/About links.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/artworks` | List all 20 artworks (featured first) |
| GET | `/api/artworks/:slug` | Get artwork by slug |
| GET | `/api/merch` | List all active merch products |
| GET | `/api/merch/:slug` | Get single merch product |
| POST | `/api/checkout/session` | Create Stripe checkout session (artwork prints/originals) |
| POST | `/api/checkout/merch-session` | Create Stripe checkout session (merch) |
| POST | `/api/checkout/verify` | Verify payment and fulfill order |

### Merch Checkout Flow
1. Frontend calls `POST /api/checkout/merch-session` with `{ merchSlug, variantId, artworkSlug, successUrl, cancelUrl }`
2. Backend validates product + variant + artwork, creates Stripe session with metadata
3. User redirected to Stripe Checkout (includes shipping address collection)
4. Stripe webhook fires `checkout.session.completed`
5. Webhook checks `metadata.purchaseType === "merch"` → calls `fulfillMerchOrder`
6. Creates entry in `merch_orders` table, then creates Printify order

### Print Price
- Enhanced Matte: $45 (11x14), $65 (18x24), $95 (24x36)
- Framed Print: $85 (11x14), $115 (18x24), $165 (24x36)
- Matte Poster (merch): $20 (starting at 11×14)

## Merch Products (10 items)
| Slug | Name | Price | Category |
|------|------|-------|----------|
| tshirt | Comfort Colors T-Shirt | $32 | apparel |
| hoodie | Gildan Pullover Hoodie | $55 | apparel |
| crewneck | Gildan Crewneck Sweatshirt | $45 | apparel |
| dad-cap | Classic Dad Cap | $35 | accessories |
| phone-case | Tough Phone Case | $28 | accessories |
| tote-bag | All-Over Print Tote Bag | $45 | accessories |
| cuff-beanie | Cuff Beanie | $32 | accessories |
| bucket-hat | Bucket Hat | $32 | accessories |
| sweat-shorts | Sponge Fleece Sweat Shorts | $48 | apparel |
| matte-poster | Matte Art Poster | $20 | print |

## Merch Provisioning
```bash
# Create Printify template products for all merch items
pnpm --filter @workspace/api-server run provision-merch

# Force recreate all (--force flag)
pnpm --filter @workspace/api-server run provision-merch -- --force
```

## Artwork Data
All 20 artworks from Ryan Cellar, with CDN images from the GitHub-hosted jsdelivr CDN:
- **Featured/For Sale**: Grin and Bear It ($750), The Warm Waking Cold ($1000), Hands to Yourself ($750), Endure ($2500)
- **Sold**: Give Me Peace, Hilarity, Maybe Tomorrow, Our Lives, The Toast
- **Unavailable/Untitled**: Hope Far Away Hope, Untitled 01-10

## Design System
- Background: `#080808` (near-black)
- Text: `#f5f5f5`
- Muted: `#888`
- Available badge: `#4ade80` (green)
- Fonts: Cormorant Garamond (serif headings), Inter (body/UI)
- Google Fonts loaded in `index.html`

## Environment Variables Required
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (auto-provisioned) |
| `STRIPE_SECRET_KEY` | Stripe secret key for checkout |
| `GMAIL_APP_PASSWORD` | Gmail App Password for ryancellart@gmail.com |
| `PRINTIFY_API_KEY` | Printify API key for print fulfillment |
| `PRINTIFY_PRODUCT_ID` | Printify product ID for print orders |
| `PRINTIFY_VARIANT_ID` | Printify variant ID for print orders |

## Development Scripts
```bash
# Seed/reseed artwork database
pnpm --filter @workspace/api-server run seed

# Push DB schema changes
pnpm --filter @workspace/db run push

# Regenerate API client from spec
pnpm --filter @workspace/api-spec run codegen
```
