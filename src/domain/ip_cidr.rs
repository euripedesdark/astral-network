use regex::Regex;
use std::sync::LazyLock;

static IPV4_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$").unwrap()
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IpCidr {
    ip: String,
    mask: u8,
    address: u32,
    network: u32,
    broadcast: u32,
}

impl IpCidr {
    pub fn parse(val: &str) -> Option<Self> {
        let v = val.trim();
        let (ip_str, mask) = match v.find('/') {
            Some(idx) => {
                let ip_part = &v[..idx];
                let mask_part = &v[idx + 1..];
                let m = mask_part.parse::<u8>().ok()?;
                if m > 32 {
                    return None;
                }
                (ip_part, m)
            }
            None => (v, 32u8),
        };

        if !IPV4_REGEX.is_match(ip_str) {
            return None;
        }

        let mut addr = 0u32;
        for part in ip_str.split('.') {
            let octet = part.parse::<u32>().ok()?;
            addr = (addr << 8) | octet;
        }

        let mask_bits = if mask == 0 {
            0u32
        } else {
            0xffffffffu32 << (32 - mask)
        };

        let network = addr & mask_bits;
        let broadcast = network | !mask_bits;

        Some(Self {
            ip: ip_str.to_string(),
            mask,
            address: addr,
            network,
            broadcast,
        })
    }

    pub fn ip(&self) -> &str {
        &self.ip
    }

    pub fn mask(&self) -> u8 {
        self.mask
    }

    pub fn address(&self) -> u32 {
        self.address
    }

    pub fn network(&self) -> u32 {
        self.network
    }

    pub fn broadcast(&self) -> u32 {
        self.broadcast
    }

    pub fn network_cidr(&self) -> String {
        format!("{}/{}", Self::to_ip_string(self.network), self.mask)
    }

    pub fn network_text(&self) -> String {
        Self::to_ip_string(self.network)
    }

    pub fn netmask_text(&self) -> String {
        let mask_bits = if self.mask == 0 {
            0u32
        } else {
            0xffffffffu32 << (32 - self.mask)
        };
        Self::to_ip_string(mask_bits)
    }

    pub fn broadcast_text(&self) -> String {
        Self::to_ip_string(self.broadcast)
    }

    pub fn is_pure_network(&self) -> bool {
        self.address == self.network && self.mask < 31
    }

    pub fn is_broadcast(&self) -> bool {
        self.address == self.broadcast && self.mask < 31
    }

    pub fn contains(&self, other_val: &str) -> bool {
        match Self::parse(other_val) {
            Some(other) => {
                let mask_bits = if self.mask == 0 {
                    0u32
                } else {
                    0xffffffffu32 << (32 - self.mask)
                };
                (other.address & mask_bits) == self.network
            }
            None => false,
        }
    }

    pub fn ip_at_offset(&self, offset: u32) -> String {
        let mask_bits = if self.mask == 0 {
            0u32
        } else {
            0xffffffffu32 << (32 - self.mask)
        };
        let target = (self.network & mask_bits) | (offset & !mask_bits);
        Self::to_ip_string(target)
    }

    pub fn to_ip_string(addr: u32) -> String {
        format!(
            "{}.{}.{}.{}",
            (addr >> 24) & 0xff,
            (addr >> 16) & 0xff,
            (addr >> 8) & 0xff,
            addr & 0xff
        )
    }

    pub fn is_valid_ipv4(val: &str) -> bool {
        IPV4_REGEX.is_match(val.trim())
    }
}
