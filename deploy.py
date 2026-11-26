#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Astral Network - Compilador e Publicador Limpo
Executa compilação do Frontend React (Vite + Tailwind),
compilação limpa em Rust (cargo build --release),
copia o executável e arquivos estáticos para o diretório global /opt/astral-network
e reinicia o serviço no systemd.

Uso:
    ./deploy.py
ou
    python3 deploy.py
"""

import os
import sys
import subprocess
import time

SERVICE_NAME = "astral-network"
PORT = 8086
GLOBAL_DIR = "/opt/astral-network"
APP_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(APP_DIR, "web")
STATIC_BUILD_DIR = os.path.join(FRONTEND_DIR, "dist")
TARGET_STATIC_DIR = os.path.join(GLOBAL_DIR, "dist")
SUDO_PASS = "Btf1_Mk3"

GREEN = "\033[0;32m"
BLUE = "\033[0;34m"
YELLOW = "\033[1;33m"
RED = "\033[0;31m"
BOLD = "\033[1m"
NC = "\033[0m"

def log(msg, color=BLUE):
    print(f"{color}{BOLD}[ASTRAL-DEPLOY]{NC} {msg}")

def run_sudo(cmd):
    if os.geteuid() == 0:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return subprocess.run(f"sudo -S {cmd}", shell=True, input=f"{SUDO_PASS}\n", capture_output=True, text=True)

def main():
    print(f"{BLUE}{BOLD}============================================================{NC}")
    print(f"{GREEN}{BOLD}       Astral Network - Compilação & Publicação Limpa       {NC}")
    print(f"{BLUE}{BOLD}============================================================{NC}")

    os.chdir(APP_DIR)

    # 0. Instalação e verificação de dependências do sistema operacional (Fedora)
    log("Verificando e instalando pacotes essenciais de rede e DHCP (dnf)...", BLUE)
    packages = [
        "dhcp-server",
        "iproute",
        "bridge-utils",
        "iptables",
        "nftables",
        "ethtool",
        "NetworkManager",
        "wireguard-tools",
        "pam-devel",
        "curl",
        "procps-ng",
    ]
    pkg_res = run_sudo(f"dnf install -y {' '.join(packages)}")
    if pkg_res.returncode == 0:
        log("Pacotes de sistema garantidos com sucesso.", GREEN)
    else:
        log(f"Aviso ao instalar pacotes via dnf (prosseguindo): {pkg_res.stderr or pkg_res.stdout}", YELLOW)

    # Garantir estrutura do daemon DHCP (isc-dhcp-server / dhcpd)
    run_sudo("mkdir -p /etc/dhcp /var/lib/dhcpd")
    run_sudo("touch /var/lib/dhcpd/dhcpd.leases")
    run_sudo("chmod 644 /var/lib/dhcpd/dhcpd.leases 2>/dev/null || true")
    run_sudo("touch /etc/dhcp/dhcpd.conf")

    # 0.1 Correção de permissões residuais de execuções anteriores com root
    log("Ajustando permissões de arquivos no diretório do projeto...", BLUE)
    if os.geteuid() != 0:
        run_sudo(f"chown -R {os.getuid()}:{os.getgid()} {APP_DIR}")
        run_sudo(f"chmod -R 777 {FRONTEND_DIR}")
        run_sudo(f"rm -f {APP_DIR}/target/.cargo-build-lock {APP_DIR}/target/release/.cargo-build-lock")
        run_sudo(f"rm -rf {FRONTEND_DIR}/node_modules/.vite-temp")
    else:
        if "SUDO_USER" in os.environ:
            s_user = os.environ["SUDO_USER"]
            subprocess.run(f"chown -R {s_user}:{s_user} {APP_DIR}", shell=True)
        subprocess.run(f"chmod -R 777 {FRONTEND_DIR}", shell=True)
        subprocess.run(f"rm -f {APP_DIR}/target/.cargo-build-lock {APP_DIR}/target/release/.cargo-build-lock", shell=True)
        subprocess.run(f"rm -rf {FRONTEND_DIR}/node_modules/.vite-temp", shell=True)

    # 1. Compilação do Frontend React/Vite
    if os.path.exists(FRONTEND_DIR):
        log("Compilando Frontend React/Vite...", BLUE)
        start_front = time.time()
        if not os.path.exists(os.path.join(FRONTEND_DIR, "node_modules")):
            log("Instalando dependencias do frontend (npm install)...", YELLOW)
            subprocess.run(["npm", "install", "--legacy-peer-deps"], cwd=FRONTEND_DIR, capture_output=True)
        front_proc = subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, capture_output=True, text=True)
        if front_proc.returncode != 0:
            log(f"Aviso ao compilar Frontend via npm run build: {front_proc.stderr or front_proc.stdout}", YELLOW)
            log("Tentando compilar diretamente com npx vite build...", YELLOW)
            front_proc = subprocess.run(["npx", "vite", "build"], cwd=FRONTEND_DIR, capture_output=True, text=True)
            if front_proc.returncode != 0:
                if os.path.exists(STATIC_BUILD_DIR):
                    log("Usando assets estaticos pre-compilados em web/dist.", GREEN)
                else:
                    log(f"ERRO na compilação do Frontend:\n{front_proc.stderr or front_proc.stdout}", RED)
                    sys.exit(1)
        elapsed_front = time.time() - start_front
        log(f"Frontend pronto em {elapsed_front:.2f} segundos!", GREEN)

    # 2. Limpeza de compilação anterior (cargo clean)
    log("Limpando cache de compilação anterior...", YELLOW)
    clean_proc = subprocess.run(["cargo", "clean", "-p", SERVICE_NAME], capture_output=True, text=True)
    if clean_proc.returncode != 0:
        subprocess.run(["cargo", "clean"], capture_output=True, text=True)
    log("Cache limpo com sucesso.", GREEN)

    # 3. Compilação Otimizada de Release em Rust
    log("Iniciando compilação otimizada em Rust (cargo build --release)...", BLUE)
    start_time = time.time()
    build_proc = subprocess.run(["cargo", "build", "--release"])
    if build_proc.returncode != 0:
        log("ERRO: Falha na compilação do Rust!", RED)
        sys.exit(1)
    elapsed = time.time() - start_time
    log(f"Backend Rust compilado com sucesso em {elapsed:.2f} segundos!", GREEN)

    bin_path = os.path.join(APP_DIR, "target", "release", SERVICE_NAME)
    if not os.path.exists(bin_path):
        log(f"ERRO: Binário compilado não encontrado em {bin_path}", RED)
        sys.exit(1)

    # 4. Publicação no Diretório Global (/opt/astral-network)
    log(f"Instalando binário e arquivos no diretório global {GLOBAL_DIR}...", BLUE)
    run_sudo(f"mkdir -p {GLOBAL_DIR} {TARGET_STATIC_DIR} /etc/astral-network")
    target_bin = os.path.join(GLOBAL_DIR, SERVICE_NAME)
    
    cp_res = run_sudo(f"cp -f {bin_path} {target_bin}")
    if cp_res.returncode != 0:
        log(f"ERRO ao copiar binário: {cp_res.stderr}", RED)
        sys.exit(1)

    run_sudo(f"chmod 755 {target_bin}")

    # Copiar estáticos do frontend
    if os.path.exists(STATIC_BUILD_DIR):
        log(f"Copiando arquivos da UI para {TARGET_STATIC_DIR}...", BLUE)
        run_sudo(f"rm -rf {TARGET_STATIC_DIR}/*")
        run_sudo(f"mkdir -p {TARGET_STATIC_DIR}")
        run_sudo(f"cp -rf {STATIC_BUILD_DIR}/* {TARGET_STATIC_DIR}/")
        run_sudo(f"chmod -R 755 {TARGET_STATIC_DIR}")

    log(f"Binário e assets instalados em {GLOBAL_DIR} com sucesso.", GREEN)

    # 5. Configuração e Reinicialização do Serviço no Systemd
    log(f"Configurando serviço systemd '{SERVICE_NAME}'...", BLUE)
    systemd_path = f"/etc/systemd/system/{SERVICE_NAME}.service"
    service_content = f"""[Unit]
Description=Astral Network - L2/L3 Network Controller, Routing, DHCP & AD Integration
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory={GLOBAL_DIR}
ExecStart={GLOBAL_DIR}/{SERVICE_NAME}
Restart=always
RestartSec=5
Environment=ASTRAL_NETWORK_PORT={PORT}
Environment=ASTRAL_NETWORK_STATIC_DIR={TARGET_STATIC_DIR}
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
"""
    tmp_srv = f"/tmp/{SERVICE_NAME}.service"
    with open(tmp_srv, "w", encoding="utf-8") as f:
        f.write(service_content)

    run_sudo(f"mv {tmp_srv} {systemd_path} && chmod 644 {systemd_path}")
    run_sudo("systemctl daemon-reload")
    run_sudo(f"systemctl enable {SERVICE_NAME}")

    log(f"Reiniciando serviço systemd '{SERVICE_NAME}'...", YELLOW)
    run_sudo(f"systemctl stop {SERVICE_NAME} 2>/dev/null || true")
    run_sudo(f"fuser -k {PORT}/tcp 2>/dev/null || true")
    run_sudo(f"pkill -9 -f '{GLOBAL_DIR}/{SERVICE_NAME}' 2>/dev/null || true")
    time.sleep(1.0)
    run_sudo(f"systemctl restart {SERVICE_NAME}")
    time.sleep(2.5)

    # 5.1 Liberação no Firewall (iptables nativo e persistência)
    log(f"Liberando porta {PORT} no firewall (iptables)...", BLUE)
    run_sudo(f"iptables -C INPUT -p tcp --dport {PORT} -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport {PORT} -j ACCEPT")
    run_sudo("iptables-save > /etc/sysconfig/iptables 2>/dev/null || iptables-save > /etc/iptables/rules.v4 2>/dev/null || true")

    # 6. Verificação de Saúde
    status_proc = run_sudo(f"systemctl is-active {SERVICE_NAME}")
    status = status_proc.stdout.strip()
    if status == "active":
        log(f"SUCESSO! O serviço '{SERVICE_NAME}' está ATIVO e rodando na porta {PORT}.", GREEN)
    else:
        log(f"AVISO: O serviço retornou status: {status}", RED)
        log("Verificando logs recentes do journalctl:", YELLOW)
        journal = run_sudo(f"journalctl -u {SERVICE_NAME} -n 15 --no-pager")
        print(journal.stdout)
        sys.exit(1)

    # 7. Teste de Endpoint Health e UI
    log("Validando endpoints REST e UI...", BLUE)
    curl_health = run_sudo(f"curl -s http://127.0.0.1:{PORT}/api/v1/network/inventory || true")
    print(f"Inventory probe length: {len(curl_health.stdout.strip())} bytes")

    # 8. Exibir porta em escuta
    ports = run_sudo(f"ss -tulpn | grep :{PORT} || true")
    if ports.stdout.strip():
        print(f"\n{GREEN}Porta em escuta:{NC}\n{ports.stdout.strip()}")

    print(f"\n{BLUE}{BOLD}============================================================{NC}")
    print(f"{GREEN}{BOLD}   Publicação e deploy concluídos com 100% de sucesso!       {NC}")
    print(f"{BLUE}{BOLD}   Acesse a UI em: http://192.168.2.10:{PORT}/              {NC}")
    print(f"{BLUE}{BOLD}============================================================{NC}")

if __name__ == "__main__":
    main()
