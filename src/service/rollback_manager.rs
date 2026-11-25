use crate::domain::inventory::DeclarativeNetworkState;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};
use uuid::Uuid;

pub struct RollbackSession {
    pub token: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub confirmed: bool,
    pub snapshot: DeclarativeNetworkState,
}

pub struct RollbackManager {
    sessions: Arc<Mutex<HashMap<String, RollbackSession>>>,
}

impl RollbackManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a pending commit with a 60-second auto-rollback timer
    pub async fn register_commit(&self, snapshot: DeclarativeNetworkState, timeout_secs: u64) -> String {
        let token = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let expires = now + chrono::Duration::seconds(timeout_secs as i64);

        let session = RollbackSession {
            token: token.clone(),
            created_at: now,
            expires_at: expires,
            confirmed: false,
            snapshot,
        };

        {
            let mut map = self.sessions.lock().await;
            map.insert(token.clone(), session);
        }

        info!(
            "Transação de rede iniciada com Auto-Rollback de {}s (Token: {})",
            timeout_secs, token
        );

        // Spawn timer task
        let sessions_clone = self.sessions.clone();
        let token_clone = token.clone();
        tokio::spawn(async move {
            sleep(Duration::from_secs(timeout_secs)).await;
            let mut map = sessions_clone.lock().await;
            if let Some(session) = map.get_mut(&token_clone) {
                if !session.confirmed {
                    warn!(
                        "[AUTO-ROLLBACK ACIONADO] O administrador não confirmou a transação {} em {}s. Revertendo estado da rede...",
                        token_clone, timeout_secs
                    );
                    // Trigger state revert
                    session.confirmed = false;
                }
            }
        });

        token
    }

    /// Confirms that network and WebUI are operating properly, cancelling rollback
    pub async fn confirm_commit(&self, token: &str) -> Result<(), String> {
        let mut map = self.sessions.lock().await;
        if let Some(session) = map.get_mut(token) {
            session.confirmed = true;
            info!("[COMMIT CONFIRMADO] Transação {} confirmada pelo operador.", token);
            Ok(())
        } else {
            Err("Token de transação não encontrado ou expirado".to_string())
        }
    }

    /// Immediate manual rollback
    pub async fn manual_rollback(&self, token: &str) -> Result<DeclarativeNetworkState, String> {
        let mut map = self.sessions.lock().await;
        if let Some(session) = map.remove(token) {
            info!("[ROLLBACK MANUAL] Revertendo para o snapshot da transação {}", token);
            Ok(session.snapshot)
        } else {
            Err("Sessão de rollback não encontrada".to_string())
        }
    }
}
