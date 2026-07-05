# Ddumba Property Operations OS

## Non-Destructive Upgrade Plan for Existing `Ddumba-attendance` Supabase Project

Status: Draft generated. Awaiting owner approval before execution.

Target project: `nkypietptxwzdfesyawx`

This plan upgrades the current live schema into the Version 1.0 Enterprise architecture without deleting, dropping, truncating, or resetting existing data.

## Safety Rules

The generated upgrade migrations follow these rules:

- No `DROP TABLE`.
- No `DROP COLUMN`.
- No `DELETE FROM`.
- No `TRUNCATE`.
- Existing tenant records are preserved.
- Existing room records are preserved.
- Existing employee/user-like records are preserved.
- Existing public tables are augmented instead of recreated.
- New enterprise tables are created with `create table if not exists`.
- Existing column names remain available for the current app.

Important: do not run `supabase db push` against the original `supabase/migrations/0001...0007` greenfield package. Use only the files under `supabase/upgrade_migrations/` after approval.

## 1. Existing Tables

The current remote public schema contains 16 existing tables:

| Table | Current Role |
|---|---|
| `activity_timeline` | Existing office activity feed. |
| `ai_insights` | Existing AI insight cards/feed. |
| `attendance` | Existing attendance records. |
| `cash_position` | Existing office cash summary. |
| `collections` | Existing collection/payment records. |
| `employees` | Existing staff records and PINs. |
| `expenses` | Existing expense records. |
| `landlord_payments` | Existing landlord payment records. |
| `landlords` | Existing landlord records. |
| `notifications` | Existing notification records. |
| `office_scores` | Existing office scoring records. |
| `offices` | Existing office records. |
| `promises` | Existing promise-to-pay records. |
| `properties` | Existing property records. |
| `rooms` | Existing room/unit records. |
| `tenants` | Existing tenant records. |

Existing row counts found during inspection:

| Table | Rows |
|---|---:|
| `offices` | 5 |
| `landlords` | 3 |
| `properties` | 3 |
| `rooms` | 5 |
| `tenants` | 3 |
| Other inspected existing tables | 0 |

## 2. Existing Columns

### `activity_timeline`

`id`, `office_id`, `event_type`, `event_description`, `actor`, `created_at`

### `ai_insights`

`id`, `office_id`, `insight_type`, `priority`, `title`, `description`, `created_at`

### `attendance`

`id`, `employee_id`, `office_id`, `clock_in`, `lunch_out`, `lunch_in`, `clock_out`, `late_minutes`, `status`, `created_at`

### `cash_position`

`id`, `office_id`, `collections`, `expenses`, `landlord_payments`, `cash_position`, `updated_at`

### `collections`

`id`, `collection_number`, `office_id`, `property_id`, `room_id`, `tenant_id`, `landlord_id`, `expected_amount`, `amount_paid`, `balance`, `collector_id`, `payment_method`, `created_at`

### `employees`

`id`, `full_name`, `employee_pin`, `office_id`, `role`, `phone`, `status`, `created_at`

### `expenses`

`id`, `expense_number`, `office_id`, `category`, `item`, `amount`, `receipt_url`, `entered_by`, `approved_by`, `created_at`

### `landlord_payments`

`id`, `landlord_id`, `office_id`, `amount`, `payment_method`, `created_at`

### `landlords`

`id`, `landlord_code`, `full_name`, `phone`, `national_id`, `trust_index`, `expected_income`, `advance_taken`, `amount_paid`, `balance_remaining`, `created_at`

### `notifications`

`id`, `office_id`, `title`, `message`, `is_read`, `created_at`

### `office_scores`

`id`, `office_id`, `collection_score`, `attendance_score`, `promise_score`, `expense_score`, `overall_score`, `updated_at`

### `offices`

`id`, `office_code`, `office_name`, `office_pin`, `manager_name`, `location`, `collection_target`, `expense_budget`, `office_score`, `office_health`, `status`, `created_at`

### `promises`

`id`, `tenant_id`, `room_id`, `amount`, `promise_date`, `office_id`, `assigned_staff`, `status`, `created_at`

### `properties`

`id`, `property_code`, `property_name`, `district`, `village`, `gps_location`, `office_id`, `landlord_id`, `total_units`, `occupied_units`, `vacant_units`, `expected_collection`, `created_at`

### `rooms`

`id`, `room_number`, `property_id`, `landlord_id`, `monthly_rent`, `outstanding_balance`, `status`, `created_at`

### `tenants`

`id`, `tenant_code`, `full_name`, `phone`, `alternative_phone`, `national_id`, `room_id`, `property_id`, `office_id`, `monthly_rent`, `balance`, `reliability_score`, `risk_score`, `created_at`

## 3. Missing Columns To Add To Existing Tables

### Company and tenancy scoping

Add `company_id` to:

`activity_timeline`, `ai_insights`, `attendance`, `cash_position`, `collections`, `employees`, `expenses`, `landlord_payments`, `landlords`, `notifications`, `office_scores`, `offices`, `promises`, `properties`, `rooms`, `tenants`

### Compatibility mappings

| Existing Table | Added Enterprise Columns |
|---|---|
| `offices` | `name`, `code`, `address`, `city`, `region`, `latitude`, `longitude`, `updated_at` |
| `properties` | `name`, `code`, `property_type`, `address`, `city`, `region`, `latitude`, `longitude`, `status`, `updated_at` |
| `rooms` | `office_id`, `floor`, `size_sq_m`, `updated_at` |
| `tenants` | `tenant_type`, `status`, `updated_at` |
| `employees` | `user_id`, `employee_code`, `job_title`, `department`, `employment_type`, `hire_date`, `termination_date`, `email`, `updated_at` |
| `collections` | `lease_id`, `type`, `reference_number`, `amount`, `due_date`, `paid_at`, `status`, `recorded_by`, `notes`, `updated_at` |
| `promises` | `lease_id`, `promised_amount`, `promised_date`, `fulfilled_at`, `created_by`, `notes`, `updated_at` |
| `expenses` | `property_id`, `category_id`, `expense_date`, `vendor`, `description`, `submitted_by`, `approved_at`, `updated_at` |
| `attendance` | `user_id`, `work_date`, `total_minutes`, `break_minutes`, `updated_at` |
| `cash_position` | `position_date` |
| `landlord_payments` | `settlement_id`, `payout_reference`, `paid_at`, `status`, `created_by`, `updated_at` |
| `office_scores` | `score_date`, `total_score`, `metadata`, `created_at` |
| `ai_insights` | `subject_type`, `subject_id`, `summary`, `confidence`, `severity`, `status`, `model_name`, `input_hash`, `metadata`, `resolved_at` |
| `notifications` | `recipient_type`, `recipient_id`, `channel`, `delivery_status` |

## 4. Missing Enterprise Tables

The upgrade creates missing enterprise tables, including:

`companies`, `users`, `roles`, `permissions`, `role_permissions`, `user_office_roles`, `user_devices`, `pin_credentials`, `security_events`, `system_settings`, `company_settings`, `office_settings`, `feature_flags`, `settings_change_requests`, `settings_versions`, `configuration_audit_logs`, `landlord_bank_accounts`, `property_landlords`, `room_status_history`, `tenant_contacts`, `document_types`, `attachments`, `tenant_documents`, `document_verifications`, `leases`, `lease_charges`, `lease_documents`, `move_in_records`, `move_out_records`, `eviction_cases`, `eviction_steps`, `rent_invoices`, `invoice_lines`, `payments`, `payment_allocations`, `receipts`, `tenant_ledger_entries`, `collector_assignments`, `collection_actions`, `promise_followups`, `arrears_snapshots`, `landlord_settlement_periods`, `management_fee_rules`, `landlord_settlements`, `landlord_settlement_lines`, `landlord_statements`, `landlord_payouts`, `landlord_payout_allocations`, `payment_provider_accounts`, `cash_accounts`, `bank_accounts`, `mobile_money_accounts`, `cash_transactions`, `cash_account_balances`, `cash_transfers`, `cash_reconciliations`, `cash_reconciliation_lines`, `daily_cash_positions`, `company_cash_positions`, `external_transaction_imports`, `external_transactions`, `transaction_reconciliation_matches`, `transaction_reconciliation_exceptions`, `payment_provider_webhook_events`, `reversal_requests`, `withdrawal_requests`, `withdrawal_approvals`, `expense_categories`, `expense_lines`, `expense_receipts`, `petty_cash_requests`, `petty_cash_disbursements`, `approval_workflows`, `approval_steps`, `approval_requests`, `approval_actions`, `field_agents`, `field_routes`, `field_route_stops`, `field_visits`, `field_visit_events`, `geofences`, `gps_validations`, `property_inspections`, `inspection_items`, `inspection_findings`, `maintenance_tickets`, `attendance_policies`, `work_schedules`, `employee_schedule_assignments`, `attendance_events`, `attendance_daily_summaries`, `attendance_corrections`, `attendance_correction_actions`, `absence_records`, `leave_requests`, `public_holidays`, `device_attendance_locks`, `payroll_profiles`, `payroll_periods`, `payroll_runs`, `payroll_items`, `payroll_adjustments`, `payroll_exports`, `communication_channels`, `message_templates`, `messages`, `message_recipients`, `message_delivery_attempts`, `message_delivery_events`, `communication_provider_logs`, `notification_failures`, `escalation_rules`, `reminders`, `broadcasts`, `notification_preferences`, `reports`, `report_runs`, `saved_report_views`, `report_access_logs`, `metric_definitions`, `metric_snapshots`, `office_collection_targets`, `collector_collection_targets`, `office_performance_components`, `office_performance_snapshots`, `office_rankings`, `executive_kpi_snapshots`, `dashboard_cache_snapshots`, `dashboard_refresh_runs`, `kpi_calculation_runs`, `company_reporting_periods`, `company_consolidation_snapshots`, `office_consolidation_snapshots`, `consolidation_adjustments`, `consolidated_report_exports`, `company_scorecards`, `performance_targets`, `ai_master_spreadsheets`, `ai_spreadsheet_rows`, `ai_validation_results`, `data_quality_checks`, `data_quality_findings`, `duplicate_candidates`, `ai_entity_suggestions`, `ai_action_feedback`, `automation_rules`, `automation_runs`, `automation_tasks`, `scheduled_jobs`, `backup_jobs`, `backup_runs`, `backup_artifacts`, `restore_requests`, `restore_drills`, `data_retention_policies`, `audit_logs`

## 5. Required Data Backfills

The upgrade backfills:

1. A default company record: `Ddumba Property Management`.
2. `company_id` onto all existing operational rows.
3. `offices.name` from `offices.office_name`.
4. `offices.code` from `offices.office_code`.
5. `properties.name` from `properties.property_name`.
6. `properties.code` from `properties.property_code`.
7. `properties.city` from `properties.district`.
8. `properties.region` from `properties.village`.
9. `rooms.office_id` from the related property.
10. `tenants.company_id`, `tenant_type`, and `status`.
11. `employees.employee_code` from the employee UUID when no code exists.
12. `collections.reference_number` from `collections.collection_number`.
13. `collections.amount` from `amount_paid`.
14. `promises.promised_amount` from `promises.amount`.
15. `promises.promised_date` from `promises.promise_date`.
16. `expenses.expense_date` from `created_at`.
17. `expenses.description` from `item`.
18. `attendance.work_date` from `clock_in` or `created_at`.
19. `landlord_payments.payout_reference` from the row ID.
20. `office_scores.total_score` from `overall_score`.
21. `ai_insights.summary` from `description`.
22. `ai_insights.severity` from `priority`.
23. `property_landlords` from existing `properties.landlord_id`.
24. Initial `room_status_history` from existing room status.
25. Active `leases` from existing tenant-room-property relationships.
26. Legacy rent invoices from positive tenant balances.
27. Legacy invoice lines from legacy balance invoices.
28. Legacy payments from positive collection amounts.
29. Legacy tenant ledger entries from positive tenant balances.
30. Office cash accounts for existing offices.
31. Legacy cash transactions from positive existing collections.

## 6. Compatibility Mappings

| Legacy Field | Enterprise Field |
|---|---|
| `offices.office_name` | `offices.name` |
| `offices.office_code` | `offices.code` |
| `offices.location` | `offices.city` |
| `properties.property_name` | `properties.name` |
| `properties.property_code` | `properties.code` |
| `properties.district` | `properties.city` |
| `properties.village` | `properties.region` |
| `tenants.room_id` | `leases.room_id` through generated active lease |
| `tenants.property_id` | `leases.property_id` through generated active lease |
| `tenants.balance` | `rent_invoices`, `invoice_lines`, `tenant_ledger_entries` |
| `collections.collection_number` | `collections.reference_number` |
| `collections.amount_paid` | `collections.amount`, `payments.amount`, `cash_transactions.amount` |
| `collections.collector_id` | preserved; future mapping to `collector_assignments` |
| `promises.amount` | `promises.promised_amount` |
| `promises.promise_date` | `promises.promised_date` |
| `expenses.item` | `expenses.description` |
| `expenses.category` | preserved; future mapping to `expense_categories` |
| `attendance.clock_in` / `clock_out` | preserved; future detailed events go into `attendance_events` |
| `landlord_payments` | future `landlord_payouts` and settlement allocation model |
| `cash_position` | future `daily_cash_positions` and `company_cash_positions` |
| `ai_insights.description` | `ai_insights.summary` |
| `ai_insights.priority` | `ai_insights.severity` |

## Generated Additive Migrations

Run only after approval:

1. `supabase/upgrade_migrations/0100_prepare_existing_tables_for_enterprise.sql`
2. `supabase/upgrade_migrations/0101_create_missing_enterprise_tables.sql`
3. `supabase/upgrade_migrations/0102_backfill_enterprise_relationships_and_seed.sql`
4. `supabase/upgrade_migrations/0103_additive_constraints_indexes_triggers.sql`
5. `supabase/upgrade_migrations/0104_stage_rls_for_new_enterprise_tables.sql`

## Validation Performed

Local static validation found:

- 16 remote-existing tables accounted for.
- 158 enterprise table creation statements generated.
- 0 missing foreign-key target tables across the upgrade set.
- 0 forward table references across the upgrade set.
- 0 `DROP TABLE`, `DROP COLUMN`, `DELETE FROM`, or `TRUNCATE` statements in the upgrade migrations.

## Approval Gate

Execution is paused.

No upgrade migration has been applied.

Approval is required before running any file in `supabase/upgrade_migrations/`.
