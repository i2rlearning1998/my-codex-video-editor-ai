# Features & access: who gets what

This is for the owner. Owner App › **Features & access**.

## Features

Each feature (its key is the one plans already list) has a label in English and Hindi, what it gates, and:

- **On for everyone**: off means off for everyone right now.
- **Share of people (%)**: 100 is everyone whose plan has it; less gives it only to that share (the same people every time).
- **Beta**: only that share gets it, plan or not, for early testing.

## Plans

A grid of features by plan, and every limit with its name (exports a month, highest export, storage, voice clones, projects, videos per project, calls a minute, credits a day; empty means no limit). **Copy a plan** makes a new one. A plan with people cannot be deleted; tick **Archived** instead (it takes no new people and its people keep it).

## Overrides and groups

Give one person (by email) or a group (`cohort:<id>`) a feature on or off, or a limit, until a date or for good. A note is required ("Write a short note about why this person gets this, so you remember later.") and your password and code are asked. An override whose end has passed is marked "This override has ended and is no longer used."

Groups hold up to 500 emails (paste them or import a text file).

## The order

1. Emergency, or the feature switched off for everyone.
2. A personal override that has not ended.
3. A group's override.
4. Beta and the share of people.
5. The plan.

The server decides with this order for the panel, the editor and Claude; the panel reads the answer at its next load. **Who has this?** lists every person with the reason ("Included in the Pro plan.", "In the group that gets this first (25 percent).", ...) and a count.

Overrides and groups are kept on the server only (they hold emails and your notes). The Supabase table `access_rules` is written in supabase/migrations/20261116100000_round_c5_access.sql and has not been run on a real Supabase yet.
