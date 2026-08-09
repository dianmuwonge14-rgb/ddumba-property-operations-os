mod offline_store;
mod sync;

use offline_store::{init_offline_database, offline_store_status, save_cache_records, save_offline_payment, search_cache, OfflineCacheEnvelope, OfflinePaymentDraft, OfflineSearchResult, OfflineStoreStatus};
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
            desktop_sync_engine_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ddumba Property Operations OS desktop shell");
}
