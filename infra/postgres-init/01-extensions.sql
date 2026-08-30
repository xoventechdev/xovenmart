-- Enable pg_trgm for Bangla-aware fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optional: unaccent for better search
CREATE EXTENSION IF NOT EXISTS unaccent;
