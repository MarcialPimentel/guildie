-- ONE-TIME fresh start: deletes ALL players and everything they own, and resets the market.
-- Used at the M1 deploy so every playtester starts equal. Import in phpMyAdmin only when told to.
-- Tables are kept; only their rows are removed.

DELETE FROM activity;
DELETE FROM trades;
DELETE FROM listings;
DELETE FROM market_demand;
DELETE FROM market_items;
DELETE FROM craft_jobs;
DELETE FROM gathering;
DELETE FROM player_professions;
DELETE FROM inventory;
DELETE FROM sessions;
DELETE FROM login_failures;
DELETE FROM players;
