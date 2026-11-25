use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingResult {
    pub target: String,
    pub success: bool,
    pub transmitted: u32,
    pub received: u32,
    pub packet_loss_percent: f32,
    pub avg_rtt_ms: Option<f32>,
    pub raw_output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArpEntry {
    pub ip: String,
    pub mac: String,
    pub interface: String,
    pub flags: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkHealth {
    pub default_gateway: Option<String>,
    pub gateway_reachable: bool,
    pub gateway_rtt_ms: Option<f32>,
    pub dns_resolves: bool,
    pub packet_loss_percent: f32,
}

pub struct DiagnosticsEngine;

impl DiagnosticsEngine {
    pub fn ping(target: &str, count: u32) -> PingResult {
        let output = Command::new("ping")
            .args(["-c", &count.to_string(), "-W", "2", target])
            .output();

        if let Ok(res) = output {
            let stdout = String::from_utf8_lossy(&res.stdout).to_string();
            let success = res.status.success();
            let loss = if stdout.contains("% packet loss") {
                stdout.split("% packet loss")
                    .next()
                    .and_then(|s| s.split_whitespace().last())
                    .and_then(|s| s.parse::<f32>().ok())
                    .unwrap_or(if success { 0.0 } else { 100.0 })
            } else {
                if success { 0.0 } else { 100.0 }
            };

            let avg = if stdout.contains("rtt min/avg/max/mdev = ") {
                stdout.split("rtt min/avg/max/mdev = ")
                    .nth(1)
                    .and_then(|s| s.split('/').nth(1))
                    .and_then(|s| s.parse::<f32>().ok())
            } else {
                None
            };

            PingResult {
                target: target.to_string(),
                success,
                transmitted: count,
                received: if success { count } else { 0 },
                packet_loss_percent: loss,
                avg_rtt_ms: avg,
                raw_output: stdout,
            }
        } else {
            PingResult {
                target: target.to_string(),
                success: false,
                transmitted: count,
                received: 0,
                packet_loss_percent: 100.0,
                avg_rtt_ms: None,
                raw_output: "Falha ao executar ping".to_string(),
            }
        }
    }

    pub fn get_arp_table() -> Vec<ArpEntry> {
        let mut entries = Vec::new();
        let output = Command::new("ip").args(["-j", "neigh", "show"]).output();
        if let Ok(res) = output {
            let stdout = String::from_utf8_lossy(&res.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(arr) = val.as_array() {
                    for item in arr {
                        let ip = item.get("dst").and_then(|d| d.as_str()).unwrap_or("").to_string();
                        let mac = item.get("lladdr").and_then(|l| l.as_str()).unwrap_or("").to_string();
                        let interface = item.get("dev").and_then(|d| d.as_str()).unwrap_or("").to_string();
                        let flags = item.get("state").and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<&str>>().join(",")).unwrap_or_else(|| "REACHABLE".to_string());
                        if !ip.is_empty() && !mac.is_empty() {
                            entries.push(ArpEntry { ip, mac, interface, flags });
                        }
                    }
                }
            }
        }
        entries
    }

    pub fn check_link_health() -> LinkHealth {
        let gw_res = Command::new("ip").args(["route", "show", "default"]).output();
        let gw = if let Ok(res) = gw_res {
            let stdout = String::from_utf8_lossy(&res.stdout);
            stdout.split_whitespace().nth(2).map(|s| s.to_string())
        } else {
            None
        };

        let mut gw_reachable = false;
        let mut gw_rtt = None;
        let mut loss = 0.0;

        if let Some(ref g) = gw {
            let ping = Self::ping(g, 2);
            gw_reachable = ping.success;
            gw_rtt = ping.avg_rtt_ms;
            loss = ping.packet_loss_percent;
        }

        // DNS check
        let dns_res = Command::new("host").args(["-W", "2", "google.com"]).output();
        let dns_resolves = dns_res.map(|r| r.status.success()).unwrap_or(false);

        LinkHealth {
            default_gateway: gw,
            gateway_reachable: gw_reachable,
            gateway_rtt_ms: gw_rtt,
            dns_resolves,
            packet_loss_percent: loss,
        }
    }
}
