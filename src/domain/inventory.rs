use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InterfaceInventory {
    pub name: String,
    pub mac: String,
    pub permanent_mac: String,
    pub state: String,          // UP, DOWN, UNKNOWN
    pub carrier: bool,          // true if cable/link detected
    pub speed_mbps: Option<u32>, // 100, 1000, 2500, 10000
    pub driver: String,
    pub mtu: u32,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
    pub role: String,           // WAN, LAN, TRUNK, BRIDGE, UNASSIGNED
    pub is_physical: bool,
    pub is_bridge: bool,
    pub is_vlan: bool,
    pub is_bond: bool,
    pub parent_interface: Option<String>,
    pub vlan_id: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanConfig {
    pub interface: String,
    pub method: String, // DHCP, STATIC, PPPOE
    pub static_ip: Option<String>,
    pub gateway: Option<String>,
    pub dns: Vec<String>,
    pub pppoe_user: Option<String>,
    pub pppoe_password: Option<String>,
    pub pppoe_vlan: Option<u16>,
    pub weight: u32,
    pub metric: u32,
    pub role: String, // PRIMARY, FAILOVER, BALANCED
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlanConfig {
    pub id: u16,
    pub parent_interface: String,
    pub mode: String, // ACCESS, TRUNK
    pub native_vlan: bool,
    pub ipv4_cidr: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub name: String,
    pub members: Vec<String>,
    pub ipv4_cidr: Option<String>,
    pub stp: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BondConfig {
    pub name: String,
    pub slaves: Vec<String>,
    pub mode: String, // 802.3ad, active-backup, balance-xor
    pub ipv4_cidr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteConfig {
    pub destination: String,
    pub gateway: String,
    pub interface: Option<String>,
    pub metric: u32,
    pub table: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PbrRule {
    pub id: String,
    pub source_cidr: Option<String>,
    pub in_interface: Option<String>,
    pub fwmark: Option<u32>,
    pub table: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForward {
    pub id: String,
    pub enabled: bool,
    pub description: String,
    pub source_cidr: Option<String>, // restriction or 0.0.0.0/0
    pub wan_interface: String,
    pub external_port: u16,
    pub protocol: String, // TCP, UDP, TCP_UDP
    pub internal_ip: String,
    pub internal_port: u16,
    pub hairpin_nat: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallZone {
    pub name: String,
    pub interfaces: Vec<String>,
    pub default_policy: String, // ACCEPT, DROP
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallRule {
    pub id: String,
    pub from_zone: String,
    pub to_zone: String,
    pub action: String, // ACCEPT, DROP, REJECT
    pub protocol: String,
    pub dest_port: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireguardPeer {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub allowed_ips: Vec<String>,
    pub endpoint: Option<String>,
    pub persistent_keepalive: u16,
    pub enabled: bool,
    pub last_handshake: Option<String>,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireguardConfig {
    pub enabled: bool,
    pub interface: String,
    pub listen_port: u16,
    pub address_cidr: String,
    pub public_key: String,
    pub peers: Vec<WireguardPeer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflareTunnelConfig {
    pub enabled: bool,
    pub tunnel_token: String,
    pub status: String, // CONNECTED, DISCONNECTED, NOT_INSTALLED
    pub ingress_rules: Vec<CloudflareIngressRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflareIngressRule {
    pub hostname: String,
    pub service: String, // e.g. http://localhost:8086, http://192.168.0.1:80
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DhcpScopeConfig {
    pub interface: String,
    pub enabled: bool,
    pub subnet_cidr: String,
    pub range_start: String,
    pub range_end: String,
    pub gateway: String,
    pub dns_servers: Vec<String>,
    pub domain_name: Option<String>,
    pub lease_time_secs: u32,
    pub ntp_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticLease {
    pub mac: String,
    pub ip: String,
    pub hostname: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveLease {
    pub ip: String,
    pub mac: String,
    pub hostname: String,
    pub expires_at: String,
    pub remaining_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdDnsIntegrationConfig {
    pub enabled: bool,
    pub ad_domain: String, // e.g. srvcloud.cloud
    pub ad_dc_ips: Vec<String>, // e.g. ["192.168.0.1", "66.163.123.90"]
    pub forward_msdcs: bool, // forward _msdcs.<ad_domain>
    pub secondary_zone_axfr: bool,
    pub upstream_dot: bool,
    pub local_overrides: Vec<DnsOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsOverride {
    pub fqdn: String,
    pub ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclarativeNetworkState {
    pub version: u32,
    pub updated_at: String,
    pub wans: Vec<WanConfig>,
    pub vlans: Vec<VlanConfig>,
    pub bridges: Vec<BridgeConfig>,
    pub bonds: Vec<BondConfig>,
    pub routes: Vec<RouteConfig>,
    pub pbr_rules: Vec<PbrRule>,
    pub port_forwards: Vec<PortForward>,
    pub firewall_rules: Vec<FirewallRule>,
    pub wireguard: WireguardConfig,
    pub cloudflare: CloudflareTunnelConfig,
    pub dhcp_scopes: Vec<DhcpScopeConfig>,
    pub static_leases: Vec<StaticLease>,
    pub ad_dns: AdDnsIntegrationConfig,
}
