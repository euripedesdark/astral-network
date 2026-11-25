mod cli;
mod config;
mod controller;
mod domain;
mod server;
mod service;

use cli::run_bootstrap_wizard_if_needed;
use config::NetworkConfig;
use controller::NetworkAddressingController;
use server::NetworkServer;
use service::{
    DeclarativeNetworkService, FirewallEngine, LinuxDhcpService, LinuxNetworkManagerBackend,
    NetworkDiscoveryService, SystemCommandExecutor,
};
use std::env;
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

    info!("Initializing Astral Network & Addressing Engine (Rust OOP Architecture)...");

    // 1. Configuration
    let config = Arc::new(NetworkConfig::load());
    let force_bootstrap = env::args().any(|arg| arg == "--bootstrap" || arg == "-b");

    info!(
        "NetworkConfig: host={}, port={}, dry_run={}",
        config.host(),
        config.port(),
        config.dry_run()
    );

    // 2. Non-Destructive Boot & Discovery Principle:
    // If existing interfaces already have IP, PRESERVE them completely without touching.
    // If NO interface has an IP (or --bootstrap was requested), launch the interactive CLI wizard.
    let _configured = run_bootstrap_wizard_if_needed(force_bootstrap, config.port());

    // 3. Ensure host firewall access (WebUI port & SSH)
    FirewallEngine::ensure_host_ports_open(config.port());

    // 4. Command Executor & NetworkManager Backend
    let executor = Arc::new(SystemCommandExecutor::new(config.dry_run()));
    let nm_backend = Arc::new(LinuxNetworkManagerBackend::new(executor.clone()));

    // 5. DHCP Service Layer
    let dhcp_service = Arc::new(LinuxDhcpService::default_service(executor.clone()));

    // 6. Declarative Network & Addressing Service
    let network_service = Arc::new(DeclarativeNetworkService::new(nm_backend, dhcp_service));

    // 7. Controller Layer
    let network_controller = Arc::new(NetworkAddressingController::new(network_service));

    // 8. Application Server
    let server = NetworkServer::new(config, network_controller);
    server.run().await?;

    Ok(())
}
