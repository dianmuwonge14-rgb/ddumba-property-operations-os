mod offline_store;
mod sync;

use offline_store::{
    get_desktop_session, init_offline_database, list_offline_mutations, offline_store_status, save_cache_records,
    save_desktop_session, save_offline_mutation, save_offline_payment, search_cache, update_offline_mutation_status,
    DesktopSessionDraft, OfflineCacheEnvelope, OfflineMutationDraft, OfflineMutationRow, OfflinePaymentDraft,
    OfflineSearchResult, OfflineStoreStatus,
};
use sync::{sync_engine_status, SyncEngineStatus};

#[tauri::command]
fn desktop_offline_store_status(app: tauri::AppHandle) -> OfflineStoreStatus {
    offline_store_status(app)
}

#[tauri::command]
fn desktop_init_offline_database(app: tauri::AppHandle) -> Result<OfflineStoreStatus, String> {
    init_offline_database(app)
}

#[tauri::command]
fn desktop_save_cache_records(app: tauri::AppHandle, records: Vec<OfflineCacheEnvelope>) -> Result<usize, String> {
    save_cache_records(app, records)
}

#[tauri::command]
fn desktop_search_cache(app: tauri::AppHandle, query: String, cache_types: Vec<String>, office_id: Option<String>, limit: Option<u32>) -> Result<Vec<OfflineSearchResult>, String> {
    search_cache(app, query, cache_types, office_id, limit)
}

#[tauri::command]
fn desktop_save_offline_payment(app: tauri::AppHandle, payment: OfflinePaymentDraft) -> Result<String, String> {
    save_offline_payment(app, payment)
}

#[tauri::command]
fn desktop_save_offline_mutation(app: tauri::AppHandle, mutation: OfflineMutationDraft) -> Result<String, String> {
    save_offline_mutation(app, mutation)
}

#[tauri::command]
fn desktop_list_offline_mutations(app: tauri::AppHandle, statuses: Option<Vec<String>>, limit: Option<u32>) -> Result<Vec<OfflineMutationRow>, String> {
    list_offline_mutations(app, statuses, limit)
}

#[tauri::command]
fn desktop_update_offline_mutation_status(app: tauri::AppHandle, transaction_uuid: String, sync_status: String, server_acknowledgement_id: Option<String>, failure_reason: Option<String>) -> Result<(), String> {
    update_offline_mutation_status(app, transaction_uuid, sync_status, server_acknowledgement_id, failure_reason)
}

#[tauri::command]
fn desktop_save_session(app: tauri::AppHandle, session: DesktopSessionDraft) -> Result<(), String> {
    save_desktop_session(app, session)
}

#[tauri::command]
fn desktop_get_session(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    get_desktop_session(app)
}

#[tauri::command]
fn desktop_sync_engine_status() -> SyncEngineStatus {
    sync_engine_status()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            desktop_offline_store_status,
            desktop_init_offline_database,
            desktop_save_cache_records,
            desktop_search_cache,
            desktop_save_offline_payment,
            desktop_save_offline_mutation,
            desktop_list_offline_mutations,
            desktop_update_offline_mutation_status,
            desktop_save_session,
            desktop_get_session,
            desktop_sync_engine_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ddumba Property Operations OS desktop shell");
}
