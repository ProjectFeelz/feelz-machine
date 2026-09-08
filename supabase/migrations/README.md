# Migrations

## The problem this fixes

Migrations 59 to 82 were written and applied by pasting them into the Supabase
SQL editor. They were never committed. The consequences have already cost real
time:

- **Migration 82 could not be reviewed.** Its detection block used a fragile
  `pg_attribute` lookup that was capable of silently matching nothing and still
  reporting success. Nobody could check what it had actually done, because there
  was no file to read — which is why For You and Browse stayed broken after it
  "worked".
- **`schema_dump.sql` is stale**, pulled before 59, so it does not describe the
  database either. There has been no accurate record of the schema in the repo
  for two dozen migrations.
- **The same bug was reintroduced three times.** 59, 64 and 74 all shipped the
  ambiguous-`RETURNS TABLE` mistake (a bare output-parameter name used as a
  column in the body, raising 42702). With the files in the repo that is one
  grep. Without them it was three separate outages.

**The SQL text of 59 to 82 is not recoverable from the database.** Postgres
applies statements; it does not keep the script. What *is* recoverable is the
state those migrations produced, and that is enough to start keeping records
from here on.

## Step 1 — baseline from the live database

The project is already linked (`supabase/.temp/linked-project.json`), so:

```bash
npx supabase login                 # once, if not already
npx supabase db pull               # writes supabase/migrations/<timestamp>_remote_schema.sql
```

`db pull` diffs the live database against the migrations it knows about — which
is none — and writes the whole current schema as one migration. That file is the
baseline: the true, reviewable state of the database as of today, standing in
for 1 to 82.

Commit it. From this point the repo and the database agree, and every later
change is a file next to it.

If `db pull` reports the remote is ahead or asks about migration history, this
is the case it is describing: an empty ledger against a populated database. It
is safe here, because it only reads.

## Step 2 — tell the ledger that the baseline is applied

```bash
npx supabase migration list                       # shows local vs remote
npx supabase migration repair --status applied <timestamp>
```

Without the repair, the next `db push` would try to *run* the baseline against a
database that already has all of it, and fail on the first `create table`. The
repair marks it applied without executing it.

Then confirm:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

## Step 3 — 83 is the first real migration

`83_finish_top_pick_ambiguity_fix.sql` is already here. Rename it to the
timestamp convention when you baseline, so ordering is unambiguous:

```
20260908120000_finish_top_pick_ambiguity_fix.sql
```

The CLI sorts by the leading timestamp, so a bare `83_` sorts before a
`2026...` baseline and would be attempted first. Numbers alone were fine while
migrations were run by hand; they are not once a tool is doing the ordering.

## From here on

1. Every schema change is a file in this directory, committed **before** it is
   run. If it is worth running against production it is worth reviewing.
2. `npx supabase db push` applies pending files. Use the SQL editor for reading
   and for emergencies, not as the way changes normally reach the database.
3. `npx supabase db pull` again whenever something was applied by hand anyway,
   so the drift is captured rather than forgotten.
4. **A migration must not be able to no-op silently.** Migration 82's
   `if v_constraint is not null then ... end if` reported success on a matched
   nothing. Either `raise notice` on both branches (as 83 does) or end the
   migration with a `select` that shows the state it claims to have produced.
5. Watch for the recurring one: any function declared `returns table(x ...)`
   must not use a bare `x` in its body. Those names are in scope for the whole
   body and Postgres cannot tell them from a column, so it raises 42702 and
   PostgREST returns 400. Alias every internal reference. This has shipped three
   times.
6. Any migration that adds a foreign key pointing at `tracks` or `artists`
   creates a second relationship between them and can break every embed in the
   app. Prefer a plain column plus a trigger for cleanup — a trigger cannot
   create a PostgREST relationship. See
   `claude/postgrest-artists-embed-outage.md` in the project for the full story.
7. After DDL that changes relationships, restart the API from the dashboard.
   `notify pgrst, 'reload schema'` only reaches the PostgREST instances that
   happen to be listening at that moment.

## Recovering the original 59 to 82 text, if you want it

Not needed for correctness — the baseline captures their result — but if you
want the history:

- **Supabase Studio → SQL Editor → saved snippets.** Anything you saved rather
  than ran-and-closed is still there, named, and can be pasted into files here.
- Studio keeps recent query history per browser profile. Older entries expire,
  so this is worth checking sooner rather than later.
- The conversation threads where each migration was written contain the full
  text of most of them.

File any you recover as `059_...` through `082_...` in this directory, marked at
the top as **reconstructed, already applied, do not run**. They are then
greppable, which is the whole point, without ever being executed by the CLI.