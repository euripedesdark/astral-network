use crate::domain::interface::NetworkInterface;
use crate::domain::ip_cidr::IpCidr;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::LazyLock;

static DOMAIN_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,252}[a-zA-Z0-9])?$").unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NetworkAddressing {
    #[serde(alias = "method")]
    pub metodo: String,

    pub interfaces: Vec<NetworkInterface>,

    pub dns: Vec<String>,

    #[serde(default, alias = "dhcpDomain", alias = "dominio_dhcp")]
    pub dominio_dhcp: Option<String>,

    #[serde(default, alias = "protectResolvConf", alias = "proteger_resolv_conf")]
    pub proteger_resolv_conf: bool,
}

impl NetworkAddressing {
    pub fn new(
        metodo: impl Into<String>,
        interfaces: Vec<NetworkInterface>,
        dns: Vec<String>,
        dominio_dhcp: Option<String>,
        proteger_resolv_conf: bool,
    ) -> Self {
        Self {
            metodo: metodo.into(),
            interfaces,
            dns,
            dominio_dhcp,
            proteger_resolv_conf,
        }
    }

    pub fn validate(&self) -> Vec<String> {
        let mut errors = Vec::new();

        if self.metodo != "manual" && self.metodo != "auto" {
            errors.push("metodo precisa ser 'manual' ou 'auto'".to_string());
        }

        if self.interfaces.is_empty() {
            errors.push("ao menos uma interface precisa ser configurada".to_string());
            return errors;
        }

        let mut seen_interfaces = HashSet::new();
        let mut seen_subnets = Vec::new();
        let mut wans_count = 0;

        for iface in &self.interfaces {
            errors.extend(iface.validate());
            if iface.is_wan() {
                wans_count += 1;
            }

            if !seen_interfaces.insert(iface.key()) {
                errors.push(format!("interface duplicada: {}", iface.nome));
            }

            if let Some(cidr) = IpCidr::parse(&iface.endereco_cidr) {
                let net_cidr = cidr.network_cidr();
                if seen_subnets.contains(&net_cidr) {
                    errors.push(format!(
                        "rede {} usada por mais de uma interface",
                        net_cidr
                    ));
                }
                seen_subnets.push(net_cidr);
            }
        }

        if wans_count > 1 {
            errors.push("mais de uma interface marcada como WAN".to_string());
        }

        if self.dns.is_empty() {
            errors.push("ao menos um servidor DNS e' obrigatorio".to_string());
        } else {
            for d in &self.dns {
                let trimmed = d.trim();
                if !IpCidr::is_valid_ipv4(trimmed) {
                    errors.push(format!("DNS invalido: {}", d));
                }
            }
            if self.dns.len() > 3 {
                errors.push("no maximo 3 servidores DNS".to_string());
            }
        }

        if let Some(ref dom) = self.dominio_dhcp {
            let dom_clean = dom.trim();
            if !dom_clean.is_empty() && !DOMAIN_REGEX.is_match(dom_clean) {
                errors.push(format!("dominio DHCP invalido: {}", dom));
            }
        }

        errors
    }

    pub fn is_valid(&self) -> bool {
        self.validate().is_empty()
    }
}
