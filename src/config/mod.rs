use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct NetworkConfig {
    host: String,
    port: u16,
    dry_run: bool,
    rollback_dir: PathBuf,
}

impl NetworkConfig {
    pub fn load() -> Self {
        let host = env::var("ASTRAL_NETWORK_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = env::var("ASTRAL_NETWORK_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8086);
        let dry_run = env::var("ASTRAL_NETWORK_DRY_RUN")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);
        let rollback_dir = env::var("ASTRAL_NETWORK_ROLLBACK_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/var/lib/astral-network/rollback"));

        Self {
            host,
            port,
            dry_run,
            rollback_dir,
        }
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn dry_run(&self) -> bool {
        self.dry_run
    }

    pub fn rollback_dir(&self) -> &PathBuf {
        &self.rollback_dir
    }
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self::load()
    }
}
