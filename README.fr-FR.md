# Astral Network — Gestion Déclarative de Réseau et Serveur DHCP

![Licence](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![Rust](https://img.shields.io/badge/Rust-1.99-orange.svg)
![Axum](https://img.shields.io/badge/Axum-0.8-blue.svg)
![NetworkManager](https://img.shields.io/badge/Network-NetworkManager-blue.svg)
![DHCP](https://img.shields.io/badge/DHCP-Server%20%26%20Leases-brightgreen.svg)

**Astral Network** est le sous-système réseau de l'écosystème Astral, conçu en **Rust (Axum + Tokio)** avec une architecture orientée objet (OOP / Traits). Il prend en charge l'approvisionnement déclaratif des interfaces réseau (physiques, VLANs 802.1Q, ponts), la gestion des sous-réseaux CIDR, l'attribution dynamique d'adresses (serveur DHCP) et le suivi des baux (leases).

---

## 🎯 Fonctionnalités Clés

- **Gestion Déclarative des Adaptateurs Réseau**:
  - Découverte et configuration des interfaces réseau physiques et virtuelles.
  - Prise en charge des ponts (bridges) et des balises VLAN 802.1Q.
  - Intégration transparente avec `NetworkManager` et `iproute2`.
- **Serveur DHCP Intégré**:
  - Plages d'adresses dynamiques par sous-réseau et interface.
  - Réservations statiques d'adresses IP basées sur l'adresse MAC.
  - Suivi en temps réel des baux DHCP actifs.
- **Séparation Architecturale**:
  - Séparation stricte entre l'adressage local et le pare-feu (géré par Astral Internet Security).
  - Prise en charge d'un instantané de configuration et retour arrière automatique (rollback).

---

## 💖 Soutenez le Projet

Pour soutenir le développement, consultez [DONATE.fr-FR.md](DONATE.fr-FR.md).

---

## 📄 Licence

Distribué sous licence **GNU AGPLv3**. Consultez [LICENSE.fr-FR.md](LICENSE.fr-FR.md).
