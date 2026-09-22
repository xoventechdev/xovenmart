UPDATE admin_users
SET password_hash = crypt('XovenAdmin2026', gen_random_bytes(6)),
    updated_at = now()
WHERE email = 'mdkamalhosennn@gmail.com'
RETURNING id, email;
