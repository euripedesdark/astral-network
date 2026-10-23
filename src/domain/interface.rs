use crate::domain::ip_cidr::IpCidr;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

static IFACE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,14}$").unwrap());

pub const ROLE_WAN: &str = "WAN";
pub const ROLE_LAN: &str = "LAN";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NetworkInterface {
    #[serde(alias = "name")]
    pub nome: String,

    #[serde(alias = "role")]
    pub papel: String,

    #[serde(alias = "addressCidr", alias = "endereco_cidr")]
    pub endereco_cidr: String,

    pub gateway: Option<String>,

    #[serde(default, alias = "dhcpServer", alias = "servidor_dhcp")]
    pub servidor_dhcp: bool,

    #[serde(default, alias = "dhcpStart", alias = "dhcp_inicio")]
    pub dhcp_inicio: Option<String>,

    #[serde(default, alias = "dhcpEnd", alias = "dhcp_fim")]
    pub dhcp_fim: Option<String>,
}

impl NetworkInterface {
    pub fn new(
        nome: impl Into<String>,
        papel: impl Into<String>,
        endereco_cidr: impl Into<String>,
        gateway: Option<String>,
        servidor_dhcp: bool,
        dhcp_inicio: Option<String>,
        dhcp_fim: Option<String>,
    ) -> Self {
        Self {
            nome: nome.into(),
            papel: papel.into(),
            endereco_cidr: endereco_cidr.into(),
            gateway,
            servidor_dhcp,
            dhcp_inicio,
            dhcp_fim,
        }
    }

    pub fn is_wan(&self) -> bool {
        self.papel.eq_ignore_ascii_case(ROLE_WAN)
    }

    pub fn is_lan(&self) -> bool {
        self.papel.eq_ignore_ascii_case(ROLE_LAN)
    }

    pub fn key(&self) -> String {
        self.nome.to_lowercase()
    }

    pub fn validate(&self) -> Vec<String> {
        let mut errors = Vec::new();

        if !IFACE_REGEX.is_match(&self.nome) {
            errors.push(format!("nome de interface invalido: {}", self.nome));
            return errors;
        }

        if self.nome.eq_ignore_ascii_case("lo") {
            errors.push("a interface de loopback nao pode ser configurada".to_string());
        }

        if !(self.is_wan() || self.is_lan()) {
            errors.push(format!(
                "papel invalido em {} (esperado WAN ou LAN)",
                self.nome
            ));
        }

        let cidr = IpCidr::parse(&self.endereco_cidr);
        match cidr {
            None => {
                errors.push(format!(
                    "endereco de {} precisa ser IPv4 com mascara CIDR (ex: 192.168.2.10/24)",
                    self.nome
                ));
            }
            Some(ref faixa) => {
                if faixa.is_broadcast() {
                    errors.push(format!(
                        "o endereco de {} e' o broadcast da rede {}",
                        self.nome,
                        faixa.network_cidr()
                    ));
                }
                if faixa.is_pure_network() {
                    errors.push(format!(
                        "o endereco de {} e' a identidade da rede (rede pura)",
                        self.nome
                    ));
                }

                if let Some(ref gw) = self.gateway {
                    let gw_clean = gw.trim();
                    if !gw_clean.is_empty() {
                        let gw_cidr = IpCidr::parse(gw_clean);
                        match gw_cidr {
                            None => errors.push(format!(
                                "gateway de {} nao e' IPv4 valido: {}",
                                self.nome, gw_clean
                            )),
                            Some(_) => {
                                if !faixa.contains(gw_clean) {
                                    errors.push(format!(
                                        "gateway {} esta fora da rede {} de {}",
                                        gw_clean,
                                        faixa.network_cidr(),
                                        self.nome
                                    ));
                                }
                            }
                        }
                    } else if self.is_wan() {
                        errors.push(format!("interface WAN {} precisa de gateway", self.nome));
                    }
                } else if self.is_wan() {
                    errors.push(format!("interface WAN {} precisa de gateway", self.nome));
                }
            }
        }

        if self.servidor_dhcp {
            if self.is_wan() {
                errors.push(format!("WAN {} nao pode servir DHCP", self.nome));
            }

            let ini_cidr = self.dhcp_inicio.as_deref().and_then(IpCidr::parse);
            let fim_cidr = self.dhcp_fim.as_deref().and_then(IpCidr::parse);

            if ini_cidr.is_none() {
                errors.push(format!("inicio do intervalo DHCP invalido em {}", self.nome));
            }
            if fim_cidr.is_none() {
                errors.push(format!("fim do intervalo DHCP invalido em {}", self.nome));
            }

            if let (Some(ini), Some(fim)) = (ini_cidr, fim_cidr) {
                if ini.address() > fim.address() {
                    errors.push(format!(
                        "intervalo DHCP de {} invertido ({} > {})",
                        self.nome,
                        self.dhcp_inicio.as_deref().unwrap_or(""),
                        self.dhcp_fim.as_deref().unwrap_or("")
                    ));
                }
                if let Some(ref faixa) = cidr {
                    if !faixa.contains(ini.ip()) || !faixa.contains(fim.ip()) {
                        errors.push(format!(
                            "intervalo DHCP de {} fora da rede {}",
                            self.nome,
                            faixa.network_cidr()
                        ));
                    }
                }
            }
        }

        errors
    }
}
