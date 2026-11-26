use crate::domain::inventory::{BondConfig, BridgeConfig, DhcpScopeConfig, RouteConfig, StaticLease, VlanConfig};
use crate::service::command_executor::{CommandExecutor, SystemCommandExecutor};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigureInterfaceRequest {
    pub name: String,
    pub action: Option<String>, // "up", "down", "apply"
    pub method: Option<String>, // "dhcp", "static"
    pub ipv4_cidr: Option<String>,
    pub gateway: Option<String>,
    pub dns: Option<Vec<String>>,
    pub mtu: Option<u32>,
    pub mac: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVlanRequest {
    pub parent_interface: String,
    pub vlan_id: u16,
    pub name: Option<String>,
    pub ipv4_cidr: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBridgeRequest {
    pub name: String,
    pub members: Vec<String>,
    pub ipv4_cidr: Option<String>,
    pub stp: Option<bool>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBondRequest {
    pub name: String,
    pub slaves: Vec<String>,
    pub mode: String,
    pub ipv4_cidr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteItem {
    pub destination: String,
    pub gateway: Option<String>,
    pub interface: Option<String>,
    pub metric: Option<u32>,
    pub protocol: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRouteRequest {
    pub destination: String,
    pub gateway: String,
    pub interface: Option<String>,
    pub metric: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteTargetRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteRouteRequest {
    pub destination: String,
}

pub struct L2L3Service {
    executor: Arc<dyn CommandExecutor>,
}

impl L2L3Service {
    pub fn new(executor: Arc<dyn CommandExecutor>) -> Self {
        Self { executor }
    }

    pub fn default_service() -> Self {
        Self::new(Arc::new(SystemCommandExecutor::new(false)))
    }

    fn sanitize_name(name: &str) -> Result<String, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Nome de interface não pode ser vazio".to_string());
        }
        if !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') {
            return Err(format!("Nome de interface contém caracteres inválidos: '{}'", trimmed));
        }
        Ok(trimmed.to_string())
    }

    // ==========================================
    // 1. INTERFACES (L2/L3)
    // ==========================================

    pub fn configure_interface(&self, req: &ConfigureInterfaceRequest) -> Result<String, String> {
        let name = Self::sanitize_name(&req.name)?;
        let mut ops = Vec::new();

        // 1. Action UP/DOWN
        if let Some(act) = &req.action {
            let act_lower = act.trim().to_lowercase();
            if act_lower == "up" {
                self.executor.execute(&format!("ip link set dev {} up", name))?;
                ops.push(format!("Interface {} ligada (UP)", name));
            } else if act_lower == "down" {
                self.executor.execute(&format!("ip link set dev {} down", name))?;
                ops.push(format!("Interface {} desligada (DOWN)", name));
                return Ok(ops.join("; "));
            }
        }

        // 2. MTU
        if let Some(mtu) = req.mtu {
            if (576..=65535).contains(&mtu) {
                let _ = self.executor.execute(&format!("ip link set dev {} mtu {}", name, mtu));
                ops.push(format!("MTU definido para {}", mtu));
            }
        }

        // 3. MAC Spoofing
        if let Some(mac) = &req.mac {
            let clean_mac = mac.trim();
            if clean_mac.len() == 17 && clean_mac.contains(':') {
                let cmd = format!("ip link set dev {} address {}", name, clean_mac);
                if let Err(_e) = self.executor.execute(&cmd) {
                    // Sometimes device must be down first
                    let _ = self.executor.execute(&format!("ip link set dev {} down && ip link set dev {} address {} && ip link set dev {} up", name, name, clean_mac, name));
                }
                ops.push(format!("MAC alterado para {}", clean_mac));
            }
        }

        // 4. Method: DHCP vs Static IP
        if let Some(method) = &req.method {
            let m_lower = method.trim().to_lowercase();
            if m_lower == "dhcp" {
                // If NetworkManager exists, configure via nmcli for persistence
                let profile = format!("astral-{}", name);
                let nm_cmd = format!("nmcli con mod '{}' ipv4.method auto 2>/dev/null && nmcli con up '{}' 2>/dev/null || dhclient -v {} 2>/dev/null &", profile, profile, name);
                let _ = self.executor.execute(&nm_cmd);
                ops.push("Configurado como cliente DHCP".to_string());
            } else if m_lower == "static" {
                if let Some(cidr) = &req.ipv4_cidr {
                    let clean_cidr = cidr.trim();
                    if clean_cidr.contains('/') {
                        let add_cmd = format!("ip addr replace {} dev {}", clean_cidr, name);
                        self.executor.execute(&add_cmd)?;
                        ops.push(format!("IP {} atribuído", clean_cidr));

                        if let Some(gw) = &req.gateway {
                            let clean_gw = gw.trim();
                            if !clean_gw.is_empty() {
                                let gw_cmd = format!("ip route replace default via {} dev {}", clean_gw, name);
                                let _ = self.executor.execute(&gw_cmd);
                                ops.push(format!("Gateway padrão {} configurado", clean_gw));
                            }
                        }

                        // Also persist in NetworkManager if active
                        let profile = format!("astral-{}", name);
                        let gw_arg = req.gateway.as_deref().unwrap_or("").trim();
                        let dns_arg = req.dns.as_ref().map(|d| d.join(" ")).unwrap_or_default();
                        let nm_persist = format!(
                            "nmcli con add type ethernet ifname '{}' con-name '{}' 2>/dev/null || true; nmcli con mod '{}' ipv4.method manual ipv4.addresses '{}' ipv4.gateway '{}' ipv4.dns '{}' 2>/dev/null || true",
                            name, profile, profile, clean_cidr, gw_arg, dns_arg
                        );
                        let _ = self.executor.execute(&nm_persist);
                    }
                }
            }
        }

        // Ensure interface is UP after configuration
        let _ = self.executor.execute(&format!("ip link set dev {} up", name));

        if ops.is_empty() {
            ops.push("Interface atualizada no kernel".to_string());
        }
        Ok(ops.join("; "))
    }

    // ==========================================
    // 2. VLANs 802.1Q
    // ==========================================

    pub fn list_vlans(&self) -> Vec<VlanConfig> {
        let mut list = Vec::new();
        let net_dir = Path::new("/sys/class/net");
        if let Ok(entries) = fs::read_dir(net_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let iface_path = net_dir.join(&name);
                let is_vlan = name.contains('.') || iface_path.join("vlan").exists();
                if is_vlan {
                    let parts: Vec<&str> = name.splitn(2, '.').collect();
                    if parts.len() == 2 {
                        let parent = parts[0].to_string();
                        let id = parts[1].parse::<u16>().unwrap_or(0);
                        let cidr = crate::service::discovery::NetworkDiscoveryService::read_interface_ips(&name).0.into_iter().next();
                        list.push(VlanConfig {
                            id,
                            parent_interface: parent,
                            mode: "ACCESS".to_string(),
                            native_vlan: false,
                            ipv4_cidr: cidr,
                            description: format!("VLAN ID {}", id),
                        });
                    }
                }
            }
        }
        list
    }

    pub fn create_vlan(&self, req: &CreateVlanRequest) -> Result<String, String> {
        let parent = Self::sanitize_name(&req.parent_interface)?;
        let id = req.vlan_id;
        if !(1..=4094).contains(&id) {
            return Err("VLAN ID deve estar entre 1 e 4094".to_string());
        }

        let name = match &req.name {
            Some(n) if !n.trim().is_empty() => Self::sanitize_name(n)?,
            _ => format!("{}.{}", parent, id),
        };

        // 1. Create VLAN link in Linux kernel
        let cmd = format!("ip link add link {} name {} type vlan id {}", parent, name, id);
        self.executor.execute(&cmd)?;

        // 2. Turn UP
        let _ = self.executor.execute(&format!("ip link set dev {} up", name));

        // 3. Assign IP if provided
        if let Some(cidr) = &req.ipv4_cidr {
            let clean_cidr = cidr.trim();
            if !clean_cidr.is_empty() {
                let _ = self.executor.execute(&format!("ip addr replace {} dev {}", clean_cidr, name));
            }
        }

        // 4. NetworkManager profile persistence
        let profile = format!("astral-{}", name);
        let nm_cmd = format!("nmcli con add type vlan con-name '{}' dev '{}' id {} ifname '{}' 2>/dev/null || true", profile, parent, id, name);
        let _ = self.executor.execute(&nm_cmd);

        info!("VLAN {} (ID {}) criada com sucesso no kernel vinculada a {}", name, id, parent);
        Ok(format!("VLAN {} criada com sucesso vinculada a {}", name, parent))
    }

    pub fn delete_vlan(&self, name: &str) -> Result<String, String> {
        let clean = Self::sanitize_name(name)?;
        let cmd = format!("ip link delete dev {}", clean);
        self.executor.execute(&cmd)?;
        let _ = self.executor.execute(&format!("nmcli con del 'astral-{}' 2>/dev/null || true", clean));
        info!("VLAN {} removida do kernel", clean);
        Ok(format!("VLAN {} removida com sucesso", clean))
    }

    // ==========================================
    // 3. LINUX BRIDGES
    // ==========================================

    pub fn list_bridges(&self) -> Vec<BridgeConfig> {
        let mut list = Vec::new();
        let net_dir = Path::new("/sys/class/net");
        if let Ok(entries) = fs::read_dir(net_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let iface_path = net_dir.join(&name);
                if iface_path.join("bridge").exists() {
                    let mut members = Vec::new();
                    let brif_path = iface_path.join("brif");
                    if let Ok(br_entries) = fs::read_dir(brif_path) {
                        for m in br_entries.flatten() {
                            members.push(m.file_name().to_string_lossy().to_string());
                        }
                    }
                    let cidr = crate::service::discovery::NetworkDiscoveryService::read_interface_ips(&name).0.into_iter().next();
                    let stp = fs::read_to_string(iface_path.join("bridge/stp_state"))
                        .map(|s| s.trim() == "1")
                        .unwrap_or(false);

                    list.push(BridgeConfig {
                        name,
                        members,
                        ipv4_cidr: cidr,
                        stp,
                        description: "Linux Bridge".to_string(),
                    });
                }
            }
        }
        list
    }

    pub fn create_bridge(&self, req: &CreateBridgeRequest) -> Result<String, String> {
        let name = Self::sanitize_name(&req.name)?;

        // 1. Create bridge interface
        self.executor.execute(&format!("ip link add name {} type bridge", name))?;

        // 2. STP
        if req.stp.unwrap_or(false) {
            let _ = self.executor.execute(&format!("ip link set dev {} type bridge stp_state 1", name));
        }

        // 3. Attach members
        for m in &req.members {
            if let Ok(clean_m) = Self::sanitize_name(m) {
                let _ = self.executor.execute(&format!("ip link set dev {} up && ip link set dev {} master {}", clean_m, clean_m, name));
            }
        }

        // 4. IP
        if let Some(cidr) = &req.ipv4_cidr {
            let clean_cidr = cidr.trim();
            if !clean_cidr.is_empty() {
                let _ = self.executor.execute(&format!("ip addr replace {} dev {}", clean_cidr, name));
            }
        }

        // 5. Up
        let _ = self.executor.execute(&format!("ip link set dev {} up", name));

        // Persistence
        let profile = format!("astral-{}", name);
        let _ = self.executor.execute(&format!("nmcli con add type bridge con-name '{}' ifname '{}' 2>/dev/null || true", profile, name));

        info!("Bridge {} criada com sucesso", name);
        Ok(format!("Bridge {} criada com {} portas membros", name, req.members.len()))
    }

    pub fn delete_bridge(&self, name: &str) -> Result<String, String> {
        let clean = Self::sanitize_name(name)?;
        self.executor.execute(&format!("ip link delete dev {}", clean))?;
        let _ = self.executor.execute(&format!("nmcli con del 'astral-{}' 2>/dev/null || true", clean));
        info!("Bridge {} excluída do kernel", clean);
        Ok(format!("Bridge {} excluída com sucesso", clean))
    }

    // ==========================================
    // 4. BONDING (LACP / Active-Backup)
    // ==========================================

    pub fn list_bonds(&self) -> Vec<BondConfig> {
        let mut list = Vec::new();
        let net_dir = Path::new("/sys/class/net");
        if let Ok(entries) = fs::read_dir(net_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let iface_path = net_dir.join(&name);
                if iface_path.join("bonding").exists() {
                    let mut slaves = Vec::new();
                    if let Ok(content) = fs::read_to_string(iface_path.join("bonding/slaves")) {
                        slaves = content.split_whitespace().map(|s| s.to_string()).collect();
                    }
                    let mode = fs::read_to_string(iface_path.join("bonding/mode"))
                        .map(|s| s.trim().to_string())
                        .unwrap_or_else(|_| "802.3ad".to_string());
                    let cidr = crate::service::discovery::NetworkDiscoveryService::read_interface_ips(&name).0.into_iter().next();

                    list.push(BondConfig {
                        name,
                        slaves,
                        mode,
                        ipv4_cidr: cidr,
                    });
                }
            }
        }
        list
    }

    pub fn create_bond(&self, req: &CreateBondRequest) -> Result<String, String> {
        let name = Self::sanitize_name(&req.name)?;
        let mode = req.mode.trim();

        let _ = self.executor.execute("modprobe bonding 2>/dev/null || true");
        self.executor.execute(&format!("ip link add name {} type bond mode {}", name, mode))?;

        for s in &req.slaves {
            if let Ok(clean_s) = Self::sanitize_name(s) {
                let _ = self.executor.execute(&format!("ip link set dev {} down && ip link set dev {} master {}", clean_s, clean_s, name));
            }
        }

        if let Some(cidr) = &req.ipv4_cidr {
            let clean_cidr = cidr.trim();
            if !clean_cidr.is_empty() {
                let _ = self.executor.execute(&format!("ip addr replace {} dev {}", clean_cidr, name));
            }
        }

        let _ = self.executor.execute(&format!("ip link set dev {} up", name));
        info!("Bond {} (Modo {}) criado com sucesso", name, mode);
        Ok(format!("Bond {} criado com sucesso", name))
    }

    pub fn delete_bond(&self, name: &str) -> Result<String, String> {
        let clean = Self::sanitize_name(name)?;
        self.executor.execute(&format!("ip link delete dev {}", clean))?;
        let _ = self.executor.execute(&format!("nmcli con del 'astral-{}' 2>/dev/null || true", clean));
        info!("Bond {} excluído do kernel", clean);
        Ok(format!("Bond {} excluído com sucesso", clean))
    }

    // ==========================================
    // 5. ROTAS ESTÁTICAS (Routing Table L3)
    // ==========================================

    pub fn list_routes(&self) -> Vec<RouteItem> {
        let mut list = Vec::new();
        // Try parsing json route
        let out = match self.executor.execute("ip -j route show 2>/dev/null") {
            Ok(s) => s,
            Err(_) => String::new(),
        };

        if let Ok(arr) = serde_json::from_str::<serde_json::Value>(&out) {
            if let Some(items) = arr.as_array() {
                for it in items {
                    let dst = it.get("dst").and_then(|v| v.as_str()).unwrap_or("default").to_string();
                    let gw = it.get("gateway").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let dev = it.get("dev").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let metric = it.get("metric").and_then(|v| v.as_u64()).map(|u| u as u32);
                    let proto = it.get("protocol").and_then(|v| v.as_str()).map(|s| s.to_string());

                    list.push(RouteItem {
                        destination: dst,
                        gateway: gw,
                        interface: dev,
                        metric,
                        protocol: proto,
                    });
                }
                return list;
            }
        }

        // Fallback: parse plain `ip route show`
        if let Ok(raw) = self.executor.execute("ip route show 2>/dev/null") {
            for line in raw.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.is_empty() { continue; }
                let dst = parts[0].to_string();
                let mut gw = None;
                let mut dev = None;
                let mut metric = None;

                let mut i = 1;
                while i < parts.len() {
                    if parts[i] == "via" && i + 1 < parts.len() {
                        gw = Some(parts[i + 1].to_string());
                        i += 2;
                    } else if parts[i] == "dev" && i + 1 < parts.len() {
                        dev = Some(parts[i + 1].to_string());
                        i += 2;
                    } else if parts[i] == "metric" && i + 1 < parts.len() {
                        metric = parts[i + 1].parse::<u32>().ok();
                        i += 2;
                    } else {
                        i += 1;
                    }
                }

                list.push(RouteItem {
                    destination: dst,
                    gateway: gw,
                    interface: dev,
                    metric,
                    protocol: None,
                });
            }
        }

        list
    }

    pub fn create_route(&self, req: &CreateRouteRequest) -> Result<String, String> {
        let dst = req.destination.trim();
        let gw = req.gateway.trim();
        if dst.is_empty() || gw.is_empty() {
            return Err("Destino e Gateway são obrigatórios".to_string());
        }

        let mut cmd = format!("ip route replace {}", dst);
        if !gw.is_empty() && gw != "direct" {
            cmd.push_str(&format!(" via {}", gw));
        }
        if let Some(dev) = &req.interface {
            let clean_dev = dev.trim();
            if !clean_dev.is_empty() {
                cmd.push_str(&format!(" dev {}", clean_dev));
            }
        }
        if let Some(metric) = req.metric {
            cmd.push_str(&format!(" metric {}", metric));
        }

        self.executor.execute(&cmd)?;
        info!("Rota aplicada no kernel: {}", cmd);
        Ok(format!("Rota para {} via {} cadastrada com sucesso", dst, gw))
    }

    pub fn delete_route(&self, dst: &str) -> Result<String, String> {
        let clean = dst.trim();
        if clean.is_empty() {
            return Err("Destino da rota não pode ser vazio".to_string());
        }
        let cmd = format!("ip route del {}", clean);
        self.executor.execute(&cmd)?;
        info!("Rota {} removida da tabela de roteamento", clean);
        Ok(format!("Rota para {} removida", clean))
    }

    // ==========================================
    // 6. DHCP SCOPES & STATIC LEASES
    // ==========================================

    pub fn save_dhcp_scope(&self, scope: &DhcpScopeConfig) -> Result<String, String> {
        let conf_path = Path::new("/etc/dhcp/dhcpd.conf");
        let mut content = fs::read_to_string(conf_path).unwrap_or_default();

        let clean_subnet_parts: Vec<&str> = scope.subnet_cidr.split('/').collect();
        if clean_subnet_parts.len() != 2 {
            return Err("Subrede inválida. Formato esperado: A.B.C.D/M (ex: 192.168.1.0/24)".to_string());
        }
        let subnet_ip = clean_subnet_parts[0];
        let prefix = clean_subnet_parts[1].parse::<u8>().unwrap_or(24);
        let netmask = match prefix {
            24 => "255.255.255.0",
            16 => "255.255.0.0",
            8 => "255.0.0.0",
            25 => "255.255.255.128",
            26 => "255.255.255.192",
            27 => "255.255.255.224",
            28 => "255.255.255.240",
            _ => "255.255.255.0",
        };

        let dns_str = if scope.dns_servers.is_empty() {
            "1.1.1.1, 8.8.8.8".to_string()
        } else {
            scope.dns_servers.join(", ")
        };

        let block = format!(
            "\n# Escopo {}\nsubnet {} netmask {} {{\n    range {} {};\n    option routers {};\n    option domain-name-servers {};\n    default-lease-time {};\n    max-lease-time {};\n}}\n",
            scope.interface,
            subnet_ip,
            netmask,
            scope.range_start,
            scope.range_end,
            scope.gateway,
            dns_str,
            scope.lease_time_secs,
            scope.lease_time_secs * 2
        );

        // Atribui IP do gateway na interface se necessário para que o dhcpd possa subir
        if !scope.interface.is_empty() && !scope.gateway.is_empty() {
            let _ = self.executor.execute(&format!("ip link set {} up", scope.interface));
            let _ = self.executor.execute(&format!("ip addr replace {}/{} dev {}", scope.gateway, prefix, scope.interface));
        }

        // Garante que o arquivo de leases existe
        let _ = self.executor.execute("mkdir -p /var/lib/dhcpd /etc/sysconfig && touch /var/lib/dhcpd/dhcpd.leases");
        if !scope.interface.is_empty() {
            let _ = self.executor.execute(&format!("echo 'DHCPDARGS=\"{}\"' > /etc/sysconfig/dhcpd", scope.interface));
        }

        // Ensure headers exist
        if !content.contains("ddns-update-style") {
            content = format!("authoritative;\nddns-update-style none;\nlog-facility local7;\n\n{}", content);
        }

        // Remove previous scope for same subnet if exists to avoid duplicate declarations
        let marker = format!("subnet {} netmask", subnet_ip);
        if let Some(start_idx) = content.find(&marker) {
            if let Some(end_idx) = content[start_idx..].find('}') {
                content.replace_range(start_idx..(start_idx + end_idx + 1), "");
            }
        }
        content.push_str(&block);

        fs::write(conf_path, &content).map_err(|e| format!("Falha ao gravar /etc/dhcp/dhcpd.conf: {}", e))?;

        // Test syntax
        let test_res = self.executor.execute("dhcpd -t -cf /etc/dhcp/dhcpd.conf 2>&1");
        let restart_res = self.executor.execute("systemctl restart dhcpd.service 2>&1");
        match restart_res {
            Ok(_) => Ok(format!("Escopo DHCP para {} ({}) ativado com sucesso!", scope.interface, scope.subnet_cidr)),
            Err(e) => {
                let err_detail = test_res.unwrap_or(e);
                Ok(format!("Escopo salvo em /etc/dhcp/dhcpd.conf. Aviso do serviço: {}", err_detail))
            }
        }
    }

    pub fn add_static_lease(&self, lease: &StaticLease) -> Result<String, String> {
        let conf_path = Path::new("/etc/dhcp/dhcpd.conf");
        let mut content = fs::read_to_string(conf_path).unwrap_or_default();

        let host_block = format!(
            "\nhost {} {{\n    hardware ethernet {};\n    fixed-address {};\n}}\n",
            lease.hostname, lease.mac, lease.ip
        );

        content.push_str(&host_block);
        fs::write(conf_path, &content).map_err(|e| format!("Erro ao gravar /etc/dhcp/dhcpd.conf: {}", e))?;

        let _ = self.executor.execute("dhcpd -t -cf /etc/dhcp/dhcpd.conf 2>&1");
        let _ = self.executor.execute("systemctl restart dhcpd.service");

        info!("Reserva DHCP estática adicionada: {} -> {}", lease.mac, lease.ip);
        Ok(format!("Reserva estática para {} ({}) criada com sucesso", lease.hostname, lease.ip))
    }

    pub fn delete_static_lease(&self, mac: &str) -> Result<String, String> {
        let conf_path = Path::new("/etc/dhcp/dhcpd.conf");
        let content = fs::read_to_string(conf_path).map_err(|e| e.to_string())?;

        let mut new_lines = Vec::new();
        let mut skip_block = false;

        for line in content.lines() {
            if line.contains("host ") && line.contains('{') {
                skip_block = false;
            }
            if line.contains(mac) {
                skip_block = true;
                continue;
            }
            if skip_block && line.trim() == "}" {
                skip_block = false;
                continue;
            }
            if !skip_block {
                new_lines.push(line);
            }
        }

        let updated = new_lines.join("\n");
        fs::write(conf_path, updated).map_err(|e| e.to_string())?;
        let _ = self.executor.execute("systemctl restart dhcpd.service");

        info!("Reserva DHCP {} removida", mac);
        Ok(format!("Reserva estática com MAC {} removida", mac))
    }
}
