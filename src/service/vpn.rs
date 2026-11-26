use crate::domain::inventory::{CloudflareTunnelConfig, WireguardConfig, WireguardPeer};
use std::path::Path;
use std::process::Command;

pub struct VpnEngine;

impl VpnEngine {
    /// Inspects and gets current status of WireGuard
    pub fn get_wireguard_status() -> WireguardConfig {
        let output = Command::new("wg").args(["show", "wg0"]).output();
        let is_up = output.as_ref().map(|o| o.status.success()).unwrap_or(false);

        let pub_key = if let Ok(res) = Command::new("wg").args(["show", "wg0", "public-key"]).output() {
            String::from_utf8_lossy(&res.stdout).trim().to_string()
        } else {
            "4b/exampleWireGuardPublicKey1234567890=".to_string()
        };

        let listen_port = if let Ok(res) = Command::new("wg").args(["show", "wg0", "listen-port"]).output() {
            String::from_utf8_lossy(&res.stdout).trim().parse::<u16>().unwrap_or(51820)
        } else {
            51820
        };

        // Parse peers if wg0 is active
        let mut peers = Vec::new();
        if is_up {
            if let Ok(res) = Command::new("wg").args(["show", "wg0", "dump"]).output() {
                let stdout = String::from_utf8_lossy(&res.stdout);
                for (idx, line) in stdout.lines().skip(1).enumerate() {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if parts.len() >= 8 {
                        peers.push(WireguardPeer {
                            id: format!("peer-{}", idx + 1),
                            name: format!("Peer-{}", idx + 1),
                            public_key: parts[0].to_string(),
                            endpoint: if parts[2] != "(none)" { Some(parts[2].to_string()) } else { None },
                            allowed_ips: parts[3].split(',').map(|s| s.trim().to_string()).collect(),
                            last_handshake: if parts[4] != "0" { Some(parts[4].to_string()) } else { None },
                            rx_bytes: parts[5].parse().unwrap_or(0),
                            tx_bytes: parts[6].parse().unwrap_or(0),
                            persistent_keepalive: parts[7].parse().unwrap_or(25),
                            enabled: true,
                        });
                    }
                }
            }
        }

        WireguardConfig {
            enabled: is_up,
            interface: "wg0".to_string(),
            listen_port,
            address_cidr: "10.100.0.1/24".to_string(),
            public_key: pub_key,
            peers,
        }
    }

    /// Generates keypair for a new peer
    pub fn generate_peer_keypair() -> (String, String) {
        let privkey = Command::new("wg").arg("genkey").output();
        if let Ok(res) = privkey {
            let private = String::from_utf8_lossy(&res.stdout).trim().to_string();
            let echo = Command::new("wg")
                .arg("pubkey")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .spawn();
            if let Ok(mut child) = echo {
                if let Some(mut stdin) = child.stdin.take() {
                    use std::io::Write;
                    let _ = stdin.write_all(private.as_bytes());
                }
                if let Ok(out) = child.wait_with_output() {
                    let public = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    return (private, public);
                }
            }
            return (private, "generated-public-key".to_string());
        }
        ("generated-private-key".to_string(), "generated-public-key".to_string())
    }

    /// Inspects Cloudflare Tunnel (`cloudflared`) status
    pub fn get_cloudflare_status() -> CloudflareTunnelConfig {
        let is_installed = Path::new("/usr/bin/cloudflared").exists() || Path::new("/usr/local/bin/cloudflared").exists();
        let status = if !is_installed {
            "NOT_INSTALLED".to_string()
        } else {
            let s_res = Command::new("systemctl").args(["is-active", "cloudflared"]).output();
            if let Ok(res) = s_res {
                if String::from_utf8_lossy(&res.stdout).trim() == "active" {
                    "CONNECTED".to_string()
                } else {
                    "DISCONNECTED".to_string()
                }
            } else {
                "DISCONNECTED".to_string()
            }
        };

        CloudflareTunnelConfig {
            enabled: status == "CONNECTED",
            tunnel_token: String::new(),
            status,
            ingress_rules: Vec::new(),
        }
    }
}
