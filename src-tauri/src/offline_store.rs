use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct OfflineStoreStatus {
    encrypted_sqlite_planned: bool,
    cache_scope: &'static str,
    database_path: Option<String>,
    initialized: bool,
    search_target_ms: u16,
}

#[derive(Deserialize)]
pub struct OfflineCacheEnvelope {
    pub cache_type: String,
    pub id: String,
    pub office_id: Option<String>,
    pub search_text: Option<String>,
    pub payload: serde_json::Value,
    pub revision: Option<String>,
    pub synced_at: Option<String>,
}

#[derive(Deserialize)]
pub struct OfflinePaymentDraft {
    pub transaction_uuid: String,
    pub company_id: String,
    pub user_id: String,
    pub employee_id: Option<String>,
    pub office_id: String,
    pub tenant_id: String,
    pub room_id: Option<String>,
    pub amount: f64,
    pub payment_method: String,
    pub reference: Option<String>,
    pub business_date: String,
    pub local_created_at: String,
    pub base_revision: Option<String>,
    pub payload: serde_json::Value,
}

#[derive(Serialize)]
pub struct OfflineSearchResult {
    pub id: String,
    pub cache_type: String,
    pub office_id: Option<String>,
    pub payload: serde_json::Value,
}

fn app_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Desktop data directory is unavailable: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Desktop data directory could not be created: {error}"))?;
    Ok(dir.join("ddumba_offline.sqlite3"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let path = app_database_path(app)?;
    let connection = Connection::open(path).map_err(|error| format!("Desktop SQLite database could not be opened: {error}"))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("SQLite WAL mode could not be enabled: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign keys could not be enabled: {error}"))?;
    Ok(connection)
}

pub fn init_offline_database(app: AppHandle) -> Result<OfflineStoreStatus, String> {
    let connection = open_database(&app)?;
    connection
        .execute_batch(
            r#"
            create table if not exists meta (
              key text primary key,
              value text not null,
              updated_at text not null default current_timestamp
            );

            create table if not exists cache_records (
              cache_type text not null,
              id text not null,
              office_id text,
              search_text text,
              payload text not null,
              revision text,
              synced_at text,
              updated_at text not null default current_timestamp,
              primary key (cache_type, id)
            );

            create index if not exists idx_cache_records_search
              on cache_records(cache_type, search_text);
            create index if not exists idx_cache_records_office
              on cache_records(cache_type, office_id);

            create table if not exists offline_mutations (
              transaction_uuid text primary key,
              transaction_type text not null,
              company_id text not null,
              user_id text not null,
              employee_id text,
              office_id text,
              business_date text not null,
              local_created_at text not null,
              payload text not null,
              base_revision text,
              sync_status text not null,
              retry_count integer not null default 0,
              server_acknowledgement_id text,
              synced_at text,
              failure_reason text,
              updated_at text not null default current_timestamp
            );

            create index if not exists idx_offline_mutations_status
              on offline_mutations(sync_status, local_created_at);
            create index if not exists idx_offline_mutations_office_date
              on offline_mutations(office_id, business_date);

            create table if not exists offline_receipts (
              transaction_uuid text primary key references offline_mutations(transaction_uuid) on delete cascade,
              provisional_receipt_number text not null,
              authoritative_receipt_number text,
              receipt_payload text not null,
              print_status text not null default 'pending_sync',
              updated_at text not null default current_timestamp
            );
            "#,
        )
        .map_err(|error| format!("Desktop SQLite schema could not be created: {error}"))?;

    connection
        .execute(
            "insert into meta(key, value, updated_at) values('schema_version', '1', current_timestamp)
             on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
            [],
        )
        .map_err(|error| format!("Desktop SQLite schema version could not be saved: {error}"))?;

    Ok(offline_store_status_for_app(&app, true))
}

pub fn save_cache_records(app: AppHandle, records: Vec<OfflineCacheEnvelope>) -> Result<usize, String> {
    let mut connection = open_database(&app)?;
    let tx = connection.transaction().map_err(|error| format!("SQLite transaction could not start: {error}"))?;
    for record in &records {
        tx.execute(
            "insert into cache_records(cache_type, id, office_id, search_text, payload, revision, synced_at, updated_at)
             values(?1, ?2, ?3, ?4, ?5, ?6, ?7, current_timestamp)
             on conflict(cache_type, id) do update set
               office_id = excluded.office_id,
               search_text = excluded.search_text,
               payload = excluded.payload,
               revision = excluded.revision,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at",
            params![
                record.cache_type,
                record.id,
                record.office_id,
                record.search_text,
                record.payload.to_string(),
                record.revision,
                record.synced_at,
            ],
        ).map_err(|error| format!("Cached record could not be saved: {error}"))?;
    }
    tx.commit().map_err(|error| format!("SQLite cache transaction could not commit: {error}"))?;
    Ok(records.len())
}

pub fn save_offline_payment(app: AppHandle, payment: OfflinePaymentDraft) -> Result<String, String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "insert into offline_mutations(
                transaction_uuid, transaction_type, company_id, user_id, employee_id, office_id,
                business_date, local_created_at, payload, base_revision, sync_status, retry_count, updated_at
             ) values(?1, 'tenant_payment', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'waiting_to_sync', 0, current_timestamp)
             on conflict(transaction_uuid) do nothing",
            params![
                payment.transaction_uuid,
                payment.company_id,
                payment.user_id,
                payment.employee_id,
                payment.office_id,
                payment.business_date,
                payment.local_created_at,
                payment.payload.to_string(),
                payment.base_revision,
            ],
        )
        .map_err(|error| format!("Offline payment could not be saved: {error}"))?;

    let provisional = format!("OFFLINE-{}", &payment.transaction_uuid[..8].to_uppercase());
    let receipt_payload = serde_json::json!({
        "status": "OFFLINE - PENDING SYNC",
        "transactionUuid": payment.transaction_uuid,
        "tenantId": payment.tenant_id,
        "roomId": payment.room_id,
        "amount": payment.amount,
        "paymentMethod": payment.payment_method,
        "reference": payment.reference,
        "businessDate": payment.business_date,
        "localCreatedAt": payment.local_created_at
    });
    connection
        .execute(
            "insert into offline_receipts(transaction_uuid, provisional_receipt_number, receipt_payload, print_status, updated_at)
             values(?1, ?2, ?3, 'pending_sync', current_timestamp)
             on conflict(transaction_uuid) do update set
               receipt_payload = excluded.receipt_payload,
               updated_at = excluded.updated_at",
            params![payment.transaction_uuid, provisional, receipt_payload.to_string()],
        )
        .map_err(|error| format!("Offline receipt could not be saved: {error}"))?;

    Ok(provisional)
}

pub fn search_cache(app: AppHandle, query: String, cache_types: Vec<String>, office_id: Option<String>, limit: Option<u32>) -> Result<Vec<OfflineSearchResult>, String> {
    let connection = open_database(&app)?;
    let normalized = format!("%{}%", query.trim().to_lowercase());
    let max_rows = limit.unwrap_or(25).min(100);
    let types = if cache_types.is_empty() {
        vec!["room".to_string(), "tenant".to_string(), "landlord".to_string(), "defaulter".to_string()]
    } else {
        cache_types
    };
    let placeholders = types.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "select id, cache_type, office_id, payload from cache_records
         where cache_type in ({placeholders})
           and (? is null or office_id is null or office_id = ?)
           and (? = '%%' or lower(coalesce(search_text, payload)) like ?)
         order by case when lower(coalesce(search_text, '')) like replace(?, '%', '') || '%' then 0 else 1 end,
                  search_text asc
         limit ?"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = types.into_iter().map(|value| Box::new(value) as Box<dyn rusqlite::ToSql>).collect();
    params_vec.push(Box::new(office_id.clone()));
    params_vec.push(Box::new(office_id));
    params_vec.push(Box::new(normalized.clone()));
    params_vec.push(Box::new(normalized.clone()));
    params_vec.push(Box::new(normalized));
    params_vec.push(Box::new(max_rows));
    let params_refs = params_vec.iter().map(|value| value.as_ref()).collect::<Vec<_>>();
    let mut statement = connection.prepare(&sql).map_err(|error| format!("Offline search could not be prepared: {error}"))?;
    let rows = statement
        .query_map(params_refs.as_slice(), |row| {
            let payload_text: String = row.get(3)?;
            Ok(OfflineSearchResult {
                id: row.get(0)?,
                cache_type: row.get(1)?,
                office_id: row.get(2)?,
                payload: serde_json::from_str(&payload_text).unwrap_or(serde_json::Value::Null),
            })
        })
        .map_err(|error| format!("Offline search failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("Offline search row could not be read: {error}"))
}

fn offline_store_status_for_app(app: &AppHandle, initialized: bool) -> OfflineStoreStatus {
    let database_path = app_database_path(app).ok().map(|path| path.display().to_string());
    OfflineStoreStatus {
        encrypted_sqlite_planned: true,
        cache_scope: "authenticated company and authorised office data only",
        database_path,
        initialized,
        search_target_ms: 300,
    }
}

pub fn offline_store_status(app: AppHandle) -> OfflineStoreStatus {
    let initialized = app_database_path(&app).map(|path| path.exists()).unwrap_or(false);
    offline_store_status_for_app(&app, initialized)
}
