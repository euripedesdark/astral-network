use crate::domain::{
    NetworkAddressing, NetworkError, NetworkInterface, NetworkSnapshot, ROLE_LAN,
};
use crate::service::backend::NetworkManagerBackend;
use crate::service::dhcp_service::DhcpService;
use serde_json::{json, Value};
use std::sync::Arc;
use tracing::{error, info, warn};

pub trait NetworkAddressingService: Send + Sync {
    fn get_current_config(&self) -> NetworkAddressing;
    fn get_kernel_interfaces(&self) -> Vec<String>;
    fn get_observed_state(&self) -> Value;
    fn plan(&self, desired: &NetworkAddressing) -> Vec<String>;
    fn validate(&self, desired: &NetworkAddressing) -> Vec<String>;
    fn apply(&self, desired: &NetworkAddressing) -> Result<NetworkSnapshot, NetworkError>;
    fn rollback(&self, snapshot: &NetworkSnapshot) -> Result<(), NetworkError>;
    fn dhcp_service(&self) -> Arc<dyn DhcpService>;
}

pub struct DeclarativeNetworkService {
    backend: Arc<dyn NetworkManagerBackend>,
    dhcp_service: Arc<dyn DhcpService>,
}

impl DeclarativeNetworkService {
    pub fn new(
        backend: Arc<dyn NetworkManagerBackend>,
        dhcp_service: Arc<dyn DhcpService>,
    ) -> Self {
        Self {
            backend,
            dhcp_service,
        }
    }

    fn profile_name(iface: &str) -> String {
        format!("astral-{}", iface)
    }

    fn sanitize(val: &str) -> String {
        val.replace('\'', "'\\''")
    }

    fn generate_commands_for_iface(
        &self,
        iface: &NetworkInterface,
        desired: &NetworkAddressing,
    ) -> Vec<String> {
        let mut cmds = Vec::new();
        let name = Self::sanitize(&iface.nome);
        let profile = Self::sanitize(&Self::profile_name(&iface.nome));
        let is_vlan = iface.nome.contains('.');

        if !self.backend.profile_exists(&Self::profile_name(&iface.nome)) {
            if is_vlan {
                let parts: Vec<&str> = iface.nome.splitn(2, '.').collect();
                if parts.len() == 2 {
                    let dev = Self::sanitize(parts[0]);
                    let id = Self::sanitize(parts[1]);
                    cmds.push(format!(
                        "nmcli con add type vlan ifname {} dev {} id {} con-name {}",
                        name, dev, id, profile
                    ));
                }
            } else {
                cmds.push(format!(
                    "nmcli con add type ethernet ifname {} con-name {}",
                    name, profile
                ));
            }
        }

        let dns_str = Self::sanitize(&desired.dns.join(" "));
        let method = if desired.metodo == "auto" {
            "auto"
        } else {
            "manual"
        };
        let gw = iface.gateway.as_deref().unwrap_or("").trim();
        let gw_clean = Self::sanitize(gw);

        cmds.push(format!(
            "nmcli con mod {} ipv4.method {} ipv4.addresses '{}' ipv4.gateway '{}' ipv4.dns '{}' ipv4.ignore-auto-dns yes",
            profile,
            method,
            Self::sanitize(&iface.endereco_cidr),
            gw_clean,
            dns_str
        ));
        cmds.push(format!("nmcli con up {}", profile));

        cmds
    }

    fn undo_applied(&self, applied: &[String], before: &Value) {
        warn!(
            "Rolling back {} applied NetworkManager commands...",
            applied.len()
        );
        let empty_vec = Vec::new();
        let perfis = before
            .get("perfis")
            .and_then(|p| p.as_array())
            .unwrap_or(&empty_vec);

        for cmd in applied.iter().rev() {
            if let Some(profile) = Self::extract_profile_name(cmd) {
                if let Some(orig) = perfis.iter().find(|p| {
                    p.get("name")
                        .and_then(|n| n.as_str())
                        .map(|n| n == profile)
                        .unwrap_or(false)
                }) {
                    let method = orig.get("method").and_then(|m| m.as_str()).unwrap_or("auto");
                    let addrs = orig
                        .get("addresses")
                        .and_then(|a| a.as_str())
                        .unwrap_or("");
                    let gw = orig.get("gateway").and_then(|g| g.as_str()).unwrap_or("");
                    let undo_cmd = format!(
                        "nmcli con mod '{}' ipv4.method '{}' ipv4.addresses '{}' ipv4.gateway '{}'",
                        Self::sanitize(&profile),
                        Self::sanitize(method),
                        Self::sanitize(addrs),
                        Self::sanitize(gw)
                    );
                    let _ = self.backend.execute_raw(&undo_cmd);
                }
            }
        }
    }

    fn extract_profile_name(cmd: &str) -> Option<String> {
        let parts: Vec<&str> = cmd.split_whitespace().collect();
        for (i, p) in parts.iter().enumerate() {
            if (*p == "mod" || *p == "up") && i + 1 < parts.len() {
                return Some(parts[i + 1].trim_matches('\'').trim_matches('"').to_string());
            }
        }
        None
    }
}

impl NetworkAddressingService for DeclarativeNetworkService {
    fn dhcp_service(&self) -> Arc<dyn DhcpService> {
        self.dhcp_service.clone()
    }

    fn get_current_config(&self) -> NetworkAddressing {
        let perfis = self.backend.list_profiles();
        let dhcp_status = self.dhcp_service.get_status();
        let mut ifaces = Vec::new();

        for p in perfis {
            let device = p.get("device").and_then(|d| d.as_str()).unwrap_or("");
            let addresses = p.get("addresses").and_then(|a| a.as_str()).unwrap_or("");
            let gateway = p
                .get("gateway")
                .and_then(|g| g.as_str())
                .filter(|g| !g.is_empty() && *g != "--" && *g != "(none)")
                .map(|g| g.to_string());

            if device.is_empty() || device == "--" || addresses.is_empty() {
                continue;
            }

            let primary_addr = addresses.split(',').next().unwrap_or("").trim();
            if primary_addr.is_empty() {
                continue;
            }

            // Check if DHCP scope matches this subnet
            let matching_scope = dhcp_status.scopes.iter().find(|s| {
                if let Some(cidr) = crate::domain::IpCidr::parse(primary_addr) {
                    s.subnet == cidr.network_text()
                } else {
                    false
                }
            });

            let (has_dhcp, dhcp_start, dhcp_end) = match matching_scope {
                Some(s) => (true, Some(s.range_start.clone()), Some(s.range_end.clone())),
                None => (false, None, None),
            };

            let papel = if gateway.is_some() && gateway.as_deref() != Some("192.168.1.1") {
                // Heuristic: default gateway on interface usually indicates WAN
                "LAN"
            } else {
                ROLE_LAN
            };

            ifaces.push(NetworkInterface::new(
                device,
                papel,
                primary_addr,
                gateway,
                has_dhcp,
                dhcp_start,
                dhcp_end,
            ));
        }

        let dns = self.backend.list_resolv_dns();
        NetworkAddressing::new(
            "manual",
            ifaces,
            dns,
            dhcp_status.domain_name,
            false,
        )
    }

    fn get_kernel_interfaces(&self) -> Vec<String> {
        self.backend.list_kernel_interfaces()
    }

    fn get_observed_state(&self) -> Value {
        json!({
            "interfaces": self.backend.list_kernel_interfaces(),
            "perfis": self.backend.list_profiles(),
            "rotas": self.backend.get_routes(),
            "dns": self.backend.list_resolv_dns(),
            "dhcp": self.dhcp_service.get_status(),
        })
    }

    fn plan(&self, desired: &NetworkAddressing) -> Vec<String> {
        let mut plan = Vec::new();
        let observed = self.get_observed_state();
        let empty_vec = Vec::new();
        let perfis = observed
            .get("perfis")
            .and_then(|p| p.as_array())
            .unwrap_or(&empty_vec);

        for iface in &desired.interfaces {
            let current = perfis.iter().find(|p| {
                p.get("device")
                    .and_then(|d| d.as_str())
                    .map(|d| d == iface.nome)
                    .unwrap_or(false)
            });

            let needs_change = match current {
                None => true,
                Some(curr) => {
                    let curr_addr = curr.get("addresses").and_then(|a| a.as_str()).unwrap_or("");
                    let curr_gw = curr.get("gateway").and_then(|g| g.as_str()).unwrap_or("");
                    let desired_gw = iface.gateway.as_deref().unwrap_or("").trim();
                    let normalized_curr_gw = if curr_gw == "--" || curr_gw == "(none)" {
                        ""
                    } else {
                        curr_gw
                    };

                    curr_addr != iface.endereco_cidr || normalized_curr_gw != desired_gw
                }
            };

            if needs_change {
                plan.extend(self.generate_commands_for_iface(iface, desired));
            }
        }

        // Add DHCP reload plan note if DHCP interfaces present
        if desired.interfaces.iter().any(|i| i.servidor_dhcp && !i.is_wan()) {
            plan.push("dhcpd: sincronizar escopos em /etc/dhcp/dhcpd.conf && systemctl restart dhcpd.service".to_string());
        }

        plan
    }

    fn validate(&self, desired: &NetworkAddressing) -> Vec<String> {
        let mut errors = desired.validate();
        let kernel_ifaces = self.get_kernel_interfaces();

        if kernel_ifaces.is_empty() {
            errors.push("nenhuma interface de rede visivel no kernel".to_string());
        }

        errors
    }

    fn apply(&self, desired: &NetworkAddressing) -> Result<NetworkSnapshot, NetworkError> {
        let errors = self.validate(desired);
        if !errors.is_empty() {
            return Err(NetworkError::Validation(errors));
        }

        let before = self.get_observed_state();
        let plan = self.plan(desired);

        let mut applied = Vec::new();
        let mut failures = Vec::new();

        for cmd in &plan {
            if cmd.starts_with("dhcpd:") {
                // Apply DHCP configuration
                if let Err(e) = self.dhcp_service.apply_config(desired) {
                    failures.push(format!("DHCP apply: {}", e));
                    break;
                }
                applied.push(cmd.clone());
                continue;
            }

            match self.backend.execute_raw(cmd) {
                Ok(_) => {
                    applied.push(cmd.clone());
                }
                Err(e) => {
                    error!("Command failed during network apply: {} -> {}", cmd, e);
                    failures.push(format!("{} -> {}", cmd, e));
                    break;
                }
            }
        }

        if !failures.is_empty() {
            self.undo_applied(&applied, &before);
            return Err(NetworkError::Internal(format!(
                "Falha ao aplicar enderecamento: {}",
                failures.join(" | ")
            )));
        }

        info!(
            "Network configuration applied successfully: {}/{} commands executed",
            applied.len(),
            plan.len()
        );

        Ok(NetworkSnapshot::new(before, applied))
    }

    fn rollback(&self, snapshot: &NetworkSnapshot) -> Result<(), NetworkError> {
        self.undo_applied(snapshot.comandos(), snapshot.antes());
        Ok(())
    }
}
