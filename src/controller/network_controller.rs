use crate::domain::{NetworkAddressing, NetworkError};
use crate::service::NetworkAddressingService;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

pub struct NetworkAddressingController {
    service: Arc<dyn NetworkAddressingService>,
}

impl NetworkAddressingController {
    pub fn new(service: Arc<dyn NetworkAddressingService>) -> Self {
        Self { service }
    }

    pub async fn handle_current(&self) -> Response {
        let addressing = self.service.get_current_config();
        let interfaces = self.service.get_kernel_interfaces();
        let observado = self.service.get_observed_state();

        Json(json!({
            "addressing": addressing,
            "interfaces": interfaces,
            "observado": observado
        }))
        .into_response()
    }

    pub async fn handle_interfaces(&self) -> Response {
        let interfaces = self.service.get_kernel_interfaces();
        Json(interfaces).into_response()
    }

    pub async fn handle_validate(&self, body: NetworkAddressing) -> Response {
        let errors = self.service.validate(&body);
        if !errors.is_empty() {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({
                    "aprovado": false,
                    "erros": errors,
                    "plano": []
                })),
            )
                .into_response();
        }

        let plan = self.service.plan(&body);
        let sem_mudanca = plan.is_empty();

        (
            StatusCode::OK,
            Json(json!({
                "aprovado": true,
                "erros": [],
                "plano": plan,
                "semMudanca": sem_mudanca
            })),
        )
            .into_response()
    }

    pub async fn handle_apply(&self, body: NetworkAddressing) -> Result<Response, NetworkError> {
        let errors = self.service.validate(&body);
        if !errors.is_empty() {
            return Ok((
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({
                    "aprovado": false,
                    "erros": errors
                })),
            )
                .into_response());
        }

        let plan = self.service.plan(&body);
        let snapshot = self.service.apply(&body)?;

        let intent_id = Uuid::new_v4().to_string();

        Ok((
            StatusCode::ACCEPTED,
            Json(json!({
                "intentId": intent_id,
                "token": snapshot.token,
                "status": "COMMITTED",
                "plano": plan,
                "message": format!("Configuração aplicada com sucesso; snapshot {}", snapshot.token)
            })),
        )
            .into_response())
    }

    pub async fn handle_dhcp_status(&self) -> Response {
        let status = self.service.dhcp_service().get_status();
        Json(status).into_response()
    }

    pub async fn handle_dhcp_leases(&self) -> Response {
        let leases = self.service.dhcp_service().get_leases();
        Json(leases).into_response()
    }

    pub async fn handle_dhcp_restart(&self) -> Result<Response, NetworkError> {
        self.service.dhcp_service().restart_server()?;
        Ok(Json(json!({
            "status": "restarted",
            "message": "Servidor DHCP (dhcpd) reiniciado com sucesso"
        }))
        .into_response())
    }

    pub async fn handle_health(&self) -> Response {
        Json(json!({
            "status": "UP",
            "service": "astral-network",
            "version": "0.1.0",
            "arch": "Rust OOP Architecture",
            "dhcp_integrated": true
        }))
        .into_response()
    }
}
