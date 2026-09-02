@echo off
set PGPASSWORD=13.kK133p
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -At -c "SELECT version()"
