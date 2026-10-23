use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSnapshot {
    pub token: String,
    pub timestamp: i64,
    pub antes: serde_json::Value,
    pub comandos: Vec<String>,
}

impl NetworkSnapshot {
    pub fn new(antes: serde_json::Value, comandos: Vec<String>) -> Self {
        let token = Uuid::new_v4().to_string();
        Self {
            token,
            timestamp: Utc::now().timestamp(),
            antes,
            comandos,
        }
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn comandos(&self) -> &[String] {
        &self.comandos
    }

    pub fn antes(&self) -> &serde_json::Value {
        &self.antes
    }
}
