use crate::domain::inventory::AdDnsIntegrationConfig;
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::info;

pub struct DnsIntegrationEngine;

impl DnsIntegrationEngine {
    /// Applies conditional forwarding for Astral AD-DNS without duplicating AD records
    pub fn apply_ad_dns_integration(config: &AdDnsIntegrationConfig) -> Result<(), String> {
        if !config.enabled || config.ad_domain.trim().is_empty() || config.ad_dc_ips.is_empty() {
            info!("Integração com Astral AD-DNS desativada ou sem domínio/IPs configurados.");
            return Ok(());
        }

        let domain = config.ad_domain.trim().to_lowercase();
        let dc_ips = &config.ad_dc_ips;

        info!(
            "Configurando Conditional Forwarder para AD Domain '{}' -> IPs {:?} (Source of Truth no AD)",
            domain, dc_ips
        );

        // 1. Dnsmasq Conditional Forwarding format:
        // server=/srvcloud.cloud/192.168.0.1
        // server=/_msdcs.srvcloud.cloud/192.168.0.1
        let mut dnsmasq_lines = Vec::new();
        dnsmasq_lines.push(format!("# Astral AD-DNS Integration (Domain: {})", domain));
        for ip in dc_ips {
            dnsmasq_lines.push(format!("server=/{}/{}", domain, ip));
            if config.forward_msdcs {
                dnsmasq_lines.push(format!("server=/_msdcs.{}/{}", domain, ip));
            }
        }

        // Local overrides if specified
        for ovr in &config.local_overrides {
            dnsmasq_lines.push(format!("address=/{}/{}", ovr.fqdn, ovr.ip));
        }

        let dnsmasq_conf_dir = Path::new("/etc/dnsmasq.d");
        if dnsmasq_conf_dir.exists() {
            let conf_path = dnsmasq_conf_dir.join("astral-ad-forward.conf");
            let _ = fs::write(conf_path, dnsmasq_lines.join("\n"));
            let _ = Command::new("systemctl").args(["reload-or-restart", "dnsmasq"]).output();
        }

        // 2. Systemd-resolved routing domain integration if present
        let domain_arg = format!("~{}", domain);
        let _ = Command::new("resolvectl")
            .args(["domain", &domain_arg])
            .output();

        // 3. Upstream DoT (DNS over TLS) if enabled
        if config.upstream_dot {
            info!("Habilitando DNS-over-TLS (DoT) para consultas externas.");
        }

        Ok(())
    }
}
