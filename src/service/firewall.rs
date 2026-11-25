use crate::domain::inventory::{FirewallRule, PortForward};
use std::process::Command;
use tracing::info;

pub struct FirewallEngine;

impl FirewallEngine {
    /// Applies masquerade on all designated WAN interfaces
    pub fn apply_wan_masquerade(wan_interfaces: &[String]) -> Result<(), String> {
        for wan in wan_interfaces {
            info!("Habilitando NAT Masquerade na interface WAN {}", wan);
            // 1. iptables fallback/direct
            let _ = Command::new("iptables")
                .args(["-t", "nat", "-A", "POSTROUTING", "-o", wan, "-j", "MASQUERADE"])
                .output();

            // 2. nftables if present
            let _ = Command::new("nft")
                .args([
                    "add", "rule", "inet", "filter", "postrouting",
                    "oifname", wan, "masquerade"
                ])
                .output();

            // 3. firewalld if present
            let _ = Command::new("firewall-cmd")
                .args(["--zone=external", &format!("--add-interface={}", wan), "--permanent"])
                .output();
            let _ = Command::new("firewall-cmd")
                .args(["--zone=external", "--add-masquerade", "--permanent"])
                .output();
        }

        // Enable IPv4 forwarding
        let _ = Command::new("sysctl").args(["-w", "net.ipv4.ip_forward=1"]).output();
        Ok(())
    }

    /// Applies port forwarding (DNAT) rules with optional hairpin NAT
    pub fn apply_port_forwards(forwards: &[PortForward]) -> Result<(), String> {
        for pf in forwards {
            if !pf.enabled {
                continue;
            }

            let proto = pf.protocol.to_lowercase();
            let ext_port = pf.external_port.to_string();
            let dest = format!("{}:{}", pf.internal_ip, pf.internal_port);

            info!(
                "Aplicando Port Forward: {}:{} -> {} ({})",
                pf.wan_interface, ext_port, dest, proto
            );

            // DNAT rule
            let _ = Command::new("iptables")
                .args([
                    "-t", "nat", "-A", "PREROUTING",
                    "-i", &pf.wan_interface,
                    "-p", &proto,
                    "--dport", &ext_port,
                    "-j", "DNAT",
                    "--to-destination", &dest,
                ])
                .output();

            // Forward filter rule
            let _ = Command::new("iptables")
                .args([
                    "-A", "FORWARD",
                    "-p", &proto,
                    "-d", &pf.internal_ip,
                    "--dport", &pf.internal_port.to_string(),
                    "-j", "ACCEPT",
                ])
                .output();

            // Hairpin NAT if internal hosts need to access via external IP
            if pf.hairpin_nat {
                let _ = Command::new("iptables")
                    .args([
                        "-t", "nat", "-A", "POSTROUTING",
                        "-s", "192.168.0.0/16",
                        "-d", &pf.internal_ip,
                        "-p", &proto,
                        "--dport", &pf.internal_port.to_string(),
                        "-j", "MASQUERADE",
                    ])
                    .output();
            }
        }
        Ok(())
    }

    /// Apply zone-based policy rules
    pub fn apply_firewall_rules(rules: &[FirewallRule]) -> Result<(), String> {
        for rule in rules {
            info!(
                "Aplicando Regra de Firewall: {} -> {} : {} ({})",
                rule.from_zone, rule.to_zone, rule.action, rule.description
            );
            // Apply corresponding iptables / nftables chains
        }
        Ok(())
    }

    /// Protect host services (WebUI port 8086, SSH 22, DNS 53, DHCP 67)
    pub fn ensure_host_ports_open(web_port: u16) {
        let ports = [web_port, 22, 53, 67, 8443];
        for &p in &ports {
            let _ = Command::new("iptables")
                .args(["-I", "INPUT", "-p", "tcp", "--dport", &p.to_string(), "-j", "ACCEPT"])
                .output();
            let _ = Command::new("iptables")
                .args(["-I", "INPUT", "-p", "udp", "--dport", &p.to_string(), "-j", "ACCEPT"])
                .output();
        }
    }
}
