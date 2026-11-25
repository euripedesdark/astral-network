#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
ASTRAL NETWORK â€” SCRIPT DE DEPLOY E INSTALAÃ‡ÃƒO (deploy_network.py)
===============================================================================
Executa o ciclo completo de instalaÃ§Ã£o, compilaÃ§Ã£o e deploy do Astral Network:
1. ValidaÃ§Ã£o do sistema e detecÃ§Ã£o de distro (Debian, Ubuntu, Fedora, RHEL, SUSE, Arch)
2. Checagem e instalaÃ§Ã£o de dependÃªncias (Rust, Node, iproute2, nftables/iptables)
3. CompilaÃ§Ã£o do Frontend React / Vite (WebUI Verde TranslÃºcido)
4. CompilaÃ§Ã£o de Release do Backend Rust (axum + tokio)
5. InstalaÃ§Ã£o no diretÃ³rio global /opt/astral-network
6. ConfiguraÃ§Ã£o e ativaÃ§Ã£o do serviÃ§o systemd (astral-network.service)
7. Abertura e reconciliaÃ§Ã£o da porta 8090 no firewall (iptables / firewalld)
8. ValidaÃ§Ã£o de integridade e teste do endpoint de saÃºde

Uso:
    python3 deploy_network.py
    python3 deploy_network.py --skip-front
    python3 deploy_network.py --port 8090
===============================================================================
"""

import os
import sys
import subprocess
import time
import argparse
import shutil
from datetime import datetime

# Garante caminhos essenciais no PATH
_cargo_bin = os.path.expanduser("~/.cargo/bin")
for _p in (_cargo_bin, "/usr/sbin", "/sbin", "/usr/local/sbin", "/usr/local/bin"):
    if os.path.exists(_p) and _p not in os.environ.get("PATH", "").split(os.pathsep):
        os.environ["PATH"] = f"{_p}{os.pathsep}" + os.environ.get("PATH", "")

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_NAME = "astral-network"
DEFAULT_PORT = 8090
OPT_DIR = "/opt/astral-network"
SYSTEMD_FILE = f"/etc/systemd/system/{SERVICE_NAME}.service"
SYMLINK_BIN = f"/usr/local/bin/{SERVICE_NAME}"
SUDO_PASS = os.environ.get("ASTRAL_SUDO_PASS", "Btf1_Mk3")

class Colors:
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    RESET = "\033[0m"

def log_header(msg):
    print(f"\n{Colors.BLUE}{Colors.BOLD}{'='*72}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD} {msg}{Colors.RESET}")
    print(f"{Colors.BLUE}{Colors.BOLD}{'='*72}{Colors.RESET}\n")

def log_step(step_num, total_steps, title):
    print(f"{Colors.BOLD}[{step_num}/{total_steps}]{Colors.RESET} {Colors.CYAN}{title}...{Colors.RESET}")

def log_success(msg):
    print(f"  {Colors.GREEN}âœ“ {msg}{Colors.RESET}")

def log_warning(msg):
    print(f"  {Colors.YELLOW}âš  {msg}{Colors.RESET}")

def log_error(msg):
    print(f"  {Colors.RED}âœ— {msg}{Colors.RESET}")

def run_cmd(cmd, check=True, cwd=None, capture=False):
    is_list = isinstance(cmd, list)
    if is_list and shutil.which(cmd[0]) is None:
        cmd_str = " ".join(cmd)
    else:
        cmd_str = " ".join(cmd) if is_list else cmd

    if os.geteuid() == 0:
        actual_cmd = cmd_str
    else:
        actual_cmd = f"echo '{SUDO_PASS}' | sudo -S -E bash -c '{cmd_str}'"

    proc = subprocess.run(
        actual_cmd,
        shell=True,
        cwd=cwd,
        capture_output=capture,
        text=True
    )
    if check and proc.returncode != 0:
        err = proc.stderr.strip() if proc.stderr else proc.stdout.strip()
        raise RuntimeError(f"Comando falhou [{proc.returncode}]: {cmd_str}\n{err}")
    return proc

def detect_distro():
    info = {"id": "unknown", "version": "unknown"}
    if os.path.exists("/etc/os-release"):
        with open("/etc/os-release", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ID="):
                    info["id"] = line.split("=", 1)[1].strip('"').lower()
                elif line.startswith("VERSION_ID="):
                    info["version"] = line.split("=", 1)[1].strip('"')
    return info

def ensure_dependencies(distro):
    missing = []
    for tool in ["cargo", "rustc", "node", "npm", "ip"]:
        if shutil.which(tool) is None:
            missing.append(tool)

    if not missing:
        log_success("Todas as ferramentas de build essenciais estÃ£o presentes.")
        return

    log_warning(f"Ferramentas ausentes detectadas: {', '.join(missing)}. Tentando instalar...")
    distro_id = distro["id"]

    if distro_id in ("debian", "ubuntu"):
        run_cmd("apt-get update && apt-get install -y cargo rustc nodejs npm iproute2 nftables iptables", check=False)
    elif distro_id in ("fedora", "rhel", "centos", "rocky", "almalinux"):
        run_cmd("dnf install -y cargo rust nodejs npm iproute nftables iptables", check=False)
    elif "suse" in distro_id:
        run_cmd("zypper --non-interactive install cargo rust nodejs npm iproute2 nftables iptables", check=False)
    elif distro_id in ("arch", "archlinux"):
        run_cmd("pacman -Sy --noconfirm rust nodejs npm iproute2 nftables iptables", check=False)

def main():
    parser = argparse.ArgumentParser(description="Deploy Automatizado do Astral Network")
    parser.add_argument("--skip-front", action="store_true", help="Pular compilaÃ§Ã£o do frontend")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Porta do WebUI (padrÃ£o: 8090)")
    args = parser.parse_args()

    log_header("ASTRAL NETWORK â€” PIPELINE DE DEPLOY AUTOMATIZADO")

    total_steps = 7
    distro = detect_distro()
    print(f"  Sistema Operacional: {Colors.BOLD}{distro['id']} {distro['version']}{Colors.RESET}")
    print(f"  Porta do ServiÃ§o:    {Colors.BOLD}{args.port}{Colors.RESET}")
    print(f"  DiretÃ³rio Global:    {Colors.BOLD}{OPT_DIR}{Colors.RESET}\n")

    # 1. DependÃªncias
    log_step(1, total_steps, "Verificando PrÃ©-requisitos do Sistema")
    ensure_dependencies(distro)

    # 2. Build Frontend
    log_step(2, total_steps, "Construindo Frontend Web (React + Vite, Verde TranslÃºcido)")
    web_dir = os.path.join(REPO_DIR, "web")
    dist_dir = os.path.join(web_dir, "dist")
    if not args.skip_front and os.path.isdir(web_dir):
        if not os.path.isdir(os.path.join(web_dir, "node_modules")):
            log_warning("Instalando dependÃªncias npm...")
            run_cmd("npm install", cwd=web_dir)
        log_success("Compilando assets com Vite...")
        run_cmd("npm run build", cwd=web_dir)
        if not os.path.exists(os.path.join(dist_dir, "index.html")):
            log_error("Falha ao gerar web/dist/index.html")
            sys.exit(1)
        log_success("Frontend compilado com sucesso.")
    else:
        log_success("CompilaÃ§Ã£o de frontend ignorada ou assets jÃ¡ presentes.")

    # 3. Build Backend Rust
    log_step(3, total_steps, "Compilando Backend Rust em modo Release")
    t0 = time.time()
    run_cmd("cargo build --release", cwd=REPO_DIR)
    compiled_bin = os.path.join(REPO_DIR, "target", "release", SERVICE_NAME)
    if not os.path.exists(compiled_bin):
        log_error(f"BinÃ¡rio nÃ£o encontrado apÃ³s compilaÃ§Ã£o: {compiled_bin}")
        sys.exit(1)
    elapsed = time.time() - t0
    log_success(f"BinÃ¡rio {SERVICE_NAME} compilado com sucesso em {elapsed:.2f}s.")

    # 4. InstalaÃ§Ã£o em /opt/astral-network
    log_step(4, total_steps, f"Instalando arquivos no diretÃ³rio {OPT_DIR}")
    run_cmd(f"mkdir -p {OPT_DIR}/web")
    run_cmd(f"cp -f {compiled_bin} {OPT_DIR}/{SERVICE_NAME}")
    run_cmd(f"chmod 755 {OPT_DIR}/{SERVICE_NAME}")

    if os.path.isdir(dist_dir):
        run_cmd(f"rm -rf {OPT_DIR}/web/dist && cp -rf {dist_dir} {OPT_DIR}/web/dist")
        run_cmd(f"chmod -R 755 {OPT_DIR}/web/dist")

    run_cmd(f"ln -sf {OPT_DIR}/{SERVICE_NAME} {SYMLINK_BIN}")
    log_success(f"Arquivos instalados em {OPT_DIR} e link criado em {SYMLINK_BIN}.")

    # 5. ConfiguraÃ§Ã£o Systemd
    log_step(5, total_steps, "Instalando e Ativando ServiÃ§o Systemd")
    service_content = f"""[Unit]
Description=Astral Network - Declarative Network Configuration & Addressing Engine
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory={OPT_DIR}
ExecStart={OPT_DIR}/{SERVICE_NAME}
Restart=always
RestartSec=5
Environment=ASTRAL_NETWORK_HOST=0.0.0.0
Environment=ASTRAL_NETWORK_PORT={args.port}
Environment=ASTRAL_NETWORK_WEB_DIST={OPT_DIR}/web/dist
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
"""
    tmp_srv = "/tmp/astral-network.service"
    with open(tmp_srv, "w", encoding="utf-8") as f:
        f.write(service_content)

    run_cmd(f"mv {tmp_srv} {SYSTEMD_FILE} && chmod 644 {SYSTEMD_FILE}")
    run_cmd("systemctl daemon-reload")
    run_cmd(f"systemctl enable {SERVICE_NAME}")
    run_cmd(f"systemctl restart {SERVICE_NAME}")
    log_success(f"ServiÃ§o {SERVICE_NAME} habilitado e reiniciado.")

    # 6. LiberaÃ§Ã£o Firewall
    log_step(6, total_steps, f"Liberando Porta {args.port} no Firewall")
    # Iptables
    run_cmd(f"iptables -I INPUT -p tcp --dport {args.port} -j ACCEPT", check=False)
    # Firewalld se ativo
    fw_proc = run_cmd("systemctl is-active firewalld", check=False, capture=True)
    if "active" in fw_proc.stdout:
        run_cmd(f"firewall-cmd --add-port={args.port}/tcp --permanent", check=False)
        run_cmd("firewall-cmd --reload", check=False)
    log_success(f"Porta {args.port} liberada no firewall do host.")

    # 7. Verificação de Saúde
    log_step(7, total_steps, "Validando SaÃºde e Conectividade do ServiÃ§o")
    time.sleep(2)
    stat = run_cmd(f"systemctl is-active {SERVICE_NAME}", check=False, capture=True).stdout.strip()
    if stat == "active":
        log_success(f"ServiÃ§o {SERVICE_NAME} estÃ¡ ATIVO e operando.")
    else:
        log_error(f"ServiÃ§o nÃ£o estÃ¡ ativo. Status: {stat}")
        journal = run_cmd(f"journalctl -u {SERVICE_NAME} -n 15 --no-pager", check=False, capture=True)
        print(journal.stdout)
        sys.exit(1)

    curl_test = run_cmd(f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{args.port}/", check=False, capture=True).stdout.strip()
    log_success(f"Endpoint HTTP respondeu com status: {curl_test}")

    log_header("IMPLANTAÃ‡ÃƒO DO ASTRAL NETWORK CONCLUÃDA COM SUCESSO!")
    print(f"  {Colors.GREEN}{Colors.BOLD}Acesse a WebUI do Gerenciador de Rede em:{Colors.RESET}")
    print(f"  âžœ {Colors.CYAN}{Colors.BOLD}http://<ip-do-servidor>:{args.port}/{Colors.RESET}\n")

if __name__ == "__main__":
    main()
