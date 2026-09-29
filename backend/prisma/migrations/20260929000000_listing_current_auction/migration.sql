-- STK-02: a listing can hold many auctions (a relist after a cancelled or no-bid auction adds a
-- new one); listings."auctionId" points at the current one.
ALTER TABLE "listings" ADD COLUMN "auctionId" TEXT;

-- Until now each listing had at most one auction, so that auction is its current one.
UPDATE "listings" l
SET "auctionId" = a."id"
FROM "auctions" a
WHERE a."listingId" = l."id";

DROP INDEX "auctions_listingId_key";

CREATE INDEX "auctions_listingId_idx" ON "auctions"("listingId");

CREATE UNIQUE INDEX "listings_auctionId_key" ON "listings"("auctionId");

ALTER TABLE "listings" ADD CONSTRAINT "listings_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
