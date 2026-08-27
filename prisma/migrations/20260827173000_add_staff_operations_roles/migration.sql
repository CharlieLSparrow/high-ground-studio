-- Platform operations are deliberately separate from customer-facing product
-- roles and project/Nest access. These roles grant narrowly scoped back-office
-- capabilities; they do not expose customer content or make the holder a
-- Quipsly product owner.
ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'SUPPORT_AGENT';
ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'PRODUCT_ANALYST';
