# Astral Network

![Licença](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![Rust](https://img.shields.io/badge/Rust-1.99-orange.svg)
![Axum](https://img.shields.io/badge/Axum-0.8-blue.svg)
![NetworkManager](https://img.shields.io/badge/Network-NetworkManager-blue.svg)
![DHCP](https://img.shields.io/badge/DHCP-Server%20%26%20Leases-brightgreen.svg)

🇧🇷 **Gerenciamento Declarativo de Rede & Servidor DHCP em Rust** — Módulo especializado do ecossistema Astral responsável pelo provisionamento declarativo de interfaces de rede (físicas, VLANs 802.1Q, bridges), configuração de sub-redes CIDR, alocação dinâmica de endereços (DHCP Server) e monitoramento de leases.

🇺🇸 **Declarative Network Configuration & Addressing Engine in Rust** — Specialized module of the Astral ecosystem providing declarative network interface provisioning (physical, 802.1Q VLANs, bridges), CIDR subnet management, dynamic address allocation (DHCP Server), and lease tracking.

---

## 🌐 Escolha o seu idioma / Choose your language

| | Idioma / Language | Documentação / Documentation |
|---|---|---|
| 🇧🇷 | **Português (Brasil)** | [README.pt-BR.md](README.pt-BR.md) |
| 🇺🇸 | **English** | [README.en-US.md](README.en-US.md) |
| 🇪🇸 | **Español** | [README.es-ES.md](README.es-ES.md) |
| 🇫🇷 | **Français** | [README.fr-FR.md](README.fr-FR.md) |

🇧🇷 [Português](README.pt-BR.md) · 🇺🇸 [English](README.en-US.md) · 🇪🇸 [Español](README.es-ES.md) · 🇫🇷 [Français](README.fr-FR.md)

---

## 🎯 Principais Recursos / Core Highlights

- **Gestão Declarativa de Interfaces (Linux & NetworkManager)**:
  - Detecção e configuração de adaptadores de rede físicos e virtuais.
  - Suporte nativo a VLANs 802.1Q, bridges e bonding para hipervisores e contêineres.
  - Snapshot de topologia e reversão atômica (rollback de configuração).
- **Servidor DHCP & Endereçamento Inteligente**:
  - Escopos CIDR flexíveis, definição de gateways, servidores DNS e rotas estáticas.
  - Reservas estáticas de IP mapeadas por endereço MAC.
  - Rastreamento e expiração em tempo real de leases ativos.
- **API REST de Alta Performance**:
  - Servidor HTTP assíncrono construído em Rust 1.99 + Axum 0.8 e Tokio.
  - Arquitetura orientada a objetos (POO / Traits) com separação rígida de camadas (Domain, Service, Controller).
  - Telas integradas em React + PrimeReact para acompanhamento de interfaces e pools DHCP.

> ℹ️ **Nota de Arquitetura**: A tradução de endereços de rede (NAT / Masquerade e Port Forwarding) é gerenciada exclusivamente pelo **Astral Internet Security** (Firewall), mantendo o **Astral Network** focado em endereçamento e topologia local.

---

## 💖 Apoie o Projeto / Support the Project

Astral Network é um projeto Open Source mantido por um desenvolvedor independente.

Se este projeto ajudou você ou sua empresa, considere apoiar o desenvolvimento:

### Brasil (PIX)
```text
24adc62c-b073-4587-974d-03fe35f6733f
```

### Internacional (Wise)
| Campo | Dados |
|---|---|
| **Beneficiário / Name** | Euripedes Batista de Paiva Junior |
| **Routing Number (Wire & ACH)** | `101019628` |
| **Número da conta / Account Number** | `215822927677` |
| **Banco / Bank Name** | Wise US Inc, 108 W 13th St, Wilmington, DE, 19801, United States |
| **SWIFT / BIC** | `TRWIUS35XXX` |

Instruções completas: [DONATE.md](DONATE.md).

---

## 📄 Licença / License

Distribuído sob a licença **GNU Affero General Public License v3.0 (AGPLv3)**. Consulte [LICENSE.md](LICENSE.md).

(c) 2026 Astral Network — **Criado por: Euripedes Batista de Paiva Junior**

## 🔐 Política Unificada de Acesso e Autenticação

O **Astral Network** integra-se à política unificada de controle de acesso do ecossistema Astral:

1. **OAuth2 / Samba Active Directory / Postgres**:
   - Autenticação federada orquestrada via `astral-auth-service` (`http://127.0.0.1:8181`). Operadores e administradores de rede corporativos são validados no Samba AD.
2. **Via `auth-service` (SSO)**:
   - Validação de cabeçalhos `Authorization: Bearer <token>` e cookies de sessão (`sso_token` e `astral_token`) assinados com o segredo compartilhado (`AUTH_TOKEN_SECRET` em `/etc/auth-service/auth.env`).
3. **Usuário Local Linux (`root` ou `sudo`)**:
   - Autenticação local no sistema operacional verificando permissões de `root` ou associação aos grupos `wheel` ou `sudo`.
4. **Superusuário PostgreSQL**:
   - Acesso administrativo para qualquer conta PostgreSQL com `rolsuper = true` (ex: `postgres`).
