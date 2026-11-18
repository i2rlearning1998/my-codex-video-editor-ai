# Real test guide for the owner

The full step-by-step guide (plain Hinglish, with tick boxes) is the document
"Testing Guide: Website, Panel, AI Mode, Admin aur Claude (MCP)" in the owner's
claude.ai (Artifacts). It covers: PC setup, getting the project, the settings
file, starting the programs, testing the website, panel, Director, AI mode,
editor, Admin, Supabase, and Claude through the connector, plus an error table
and a bug-report template.

The files it uses are in `test-kit/` (double-click `.bat` files, no commands to
type). `test-kit/settings.env.example` is the settings template: copy it to
`test-kit/settings.env` (never committed).

Order: `1-INSTALL-AND-BUILD.bat`, `5-CREATE-ADMIN-ACCOUNT.bat` (once), then
`2-START-SERVER.bat`, `3-START-SITE-PANEL-EDITOR.bat`, `4-START-ADMIN.bat`.
For Claude: `6-START-TUNNEL.bat`. For Supabase tables: `7-SUPABASE-MAKE-TABLES.bat`.
