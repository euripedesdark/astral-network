use std::process::Command;
use tracing::info;
use crate::domain::inventory::{PortForward, ZoneFirewallRule};

/// Firewall Host Protection for Astral Network.
/// NAT Masquerade, DNAT Port Forwarding, SPI Rules and Zones are managed
/// centrally by Astral Internet Security (`astral-internet-security`).
pub struct FirewallEngine;

impl FirewallEngine {
    /// Protect host services (WebUI port, SSH 22, DNS 53, DHCP 67) using pure iptables.
    /// Idempotent check ensures existing rules (like Samba AD DC) are never flushed or overwritten.
    pub fn ensure_host_ports_open(web_port: u16) {
        let ports = [web_port, 22, 53, 67, 8443];
        for &p in &ports {
            let port_str = p.to_string();
            // TCP
            let exists_tcp = Command::new("iptables")
                .args(["-C", "INPUT", "-p", "tcp", "--dport", &port_str, "-j", "ACCEPT"])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);

            if !exists_tcp {
                let _ = Command::new("iptables")
                    .args(["-I", "INPUT", "-p", "tcp", "--dport", &port_str, "-j", "ACCEPT"])
                    .output();
            }

            // UDP
            let exists_udp = Command::new("iptables")
                .args(["-C", "INPUT", "-p", "udp", "--dport", &port_str, "-j", "ACCEPT"])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);

            if !exists_udp {
                let _ = Command::new("iptables")
                    .args(["-I", "INPUT", "-p", "udp", "--dport", &port_str, "-j", "ACCEPT"])
                    .output();
            }
        }

        // Persist to /etc/sysconfig/iptables if present
        let _ = Command::new("sh")
            .args(["-c", "iptables-save > /etc/sysconfig/iptables 2>/dev/null || true"])
            .output();

        info!("Host firewall ports verified via iptables (WebUI: {}, SSH, DNS, DHCP)", web_port);
    }

    pub fn apply_wan_masquerade(_wans: &[String]) -> Result<(), String> {
        info!("WAN masquerade handled by astral-internet-security engine.");
        Ok(())
    }

    pub fn apply_port_forwards(_rules: &[PortForward]) -> Result<(), String> {
        info!("Port forwards handled by astral-internet-security engine.");
        Ok(())
    }

    pub fn apply_firewall_rules(_rules: &[ZoneFirewallRule]) -> Result<(), String> {
        info!("Zone firewall rules handled by astral-internet-security engine.");
        Ok(())
    }
}
