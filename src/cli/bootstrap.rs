use crate::domain::inventory::InterfaceInventory;
use crate::service::discovery::NetworkDiscoveryService;
use std::io::{self, Write};
use std::process::Command;
use tracing::{info, warn};

pub struct BootstrapWizard;

impl BootstrapWizard {
    pub fn check_and_run(force: bool, web_port: u16) -> bool {
        let interfaces = NetworkDiscoveryService::discover_all_interfaces();
        let has_ip = NetworkDiscoveryService::has_active_ip(&interfaces);

        if has_ip && !force {
            info!("Rede ativa detectada no sistema operacional. Modo não-destrutivo mantido (configurações existentes preservadas).");
            return false;
        }

        println!("\n================================================================================");
        println!("   ASTRAL NETWORK - ASSISTENTE DE INICIALIZAÇÃO E BOOTSTRAP DE REDE");
        println!("================================================================================");
        if !has_ip {
            println!(" [AVISO] Nenhuma interface com IP configurado foi detectada neste servidor.");
            println!(" Para liberar o acesso à WebUI, configure uma interface de rede inicial (LAN).");
        } else {
            println!(" [INFO] Inicializando assistente interativo sob demanda (--bootstrap).");
        }
        println!("--------------------------------------------------------------------------------");
        println!("{:<4} {:<12} {:<19} {:<12} {:<8} {:<8} {:<16}", "#", "Interface", "MAC Address", "Link Físico", "Veloc.", "Estado", "Papel Sugerido");
        println!("--------------------------------------------------------------------------------");

        let physical_or_all: Vec<&InterfaceInventory> = interfaces
            .iter()
            .filter(|i| i.is_physical || !i.name.contains('.'))
            .collect();

        if physical_or_all.is_empty() {
            println!(" Nenhuma interface de rede física foi localizada no sistema.");
            println!("================================================================================\n");
            return false;
        }

        for (idx, iface) in physical_or_all.iter().enumerate() {
            let link_str = if iface.carrier { "CONECTADO" } else { "DESCONECTADO" };
            let speed_str = if let Some(s) = iface.speed_mbps {
                format!("{}M", s)
            } else {
                "-".to_string()
            };
            let suggested_role = if iface.carrier {
                "LAN (Recomendado)"
            } else {
                "Disponível"
            };

            println!(
                "{:<4} {:<12} {:<19} {:<12} {:<8} {:<8} {:<16}",
                idx + 1,
                iface.name,
                iface.mac,
                link_str,
                speed_str,
                iface.state,
                suggested_role
            );
        }
        println!("--------------------------------------------------------------------------------");

        // Check if stdin is interactive
        let is_terminal = atty_check();
        if !is_terminal {
            warn!("Executando em ambiente não-interativo (systemd/daemon). Bootstrap interativo suspenso.");
            println!("================================================================================\n");
            return false;
        }

        print!("Escolha o número da interface para acesso à WebUI [1-{}]: ", physical_or_all.len());
        let _ = io::stdout().flush();
        let mut choice = String::new();
        if io::stdin().read_line(&mut choice).is_err() {
            return false;
        }

        let selected_idx: usize = choice.trim().parse::<usize>().unwrap_or(1);
        let chosen_iface = if selected_idx >= 1 && selected_idx <= physical_or_all.len() {
            physical_or_all[selected_idx - 1]
        } else {
            physical_or_all[0]
        };

        println!("\nInterface selecionada: {} ({})", chosen_iface.name, chosen_iface.mac);
        println!("Escolha o método de configuração:");
        println!("  [1] IP Estático na LAN (Recomendado: 192.168.1.1/24)");
        println!("  [2] Cliente DHCP automático");
        print!("Opção [1]: ");
        let _ = io::stdout().flush();

        let mut method_choice = String::new();
        let _ = io::stdin().read_line(&mut method_choice);
        let is_dhcp = method_choice.trim() == "2";

        let mut assigned_ip = "192.168.1.1".to_string();

        if is_dhcp {
            println!("Solicitando concessão via DHCP em {}...", chosen_iface.name);
            let _ = Command::new("ip").args(["link", "set", &chosen_iface.name, "up"]).output();
            let _ = Command::new("dhclient").args(["-4", &chosen_iface.name]).output();
            let _ = Command::new("systemctl").args(["restart", "NetworkManager"]).output();
        } else {
            print!("Informe o endereço IPv4 com máscara CIDR [192.168.1.1/24]: ");
            let _ = io::stdout().flush();
            let mut ip_input = String::new();
            let _ = io::stdin().read_line(&mut ip_input);
            let ip_cidr = if ip_input.trim().is_empty() {
                "192.168.1.1/24"
            } else {
                ip_input.trim()
            };

            assigned_ip = ip_cidr.split('/').next().unwrap_or("192.168.1.1").to_string();

            println!("Aplicando IP {} na interface {}...", ip_cidr, chosen_iface.name);
            let _ = Command::new("ip").args(["link", "set", &chosen_iface.name, "up"]).output();
            let _ = Command::new("ip").args(["addr", "add", ip_cidr, "dev", &chosen_iface.name]).output();

            // Also configure profile via NetworkManager if available
            let nm_res = Command::new("nmcli")
                .args([
                    "con", "add", "type", "ethernet",
                    "ifname", &chosen_iface.name,
                    "con-name", &format!("astral-{}", chosen_iface.name),
                    "ipv4.method", "manual",
                    "ipv4.addresses", ip_cidr,
                ])
                .output();
            if let Ok(res) = nm_res {
                if res.status.success() {
                    let _ = Command::new("nmcli")
                        .args(["con", "up", &format!("astral-{}", chosen_iface.name)])
                        .output();
                }
            }
        }

        // Open firewall port for WebUI and SSH
        println!("Garantindo liberação da porta {} (WebUI) e 22 (SSH) no firewall...", web_port);
        open_firewall_ports(&[web_port, 22]);

        println!("--------------------------------------------------------------------------------");
        println!("[OK] Interface {} configurada com sucesso!", chosen_iface.name);
        println!("================================================================================");
        println!(">>> ACESSO À WEBUI DISPONÍVEL EM: http://{}:{} <<<", assigned_ip, web_port);
        println!("================================================================================\n");

        true
    }
}

fn open_firewall_ports(ports: &[u16]) {
    // Try firewalld
    for &p in ports {
        let _ = Command::new("firewall-cmd")
            .args(["--add-port", &format!("{}/tcp", p), "--permanent"])
            .output();
    }
    let _ = Command::new("firewall-cmd").arg("--reload").output();

    // Fallback iptables
    for &p in ports {
        let _ = Command::new("iptables")
            .args(["-I", "INPUT", "-p", "tcp", "--dport", &p.to_string(), "-j", "ACCEPT"])
            .output();
    }
}

fn atty_check() -> bool {
    // Basic terminal detection check
    std::env::var("TERM").is_ok() && std::env::var("SYSTEMD_EXEC_PID").is_err()
}

pub fn run_bootstrap_wizard_if_needed(force: bool, web_port: u16) -> bool {
    BootstrapWizard::check_and_run(force, web_port)
}
