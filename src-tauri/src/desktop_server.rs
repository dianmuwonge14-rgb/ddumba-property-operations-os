use serde::Serialize;
use std::{
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct DesktopNextServer {
    child: Mutex<Option<Child>>,
    status: Mutex<DesktopNextServerStatus>,
}

#[derive(Clone, Default, Serialize)]
pub struct DesktopNextServerStatus {
    pub error: Option<String>,
    pub port: Option<u16>,
    pub ready: bool,
    pub url: Option<String>,
}

fn available_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Local server port could not be allocated: {error}"))?;
    let port = listener.local_addr().map_err(|error| format!("Local server port could not be read: {error}"))?.port();
    drop(listener);
    Ok(port)
}

fn resource_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map_err(|error| format!("Desktop resources could not be located: {error}"))
        .map(|dir| dir.join(path))
}

fn node_resource_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "node/windows/node.exe"
    }
    #[cfg(target_os = "macos")]
    {
        "node/macos/node"
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        "node/linux/node"
    }
}

fn wait_until_ready(url: &str, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if std::net::TcpStream::connect(url.trim_start_matches("http://")).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(160));
    }
    false
}

pub fn start_desktop_next_server(app: &AppHandle, state: &DesktopNextServer) -> DesktopNextServerStatus {
    if let Ok(status) = state.status.lock() {
        if status.ready {
            return status.clone();
        }
    }

    let port = match available_port() {
        Ok(port) => port,
        Err(error) => {
            let status = DesktopNextServerStatus { error: Some(error), ..Default::default() };
            if let Ok(mut current) = state.status.lock() {
                *current = status.clone();
            }
            return status;
        }
    };
    let url = format!("http://127.0.0.1:{port}");
    let server_dir = match resource_path(app, "next-app") {
        Ok(path) => path,
        Err(error) => {
            let status = DesktopNextServerStatus { error: Some(error), ..Default::default() };
            if let Ok(mut current) = state.status.lock() {
                *current = status.clone();
            }
            return status;
        }
    };
    let server_js = server_dir.join("server.js");
    let node_path = match resource_path(app, node_resource_name()) {
        Ok(path) => path,
        Err(error) => {
            let status = DesktopNextServerStatus { error: Some(error), ..Default::default() };
            if let Ok(mut current) = state.status.lock() {
                *current = status.clone();
            }
            return status;
        }
    };

    if !server_js.exists() {
        let status = DesktopNextServerStatus {
            error: Some(format!("Bundled Ddumba OS server is missing: {}", server_js.display())),
            ..Default::default()
        };
        if let Ok(mut current) = state.status.lock() {
            *current = status.clone();
        }
        return status;
    }
    if !node_path.exists() {
        let status = DesktopNextServerStatus {
            error: Some(format!("Bundled Node runtime is missing: {}", node_path.display())),
            ..Default::default()
        };
        if let Ok(mut current) = state.status.lock() {
            *current = status.clone();
        }
        return status;
    }

    let child = Command::new(node_path)
        .arg(server_js)
        .current_dir(&server_dir)
        .env("DDUMBA_DESKTOP", "1")
        .env("HOSTNAME", "127.0.0.1")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    match child {
        Ok(child) => {
            if let Ok(mut current_child) = state.child.lock() {
                *current_child = Some(child);
            }
            let ready = wait_until_ready(&format!("127.0.0.1:{port}"), Duration::from_secs(10));
            let status = DesktopNextServerStatus {
                error: if ready { None } else { Some("Local Ddumba OS server started but did not become ready in time.".to_string()) },
                port: Some(port),
                ready,
                url: Some(url),
            };
            if let Ok(mut current) = state.status.lock() {
                *current = status.clone();
            }
            status
        }
        Err(error) => {
            let status = DesktopNextServerStatus {
                error: Some(format!("Local Ddumba OS server could not start: {error}")),
                ..Default::default()
            };
            if let Ok(mut current) = state.status.lock() {
                *current = status.clone();
            }
            status
        }
    }
}
