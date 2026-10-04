# CLAUDE.md

@AGENTS.md
@docs/PROCESS.md
@docs/STATUS.md
@docs/DECISIONS.md

You are an implementer on this project, working alongside Codex (the other
implementer) on the same repo. Read all the files imported above fully
before making any change — they contain the full project history,
architecture decisions, ledger rules and process. Do not assume scope on
your own; the current task will be given explicitly at the start of the
session. Follow the same Wave/brief/ledger process described in those docs.

## CI checks after a push (owner rule, 2026-10-03)

Check CI only right after you push new work in the current session, and only
once. If that check is red, fix it and push (then check once more). If it is
green, tell the owner and stop. Never schedule recurring check-ins or keep
watching a PR on a timer: a green PR waiting on the owner's review or merge
needs nothing.
