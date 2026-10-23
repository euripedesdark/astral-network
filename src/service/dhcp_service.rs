use crate::domain::{
    DhcpLease, DhcpScope, DhcpStatus, IpCidr, NetworkAddressing, NetworkError,
};
use crate::service::command_executor::CommandExecutor;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{error, info, warn};

pub trait DhcpService: Send + Sync {
    fn get_status(&self) -> DhcpStatus;
    fn get_leases(&self) -> Vec<DhcpLease>;
    fn generate_config(&self, addressing: &NetworkAddressing) -> String;
    fn apply_config(&self, addressing: &NetworkAddressing) -> Result<(), NetworkError>;
    fn restart_server(&self) -> Result<(), NetworkError>;
}

pub struct LinuxDhcpService {
    executor: Arc<dyn CommandExecutor>,
    conf_path: PathBuf,
    leases_path: PathBuf,
}

impl LinuxDhcpService {
    pub fn new(
        executor: Arc<dyn CommandExecutor>,
        conf_path: PathBuf,
        leases_path: PathBuf,
    ) -> Self {
        Self {
            executor,
            conf_path,
            leases_path,
        }
    }

    pub fn default_service(executor: Arc<dyn CommandExecutor>) -> Self {
        Self::new(
            executor,
            PathBuf::from("/etc/dhcp/dhcpd.conf"),
            PathBuf::from("/var/lib/dhcpd/dhcpd.leases"),
        )
    }

    fn parse_leases_file(&self) -> Vec<DhcpLease> {
        if !self.leases_path.exists() {
            return Vec::new();
        }

        let content = match fs::read_to_string(&self.leases_path) {
            Ok(c) => c,
            Err(e) => {
                warn!("Failed to read leases file {:?}: {}", self.leases_path, e);
                return Vec::new();
            }
        };

        let mut leases_by_ip: HashMap<String, DhcpLease> = HashMap::new();
        let mut current_ip: Option<String> = None;
        let mut current_mac: Option<String> = None;
        let mut current_hostname: Option<String> = None;
        let mut current_starts: Option<String> = None;
        let mut current_ends: Option<String> = None;
        let mut current_state: String = "unknown".to_string();
        let mut current_vendor: Option<String> = None;

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.starts_with("lease ") && trimmed.ends_with('{') {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    current_ip = Some(parts[1].to_string());
                }
                current_mac = None;
                current_hostname = None;
                current_starts = None;
                current_ends = None;
                current_state = "free".to_string();
                current_vendor = None;
                continue;
            }

            if trimmed == "}" {
                if let (Some(ip), Some(mac)) = (current_ip.take(), current_mac.take()) {
                    let lease = DhcpLease {
                        ip: ip.clone(),
                        mac,
                        hostname: current_hostname.take(),
                        starts: current_starts.take(),
                        ends: current_ends.take(),
                        state: current_state.clone(),
                        vendor_class: current_vendor.take(),
                    };
                    leases_by_ip.insert(ip, lease);
                }
                continue;
            }

            if let Some(rest) = trimmed.strip_prefix("hardware ethernet ") {
                current_mac = Some(rest.trim_end_matches(';').trim().to_string());
            } else if let Some(rest) = trimmed.strip_prefix("client-hostname \"") {
                current_hostname = Some(rest.trim_end_matches("\";").trim().to_string());
            } else if let Some(rest) = trimmed.strip_prefix("binding state ") {
                current_state = rest.trim_end_matches(';').trim().to_string();
            } else if let Some(rest) = trimmed.strip_prefix("starts ") {
                current_starts = Some(rest.trim_end_matches(';').trim().to_string());
            } else if let Some(rest) = trimmed.strip_prefix("ends ") {
                current_ends = Some(rest.trim_end_matches(';').trim().to_string());
            } else if let Some(rest) = trimmed.strip_prefix("set vendor-class-identifier = \"") {
                current_vendor = Some(rest.trim_end_matches("\";").trim().to_string());
            }
        }

        let mut list: Vec<DhcpLease> = leases_by_ip.into_values().collect();
        list.sort_by(|a, b| a.ip.cmp(&b.ip));
        list
    }
}

impl DhcpService for LinuxDhcpService {
    fn get_status(&self) -> DhcpStatus {
        let is_active = self
            .executor
            .execute("systemctl is-active dhcpd.service 2>/dev/null || true")
            .map(|s| s.trim() == "active")
            .unwrap_or(false);

        let leases = self.parse_leases_file();
        let active_count = leases.iter().filter(|l| l.state == "active").count();
        let total_count = leases.len();

        let mut scopes = Vec::new();
        if let Ok(content) = fs::read_to_string(&self.conf_path) {
            let mut current_subnet = String::new();
            let mut current_netmask = String::new();
            let mut current_start = String::new();
            let mut current_end = String::new();
            let mut current_router = String::new();
            let mut current_bcast = String::new();
            let mut current_dns = Vec::new();

            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("subnet ") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 4 {
                        current_subnet = parts[1].to_string();
                        current_netmask = parts[3].to_string();
                    }
                } else if trimmed.starts_with("range ") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 3 {
                        current_start = parts[1].trim_end_matches(';').to_string();
                        current_end = parts[2].trim_end_matches(';').to_string();
                    }
                } else if trimmed.starts_with("option routers ") {
                    current_router = trimmed
                        .strip_prefix("option routers ")
                        .unwrap_or("")
                        .trim_end_matches(';')
                        .trim()
                        .to_string();
                } else if trimmed.starts_with("option broadcast-address ") {
                    current_bcast = trimmed
                        .strip_prefix("option broadcast-address ")
                        .unwrap_or("")
                        .trim_end_matches(';')
                        .trim()
                        .to_string();
                } else if trimmed.starts_with("option domain-name-servers ") {
                    current_dns = trimmed
                        .strip_prefix("option domain-name-servers ")
                        .unwrap_or("")
                        .trim_end_matches(';')
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .collect();
                } else if trimmed == "}" && !current_subnet.is_empty() {
                    scopes.push(DhcpScope {
                        interface: "lan".to_string(),
                        subnet: current_subnet.clone(),
                        netmask: current_netmask.clone(),
                        range_start: current_start.clone(),
                        range_end: current_end.clone(),
                        router: current_router.clone(),
                        broadcast: current_bcast.clone(),
                        dns_servers: current_dns.clone(),
                    });
                    current_subnet.clear();
                }
            }
        }

        DhcpStatus {
            active: is_active,
            active_leases_count: active_count,
            total_leases_recorded: total_count,
            domain_name: Some("srvcloud.cloud".to_string()),
            scopes,
            leases,
        }
    }

    fn get_leases(&self) -> Vec<DhcpLease> {
        self.parse_leases_file()
    }

    fn generate_config(&self, addressing: &NetworkAddressing) -> String {
        let domain = addressing
            .dominio_dhcp
            .as_deref()
            .unwrap_or("srvcloud.cloud");

        let mut conf = String::new();
        conf.push_str("# Astral Network - ISC DHCP Server Configuration\n");
        conf.push_str("# Managed Declaratively by Astral Network Engine (Rust OOP)\n\n");
        conf.push_str("authoritative;\n");
        conf.push_str("ddns-update-style none;\n\n");
        conf.push_str(&format!("option domain-name \"{}\";\n", domain));
        conf.push_str(&format!("option domain-search \"{}\";\n", domain));
        conf.push_str("default-lease-time 86400;\n");
        conf.push_str("max-lease-time 604800;\n");
        conf.push_str("log-facility local7;\n\n");

        let dns_list = if addressing.dns.is_empty() {
            "1.1.1.1, 8.8.8.8".to_string()
        } else {
            addressing.dns.join(", ")
        };

        for iface in &addressing.interfaces {
            if !iface.servidor_dhcp || iface.is_wan() {
                continue;
            }

            if let Some(cidr) = IpCidr::parse(&iface.endereco_cidr) {
                let subnet = cidr.network_text();
                let netmask = cidr.netmask_text();
                let broadcast = cidr.broadcast_text();

                let range_start = iface
                    .dhcp_inicio
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "");
                let range_end = iface
                    .dhcp_fim
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "");

                let default_start = cidr.ip_at_offset(100);
                let default_end = cidr.ip_at_offset(199);

                let start = if range_start.is_empty() {
                    &default_start
                } else {
                    range_start
                };
                let end = if range_end.is_empty() {
                    &default_end
                } else {
                    range_end
                };

                let router = iface
                    .gateway
                    .as_deref()
                    .filter(|g| !g.trim().is_empty())
                    .unwrap_or_else(|| cidr.ip());

                conf.push_str(&format!("# Interface {}\n", iface.nome));
                conf.push_str(&format!("subnet {} netmask {} {{\n", subnet, netmask));
                conf.push_str(&format!("    range {} {};\n", start, end));
                conf.push_str(&format!("    option routers {};\n", router));
                conf.push_str(&format!("    option broadcast-address {};\n", broadcast));
                conf.push_str(&format!("    option domain-name-servers {};\n", dns_list));
                conf.push_str("}\n\n");
            }
        }

        conf
    }

    fn apply_config(&self, addressing: &NetworkAddressing) -> Result<(), NetworkError> {
        let has_dhcp_iface = addressing
            .interfaces
            .iter()
            .any(|i| i.servidor_dhcp && !i.is_wan());

        if !has_dhcp_iface {
            info!("No interface configured with DHCP server enabled; skipping dhcpd.conf rewrite.");
            return Ok(());
        }

        let new_conf = self.generate_config(addressing);

        if let Some(parent) = self.conf_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let temp_conf = format!("{}.tmp", self.conf_path.to_string_lossy());
        fs::write(&temp_conf, &new_conf).map_err(|e| {
            NetworkError::Internal(format!("Failed to write temporary dhcpd.conf: {}", e))
        })?;

        // Test configuration syntax
        let check_cmd = format!("dhcpd -t -cf '{}' 2>&1", temp_conf);
        match self.executor.execute(&check_cmd) {
            Ok(_) => {
                // Rename temp to target
                fs::rename(&temp_conf, &self.conf_path).map_err(|e| {
                    NetworkError::Internal(format!("Failed to activate dhcpd.conf: {}", e))
                })?;
                info!("DHCP configuration updated at {:?}", self.conf_path);
                self.restart_server()
            }
            Err(e) => {
                let _ = fs::remove_file(&temp_conf);
                error!("dhcpd configuration test failed: {}", e);
                Err(NetworkError::Unprocessable(format!(
                    "Configuração do DHCP inválida: {}",
                    e
                )))
            }
        }
    }

    fn restart_server(&self) -> Result<(), NetworkError> {
        info!("Restarting dhcpd.service...");
        match self.executor.execute("systemctl restart dhcpd.service") {
            Ok(_) => {
                info!("dhcpd.service restarted successfully.");
                Ok(())
            }
            Err(e) => {
                error!("Failed to restart dhcpd.service: {}", e);
                Err(NetworkError::Internal(format!(
                    "Falha ao reiniciar dhcpd.service: {}",
                    e
                )))
            }
        }
    }
}
