use std::process::Command;
use tracing::{debug, info};

pub trait CommandExecutor: Send + Sync {
    fn execute(&self, cmd: &str) -> Result<String, String>;
    fn is_dry_run(&self) -> bool;
}

pub struct SystemCommandExecutor {
    dry_run: bool,
}

impl SystemCommandExecutor {
    pub fn new(dry_run: bool) -> Self {
        Self { dry_run }
    }
}

impl CommandExecutor for SystemCommandExecutor {
    fn execute(&self, cmd: &str) -> Result<String, String> {
        if self.dry_run {
            info!("[DRY-RUN] Executing: {}", cmd);
            return Ok(String::new());
        }

        debug!("Executing shell command: {}", cmd);
        let output = Command::new("sh")
            .arg("-c")
            .arg(cmd)
            .output()
            .map_err(|e| format!("Failed to spawn command '{}': {}", cmd, e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if output.status.success() {
            Ok(stdout)
        } else {
            Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                format!("Command failed with exit code: {:?}", output.status.code())
            })
        }
    }

    fn is_dry_run(&self) -> bool {
        self.dry_run
    }
}
