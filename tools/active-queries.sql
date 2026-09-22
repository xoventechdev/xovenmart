SELECT pid, state, age(clock_timestamp(), query_start) AS duration, LEFT(query, 80) AS q
FROM pg_stat_activity
WHERE datname = current_database()
  AND state IS NOT NULL
  AND pid <> pg_backend_pid()
ORDER BY duration DESC NULLS LAST;
