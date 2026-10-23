use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::fmt;

#[derive(Debug)]
pub enum NetworkError {
    Validation(Vec<String>),
    Unprocessable(String),
    Internal(String),
    NotFound(String),
    BadRequest(String),
}

impl fmt::Display for NetworkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NetworkError::Validation(errs) => write!(f, "Validation errors: {}", errs.join("; ")),
            NetworkError::Unprocessable(msg) => write!(f, "Unprocessable entity: {}", msg),
            NetworkError::Internal(msg) => write!(f, "Internal server error: {}", msg),
            NetworkError::NotFound(msg) => write!(f, "Resource not found: {}", msg),
            NetworkError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
        }
    }
}

impl std::error::Error for NetworkError {}

impl IntoResponse for NetworkError {
    fn into_response(self) -> Response {
        match self {
            NetworkError::Validation(errs) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({
                    "aprovado": false,
                    "erros": errs,
                    "plano": []
                })),
            )
                .into_response(),
            NetworkError::Unprocessable(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({
                    "aprovado": false,
                    "erros": [msg],
                    "plano": []
                })),
            )
                .into_response(),
            NetworkError::NotFound(msg) => (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "status": "error",
                    "message": msg
                })),
            )
                .into_response(),
            NetworkError::BadRequest(msg) => (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "error",
                    "message": msg
                })),
            )
                .into_response(),
            NetworkError::Internal(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": msg
                })),
            )
                .into_response(),
        }
    }
}
