use crate::config::NetworkConfig;
use crate::controller::network_controller::{ConfirmCommitRequest, NewPeerRequest, PingRequest, RollbackRequest};
use crate::controller::NetworkAddressingController;
use crate::domain::inventory::{AdDnsIntegrationConfig, DeclarativeNetworkState, DhcpScopeConfig, StaticLease};
use crate::domain::NetworkAddressing;
use crate::service::l2l3_service::{
    ConfigureInterfaceRequest, CreateBondRequest, CreateBridgeRequest, CreateRouteRequest,
    CreateVlanRequest, DeleteRouteRequest, DeleteTargetRequest,
};
use axum::{
    extract::{Json, State},
    http::{header, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

#[derive(Clone)]
pub struct NetworkContainer {
    pub config: Arc<NetworkConfig>,
    pub controller: Arc<NetworkAddressingController>,
}

pub struct NetworkServer {
    container: NetworkContainer,
}

impl NetworkServer {
    pub fn new(config: Arc<NetworkConfig>, controller: Arc<NetworkAddressingController>) -> Self {
        Self {
            container: NetworkContainer { config, controller },
        }
    }

    pub fn build_router(&self) -> Router {
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        Router::new()
            // 0. Unified Authentication Routes (matching Astral AD-DNS)
            .route("/api/auth/login", post(crate::auth::login_handler))
            .route("/api/v1/auth/login", post(crate::auth::login_handler))
            .route("/api/auth/logout", post(crate::auth::logout_handler))
            .route("/api/v1/auth/logout", post(crate::auth::logout_handler))
            .route("/api/auth/me", get(crate::auth::me_handler))
            .route("/api/v1/auth/me", get(crate::auth::me_handler))
            .route("/api/auth/providers", get(crate::auth::providers_handler))
            .route("/api/v1/auth/providers", get(crate::auth::providers_handler))
            // 1. Full Interface Inventory (Active & Inactive with MACs)
            .route(
                "/api/v1/network/inventory",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_inventory().await
                }),
            )
            // 2. Link Health & Gateway check
            .route(
                "/api/v1/network/link-health",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_link_health().await
                }),
            )
            // 3. Declarative State & Auto-Rollback Engine
            .route(
                "/api/v1/network/declarative-state",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_declarative_get().await
                })
                .post(
                    |State(c): State<NetworkContainer>, Json(body): Json<DeclarativeNetworkState>| async move {
                        c.controller.handle_declarative_apply(body).await
                    },
                ),
            )
            .route(
                "/api/v1/network/confirm-commit",
                post(
                    |State(c): State<NetworkContainer>, Json(body): Json<ConfirmCommitRequest>| async move {
                        c.controller.handle_confirm_commit(body).await
                    },
                ),
            )
            .route(
                "/api/v1/network/rollback",
                post(
                    |State(c): State<NetworkContainer>, Json(body): Json<RollbackRequest>| async move {
                        c.controller.handle_rollback(body).await
                    },
                ),
            )
            // 4. WireGuard VPN Endpoints
            .route(
                "/api/v1/network/vpn/wireguard",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_wireguard_get().await
                }),
            )
            .route(
                "/api/v1/network/vpn/wireguard/peer",
                post(
                    |State(c): State<NetworkContainer>, Json(body): Json<NewPeerRequest>| async move {
                        c.controller.handle_wireguard_add_peer(body).await
                    },
                ),
            )
            // 5. Cloudflare Zero Trust Endpoints
            .route(
                "/api/v1/network/cloudflare",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_cloudflare_get().await
                }),
            )
            // 6. Astral AD-DNS Integration Endpoints
            .route(
                "/api/v1/network/dns/ad-integration",
                post(
                    |State(c): State<NetworkContainer>, Json(body): Json<AdDnsIntegrationConfig>| async move {
                        c.controller.handle_ad_dns_apply(body).await
                    },
                ),
            )
            // 7. Live Diagnostics Endpoints (Ping & ARP)
            .route(
                "/api/v1/network/diagnostics/ping",
                post(
                    |State(c): State<NetworkContainer>, Json(body): Json<PingRequest>| async move {
                        c.controller.handle_diagnostics_ping(body).await
                    },
                ),
            )
            .route(
                "/api/v1/network/diagnostics/arp",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_diagnostics_arp().await
                }),
            )
            // 8. Addressing API (Legacy / Direct)
            .route(
                "/api/v1/network/addressing",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_current().await
                })
                .post(
                    |State(c): State<NetworkContainer>, Json(body): Json<NetworkAddressing>| async move {
                        c.controller.handle_apply(body).await
                    },
                ),
            )
            .route(
                "/api/v1/network/addressing/interfaces",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_interfaces().await
                }),
            )
            .route(
                "/api/v1/network/addressing/validar",
                post(
                    |State(c): State<NetworkContainer>, Json(body): Json<NetworkAddressing>| async move {
                        c.controller.handle_validate(body).await
                    },
                ),
            )
            // 9. DHCP Management API
            .route(
                "/api/v1/network/dhcp/status",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_dhcp_status().await
                }),
            )
            .route(
                "/api/v1/network/dhcp/leases",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_dhcp_leases().await
                }),
            )
            .route(
                "/api/v1/network/dhcp/restart",
                post(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_dhcp_restart().await
                }),
            )
            // 10. Health Checks
            .route(
                "/health",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_health().await
                }),
            )
            .route(
                "/api/v1/network/health",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_health().await
                }),
            )
            // 11. Dynamic L2 / L3 Network Configuration Endpoints
            .route(
                "/api/v1/network/interface/configure",
                post(|State(c): State<NetworkContainer>, Json(body): Json<ConfigureInterfaceRequest>| async move {
                    c.controller.handle_interface_configure(body).await
                }),
            )
            .route(
                "/api/v1/network/vlans",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_vlans_list().await
                }),
            )
            .route(
                "/api/v1/network/vlan/create",
                post(|State(c): State<NetworkContainer>, Json(body): Json<CreateVlanRequest>| async move {
                    c.controller.handle_vlan_create(body).await
                }),
            )
            .route(
                "/api/v1/network/vlan/delete",
                post(|State(c): State<NetworkContainer>, Json(body): Json<DeleteTargetRequest>| async move {
                    c.controller.handle_vlan_delete(body).await
                }),
            )
            .route(
                "/api/v1/network/bridges",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_bridges_list().await
                }),
            )
            .route(
                "/api/v1/network/bridge/create",
                post(|State(c): State<NetworkContainer>, Json(body): Json<CreateBridgeRequest>| async move {
                    c.controller.handle_bridge_create(body).await
                }),
            )
            .route(
                "/api/v1/network/bridge/delete",
                post(|State(c): State<NetworkContainer>, Json(body): Json<DeleteTargetRequest>| async move {
                    c.controller.handle_bridge_delete(body).await
                }),
            )
            .route(
                "/api/v1/network/bonds",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_bonds_list().await
                }),
            )
            .route(
                "/api/v1/network/bond/create",
                post(|State(c): State<NetworkContainer>, Json(body): Json<CreateBondRequest>| async move {
                    c.controller.handle_bond_create(body).await
                }),
            )
            .route(
                "/api/v1/network/bond/delete",
                post(|State(c): State<NetworkContainer>, Json(body): Json<DeleteTargetRequest>| async move {
                    c.controller.handle_bond_delete(body).await
                }),
            )
            .route(
                "/api/v1/network/routes",
                get(|State(c): State<NetworkContainer>| async move {
                    c.controller.handle_routes_list().await
                }),
            )
            .route(
                "/api/v1/network/routes/create",
                post(|State(c): State<NetworkContainer>, Json(body): Json<CreateRouteRequest>| async move {
                    c.controller.handle_route_create(body).await
                }),
            )
            .route(
                "/api/v1/network/routes/delete",
                post(|State(c): State<NetworkContainer>, Json(body): Json<DeleteRouteRequest>| async move {
                    c.controller.handle_route_delete(body).await
                }),
            )
            .route(
                "/api/v1/network/dhcp/scope",
                post(|State(c): State<NetworkContainer>, Json(body): Json<DhcpScopeConfig>| async move {
                    c.controller.handle_dhcp_scope_save(body).await
                }),
            )
            .route(
                "/api/v1/network/dhcp/static-lease",
                post(|State(c): State<NetworkContainer>, Json(body): Json<StaticLease>| async move {
                    c.controller.handle_dhcp_static_lease_add(body).await
                }),
            )
            .route(
                "/api/v1/network/dhcp/static-lease/delete",
                post(|State(c): State<NetworkContainer>, Json(body): Json<DeleteTargetRequest>| async move {
                    c.controller.handle_dhcp_static_lease_delete(body).await
                }),
            )
            .fallback(handle_static_web)
            .layer(cors)
            .layer(TraceLayer::new_for_http())
            .with_state(self.container.clone())
    }

    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        let addr: SocketAddr = format!(
            "{}:{}",
            self.container.config.host(),
            self.container.config.port()
        )
        .parse()?;

        info!("Astral Network Server listening on http://{}", addr);
        let listener = tokio::net::TcpListener::bind(addr).await?;
        let router = self.build_router();
        axum::serve(listener, router).await?;
        Ok(())
    }
}

async fn handle_static_web(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let dist_dirs = ["./web/dist", "/opt/astral-network/web/dist", "./dist"];

    for base in &dist_dirs {
        let file_path = Path::new(base).join(path);
        if file_path.is_file() {
            if let Ok(content) = tokio::fs::read(&file_path).await {
                let mime = if path.ends_with(".js") {
                    "application/javascript"
                } else if path.ends_with(".css") {
                    "text/css"
                } else if path.ends_with(".svg") {
                    "image/svg+xml"
                } else if path.ends_with(".json") {
                    "application/json"
                } else {
                    "text/html"
                };

                return (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, mime)],
                    content,
                ).into_response();
            }
        }
    }

    // Fallback to index.html for SPA routing
    for base in &dist_dirs {
        let index_file = Path::new(base).join("index.html");
        if let Ok(content) = tokio::fs::read_to_string(&index_file).await {
            return Html(content).into_response();
        }
    }

    Html(
        r#"<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Astral Network Management Engine</title>
  <style>
    body { background: #030712; color: #10b981; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: rgba(6, 78, 59, 0.2); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 2.5rem; backdrop-filter: blur(8px); text-align: center; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; color: #34d399; font-size: 1.5rem; }
    p { color: #a7f3d0; font-size: 0.95rem; line-height: 1.5; }
    a { color: #6ee7b7; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Astral Network · Motor de Gerenciamento</h1>
    <p>O backend Rust está operacional. Os arquivos estáticos da WebUI estão sendo compilados.</p>
    <p>Consulte a API em <a href="/api/v1/network/inventory">/api/v1/network/inventory</a> ou <a href="/api/v1/network/health">/api/v1/network/health</a>.</p>
  </div>
</body>
</html>"#
    ).into_response()
}
