#!/usr/bin/env python3
"""
Check server/migrations before they ship (run in CI):
  - files are named NNN_name.sql, numbered 001, 002, ... with no gaps or duplicates
  - from 006 on, each file ends with the line "-- END NNN" (its own number). The server only applies a
    migration once that line is there, so a half-uploaded file is never run (server/app/lib/migrate.php).
  - no edits to migrations that are already live: compare against the last release with --base REF.

    python3 tools/check_migrations.py [--base origin/main]
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "server", "migrations")
FIRST_WITH_END_MARKER = 6
errors = []

files = sorted(f for f in os.listdir(DIR) if f.endswith(".sql"))
numbers = []
for f in files:
    m = re.fullmatch(r"(\d{3})_[a-z0-9_]+\.sql", f)
    if not m:
        errors.append(f"{f}: name must look like 006_short_name.sql")
        continue
    n = int(m.group(1))
    numbers.append(n)
    if n >= FIRST_WITH_END_MARKER:
        with open(os.path.join(DIR, f), encoding="utf-8") as fh:
            lines = fh.read().rstrip().splitlines()
        if not lines or lines[-1].strip() != f"-- END {n:03d}":
            errors.append(f"{f}: last line must be '-- END {n:03d}' (the server won't apply it otherwise)")

if numbers != list(range(1, len(numbers) + 1)):
    errors.append(f"migrations must be numbered 001..{len(numbers):03d} with no gaps or duplicates (found {numbers})")

if "--base" in sys.argv:
    base = sys.argv[sys.argv.index("--base") + 1]
    out = subprocess.run(["git", "diff", "--name-status", base, "--", "server/migrations"],
                         cwd=ROOT, capture_output=True, text=True)
    for line in out.stdout.splitlines():
        status, path = line.split("\t", 1)
        if status != "A" and path.endswith(".sql"):
            errors.append(f"{path}: already-applied migrations must never change; add a new numbered file instead")

if errors:
    print(f"Migrations INVALID ({len(errors)} problems):")
    for e in errors:
        print("  - " + e)
    sys.exit(1)
print(f"Migrations OK: {len(numbers)} files.")
