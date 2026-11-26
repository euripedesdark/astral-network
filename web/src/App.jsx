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
  X,
  Zap,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('interfaces');
  const [loading, setLoading] = useState(false);
  const [interfaces, setInterfaces] = useState([]);
  const [linkHealth, setLinkHealth] = useState(null);
  const [activeLeases, setActiveLeases] = useState([]);
  const [dhcpStatus, setDhcpStatus] = useState(null);
  const [wireguard, setWireguard] = useState(null);
  const [cloudflare, setCloudflare] = useState(null);
  const [toast, setToast] = useState(null);

  // L2 / L3 Dynamic Inventory State
  const [vlans, setVlans] = useState([]);
  const [bridges, setBridges] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [routes, setRoutes] = useState([]);

  // Modals Visibility
  const [editingIface, setEditingIface] = useState(null);
  const [showVlanModal, setShowVlanModal] = useState(false);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [showBondModal, setShowBondModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showStaticLeaseModal, setShowStaticLeaseModal] = useState(false);

  // Authentication State (SSO / PAM / Samba AD)
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', provider: 'ad' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Forms
  const [ifaceForm, setIfaceForm] = useState({
    name: '',
    action: 'apply',
    method: 'static',
    ipv4_cidr: '',
    gateway: '',
    dns: '1.1.1.1, 8.8.8.8',
    mtu: 1500,
    mac: '',
    role: 'LAN',
  });

  const [vlanForm, setVlanForm] = useState({
    parent_interface: '',
    vlan_id: 10,
    name: '',
    ipv4_cidr: '',
    description: '',
  });

  const [bridgeForm, setBridgeForm] = useState({
    name: 'br0',
    members: [],
    ipv4_cidr: '',
    stp: false,
    description: '',
  });

  const [bondForm, setBondForm] = useState({
    name: 'bond0',
    slaves: [],
    mode: '802.3ad',
    ipv4_cidr: '',
  });

  const [routeForm, setRouteForm] = useState({
    destination: '',
    gateway: '',
    interface: '',
    metric: 100,
  });

  // DHCP Scope Form State
  const [scopeForm, setScopeForm] = useState({
    iface: '',
    subnet: '192.168.1.0/24',
    start: '192.168.1.100',
    end: '192.168.1.200',
    gateway: '192.168.1.1',
    dns: '192.168.1.1, 8.8.8.8',
    lease_time: '43200',
    enabled: true,
  });
  const [staticLeases, setStaticLeases] = useState([]);
  const [staticLeaseForm, setStaticLeaseForm] = useState({ mac: '', ip: '', hostname: '', description: '' });

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

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMe = async () => {
    try {
      const res = await fetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError('');
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        document.cookie = `ASTRAL_SESSION=${encodeURIComponent(data.token)}; path=/; max-age=86400`;
        document.cookie = `astral_token=${encodeURIComponent(data.token)}; path=/; max-age=86400`;
        document.cookie = `sso_token=${encodeURIComponent(data.token)}; path=/; max-age=86400`;
        try { localStorage.setItem('astral_token', data.token); } catch {}
        setUser(data.user || { username: loginForm.username, role: 'admin' });
        showToast(`Bem-vindo, ${loginForm.username}!`, 'success');
        fetchInventory();
        fetchHealth();
        fetchL2L3();
        fetchVpnAndDhcp();
      } else {
        setLoginError(data.message || data.error || 'Credenciais inválidas ou acesso negado.');
      }
    } catch (err) {
      setLoginError(err.message || 'Falha de comunicação com o servidor.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {}
    document.cookie = 'ASTRAL_SESSION=; path=/; max-age=0';
    document.cookie = 'astral_token=; path=/; max-age=0';
    document.cookie = 'sso_token=; path=/; max-age=0';
    try { localStorage.removeItem('astral_token'); } catch {}
    setUser(null);
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

  const fetchL2L3 = async () => {
    try {
      const [vRes, bRes, boRes, rRes] = await Promise.all([
        fetch('/api/v1/network/vlans'),
        fetch('/api/v1/network/bridges'),
        fetch('/api/v1/network/bonds'),
        fetch('/api/v1/network/routes'),
      ]);
      if (vRes.ok) setVlans(await vRes.json());
      if (bRes.ok) setBridges(await bRes.json());
      if (boRes.ok) setBonds(await boRes.json());
      if (rRes.ok) setRoutes(await rRes.json());
    } catch (e) {
      console.error("Falha ao consultar estado L2/L3", e);
    }
  };

  const fetchVpnAndDhcp = async () => {
    try {
      const [wgRes, cfRes, leaseRes, statusRes] = await Promise.all([
        fetch('/api/v1/network/vpn/wireguard'),
        fetch('/api/v1/network/cloudflare'),
        fetch('/api/v1/network/dhcp/leases'),
        fetch('/api/v1/network/dhcp/status'),
      ]);
      if (wgRes.ok) setWireguard(await wgRes.json());
      if (cfRes.ok) setCloudflare(await cfRes.json());
      if (leaseRes.ok) setActiveLeases(await leaseRes.json());
      if (statusRes.ok) setDhcpStatus(await statusRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMe();
    fetchInventory();
    fetchHealth();
    fetchL2L3();
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
      fetchL2L3();
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
        fetchL2L3();
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

  // --- L2/L3 ACTIONS ---

  const openEditIface = (iface) => {
    setEditingIface(iface);
    setIfaceForm({
      name: iface.name,
      action: 'apply',
      method: iface.ipv4 && iface.ipv4.length > 0 ? 'static' : 'dhcp',
      ipv4_cidr: iface.ipv4 && iface.ipv4.length > 0 ? iface.ipv4[0] : '',
      gateway: linkHealth?.default_gateway || '',
      dns: '1.1.1.1, 8.8.8.8',
      mtu: iface.mtu || 1500,
      mac: iface.mac || '',
      role: iface.role || 'LAN',
    });
  };

  const handleSaveInterface = async () => {
    if (!ifaceForm.name) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/interface/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ifaceForm.name,
          action: ifaceForm.action || 'apply',
          method: ifaceForm.method,
          ipv4_cidr: ifaceForm.method === 'static' ? ifaceForm.ipv4_cidr : null,
          gateway: ifaceForm.method === 'static' ? ifaceForm.gateway : null,
          dns: ifaceForm.dns ? ifaceForm.dns.split(',').map(s => s.trim()).filter(Boolean) : [],
          mtu: parseInt(ifaceForm.mtu, 10) || 1500,
          mac: ifaceForm.mac || null,
          role: ifaceForm.role || 'LAN',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Interface configurada no kernel com sucesso!", "success");
        setEditingIface(null);
        fetchInventory();
        fetchHealth();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha na requisição: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleInterfaceState = async (ifaceName, currentIsUp) => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/interface/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ifaceName,
          action: currentIsUp ? 'down' : 'up',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Interface ${ifaceName} ${currentIsUp ? 'desligada' : 'ativada'}!`, "info");
        fetchInventory();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVlan = async (e) => {
    e?.preventDefault();
    if (!vlanForm.parent_interface) {
      showToast("Selecione uma interface física pai.", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/vlan/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_interface: vlanForm.parent_interface,
          vlan_id: parseInt(vlanForm.vlan_id, 10),
          name: vlanForm.name || undefined,
          ipv4_cidr: vlanForm.ipv4_cidr || undefined,
          description: vlanForm.description || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "VLAN criada no kernel com sucesso!", "success");
        setShowVlanModal(false);
        setVlanForm({ parent_interface: '', vlan_id: 10, name: '', ipv4_cidr: '', description: '' });
        fetchInventory();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha ao criar VLAN: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVlan = async (name) => {
    if (!window.confirm(`Deseja realmente excluir a VLAN ${name}?`)) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/vlan/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "VLAN excluída!", "info");
        fetchInventory();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBridge = async (e) => {
    e?.preventDefault();
    if (!bridgeForm.name) {
      showToast("Informe o nome da bridge (ex: br0).", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/bridge/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bridgeForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Bridge criada no kernel com sucesso!", "success");
        setShowBridgeModal(false);
        setBridgeForm({ name: 'br0', members: [], ipv4_cidr: '', stp: false, description: '' });
        fetchInventory();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha ao criar Bridge: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBridge = async (name) => {
    if (!window.confirm(`Deseja realmente excluir a Bridge ${name}?`)) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/bridge/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Bridge excluída!", "info");
        fetchInventory();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBond = async (e) => {
    e?.preventDefault();
    if (!bondForm.name || bondForm.slaves.length === 0) {
      showToast("Informe o nome e selecione pelo menos uma interface escrava.", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/bond/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bondForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Bond criado no kernel!", "success");
        setShowBondModal(false);
        setBondForm({ name: 'bond0', slaves: [], mode: '802.3ad', ipv4_cidr: '' });
        fetchInventory();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha ao criar Bond: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBond = async (name) => {
    if (!window.confirm(`Deseja realmente excluir o Bond ${name}?`)) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/bond/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Bond excluído!", "info");
        fetchInventory();
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoute = async (e) => {
    e?.preventDefault();
    if (!routeForm.destination || !routeForm.gateway) {
      showToast("Destino CIDR e Gateway são obrigatórios.", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/routes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: routeForm.destination,
          gateway: routeForm.gateway,
          interface: routeForm.interface || undefined,
          metric: parseInt(routeForm.metric, 10) || 100,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Rota adicionada à tabela de roteamento!", "success");
        setShowRouteModal(false);
        setRouteForm({ destination: '', gateway: '', interface: '', metric: 100 });
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha ao cadastrar rota: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoute = async (destination) => {
    if (!window.confirm(`Deseja remover a rota para ${destination}?`)) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/routes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Rota removida!", "info");
        fetchL2L3();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDhcpScopeDirect = async (e) => {
    e?.preventDefault();
    if (!scopeForm.iface) {
      showToast("Selecione a interface para ativar o escopo.", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/dhcp/scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interface: scopeForm.iface,
          enabled: true,
          subnet_cidr: scopeForm.subnet,
          range_start: scopeForm.start,
          range_end: scopeForm.end,
          gateway: scopeForm.gateway,
          dns_servers: scopeForm.dns.split(',').map(s => s.trim()).filter(Boolean),
          domain_name: adConfig.ad_domain,
          lease_time_secs: parseInt(scopeForm.lease_time, 10) || 43200,
          ntp_servers: [],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Escopo DHCP salvo e ativado no serviço!", "success");
        fetchVpnAndDhcp();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha ao salvar escopo: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaticLease = async (e) => {
    e?.preventDefault();
    if (!staticLeaseForm.mac || !staticLeaseForm.ip || !staticLeaseForm.hostname) {
      showToast("MAC, IP e Hostname são obrigatórios.", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/dhcp/static-lease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staticLeaseForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Reserva estática criada no servidor DHCP!", "success");
        setShowStaticLeaseModal(false);
        setStaticLeases(prev => [...prev, staticLeaseForm]);
        setStaticLeaseForm({ mac: '', ip: '', hostname: '', description: '' });
        fetchVpnAndDhcp();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha ao criar reserva: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaticLease = async (mac) => {
    if (!window.confirm(`Deseja remover a reserva estática com MAC ${mac}?`)) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/network/dhcp/static-lease/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mac }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Reserva removida!", "info");
        setStaticLeases(prev => prev.filter(l => l.mac !== mac));
        fetchVpnAndDhcp();
      } else {
        showToast("Erro: " + (data.error || data.message), "error");
      }
    } catch (e) {
      showToast("Falha: " + e.message, "error");
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

  if (!user && !authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/20 via-slate-950 to-emerald-900/10 pointer-events-none" />
        <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-emerald-500/30 shadow-2xl relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/30 to-emerald-900/60 border border-emerald-400/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Network className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              ASTRAL <span className="text-emerald-400">NETWORK</span>
            </h1>
            <p className="text-xs text-slate-400">
              Controle L2/L3, Roteamento, DHCP & Integração Active Directory
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="bg-rose-950/80 border border-rose-800 p-3 rounded-lg text-rose-200 text-xs font-mono">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Provedor de Autenticação</label>
              <select
                value={loginForm.provider}
                onChange={e => setLoginForm({ ...loginForm, provider: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-lg text-xs bg-slate-900 text-slate-200 border border-emerald-500/30"
              >
                <option value="ad">Samba Active Directory / SSO (Kerberos)</option>
                <option value="pam">Linux Local PAM (root / sudo / wheel)</option>
                <option value="local">Credencial Local Astral</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Usuário / Login</label>
              <input
                type="text"
                required
                value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                placeholder="ex.: Administrator ou root"
                className="w-full glass-input px-3 py-2 rounded-lg text-xs bg-slate-900 text-white border border-emerald-500/30 focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Senha</label>
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="••••••••••••"
                className="w-full glass-input px-3 py-2 rounded-lg text-xs bg-slate-900 text-white border border-emerald-500/30 focus:border-emerald-400"
              />
            </div>

            <button
              type="submit"
              disabled={loginBusy}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2"
            >
              {loginBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {loginBusy ? 'Autenticando...' : 'Acessar Console de Rede'}
            </button>
          </form>

          <div className="pt-4 border-t border-emerald-500/15 text-center text-[11px] text-slate-500">
            Sessão única compatível com Astral AD-DNS e Internet Security
          </div>
        </div>
      </div>
    );
  }

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
                Roteamento Declarativo, L2/L3 Control, DHCP Server & Integração AD-DNS
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
              onClick={() => { fetchInventory(); fetchHealth(); fetchL2L3(); fetchVpnAndDhcp(); showToast("Atualizado com o kernel!", "info"); }}
              disabled={loading}
              className="p-2 glass-card hover:bg-emerald-950/60 rounded-lg text-emerald-300 transition"
              title="Recarregar do SO"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {user && (
              <div className="glass-card px-3 py-1.5 rounded-lg flex items-center gap-2 border border-emerald-500/30">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-slate-400 text-[10px] block">{user.role || 'Operador'}</span>
                  <span className="font-semibold text-emerald-300">{user.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="ml-1 p-1 hover:bg-rose-950/60 rounded text-slate-400 hover:text-rose-300 transition"
                  title="Sair / Encerrar Sessão"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-4 pt-3 border-t border-emerald-500/15 flex flex-wrap items-center gap-1">
          {[
            { id: 'interfaces', label: 'Interfaces & L2 (VLANs, Bridges, Bonds)', icon: Layers },
            { id: 'firewall', label: 'Tabela de Roteamento L3 & Port Forwarding', icon: Shield },
            { id: 'connections', label: 'Conexões: Link, P2P & WireGuard', icon: Radio },
            { id: 'dhcp_ad', label: 'Servidor DHCP & Integração AD-DNS', icon: Server },
            { id: 'security', label: 'Segurança & Diagnóstico (Ping/ARP)', icon: Terminal },
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
        {/* TAB 1: INTERFACES & L2 */}
        {activeTab === 'interfaces' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  Inventário Completo de Interfaces de Rede (Kernel)
                </h2>
                <p className="text-xs text-slate-400">
                  Todas as interfaces físicas, virtuais, VLANs e bridges com endereços MAC permanentes e controle UP/DOWN.
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
                      <th className="p-3">Endereços IP (IPv4)</th>
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
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleInterfaceState(iface.name, isUp)}
                                className={`px-2 py-1 rounded text-[10px] font-semibold transition border ${
                                  isUp
                                    ? 'bg-rose-950/60 hover:bg-rose-900 border-rose-600/30 text-rose-300'
                                    : 'bg-emerald-950/60 hover:bg-emerald-900 border-emerald-600/30 text-emerald-300'
                                }`}
                              >
                                {isUp ? 'Desativar' : 'Ativar'}
                              </button>
                              <button
                                onClick={() => openEditIface(iface)}
                                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-300 rounded text-xs transition font-semibold"
                              >
                                Configurar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dynamic L2 Panels: VLANs 802.1Q, Bridges & Bonding */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* VLANs 802.1Q Panel */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <Layers className="w-4 h-4" />
                    VLANs 802.1Q
                  </div>
                  <button
                    onClick={() => setShowVlanModal(true)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1 shadow"
                  >
                    <Plus className="w-3 h-3" /> Nova VLAN
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Cria subinterfaces virtuais com tag 802.1Q no kernel para isolamento de broadcast.
                </p>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {vlans.length > 0 ? (
                    vlans.map((vl, idx) => (
                      <div key={idx} className="p-2.5 glass-card rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-purple-300 font-mono block">VLAN {vl.id} ({vl.parent_interface}.{vl.id})</strong>
                          <span className="text-[10px] text-slate-400">{vl.ipv4_cidr || 'Sem IP'} · {vl.mode}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteVlan(`${vl.parent_interface}.${vl.id}`)}
                          className="p-1 hover:bg-rose-950 text-slate-400 hover:text-rose-300 rounded transition"
                          title="Excluir VLAN"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-4 glass-card rounded text-xs text-slate-500 italic">
                      Nenhuma VLAN 802.1Q criada. Clique em '+ Nova VLAN' para adicionar.
                    </div>
                  )}
                </div>
              </div>

              {/* Linux Bridges Panel */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <Router className="w-4 h-4" />
                    Linux Bridges
                  </div>
                  <button
                    onClick={() => setShowBridgeModal(true)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1 shadow"
                  >
                    <Plus className="w-3 h-3" /> Nova Bridge
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Pontes L2 de software para interligar interfaces físicas a switches virtuais, KVM e containers.
                </p>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {bridges.length > 0 ? (
                    bridges.map((br, idx) => (
                      <div key={idx} className="p-2.5 glass-card rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-indigo-300 font-mono block">{br.name} {br.stp ? '(STP Ativo)' : ''}</strong>
                          <span className="text-[10px] text-slate-400">
                            Portas: {br.members?.join(', ') || 'Nenhuma'} · {br.ipv4_cidr || 'Sem IP'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteBridge(br.name)}
                          className="p-1 hover:bg-rose-950 text-slate-400 hover:text-rose-300 rounded transition"
                          title="Excluir Bridge"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-4 glass-card rounded text-xs text-slate-500 italic">
                      Nenhuma bridge configurada. Clique em '+ Nova Bridge' para criar.
                    </div>
                  )}
                </div>
              </div>

              {/* Bonding Panel */}
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <ArrowDownUp className="w-4 h-4" />
                    Link Aggregation (Bond)
                  </div>
                  <button
                    onClick={() => setShowBondModal(true)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1 shadow"
                  >
                    <Plus className="w-3 h-3" /> Novo Bond
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Agrega múltiplas interfaces físicas em um canal lógico redundante ou de alta velocidade (LACP).
                </p>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {bonds.length > 0 ? (
                    bonds.map((bo, idx) => (
                      <div key={idx} className="p-2.5 glass-card rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-cyan-300 font-mono block">{bo.name} ({bo.mode})</strong>
                          <span className="text-[10px] text-slate-400">
                            Slaves: {bo.slaves?.join(', ') || 'Nenhum'} · {bo.ipv4_cidr || 'Sem IP'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteBond(bo.name)}
                          className="p-1 hover:bg-rose-950 text-slate-400 hover:text-rose-300 rounded transition"
                          title="Excluir Bond"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-4 glass-card rounded text-xs text-slate-500 italic">
                      Nenhum bond criado. Clique em '+ Novo Bond' para agregar placas.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROUTING & FIREWALL */}
        {activeTab === 'firewall' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  Tabela de Roteamento L3 & Proteção de Portas
                </h2>
                <p className="text-xs text-slate-400">
                  Rotas estáticas do kernel, gateways de saída e redirecionamento de conexões (DNAT).
                </p>
              </div>

              <button
                onClick={() => setShowRouteModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
              >
                <Plus className="w-4 h-4" /> Adicionar Rota Estática
              </button>
            </div>

            {/* Live Kernel Routing Table */}
            <div className="glass-panel rounded-xl overflow-hidden border border-emerald-500/20 space-y-2">
              <div className="p-4 border-b border-emerald-500/20 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Rotas Ativas no Kernel (ip route show)
                </h3>
                <span className="text-xs text-emerald-400 font-mono">{routes.length} rotas carregadas</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-950/40 text-emerald-300 font-semibold border-b border-emerald-500/20 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Destino / Rede</th>
                      <th className="p-3">Gateway (Next-Hop)</th>
                      <th className="p-3">Interface de Saída</th>
                      <th className="p-3">Métrica</th>
                      <th className="p-3">Origem</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-500/10 font-mono">
                    {routes.map((rt, i) => (
                      <tr key={i} className="hover:bg-emerald-950/20 transition">
                        <td className="p-3 text-white font-bold">{rt.destination}</td>
                        <td className="p-3 text-emerald-300">{rt.gateway || '(Diretamente Conectada)'}</td>
                        <td className="p-3 text-cyan-300">{rt.interface || '-'}</td>
                        <td className="p-3 text-slate-400">{rt.metric || '-'}</td>
                        <td className="p-3 text-slate-500">{rt.protocol || 'kernel'}</td>
                        <td className="p-3 text-right">
                          {rt.destination !== 'default' && (
                            <button
                              onClick={() => handleDeleteRoute(rt.destination)}
                              className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-[10px] transition"
                            >
                              Remover
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Port Forwarding / Host Protection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Redirecionamento de Portas (Port Forwarding & DNAT)
                </h3>
                <p className="text-xs text-slate-400">
                  Encaminha requisições externas para servidores da rede local com suporte a Hairpin NAT.
                </p>
                <div className="space-y-2 text-xs font-mono">
                  <div className="p-3 glass-card rounded-lg flex items-center justify-between">
                    <div>
                      <strong className="text-white block">WAN :443 ➔ 192.168.0.10:443</strong>
                      <span className="text-[10px] text-slate-400">HTTPS Ingress · Hairpin NAT: Ativo</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/40">Ativo</span>
                  </div>
                  <div className="p-3 glass-card rounded-lg flex items-center justify-between">
                    <div>
                      <strong className="text-white block">WAN :8095 ➔ 127.0.0.1:8095</strong>
                      <span className="text-[10px] text-slate-400">WebUI AD-DNS Console</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/40">Ativo</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Portas de Gerenciamento do Host
                </h3>
                <p className="text-xs text-slate-400">
                  Portas administrativas essenciais protegidas contra bloqueios indevidos.
                </p>
                <div className="space-y-2 text-xs font-mono">
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">WebUI Astral Network (:8086)</span>
                    <span className="text-emerald-400 font-bold">LIBERADO</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Terminal SSH (:22)</span>
                    <span className="text-emerald-400 font-bold">LIBERADO</span>
                  </div>
                  <div className="p-2.5 glass-card rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Serviços DHCP (:67/UDP) & DNS (:53)</span>
                    <span className="text-emerald-400 font-bold">LIBERADO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CONNECTIONS: WIREGUARD & CLOUDFLARE */}
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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-emerald-400" />
                  Servidor DHCP & Integração Astral AD-DNS
                </h2>
                <p className="text-xs text-slate-400">
                  Gerenciamento de escopos, reservas de IP estático por MAC e encaminhamento condicional para Active Directory.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                  dhcpStatus?.active ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${dhcpStatus?.active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {dhcpStatus?.active ? 'Daemon DHCP Ativo' : 'Daemon DHCP Inativo'}
                </span>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/v1/network/dhcp/restart', { method: 'POST' });
                      const d = await res.json();
                      showToast(d.message || "Daemon DHCP reiniciado com sucesso!", res.ok ? "success" : "error");
                      fetchVpnAndDhcp();
                    } catch (e) {
                      showToast("Erro ao reiniciar DHCP: " + e.message, "error");
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reiniciar Daemon
                </button>
              </div>
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

            {/* Configuração de Escopo DHCP */}
            <form onSubmit={handleSaveDhcpScopeDirect} className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-500/15 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Configurar / Ativar Escopo DHCP (Pool por Interface LAN)
                </h3>
                <span className="text-xs text-slate-400 font-mono">/etc/dhcp/dhcpd.conf</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Interface LAN / Bridge</label>
                  <select
                    value={scopeForm.iface}
                    onChange={e => setScopeForm({ ...scopeForm, iface: e.target.value })}
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white"
                  >
                    <option value="">Selecione uma interface...</option>
                    {interfaces.filter(i => i.role !== 'WAN').map((iface, idx) => (
                      <option key={idx} value={iface.name}>
                        {iface.name} ({iface.ipv4?.join(', ') || 'Sem IP'} - {iface.mac})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Subrede CIDR</label>
                  <input
                    type="text"
                    value={scopeForm.subnet}
                    onChange={e => setScopeForm({ ...scopeForm, subnet: e.target.value })}
                    placeholder="ex.: 192.168.1.0/24"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Gateway Padrão</label>
                  <input
                    type="text"
                    value={scopeForm.gateway}
                    onChange={e => setScopeForm({ ...scopeForm, gateway: e.target.value })}
                    placeholder="ex.: 192.168.1.1"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Faixa Inicial (Range Start)</label>
                  <input
                    type="text"
                    value={scopeForm.start}
                    onChange={e => setScopeForm({ ...scopeForm, start: e.target.value })}
                    placeholder="ex.: 192.168.1.100"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Faixa Final (Range End)</label>
                  <input
                    type="text"
                    value={scopeForm.end}
                    onChange={e => setScopeForm({ ...scopeForm, end: e.target.value })}
                    placeholder="ex.: 192.168.1.200"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Servidores DNS Entregues</label>
                  <input
                    type="text"
                    value={scopeForm.dns}
                    onChange={e => setScopeForm({ ...scopeForm, dns: e.target.value })}
                    placeholder="ex.: 192.168.1.1, 8.8.8.8"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
                >
                  <Save className="w-4 h-4" />
                  Salvar e Ativar Escopo DHCP
                </button>
              </div>
            </form>

            {/* Reservas Estáticas (Static Leases / IP Fixo por MAC) */}
            <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-500/15 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-400" />
                    Reservas Estáticas de IP (DHCP Static Leases / MAC Fixo)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Fixa endereços IP específicos para servidores, impressoras e estações baseado no MAC Address.
                  </p>
                </div>
                <button
                  onClick={() => setShowStaticLeaseModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Reserva Estática
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-emerald-950/40 text-emerald-300 font-semibold border-b border-emerald-500/20 text-[10px] uppercase font-sans">
                    <tr>
                      <th className="p-3">MAC Address</th>
                      <th className="p-3">IP Fixo Reservado</th>
                      <th className="p-3">Hostname</th>
                      <th className="p-3">Descrição</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-500/10">
                    {staticLeases.length > 0 ? (
                      staticLeases.map((st, i) => (
                        <tr key={i} className="hover:bg-emerald-950/20 transition">
                          <td className="p-3 text-slate-300">{st.mac}</td>
                          <td className="p-3 text-emerald-300 font-bold">{st.ip}</td>
                          <td className="p-3 text-white">{st.hostname}</td>
                          <td className="p-3 text-slate-400 font-sans">{st.description || '-'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteStaticLease(st.mac)}
                              className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-[10px] transition font-sans"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500 italic font-sans">
                          Nenhuma reserva estática configurada. Clique em '+ Nova Reserva Estática' para adicionar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                          <td className="p-3 text-emerald-300 font-bold">{l.ip}</td>
                          <td className="p-3 text-slate-300">{l.mac}</td>
                          <td className="p-3 text-white">{l.hostname || '-'}</td>
                          <td className="p-3 text-slate-400">{l.ends || l.expires_at || '-'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setStaticLeaseForm({ mac: l.mac, ip: l.ip, hostname: l.hostname || '', description: '' });
                                setShowStaticLeaseModal(true);
                              }}
                              className="px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/40 text-emerald-300 rounded text-[10px] transition"
                            >
                              Tornar Estático
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
                    className="flex-1 glass-input px-3 py-2 rounded-lg text-xs bg-slate-900 border border-emerald-500/30 text-white font-mono"
                  />
                  <button
                    onClick={handlePingTest}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
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

      {/* ============================================================================== */}
      {/* MODALS */}
      {/* ============================================================================== */}

      {/* 1. Modal de Configuração de Interface */}
      {editingIface && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-emerald-500/20 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 border border-emerald-500/30">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Configurar {editingIface.name}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      editingIface.state === 'UP' ? 'bg-emerald-950 text-emerald-400 border border-emerald-600/40' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {editingIface.state}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">MAC Atual: {editingIface.mac}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingIface(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Papel e Ação */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Papel da Interface (Role)</label>
                  <select
                    value={ifaceForm.role}
                    onChange={e => setIfaceForm({ ...ifaceForm, role: e.target.value })}
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white"
                  >
                    <option value="LAN">LAN (Rede Local Interna)</option>
                    <option value="WAN">WAN (Internet / Link Externo)</option>
                    <option value="TRUNK">TRUNK (Tronco 802.1Q)</option>
                    <option value="BRIDGE">BRIDGE (Membro de Bridge)</option>
                    <option value="UNASSIGNED">UNASSIGNED (Livre)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Estado Administrativo</label>
                  <select
                    value={ifaceForm.action}
                    onChange={e => setIfaceForm({ ...ifaceForm, action: e.target.value })}
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white"
                  >
                    <option value="apply">Manter Ativo / Aplicar Parâmetros</option>
                    <option value="up">Forçar Ativação (ip link set up)</option>
                    <option value="down">Desativar Interface (ip link set down)</option>
                  </select>
                </div>
              </div>

              {/* Modo de Endereçamento */}
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Método de Endereçamento IPv4</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIfaceForm({ ...ifaceForm, method: 'dhcp' })}
                    className={`py-2 rounded-lg text-xs font-semibold border transition ${
                      ifaceForm.method === 'dhcp'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    DHCP Cliente (Automático)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIfaceForm({ ...ifaceForm, method: 'static' })}
                    className={`py-2 rounded-lg text-xs font-semibold border transition ${
                      ifaceForm.method === 'static'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    IP Estático (Manual)
                  </button>
                </div>
              </div>

              {/* Campos IP Estático */}
              {ifaceForm.method === 'static' && (
                <div className="space-y-3 p-3.5 bg-slate-950/70 rounded-xl border border-emerald-500/20">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Endereço IPv4 / CIDR</label>
                    <input
                      type="text"
                      value={ifaceForm.ipv4_cidr}
                      onChange={e => setIfaceForm({ ...ifaceForm, ipv4_cidr: e.target.value })}
                      placeholder="ex.: 192.168.1.1/24"
                      className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Gateway Padrão</label>
                      <input
                        type="text"
                        value={ifaceForm.gateway}
                        onChange={e => setIfaceForm({ ...ifaceForm, gateway: e.target.value })}
                        placeholder="ex.: 192.168.1.254"
                        className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Servidores DNS</label>
                      <input
                        type="text"
                        value={ifaceForm.dns}
                        onChange={e => setIfaceForm({ ...ifaceForm, dns: e.target.value })}
                        placeholder="1.1.1.1, 8.8.8.8"
                        className="w-full glass-input px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/30 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Parâmetros Avançados */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">MTU da Interface</label>
                  <input
                    type="number"
                    value={ifaceForm.mtu}
                    onChange={e => setIfaceForm({ ...ifaceForm, mtu: e.target.value })}
                    placeholder="1500"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Clonar MAC (Opcional)</label>
                  <input
                    type="text"
                    value={ifaceForm.mac}
                    onChange={e => setIfaceForm({ ...ifaceForm, mac: e.target.value })}
                    placeholder="00:11:22:33:44:55"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingIface(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveInterface}
                disabled={loading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar e Aplicar no Kernel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal de Nova VLAN 802.1Q */}
      {showVlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateVlan} className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-emerald-500/20 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Layers className="w-5 h-5 text-purple-400" />
                Nova VLAN 802.1Q
              </div>
              <button type="button" onClick={() => setShowVlanModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Interface Física Pai (Parent)</label>
                <select
                  required
                  value={vlanForm.parent_interface}
                  onChange={e => setVlanForm({ ...vlanForm, parent_interface: e.target.value })}
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white"
                >
                  <option value="">Selecione a interface pai...</option>
                  {interfaces.filter(i => !i.is_vlan).map((iface, i) => (
                    <option key={i} value={iface.name}>{iface.name} ({iface.mac})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">VLAN ID (1-4094)</label>
                  <input
                    type="number"
                    min="1"
                    max="4094"
                    required
                    value={vlanForm.vlan_id}
                    onChange={e => setVlanForm({ ...vlanForm, vlan_id: e.target.value })}
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Nome da Subinterface</label>
                  <input
                    type="text"
                    value={vlanForm.name || (vlanForm.parent_interface ? `${vlanForm.parent_interface}.${vlanForm.vlan_id}` : '')}
                    onChange={e => setVlanForm({ ...vlanForm, name: e.target.value })}
                    placeholder="ex.: ens34.10"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Endereço IPv4 / CIDR (Opcional)</label>
                <input
                  type="text"
                  value={vlanForm.ipv4_cidr}
                  onChange={e => setVlanForm({ ...vlanForm, ipv4_cidr: e.target.value })}
                  placeholder="ex.: 192.168.10.1/24"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowVlanModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-purple-950">
                Criar VLAN no Kernel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Modal de Nova Bridge */}
      {showBridgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBridge} className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-emerald-500/20 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Router className="w-5 h-5 text-indigo-400" />
                Nova Linux Bridge
              </div>
              <button type="button" onClick={() => setShowBridgeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Nome da Bridge</label>
                <input
                  type="text"
                  required
                  value={bridgeForm.name}
                  onChange={e => setBridgeForm({ ...bridgeForm, name: e.target.value })}
                  placeholder="ex.: br0"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Interfaces Membros (Portas Enslaved)</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-emerald-500/20">
                  {interfaces.filter(i => !i.is_bridge).map((iface, i) => (
                    <label key={i} className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={bridgeForm.members.includes(iface.name)}
                        onChange={e => {
                          const updated = e.target.checked
                            ? [...bridgeForm.members, iface.name]
                            : bridgeForm.members.filter(m => m !== iface.name);
                          setBridgeForm({ ...bridgeForm, members: updated });
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-mono">{iface.name}</span>
                      <span className="text-[10px] text-slate-500">({iface.mac})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Endereço IPv4 / CIDR (Opcional)</label>
                <input
                  type="text"
                  value={bridgeForm.ipv4_cidr}
                  onChange={e => setBridgeForm({ ...bridgeForm, ipv4_cidr: e.target.value })}
                  placeholder="ex.: 192.168.100.1/24"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="stp_toggle"
                  checked={bridgeForm.stp}
                  onChange={e => setBridgeForm({ ...bridgeForm, stp: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                />
                <label htmlFor="stp_toggle" className="text-slate-300 font-semibold cursor-pointer">
                  Habilitar Spanning Tree Protocol (STP anti-loop)
                </label>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowBridgeModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-indigo-950">
                Criar Bridge no Kernel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Modal de Novo Bond */}
      {showBondModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBond} className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-emerald-500/20 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <ArrowDownUp className="w-5 h-5 text-cyan-400" />
                Novo Link Aggregation (Bond)
              </div>
              <button type="button" onClick={() => setShowBondModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Nome do Bond</label>
                  <input
                    type="text"
                    required
                    value={bondForm.name}
                    onChange={e => setBondForm({ ...bondForm, name: e.target.value })}
                    placeholder="ex.: bond0"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Modo de Agregação</label>
                  <select
                    value={bondForm.mode}
                    onChange={e => setBondForm({ ...bondForm, mode: e.target.value })}
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white"
                  >
                    <option value="802.3ad">802.3ad LACP (Dinâmico)</option>
                    <option value="active-backup">Active-Backup (Tolerância a Falhas)</option>
                    <option value="balance-rr">Balance Round-Robin</option>
                    <option value="balance-xor">Balance XOR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Interfaces Escravas (Slaves)</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-emerald-500/20">
                  {interfaces.filter(i => !i.is_bridge && !i.is_vlan).map((iface, i) => (
                    <label key={i} className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={bondForm.slaves.includes(iface.name)}
                        onChange={e => {
                          const updated = e.target.checked
                            ? [...bondForm.slaves, iface.name]
                            : bondForm.slaves.filter(s => s !== iface.name);
                          setBondForm({ ...bondForm, slaves: updated });
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="font-mono">{iface.name}</span>
                      <span className="text-[10px] text-slate-500">({iface.mac})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Endereço IPv4 / CIDR (Opcional)</label>
                <input
                  type="text"
                  value={bondForm.ipv4_cidr}
                  onChange={e => setBondForm({ ...bondForm, ipv4_cidr: e.target.value })}
                  placeholder="ex.: 192.168.200.1/24"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowBondModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-cyan-950">
                Criar Bond no Kernel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Modal de Nova Rota Estática */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateRoute} className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-emerald-500/20 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Globe className="w-5 h-5 text-emerald-400" />
                Adicionar Rota Estática
              </div>
              <button type="button" onClick={() => setShowRouteModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Rede de Destino (CIDR)</label>
                <input
                  type="text"
                  required
                  value={routeForm.destination}
                  onChange={e => setRouteForm({ ...routeForm, destination: e.target.value })}
                  placeholder="ex.: 10.50.0.0/16 ou 172.16.0.0/12"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Gateway / Next-Hop</label>
                <input
                  type="text"
                  required
                  value={routeForm.gateway}
                  onChange={e => setRouteForm({ ...routeForm, gateway: e.target.value })}
                  placeholder="ex.: 192.168.1.254"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Interface de Saída</label>
                  <select
                    value={routeForm.interface}
                    onChange={e => setRouteForm({ ...routeForm, interface: e.target.value })}
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white"
                  >
                    <option value="">Automática pelo Kernel</option>
                    {interfaces.map((iface, i) => (
                      <option key={i} value={iface.name}>{iface.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Métrica</label>
                  <input
                    type="number"
                    value={routeForm.metric}
                    onChange={e => setRouteForm({ ...routeForm, metric: e.target.value })}
                    placeholder="100"
                    className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowRouteModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-emerald-950">
                Adicionar Rota
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. Modal de Nova Reserva Estática DHCP */}
      {showStaticLeaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateStaticLease} className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-emerald-500/20 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Key className="w-5 h-5 text-emerald-400" />
                Nova Reserva Estática (IP Fixo por MAC)
              </div>
              <button type="button" onClick={() => setShowStaticLeaseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">MAC Address do Dispositivo</label>
                <input
                  type="text"
                  required
                  value={staticLeaseForm.mac}
                  onChange={e => setStaticLeaseForm({ ...staticLeaseForm, mac: e.target.value })}
                  placeholder="ex.: 00:11:22:33:44:55"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Endereço IP Fixo Reservado</label>
                <input
                  type="text"
                  required
                  value={staticLeaseForm.ip}
                  onChange={e => setStaticLeaseForm({ ...staticLeaseForm, ip: e.target.value })}
                  placeholder="ex.: 192.168.1.50"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Hostname (Nome do Dispositivo)</label>
                <input
                  type="text"
                  required
                  value={staticLeaseForm.hostname}
                  onChange={e => setStaticLeaseForm({ ...staticLeaseForm, hostname: e.target.value })}
                  placeholder="ex.: printer-laser-contabil"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Descrição / Observações</label>
                <input
                  type="text"
                  value={staticLeaseForm.description}
                  onChange={e => setStaticLeaseForm({ ...staticLeaseForm, description: e.target.value })}
                  placeholder="ex.: Impressora HP LaserJet 1020"
                  className="w-full glass-input px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/30 text-white"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowStaticLeaseModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-emerald-950">
                Salvar Reserva no DHCP
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-emerald-500/15 px-6 py-4 text-center text-xs text-slate-500 glass-panel">
        Astral Network · Enterprise Routing & Security Platform · Licenciado sob termos da SrvCloud
      </footer>
    </div>
  );
}
