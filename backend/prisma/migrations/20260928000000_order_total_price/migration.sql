-- ORD-01: authoritative order total. Added nullable, backfilled, then made NOT NULL.
ALTER TABLE "orders" ADD COLUMN "totalPrice" DECIMAL(18,2);

-- Auction orders: the winning bid amount is the agreed total.
UPDATE "orders" o
SET "totalPrice" = b."amount"
FROM "auctions" a
JOIN "bids" b ON b."id" = a."winningBidId"
WHERE o."sourceType" = 'AUCTION' AND o."auctionId" = a."id";

-- Offer orders (and any auction order without a recorded winning bid): quantity * unit price.
UPDATE "orders" SET "totalPrice" = "quantity" * "agreedPrice" WHERE "totalPrice" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "totalPrice" SET NOT NULL;
