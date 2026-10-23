use crate::config::NetworkConfig;
use crate::controller::NetworkAddressingController;
use crate::domain::NetworkAddressing;
use axum::{
    extract::{Json, State},
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
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
            // Addressing API
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
            // DHCP Management API
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
            // Health Checks
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
