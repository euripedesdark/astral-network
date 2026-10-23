# Astral Network — Gestión Declarativa de Red y Servidor DHCP

![Licencia](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![Rust](https://img.shields.io/badge/Rust-1.99-orange.svg)
![Axum](https://img.shields.io/badge/Axum-0.8-blue.svg)
![NetworkManager](https://img.shields.io/badge/Network-NetworkManager-blue.svg)
![DHCP](https://img.shields.io/badge/DHCP-Server%20%26%20Leases-brightgreen.svg)

**Astral Network** es el subsistema de red del ecosistema Astral, desarrollado en **Rust (Axum + Tokio)** con arquitectura orientada a objetos (OOP / Traits). Proporciona aprovisionamiento declarativo de adaptadores de red (físicos, VLANs 802.1Q, puentes), direccionamiento de subredes CIDR, servidor DHCP integrado y monitorización de concesiones (leases).

---

## 🎯 Características Principales

- **Gestión Declarativa de Interfaces**:
  - Detección y configuración de interfaces físicas y virtuales.
  - Puentes de red (bridges) y soporte para VLANs 802.1Q para hipervisores y contenedores.
  - Integración con `NetworkManager` e `iproute2`.
- **Servidor DHCP y Asignación de IPs**:
  - Definición de rangos dinámicos, pasarelas y servidores DNS.
  - Reservas estáticas de IP vinculadas a direcciones MAC.
  - Tabla de concesiones en tiempo real.
- **Arquitectura Limpia**:
  - Separación entre direccionamiento local y cortafuegos (gestionado por Astral Internet Security).
  - Soporte de rollback automático de configuración.

---

## 💖 Apoye el Proyecto

Consulte las opciones de donación en [DONATE.es-ES.md](DONATE.es-ES.md).

---

## 📄 Licencia

Distribuido bajo la licencia **GNU AGPLv3**. Consulte [LICENSE.es-ES.md](LICENSE.es-ES.md).
