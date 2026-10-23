# Astral Network — Gerenciamento Declarativo de Rede & DHCP

![Licença](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![Rust](https://img.shields.io/badge/Rust-1.99-orange.svg)
![Axum](https://img.shields.io/badge/Axum-0.8-blue.svg)
![NetworkManager](https://img.shields.io/badge/Network-NetworkManager-blue.svg)
![DHCP](https://img.shields.io/badge/DHCP-Server%20%26%20Leases-brightgreen.svg)

**Astral Network** é o subsistema de rede do ecossistema Astral, desenvolvido em **Rust (Axum + Tokio)** com arquitetura orientada a objetos (OOP / Traits), responsável pelo provisionamento declarativo de interfaces de rede (físicas, VLANs, bridges), cálculo de sub-redes CIDR, alocação dinâmica de endereços (DHCP Server) e monitoramento de leases.

---

## 🎯 Recursos e Capacidades

- **Configuração Declarativa de Adaptadores**:
  - Detecção em tempo real de placas de rede ethernet e wireless.
  - Criação e desmontagem de bridges (`br0`) e subinterfaces VLAN (`eth0.100`).
  - Integração com `NetworkManager` (`nmcli`) e fallback para chamadas diretas ao kernel (`iproute2`).
- **Servidor DHCP Embutido**:
  - Definição de pools dinâmicos por interface e escopo de rede.
  - Atribuição estática (reservas por MAC Address).
  - Tabela de leases ativa com histórico de renovação e expiração.
- **Segurança e Isolamento**:
  - Separação clara entre endereçamento de rede e firewall (gerenciado pelo Astral Internet Security).
  - Suporte a rollback instantâneo caso uma nova configuração perca a conectividade.

---

## 🏗️ Estrutura do Código

```
astral-network/
├── Cargo.toml                  # Metadados e dependências em Rust
├── src/
│   ├── main.rs                 # Ponto de entrada do serviço
│   ├── server.rs               # Configuração do servidor HTTP Axum
│   ├── domain/                 # Entidades e Value Objects (Interface, CIDR, DHCP, Snapshot)
│   ├── service/                # Lógica de negócio e orquestração de rede
│   ├── controller/             # Endpoints REST e serialização JSON
│   └── config/                 # Parâmetros e diretórios de rollback
├── frontend/                   # Componentes visuais em React (Index, Enderecamento)
└── scripts/                    # Scripts auxiliares de configuração WAN
```

---

## 💖 Apoie o Projeto

Chave PIX: `24adc62c-b073-4587-974d-03fe35f6733f`  
Para transferências internacionais via Wise, consulte [DONATE.pt-BR.md](DONATE.pt-BR.md).

---

## 📄 Licença

Licenciado sob **GNU AGPLv3**. Consulte [LICENSE.pt-BR.md](LICENSE.pt-BR.md).

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
