-- ORD-04: an auction whose order is cancelled moves to this terminal state.
ALTER TYPE "AuctionStatus" ADD VALUE 'CANCELLED';
