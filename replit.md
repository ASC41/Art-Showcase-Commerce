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

## Frontend Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Landing.tsx` | GalleryX Framer — infinite draggable 3D grid |
| `/portfolio` | `Portfolio.tsx` | ScrollGrid with 3D animation + ArtworkLightbox |
| `/about` | `About.tsx` | Artist bio, contact info |
| `/order/success` | `OrderSuccess.tsx` | Post-purchase confirmation with verify call |

### Key Components
- **`GalleryX`** — Framer component at `src/framer/gallery-x.jsx` (unframer package). Used on landing page with real artwork data.
- **`ScrollGrid`** — Adapted FramerScroll3DGrid with framer-motion scroll animations, 6 animation styles, hover overlays, and onclick handling.
- **`ArtworkLightbox`** — Full-screen overlay with artwork details, status/price, Buy Original/Buy Print CTAs, keyboard nav (arrows + Escape).
- **`Navbar`** — Fixed top nav with Ryan Cellar wordmark and Portfolio/About links.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/artworks` | List all 20 artworks (featured first) |
| GET | `/api/artworks/:slug` | Get artwork by slug |
| POST | `/api/checkout/session` | Create Stripe checkout session |
| POST | `/api/checkout/verify` | Verify payment and fulfill order |

### Checkout Flow
1. Frontend calls `POST /api/checkout/session` with `artworkSlug`, `purchaseType` (original | print), `successUrl`, `cancelUrl`
2. Backend creates Stripe session and returns `{ url, sessionId }`
3. User redirected to Stripe Checkout
4. On success, Stripe redirects to `/order/success?session_id=SESSION_ID`
5. Frontend calls `POST /api/checkout/verify` with `sessionId`
6. Backend verifies with Stripe, marks artwork as sold (originals), sends Gmail notification, creates Printify order (prints)

### Print Price
Prints are priced at $45 (4500 cents) — hard-coded in `checkout.ts`.

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
