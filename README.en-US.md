# Astral Network — Declarative Network Management & DHCP Server

![License](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![Rust](https://img.shields.io/badge/Rust-1.99-orange.svg)
![Axum](https://img.shields.io/badge/Axum-0.8-blue.svg)
![NetworkManager](https://img.shields.io/badge/Network-NetworkManager-blue.svg)
![DHCP](https://img.shields.io/badge/DHCP-Server%20%26%20Leases-brightgreen.svg)

**Astral Network** is the core networking subsystem of the Astral ecosystem, built with **Rust (Axum + Tokio)** following Object-Oriented principles (OOP / Traits). It provides declarative provisioning of network adapters (physical, 802.1Q VLANs, bridges), CIDR subnet addressing, dynamic IP allocation (DHCP Server), and live lease tracking.

---

## 🎯 Features & Capabilities

- **Declarative Interface Management**:
  - Live discovery and configuration of ethernet and virtual network interfaces.
  - Native creation and destruction of network bridges (`br0`) and 802.1Q VLAN tags.
  - First-class integration with `NetworkManager` (`nmcli`) and kernel `iproute2`.
- **Embedded DHCP Engine**:
  - Dynamic pools per network scope and physical interface.
  - MAC address static reservations.
  - Live lease table tracking allocation, renewal, and expiration.
- **Reliability & Architectural Separation**:
  - Clean separation between local addressing and firewall/NAT (handled exclusively by Astral Internet Security).
  - Snapshot-based configuration rollback to prevent network isolation.

---

## 🏗️ Repository Layout

```
astral-network/
├── Cargo.toml                  # Rust package definition
├── src/
│   ├── main.rs                 # Application entry point
│   ├── server.rs               # Axum HTTP server and router
│   ├── domain/                 # Domain models (Interface, CIDR, DHCP, Snapshot)
│   ├── service/                # Business logic and network backend adapters
│   ├── controller/             # REST endpoints and request handlers
│   └── config/                 # Service configuration and state paths
├── frontend/                   # React management views
└── scripts/                    # WAN configuration utilities
```

---

## 💖 Support the Project

For international donations via Wise or local payment methods, please see [DONATE.en-US.md](DONATE.en-US.md).

---

## 📄 License

Distributed under the **GNU AGPLv3**. See [LICENSE.en-US.md](LICENSE.en-US.md).
