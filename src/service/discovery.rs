use crate::domain::inventory::InterfaceInventory;
use std::fs;
use std::path::Path;
use std::process::Command;

pub struct NetworkDiscoveryService;

impl NetworkDiscoveryService {
    /// Non-destructively discovers all interfaces on the host (active, inactive, DOWN, no cable)
    pub fn discover_all_interfaces() -> Vec<InterfaceInventory> {
        let mut interfaces = Vec::new();
        let net_dir = Path::new("/sys/class/net");

        if let Ok(entries) = fs::read_dir(net_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name == "lo" || name.is_empty() {
                    continue;
                }

                let iface_path = net_dir.join(&name);
                
                // Read current MAC
                let mac = fs::read_to_string(iface_path.join("address"))
                    .map(|s| s.trim().to_lowercase())
                    .unwrap_or_else(|_| "00:00:00:00:00:00".to_string());

                // Read permanent MAC from ethtool or sysfs if available
                let permanent_mac = Self::read_permanent_mac(&name, &mac);

                // Read operstate (UP, DOWN, UNKNOWN)
                let state = fs::read_to_string(iface_path.join("operstate"))
                    .map(|s| s.trim().to_uppercase())
                    .unwrap_or_else(|_| "UNKNOWN".to_string());

                // Read carrier (1 = link detected, 0 = no cable)
                let carrier = fs::read_to_string(iface_path.join("carrier"))
                    .map(|s| s.trim() == "1")
                    .unwrap_or(false);

                // Read speed (in Mbps)
                let speed_mbps = if carrier {
                    fs::read_to_string(iface_path.join("speed"))
                        .ok()
                        .and_then(|s| s.trim().parse::<u32>().ok())
                } else {
                    None
                };

                // Read driver
                let driver = fs::read_link(iface_path.join("device/driver"))
                    .ok()
                    .and_then(|p| p.file_name().map(|f| f.to_string_lossy().to_string()))
                    .unwrap_or_else(|| "virtual".to_string());

                // Read MTU
                let mtu = fs::read_to_string(iface_path.join("mtu"))
                    .ok()
                    .and_then(|s| s.trim().parse::<u32>().ok())
                    .unwrap_or(1500);

                // Read IPv4 and IPv6 from ip command or /proc/net
                let (ipv4, ipv6) = Self::read_interface_ips(&name);

                // Detect interface type
                let is_physical = iface_path.join("device").exists();
                let is_bridge = iface_path.join("bridge").exists();
                let is_vlan = name.contains('.') || iface_path.join("vlan").exists();
                let is_bond = iface_path.join("bonding").exists();

                let (parent_interface, vlan_id) = if is_vlan {
                    let parts: Vec<&str> = name.splitn(2, '.').collect();
                    if parts.len() == 2 {
                        (Some(parts[0].to_string()), parts[1].parse::<u16>().ok())
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

                // Detect initial role
                let role = if name.starts_with("wan") || name.starts_with("ppp") {
                    "WAN".to_string()
                } else if !ipv4.is_empty() {
                    // Check if default gateway is on this interface
                    if Self::is_default_gateway_interface(&name) {
                        "WAN".to_string()
                    } else {
                        "LAN".to_string()
                    }
                } else {
                    "UNASSIGNED".to_string()
                };

                interfaces.push(InterfaceInventory {
                    name,
                    mac,
                    permanent_mac,
                    state,
                    carrier,
                    speed_mbps,
                    driver,
                    mtu,
                    ipv4,
                    ipv6,
                    role,
                    is_physical,
                    is_bridge,
                    is_vlan,
                    is_bond,
                    parent_interface,
                    vlan_id,
                });
            }
        }

        interfaces.sort_by(|a, b| a.name.cmp(&b.name));
        interfaces
    }

    /// Read permanent MAC address via ethtool
    fn read_permanent_mac(iface: &str, current_mac: &str) -> String {
        let output = Command::new("ethtool").args(["-P", iface]).output();
        if let Ok(res) = output {
            let stdout = String::from_utf8_lossy(&res.stdout);
            for line in stdout.lines() {
                if line.starts_with("Permanent address:") {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() >= 2 {
                        let perm = line.trim_start_matches("Permanent address:").trim();
                        if !perm.is_empty() && perm != "00:00:00:00:00:00" {
                            return perm.to_lowercase();
                        }
                    }
                }
            }
        }
        current_mac.to_string()
    }

    /// Read IPv4 and IPv6 addresses assigned to an interface via `ip -j addr`
    pub fn read_interface_ips(iface: &str) -> (Vec<String>, Vec<String>) {
        let mut ipv4 = Vec::new();
        let mut ipv6 = Vec::new();

        let output = Command::new("ip").args(["-j", "addr", "show", iface]).output();
        if let Ok(res) = output {
            let stdout = String::from_utf8_lossy(&res.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(arr) = val.as_array() {
                    for entry in arr {
                        if let Some(addr_info) = entry.get("addr_info").and_then(|a| a.as_array()) {
                            for addr in addr_info {
                                let family = addr.get("family").and_then(|f| f.as_str()).unwrap_or("");
                                let local = addr.get("local").and_then(|l| l.as_str()).unwrap_or("");
                                let prefixlen = addr.get("prefixlen").and_then(|p| p.as_u64()).unwrap_or(24);
                                if !local.is_empty() {
                                    let cidr = format!("{}/{}", local, prefixlen);
                                    if family == "inet" {
                                        ipv4.push(cidr);
                                    } else if family == "inet6" && !local.starts_with("fe80:") {
                                        ipv6.push(cidr);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Fallback parsing `ip -br addr show <iface>`
            let alt = Command::new("ip").args(["-br", "addr", "show", iface]).output();
            if let Ok(res) = alt {
                let stdout = String::from_utf8_lossy(&res.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        for ip_part in &parts[2..] {
                            if ip_part.contains('.') {
                                ipv4.push(ip_part.to_string());
                            } else if ip_part.contains(':') && !ip_part.starts_with("fe80:") {
                                ipv6.push(ip_part.to_string());
                            }
                        }
                    }
                }
            }
        }

        (ipv4, ipv6)
    }

    /// Check if an interface holds the default route
    fn is_default_gateway_interface(iface: &str) -> bool {
        let output = Command::new("ip").args(["route", "show", "default"]).output();
        if let Ok(res) = output {
            let stdout = String::from_utf8_lossy(&res.stdout);
            stdout.contains(&format!("dev {}", iface))
        } else {
            false
        }
    }

    /// Non-destructive check: returns true if at least one non-loopback interface has an IP
    pub fn has_active_ip(interfaces: &[InterfaceInventory]) -> bool {
        interfaces.iter().any(|iface| !iface.ipv4.is_empty())
    }
}
