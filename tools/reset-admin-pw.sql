-- Reset admin password to a known value.
-- bcrypt format: $2a$<rounds>$<salt><hash>; the salt is the 22-char
-- string after the second $ and before the final 53-char hash.
-- We let pgcrypto's crypt() generate a fresh random salt each run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE admin_users
SET password_hash = crypt('XovenAdmin2026', gen_salt('bf', 10)),
    updated_at = now()
WHERE email = 'mdkamalhosennn@gmail.com'
RETURNING id, email, role;
