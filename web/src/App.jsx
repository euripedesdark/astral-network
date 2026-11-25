import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Check,
  CheckCircle,
  Cloud,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Flame,
  Globe,
  HardDrive,
  HelpCircle,
  Key,
  Layers,
  Lock,
  Network,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Router,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  Wifi,
  Zap,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('interfaces');
  const [loading, setLoading] = useState(false);
  const [interfaces, setInterfaces] = useState([]);
  const [linkHealth, setLinkHealth] = useState(null);
  const [activeLeases, setActiveLeases] = useState([]);
  const [wireguard, setWireguard] = useState(null);
  const [cloudflare, setCloudflare] = useState(null);
  const [toast, setToast] = useState(null);

  // Auto-Rollback State
  const [pendingCommitToken, setPendingCommitToken] = useState(null);
  const [rollbackCountdown, setRollbackCountdown] = useState(0);

  // Diagnostics State
  const [pingTarget, setPingTarget] = useState('8.8.8.8');
  const [pingResult, setPingResult] = useState(null);
  const [arpTable, setArpTable] = useState([]);

  // AD-DNS Integration State
  const [adConfig, setAdConfig] = useState({
    enabled: true,
    ad_domain: 'srvcloud.cloud',
    ad_dc_ips: ['192.168.0.1', '127.0.0.1'],
    forward_msdcs: true,
    secondary_zone_axfr: false,
    upstream_dot: false,
    local_overrides: [],
  });

  // Modal State for Interface Editing
  const [editingIface, setEditingIface] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/inventory');
      if (res.ok) {
        const data = await res.json();
        setInterfaces(data);
      }
    } catch (e) {
      console.error("Falha ao consultar inventário", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/v1/network/link-health');
      if (res.ok) {
        const data = await res.json();
        setLinkHealth(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchVpnAndDhcp = async () => {
    try {
      const [wgRes, cfRes, leaseRes] = await Promise.all([
        fetch('/api/v1/network/vpn/wireguard'),
        fetch('/api/v1/network/cloudflare'),
        fetch('/api/v1/network/dhcp/leases'),
      ]);
      if (wgRes.ok) setWireguard(await wgRes.json());
      if (cfRes.ok) setCloudflare(await cfRes.json());
      if (leaseRes.ok) setActiveLeases(await leaseRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchHealth();
    fetchVpnAndDhcp();
    const interval = setInterval(() => {
      fetchHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Rollback Countdown Timer
  useEffect(() => {
    if (rollbackCountdown > 0) {
      const timer = setTimeout(() => setRollbackCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (rollbackCountdown === 0 && pendingCommitToken) {
      showToast("Tempo de confirmação expirado! Rollback automático aplicado.", "warning");
      setPendingCommitToken(null);
      fetchInventory();
    }
  }, [rollbackCountdown, pendingCommitToken]);

  const handleConfirmCommit = async () => {
    if (!pendingCommitToken) return;
    try {
      const res = await fetch('/api/v1/network/confirm-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pendingCommitToken }),
      });
      if (res.ok) {
        showToast("Configuração confirmada e permanente salva!", "success");
        setPendingCommitToken(null);
        setRollbackCountdown(0);
      }
    } catch (e) {
      showToast("Erro ao confirmar commit: " + e.message, "error");
    }
  };

  const handleManualRollback = async () => {
    if (!pendingCommitToken) return;
    try {
      const res = await fetch('/api/v1/network/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pendingCommitToken }),
      });
      if (res.ok) {
        showToast("Configurações revertidas com sucesso!", "info");
        setPendingCommitToken(null);
        setRollbackCountdown(0);
        fetchInventory();
      }
    } catch (e) {
      showToast("Erro ao reverter: " + e.message, "error");
    }
  };

  const handleApplyDeclarative = async () => {
    try {
      setLoading(true);
      const payload = {
        version: 1,
        updated_at: new Date().toISOString(),
        wans: [],
        vlans: [],
        bridges: [],
        bonds: [],
        routes: [],
        pbr_rules: [],
        port_forwards: [],
        firewall_rules: [],
        wireguard: wireguard || { enabled: false, interface: 'wg0', listen_port: 51820, address_cidr: '10.100.0.1/24', public_key: '', peers: [] },
        cloudflare: cloudflare || { enabled: false, tunnel_token: '', status: 'DISCONNECTED', ingress_rules: [] },
        dhcp_scopes: [],
        static_leases: [],
        ad_dns: adConfig,
      };

      const res = await fetch('/api/v1/network/declarative-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setPendingCommitToken(data.token);
        setRollbackCountdown(data.timeout_seconds || 60);
        showToast("Alterações aplicadas provisoriamente! Confirme na barra superior.", "warning");
      }
    } catch (e) {
      showToast("Falha ao aplicar configurações: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePingTest = async () => {
    try {
      const res = await fetch('/api/v1/network/diagnostics/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: pingTarget, count: 4 }),
      });
      if (res.ok) {
        setPingResult(await res.json());
      }
    } catch (e) {
      showToast("Erro ao executar ping: " + e.message, "error");
    }
  };

  const handleFetchArp = async () => {
    try {
      const res = await fetch('/api/v1/network/diagnostics/arp');
      if (res.ok) setArpTable(await res.json());
    } catch (e) {
      showToast("Erro ao consultar tabela ARP: " + e.message, "error");
    }
  };

  const activeIfacesCount = interfaces.filter(i => i.state === 'UP').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 backdrop-blur-md transition-all ${
          toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300' :
          toast.type === 'warning' ? 'bg-amber-950/90 border-amber-500/50 text-amber-300' :
          toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-300' :
          'bg-slate-900/90 border-slate-700 text-slate-200'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
          {toast.type === 'error' && <ShieldAlert className="w-5 h-5 text-rose-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Auto-Rollback Warning Banner */}
      {pendingCommitToken && (
        <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 border-b border-amber-500/40 px-6 py-2.5 flex items-center justify-between text-amber-200 shadow-lg backdrop-blur-md sticky top-0 z-40 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold">
              Alterações de rede aplicadas provisoriamente. Reversão automática em: <strong className="text-white bg-amber-800/60 px-2 py-0.5 rounded font-mono text-base">{rollbackCountdown}s</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRollback}
              className="px-3 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-600/40 text-amber-300 rounded text-xs transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reverter Agora
            </button>
            <button
              onClick={handleConfirmCommit}
              className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
            >
              <Check className="w-4 h-4" />
              Confirmar Alterações
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="glass-panel border-b border-emerald-500/20 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-900/60 border border-emerald-400/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Network className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  ASTRAL <span className="text-emerald-400">NETWORK</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  v1.0 · Rust Engine
                </span>
              </div>
              <p className="text-xs text-emerald-200/70">
                Roteamento Declarativo, Firewall nftables, Zero Trust & Integração AD-DNS
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="glass-card px-3 py-1.5 rounded-lg flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-slate-400 text-[10px] block">Interfaces Ativas</span>
                <span className="font-semibold text-emerald-300">{activeIfacesCount} / {interfaces.length} UP</span>
              </div>
            </div>

            <div className="glass-card px-3 py-1.5 rounded-lg flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-slate-400 text-[10px] block">Gateway WAN</span>
                <span className="font-semibold text-cyan-300">
                  {linkHealth?.default_gateway || "Detectando..."} {linkHealth?.gateway_rtt_ms ? `(${linkHealth.gateway_rtt_ms.toFixed(1)}ms)` : ""}
                </span>
              </div>
            </div>

            <div className="glass-card px-3 py-1.5 rounded-lg flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-slate-400 text-[10px] block">Astral AD-DNS</span>
                <span className="font-semibold text-emerald-300">Conditional Forwarder Ativo</span>
              </div>
            </div>

            <button
              onClick={() => { fetchInventory(); fetchHealth(); fetchVpnAndDhcp(); showToast("Atualizado com o kernel!", "info"); }}
              disabled={loading}
              className="p-2 glass-card hover:bg-emerald-950/60 rounded-lg text-emerald-300 transition"
              title="Recarregar do SO"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-4 pt-3 border-t border-emerald-500/15 flex flex-wrap items-center gap-1">
          {[
            { id: 'interfaces', label: 'Interfaces & Redes', icon: Layers },
            { id: 'firewall', label: 'Roteamento, NAT & Firewall', icon: Shield },
            { id: 'connections', label: 'Conexões: Link, P2P & VPN', icon: Radio },
            { id: 'dhcp_ad', label: 'DHCP & Integração AD-DNS', icon: Server },
            { id: 'security', label: 'Segurança & Diagnóstico', icon: Terminal },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 shadow-md shadow-emerald-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-emerald-950/30'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* TAB 1: INTERFACES & NETWORKS */}
        {activeTab === 'interfaces' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  Inventário Completo de Interfaces de Rede (Kernel)
                </h2>
                <p className="text-xs text-slate-400">
                  Todas as interfaces físicas, virtuais, VLANs e bridges com endereços MAC permanentes e estado de carrier.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplyDeclarative}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-950"
                >
                  <Save className="w-4 h-4" />
                  Aplicar c/ Auto-Rollback (60s)
                </button>
              </div>
            </div>

            {/* Interfaces Table */}
            <div className="glass-panel rounded-xl overflow-hidden border border-emerald-500/20">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-950/40 text-emerald-300 font-semibold border-b border-emerald-500/20 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Interface</th>
                      <th className="p-3">Papel</th>
                      <th className="p-3">MAC Atual / Permanente</th>
                      <th className="p-3">Link Físico</th>
                      <th className="p-3">Velocidade</th>
                      <th className="p-3">Endereços IP (IPv4 / IPv6)</th>
                      <th className="p-3">MTU</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-500/10">
                    {interfaces.map(iface => {
                      const isUp = iface.state === 'UP';
                      const hasLink = iface.carrier;
                      return (
                        <tr key={iface.name} className="hover:bg-emerald-950/20 transition">
                          <td className="p-3 font-mono font-medium text-white flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                            {iface.name}
                            {iface.is_bridge && <span className="text-[9px] bg-indigo-950 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-700/40">Bridge</span>}
                            {iface.is_vlan && <span className="text-[9px] bg-purple-950 text-purple-300 px-1.5 py-0.2 rounded border border-purple-700/40">VLAN {iface.vlan_id}</span>}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              iface.role === 'WAN' ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/40' :
                              iface.role === 'LAN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40' :
                              iface.role === 'TRUNK' ? 'bg-purple-950 text-purple-300 border border-purple-700/40' :
                              'bg-slate-900 text-slate-400 border border-slate-700'
                            }`}>
                              {iface.role}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-300">
                            <div>{iface.mac}</div>
                            {iface.permanent_mac && iface.permanent_mac !== iface.mac && (
                              <div className="text-[10px] text-slate-500">Real: {iface.permanent_mac}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1.5 w-fit ${
                              hasLink ? 'text-emerald-300 bg-emerald-950/80' : 'text-slate-400 bg-slate-900'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${hasLink ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                              {hasLink ? 'Conectado' : 'Sem Cabo'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-300">
                            {iface.speed_mbps ? `${iface.speed_mbps} Mbps` : '-'}
                          </td>
                          <td className="p-3 font-mono text-slate-200">
                            {iface.ipv4.length > 0 ? (
                              iface.ipv4.map((ip, i) => <div key={i} className="text-emerald-300">{ip}</div>)
                            ) : (
                              <span className="text-slate-500 italic">Nenhum IP atribuído</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-400">{iface.mtu}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setEditingIface(iface)}
                              className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-300 rounded text-xs transition"
                            >
                              Configurar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sub-panels: Multi-WAN, VLANs & Bridges */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <Globe className="w-4 h-4" />
                  Multi-WAN & Failover
                </div>
                <p className="text-xs text-slate-400">
                  Agregação de múltiplos links com failover automático e balanceamento de carga baseado em peso ou PBR.
                </p>
                <div className="text-xs space-y-2 pt-2">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span>WAN Primária:</span>
                    <strong className="text-emerald-400 font-mono">DHCP Client (Ativo)</strong>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span>Failover Secundário:</span>
                    <span className="text-slate-400">Em espera (Standby)</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <Layers className="w-4 h-4" />
                  VLANs 802.1Q (Trunk & Access)
                </div>
                <p className="text-xs text-slate-400">
                  Segmentação de tráfego em redes lógicas. Suporte a portas Trunk com Native VLAN e Access direto.
                </p>
                <div className="text-xs space-y-2 pt-2">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span>Trunk Principal:</span>
                    <span className="text-purple-300 font-mono">VLAN 10, 20, 30</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span>Native VLAN (PVID):</span>
                    <span className="text-slate-400 font-mono">VID 1</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <Router className="w-4 h-4" />
                  Linux Bridges & Bonding
                </div>
                <p className="text-xs text-slate-400">
                  Integração L2 de placas físicas com máquinas virtuais KVM, containers e agregação LACP 802.3ad.
                </p>
                <div className="text-xs space-y-2 pt-2">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span>Bridges Ativas:</span>
                    <span className="text-indigo-300 font-mono">br0 (STP Habilitado)</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span>Agregação LACP:</span>
                    <span className="text-slate-400">Desativada</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROUTING, NAT & FIREWALL */}
        {activeTab === 'firewall' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                Roteamento, NAT & Firewall de Zonas (nftables)
              </h2>
              <p className="text-xs text-slate-400">
                Políticas de tráfego, mascaramento de WAN, redirecionamento de portas (DNAT com Hairpin) e proteção de serviços do host.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* NAT & Port Forwarding */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Redirecionamento de Portas (Port Forwarding & DNAT)
                </h3>
                <p className="text-xs text-slate-400">
                  Encaminha requisições externas da WAN para servidores internos com suporte opcional a Hairpin NAT.
                </p>

                <div className="space-y-2 text-xs">
                  <div className="p-3 glass-card rounded-lg flex items-center justify-between">
                    <div>
                      <strong className="text-white block font-mono">WAN :443 ➔ 192.168.0.10:443</strong>
                      <span className="text-[10px] text-slate-400">HTTPS Ingress · Hairpin NAT: Ativo</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/40">Ativo</span>
                  </div>

                  <div className="p-3 glass-card rounded-lg flex items-center justify-between">
                    <div>
                      <strong className="text-white block font-mono">WAN :8095 ➔ 127.0.0.1:8095</strong>
                      <span className="text-[10px] text-slate-400">WebUI AD-DNS Console</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/40">Ativo</span>
                  </div>
                </div>
              </div>

              {/* Host Protection */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Proteção dos Serviços do Host (Self Access)
                </h3>
                <p className="text-xs text-slate-400">
                  Portas administrativas essenciais protegidas contra varreduras e bloqueios acidentais.
                </p>

                <div className="space-y-2 text-xs font-mono">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">WebUI Astral Network (:8086)</span>
                    <span className="text-emerald-400 font-bold">LIBERADO (LAN)</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Terminal SSH (:22)</span>
                    <span className="text-emerald-400 font-bold">LIBERADO</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Servidor DNS (:53) & DHCP (:67)</span>
                    <span className="text-emerald-400 font-bold">LIBERADO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CONNECTIONS: INTERNET, P2P, WIREGUARD & CLOUDFLARE */}
        {activeTab === 'connections' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400" />
                Conexões: Monitor de Link, WireGuard & Cloudflare Zero Trust
              </h2>
              <p className="text-xs text-slate-400">
                Saúde da conexão com a internet, VPN de acesso remoto WireGuard e túneis seguros com a nuvem.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* WireGuard VPN */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    WireGuard VPN Server (:51820 UDP)
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    wireguard?.enabled ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {wireguard?.enabled ? 'Serviço Ativo' : 'Pronto'}
                  </span>
                </div>

                <div className="text-xs space-y-2">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between font-mono">
                    <span className="text-slate-400">Subnet VPN:</span>
                    <span className="text-emerald-300">{wireguard?.address_cidr || "10.100.0.1/24"}</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between font-mono text-[10px]">
                    <span className="text-slate-400">Chave Pública:</span>
                    <span className="text-slate-300 truncate max-w-[200px]">{wireguard?.public_key || "Gerada no primeiro start"}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <h4 className="text-xs font-semibold text-white mb-2">Peers Cadastrados</h4>
                  {wireguard?.peers?.length ? (
                    <div className="space-y-1.5 text-xs font-mono">
                      {wireguard.peers.map(p => (
                        <div key={p.id} className="p-2 glass-card rounded-lg flex items-center justify-between">
                          <span>{p.name} ({p.allowed_ips.join(', ')})</span>
                          <span className="text-emerald-400 text-[10px]">Conectado</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center glass-card rounded-lg text-slate-500 text-xs italic">
                      Nenhum peer cadastrado. Gere chaves e QR Code para novos clientes.
                    </div>
                  )}
                </div>
              </div>

              {/* Cloudflare Zero Trust */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <Cloud className="w-4 h-4" />
                    Cloudflare Zero Trust (cloudflared)
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    cloudflare?.status === 'CONNECTED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {cloudflare?.status || 'NÃO CONFIGURADO'}
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Túneis de saída segura para conectar filiais e colaboradores sem expor portas ou IPs públicos na WAN.
                </p>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-400">Ingress Rules:</span>
                    <span className="text-emerald-300 font-mono">WARP Connector Habilitado</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-400">Túnel Privado:</span>
                    <span className="text-slate-300 font-mono">astral-network-tunnel</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DHCP & ASTRAL AD-DNS INTEGRATION */}
        {activeTab === 'dhcp_ad' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-emerald-400" />
                Servidor DHCP & Integração Astral AD-DNS
              </h2>
              <p className="text-xs text-slate-400">
                Distribuição de IPs na LAN com encaminhamento condicional direto para o Active Directory Domain Controller (sem split-brain).
              </p>
            </div>

            {/* AD-DNS Integration Highlight Box */}
            <div className="glass-panel p-5 rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-slate-950">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Integração Direta com Astral AD-DNS (Source of Truth)</h3>
                  </div>
                  <p className="text-xs text-emerald-200/80 max-w-2xl leading-relaxed">
                    Consultas para o domínio do AD (<strong className="text-emerald-300 font-mono">{adConfig.ad_domain}</strong> e <strong className="text-emerald-300 font-mono">_msdcs.{adConfig.ad_domain}</strong>) são encaminhadas via <em>Conditional Forwarding</em> diretamente para o IP do Controlador de Domínio (<strong className="text-emerald-300 font-mono">{adConfig.ad_dc_ips.join(', ')}:53</strong>). Não há duplicação manual de registros SRV, Kerberos ou DDNS.
                  </p>
                </div>

                <button
                  onClick={async () => {
                    const res = await fetch('/api/v1/network/dns/ad-integration', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(adConfig),
                    });
                    if (res.ok) showToast("Conditional Forwarding do AD aplicado com sucesso!", "success");
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shrink-0 flex items-center gap-1.5 shadow-lg shadow-emerald-950"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sincronizar c/ AD DC
                </button>
              </div>
            </div>

            {/* Active Leases Table */}
            <div className="glass-panel rounded-xl overflow-hidden border border-emerald-500/20 space-y-2">
              <div className="p-4 border-b border-emerald-500/20 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  Concessões DHCP Ativas em Tempo Real
                </h3>
                <span className="text-xs text-emerald-400 font-mono">{activeLeases.length} clientes conectados</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-950/40 text-emerald-300 font-semibold border-b border-emerald-500/20 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Endereço IP</th>
                      <th className="p-3">MAC Address</th>
                      <th className="p-3">Hostname</th>
                      <th className="p-3">Expiração</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-500/10 font-mono">
                    {activeLeases.length ? (
                      activeLeases.map((l, i) => (
                        <tr key={i} className="hover:bg-emerald-950/20 transition">
                          <td className="p-3 text-emerald-300">{l.ip}</td>
                          <td className="p-3 text-slate-300">{l.mac}</td>
                          <td className="p-3 text-white">{l.hostname || '-'}</td>
                          <td className="p-3 text-slate-400">{l.expires_at}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => showToast(`Concessão de ${l.ip} liberada.`, "info")}
                              className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-[10px] transition"
                            >
                              Liberar
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                          Nenhuma concessão ativa no momento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SECURITY, ROLLBACK & DIAGNOSTICS */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                Segurança Operacional, Auto-Rollback & Diagnóstico
              </h2>
              <p className="text-xs text-slate-400">
                Teste de conectividade em tempo real, visualização da tabela ARP do kernel e histórico de transações.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Live Ping Test */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Teste de Conectividade (Ping ICMP)
                </h3>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pingTarget}
                    onChange={e => setPingTarget(e.target.value)}
                    placeholder="ex.: 8.8.8.8 ou srvcloud.cloud"
                    className="flex-1 glass-input px-3 py-2 rounded-lg text-xs"
                  />
                  <button
                    onClick={handlePingTest}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Disparar
                  </button>
                </div>

                {pingResult && (
                  <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between text-emerald-300 font-bold">
                      <span>Destino: {pingResult.target}</span>
                      <span>Perda: {pingResult.packet_loss_percent}%</span>
                    </div>
                    {pingResult.avg_rtt_ms && (
                      <div className="text-cyan-300">RTT Médio: {pingResult.avg_rtt_ms.toFixed(2)} ms</div>
                    )}
                    <pre className="text-[10px] text-slate-400 overflow-x-auto pt-2 border-t border-slate-800">
                      {pingResult.raw_output}
                    </pre>
                  </div>
                )}
              </div>

              {/* ARP Table */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Tabela ARP / NDP do Kernel
                  </h3>
                  <button
                    onClick={handleFetchArp}
                    className="px-2.5 py-1 glass-card hover:bg-emerald-950 text-emerald-300 rounded text-[10px] transition flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Consultar ARP
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1 text-xs font-mono">
                  {arpTable.length ? (
                    arpTable.map((a, i) => (
                      <div key={i} className="p-2 glass-card rounded flex items-center justify-between">
                        <span className="text-white">{a.ip}</span>
                        <span className="text-slate-400">{a.mac}</span>
                        <span className="text-emerald-400 text-[10px]">{a.interface}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-4 text-slate-500 text-xs italic">
                      Clique em 'Consultar ARP' para ler as entradas de vizinhos do kernel.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-emerald-500/15 px-6 py-4 text-center text-xs text-slate-500 glass-panel">
        Astral Network · Enterprise Routing & Security Platform · Licenciado sob termos da SrvCloud
      </footer>
    </div>
  );
}
