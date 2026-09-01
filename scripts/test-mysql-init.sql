-- Test-container init script for the MySQL adapter integration suite.
-- The MySqlAdapter provisions per-tenant databases (CREATE/DROP DATABASE),
-- which needs privileges beyond the single database MYSQL_USER is granted
-- by default. Runs automatically on first boot via docker-compose.test.yml.
GRANT ALL PRIVILEGES ON *.* TO 'test'@'%';
FLUSH PRIVILEGES;
