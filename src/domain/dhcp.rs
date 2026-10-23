use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DhcpLease {
    pub ip: String,
    pub mac: String,
    pub hostname: Option<String>,
    pub starts: Option<String>,
    pub ends: Option<String>,
    pub state: String,
    pub vendor_class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DhcpScope {
    pub interface: String,
    pub subnet: String,
    pub netmask: String,
    pub range_start: String,
    pub range_end: String,
    pub router: String,
    pub broadcast: String,
    pub dns_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DhcpStatus {
    pub active: bool,
    pub active_leases_count: usize,
    pub total_leases_recorded: usize,
    pub domain_name: Option<String>,
    pub scopes: Vec<DhcpScope>,
    pub leases: Vec<DhcpLease>,
}
