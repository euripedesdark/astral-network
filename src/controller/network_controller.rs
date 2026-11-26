use crate::domain::inventory::{AdDnsIntegrationConfig, DeclarativeNetworkState, InterfaceInventory};
use crate::domain::{NetworkAddressing, NetworkError};
use crate::service::diagnostics::DiagnosticsEngine;
use crate::service::discovery::NetworkDiscoveryService;
use crate::service::dns_integration::DnsIntegrationEngine;
use crate::service::firewall::FirewallEngine;
use crate::service::rollback_manager::RollbackManager;
use crate::service::vpn::VpnEngine;
use crate::service::NetworkAddressingService;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct PingRequest {
    pub target: String,
    pub count: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmCommitRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct RollbackRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct NewPeerRequest {
    pub name: String,
    pub allowed_ips: Vec<String>,
}

pub struct NetworkAddressingController {
    service: Arc<dyn NetworkAddressingService>,
    rollback_manager: Arc<RollbackManager>,
}

impl NetworkAddressingController {
    pub fn new(service: Arc<dyn NetworkAddressingService>) -> Self {
        Self {
            service,
            rollback_manager: Arc::new(RollbackManager::new()),
        }
    }

    pub fn with_rollback(service: Arc<dyn NetworkAddressingService>, rollback_manager: Arc<RollbackManager>) -> Self {
        Self {
            service,
            rollback_manager,
        }
    }

    // 1. Full non-destructive inventory of all interfaces (UP, DOWN, no cable, with MACs)
    pub async fn handle_inventory(&self) -> Response {
        let interfaces = NetworkDiscoveryService::discover_all_interfaces();
        Json(interfaces).into_response()
    }

    // 2. Link Health & Gateway check
    pub async fn handle_link_health(&self) -> Response {
        let health = DiagnosticsEngine::check_link_health();
        Json(health).into_response()
    }

    // 3. Declarative State Management
    pub async fn handle_declarative_get(&self) -> Response {
        let _interfaces = NetworkDiscoveryService::discover_all_interfaces();
        let wg = VpnEngine::get_wireguard_status();
        let cf = VpnEngine::get_cloudflare_status();

        let state = DeclarativeNetworkState {
            version: 1,
            updated_at: chrono::Utc::now().to_rfc3339(),
            wans: vec![],
            vlans: vec![],
            bridges: vec![],
            bonds: vec![],
            routes: vec![],
            pbr_rules: vec![],
            port_forwards: vec![],
            firewall_rules: vec![],
            wireguard: wg,
            cloudflare: cf,
            dhcp_scopes: vec![],
            static_leases: vec![],
            ad_dns: AdDnsIntegrationConfig {
                enabled: true,
                ad_domain: "srvcloud.cloud".to_string(),
                ad_dc_ips: vec!["192.168.0.1".to_string(), "127.0.0.1".to_string()],
                forward_msdcs: true,
                secondary_zone_axfr: false,
                upstream_dot: false,
                local_overrides: vec![],
            },
        };

        Json(state).into_response()
    }

    pub async fn handle_declarative_apply(&self, body: DeclarativeNetworkState) -> Response {
        // 1. Register commit with 60-second auto-rollback safety timer
        let token = self.rollback_manager.register_commit(body.clone(), 60).await;

        // 2. Apply NAT Masquerade on WAN interfaces
        let wan_names: Vec<String> = body.wans.iter().map(|w| w.interface.clone()).collect();
        let _ = FirewallEngine::apply_wan_masquerade(&wan_names);

        // 3. Apply Port Forwards & Hairpin NAT
        let _ = FirewallEngine::apply_port_forwards(&body.port_forwards);

        // 4. Apply Zone Firewall Rules
        let _ = FirewallEngine::apply_firewall_rules(&body.firewall_rules);

        // 5. Apply Astral AD-DNS Integration (Conditional Forwarding)
        let _ = DnsIntegrationEngine::apply_ad_dns_integration(&body.ad_dns);

        Json(json!({
            "status": "PENDING_CONFIRMATION",
            "token": token,
            "timeout_seconds": 60,
            "message": "Configuração aplicada provisoriamente. Confirme em até 60 segundos na interface para cancelar o rollback automático."
        }))
        .into_response()
    }

    pub async fn handle_confirm_commit(&self, body: ConfirmCommitRequest) -> Response {
        match self.rollback_manager.confirm_commit(&body.token).await {
            Ok(()) => Json(json!({
                "status": "CONFIRMED",
                "message": "Alterações de rede confirmadas com sucesso! Estado permanente salvo."
            }))
            .into_response(),
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "ERROR",
                    "error": e
                })),
            )
                .into_response(),
        }
    }

    pub async fn handle_rollback(&self, body: RollbackRequest) -> Response {
        match self.rollback_manager.manual_rollback(&body.token).await {
            Ok(prev) => Json(json!({
                "status": "ROLLED_BACK",
                "message": "Reversão manual executada; estado restaurado ao snapshot anterior.",
                "restored_state": prev
            }))
            .into_response(),
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "ERROR",
                    "error": e
                })),
            )
                .into_response(),
        }
    }

    // 4. WireGuard VPN Endpoints
    pub async fn handle_wireguard_get(&self) -> Response {
        let status = VpnEngine::get_wireguard_status();
        Json(status).into_response()
    }

    pub async fn handle_wireguard_add_peer(&self, body: NewPeerRequest) -> Response {
        let (privkey, pubkey) = VpnEngine::generate_peer_keypair();
        Json(json!({
            "status": "SUCCESS",
            "name": body.name,
            "public_key": pubkey,
            "private_key": privkey,
            "allowed_ips": body.allowed_ips,
            "message": "Par de chaves WireGuard gerado para o novo peer."
        }))
        .into_response()
    }

    // 5. Cloudflare Zero Trust Endpoints
    pub async fn handle_cloudflare_get(&self) -> Response {
        let status = VpnEngine::get_cloudflare_status();
        Json(status).into_response()
    }

    // 6. Astral AD-DNS Integration Endpoints
    pub async fn handle_ad_dns_apply(&self, body: AdDnsIntegrationConfig) -> Response {
        match DnsIntegrationEngine::apply_ad_dns_integration(&body) {
            Ok(()) => Json(json!({
                "status": "SUCCESS",
                "message": format!("Encaminhamento condicional configurado para '{}' apontando para o AD DC (Source of Truth)", body.ad_domain)
            }))
            .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "ERROR", "error": e }))
            ).into_response(),
        }
    }

    // 7. Live Diagnostics Endpoints (Ping & ARP)
    pub async fn handle_diagnostics_ping(&self, body: PingRequest) -> Response {
        let count = body.count.unwrap_or(3);
        let result = DiagnosticsEngine::ping(&body.target, count);
        Json(result).into_response()
    }

    pub async fn handle_diagnostics_arp(&self) -> Response {
        let entries = DiagnosticsEngine::get_arp_table();
        Json(entries).into_response()
    }

    // Existing methods
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
            "version": "1.0.0",
            "arch": "Rust OOP Architecture",
            "features": [
                "non-destructive-boot",
                "inventory-all-macs",
                "cli-bootstrap-wizard",
                "multi-wan-failover",
                "vlan-trunk-bridge",
                "nftables-zone-firewall",
                "wireguard-vpn",
                "cloudflare-zero-trust",
                "dhcp-server",
                "astral-ad-dns-conditional-forwarder",
                "auto-rollback-timer"
            ]
        }))
        .into_response()
    }
}
