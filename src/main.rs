mod config;
mod controller;
mod domain;
mod server;
mod service;

use config::NetworkConfig;
use controller::NetworkAddressingController;
use server::NetworkServer;
use service::{
    DeclarativeNetworkService, LinuxDhcpService, LinuxNetworkManagerBackend, SystemCommandExecutor,
};
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,astral_network=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Initializing Astral Network & DHCP Engine (Rust OOP Architecture)...");

    // 1. Configuration
    let config = Arc::new(NetworkConfig::load());
    info!(
        "NetworkConfig: host={}, port={}, dry_run={}",
        config.host(),
        config.port(),
        config.dry_run()
    );

    // 2. Command Executor
    let executor = Arc::new(SystemCommandExecutor::new(config.dry_run()));

    // 3. NetworkManager Backend
    let nm_backend = Arc::new(LinuxNetworkManagerBackend::new(executor.clone()));

    // 4. DHCP Service Layer (Integrated ISC DHCP Server Management)
    let dhcp_service = Arc::new(LinuxDhcpService::default_service(executor.clone()));

    // 5. Declarative Network & Addressing Service
    let network_service = Arc::new(DeclarativeNetworkService::new(nm_backend, dhcp_service));

    // 6. Controller Layer
    let network_controller = Arc::new(NetworkAddressingController::new(network_service));

    // 7. Application Server
    let server = NetworkServer::new(config, network_controller);
    server.run().await?;

    Ok(())
}
