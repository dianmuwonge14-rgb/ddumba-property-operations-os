use serde::Serialize;

#[derive(Serialize)]
pub struct SyncEngineStatus {
    authoritative_backend: &'static str,
    idempotency_key: &'static str,
    financial_posting_mode: &'static str,
}

pub fn sync_engine_status() -> SyncEngineStatus {
    SyncEngineStatus {
        authoritative_backend: "production Supabase",
        idempotency_key: "desktop offline transaction UUID",
        financial_posting_mode: "server RPC required before posting",
    }
}
