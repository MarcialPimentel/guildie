# Migrations

SQL files that build and change the database, applied **in order** in phpMyAdmin:

- `001_init.sql`: players, sessions, inventory, game_state (issue #3)

Rules:
- Never edit a migration that has already been applied; add a new numbered file instead.
- Every table uses InnoDB and utf8mb4.
