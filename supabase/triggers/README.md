# Triggers

Primary trigger implementation lives in:

- `../migrations/0005_indexes_triggers_audit.sql`

Trigger classes:

- `updated_at` automation.
- Audit logging for sensitive operational tables.
- Append-only protection for financial, audit, security, provider, and ledger records.

Future trigger migrations should stay focused and avoid mixing schema creation with trigger behavior.
