use crate::domain::IpCidr;
use crate::service::command_executor::CommandExecutor;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tracing::warn;

pub trait NetworkManagerBackend: Send + Sync {
    fn list_kernel_interfaces(&self) -> Vec<String>;
    fn list_resolv_dns(&self) -> Vec<String>;
    fn list_profiles(&self) -> Vec<Value>;
    fn get_routes(&self) -> String;
    fn profile_exists(&self, profile_name: &str) -> bool;
    fn execute_raw(&self, cmd: &str) -> Result<String, String>;
}

pub struct LinuxNetworkManagerBackend {
    executor: Arc<dyn CommandExecutor>,
}

impl LinuxNetworkManagerBackend {
    pub fn new(executor: Arc<dyn CommandExecutor>) -> Self {
        Self { executor }
    }

    fn sanitize_arg(val: &str) -> String {
        val.replace('\'', "'\\''")
    }
}

impl NetworkManagerBackend for LinuxNetworkManagerBackend {
    fn list_kernel_interfaces(&self) -> Vec<String> {
        let net_dir = Path::new("/sys/class/net");
        if let Ok(entries) = fs::read_dir(net_dir) {
            let mut list = Vec::new();
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if !name.is_empty() && name != "lo" {
                        list.push(name);
                    }
                }
            }
            list.sort();
            if !list.is_empty() {
                return list;
            }
        }

        // Fallback via shell
        match self.executor.execute("ls /sys/class/net 2>/dev/null || true") {
            Ok(out) => out
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty() && l != "lo")
                .collect(),
            Err(_) => Vec::new(),
        }
    }

    fn list_resolv_dns(&self) -> Vec<String> {
        let mut servers = Vec::new();
        if let Ok(content) = fs::read_to_string("/etc/resolv.conf") {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("nameserver") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 2 && IpCidr::is_valid_ipv4(parts[1]) {
                        servers.push(parts[1].to_string());
                    }
                }
            }
        }
        if servers.is_empty() {
            servers.push("1.1.1.1".to_string());
        }
        servers
    }

    fn list_profiles(&self) -> Vec<Value> {
        let cmd = "nmcli -t -f NAME,DEVICE,TYPE connection show 2>/dev/null || true";
        let out = match self.executor.execute(cmd) {
            Ok(s) => s,
            Err(e) => {
                warn!("Failed to query nmcli connections: {}", e);
                return Vec::new();
            }
        };

        let mut list = Vec::new();
        for line in out.lines() {
            if line.trim().is_empty() {
                continue;
            }
            // Parse colon-separated fields considering escaped colons
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() < 3 {
                continue;
            }
            let name = parts[0].replace(r"\:", ":");
            let device = parts[1];
            let tipo = parts[2];

            if !tipo.contains("ethernet") && !tipo.contains("vlan") && !tipo.contains("bridge") {
                continue;
            }

            let sanitized_name = Self::sanitize_arg(&name);
            let method = self
                .executor
                .execute(&format!(
                    "nmcli -g ipv4.method connection show '{}' 2>/dev/null || true",
                    sanitized_name
                ))
                .unwrap_or_default();
            let addresses = self
                .executor
                .execute(&format!(
                    "nmcli -g ipv4.addresses connection show '{}' 2>/dev/null || true",
                    sanitized_name
                ))
                .unwrap_or_default()
                .replace('\n', ",");
            let gateway = self
                .executor
                .execute(&format!(
                    "nmcli -g ipv4.gateway connection show '{}' 2>/dev/null || true",
                    sanitized_name
                ))
                .unwrap_or_default();
            let dns = self
                .executor
                .execute(&format!(
                    "nmcli -g ipv4.dns connection show '{}' 2>/dev/null || true",
                    sanitized_name
                ))
                .unwrap_or_default()
                .replace('\n', ",");

            list.push(json!({
                "name": name,
                "device": device,
                "type": tipo,
                "method": method.trim(),
                "addresses": addresses.trim(),
                "gateway": gateway.trim(),
                "dns": dns.trim(),
            }));
        }
        list
    }

    fn get_routes(&self) -> String {
        self.executor
            .execute("ip -4 route show 2>/dev/null || true")
            .unwrap_or_default()
    }

    fn profile_exists(&self, profile_name: &str) -> bool {
        let cmd = "nmcli -t -f NAME connection show 2>/dev/null || true";
        if let Ok(out) = self.executor.execute(cmd) {
            for line in out.lines() {
                let trimmed = line.trim().replace(r"\:", ":");
                if trimmed == profile_name {
                    return true;
                }
            }
        }
        false
    }

    fn execute_raw(&self, cmd: &str) -> Result<String, String> {
        self.executor.execute(cmd)
    }
}
