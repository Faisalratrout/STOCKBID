-- Schema prep for four post-MVP items surfaced by the frontend design review (minimum order
-- quantity, watchlist, seller reviews, notification preferences). Additive only: nullable
-- columns, sensible defaults, no endpoint or UI reads/writes any of this yet.

ALTER TABLE "users"
  ADD COLUMN "notifyNewOffers" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyCounterOffers" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyAuctionUpdates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMarketingEmails" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "listings" ADD COLUMN "minOrderQuantity" INTEGER;

CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "watchlist_items_userId_listingId_key" ON "watchlist_items"("userId", "listingId");
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reviews_orderId_key" ON "reviews"("orderId");
CREATE INDEX "reviews_revieweeId_idx" ON "reviews"("revieweeId");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
