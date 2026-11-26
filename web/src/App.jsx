import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Check,
  CheckCircle,
  Cloud,
  Database,
  Globe,
  HardDrive,
  Key,
  Layers,
  Lock,
  LogOut,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Router,
  Save,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  User,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
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

  // Unified Authentication State (Identical to Astral AD-DNS)
  const [operator, setOperator] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authProvider, setAuthProvider] = useState('ad'); // 'ad', 'linux', 'postgres'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [lang, setLang] = useState('pt');

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
        setOperator(data.data || data);
      } else {
        setOperator(null);
      }
    } catch {
      setOperator(null);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authUsername,
          password: authPassword,
          provider: authProvider,
        }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        document.cookie = `ASTRAL_SESSION=${encodeURIComponent(data.token)}; path=/; max-age=86400`;
        document.cookie = `astral_token=${encodeURIComponent(data.token)}; path=/; max-age=86400`;
        document.cookie = `sso_token=${encodeURIComponent(data.token)}; path=/; max-age=86400`;
        try { localStorage.setItem('astral_token', data.token); } catch {}
        setOperator(data.user || data.data || { username: authUsername, provider: authProvider, role: 'admin' });
        showToast(`Bem-vindo, ${authUsername}!`, 'success');
        fetchInventory();
        fetchHealth();
        fetchL2L3();
        fetchVpnAndDhcp();
      } else {
        setAuthError(data.message || data.error || 'Credenciais inválidas ou acesso negado.');
      }
    } catch (err) {
      setAuthError(err.message || 'Falha de comunicação com o servidor.');
    } finally {
      setAuthSubmitting(false);
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
    setOperator(null);
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

  // ==============================================================================
  // TELA DE LOGIN UNIFICADA IDÊNTICA AO ASTRAL AD-DNS
  // ==============================================================================
  if (!operator && !authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
        {/* Top bar on login page */}
        <div className="w-full flex items-center justify-between p-4 sm:p-6 border-b border-slate-900 bg-slate-950/60 backdrop-blur z-20">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600/20 border border-indigo-500/40 p-2 rounded-xl text-indigo-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm bg-gradient-to-r from-indigo-400 to-sky-300 bg-clip-text text-transparent">
                Astral Network Controller
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-500 font-mono">v1.0.0</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs">
            <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer pr-2"
            >
              <option value="pt" className="bg-slate-900 text-slate-100">🇧🇷 Português (Brasil)</option>
              <option value="en" className="bg-slate-900 text-slate-100">🇺🇸 English (US)</option>
              <option value="es" className="bg-slate-900 text-slate-100">🇪🇸 Español (España)</option>
              <option value="fr" className="bg-slate-900 text-slate-100">🇫🇷 Français (France)</option>
            </select>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 z-10">
          <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur">
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 mb-3">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 tracking-wide">Acesso Unificado Astral</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Autenticação centralizada para infraestrutura e serviços Astral
              </p>
            </div>

            {/* Provider Tabs (Samba AD, Linux Sudo, PostgreSQL) */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800/80 mb-5">
              <button
                type="button"
                onClick={() => { setAuthProvider('ad'); setAuthError(null); }}
                className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  authProvider === 'ad'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield className="w-4 h-4 mb-1" />
                <span className="truncate w-full text-center">Samba AD / SSO</span>
              </button>
              <button
                type="button"
                onClick={() => { setAuthProvider('linux'); setAuthError(null); }}
                className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  authProvider === 'linux'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-4 h-4 mb-1" />
                <span className="truncate w-full text-center">Linux Sudo</span>
              </button>
              <button
                type="button"
                onClick={() => { setAuthProvider('postgres'); setAuthError(null); }}
                className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  authProvider === 'postgres'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-4 h-4 mb-1" />
                <span className="truncate w-full text-center">PostgreSQL</span>
              </button>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 mb-5 text-[11px] text-slate-400 leading-relaxed">
              {authProvider === 'ad' && "Acesso via credenciais do domínio Samba AD ou token SSO emitido pelo auth-service."}
              {authProvider === 'linux' && "Acesso de administrador de sistema operacional com privilégios sudo (wheel/sudo) ou root."}
              {authProvider === 'postgres' && "Acesso via banco de dados para qualquer superusuário PostgreSQL (rolsuper = true)."}
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Usuário</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder={
                      authProvider === 'ad' ? "Administrator" :
                      authProvider === 'linux' ? "euripedes / root" : "postgres"
                    }
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 transition focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Senha</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 transition focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {authSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Entrar no Sistema</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="w-full text-center py-3 text-[11px] text-slate-500 border-t border-slate-900 bg-slate-950/40">
          Política Unificada de Acesso: Samba AD / OAuth2, Linux Sudo, PostgreSQL Superuser ou Auth-Service SSO.
        </div>
      </div>
    );
  }

  // ==============================================================================
  // DASHBOARD PRINCIPAL COM SIDEBAR NOC
  // ==============================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
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
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600/20 border border-indigo-500/40 p-2 rounded-xl text-indigo-400 shadow-inner">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-wide bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
                Astral Network Controller
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 font-mono font-medium">
                v1.0 · L2/L3 Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Controle de Interfaces, Roteamento L3, Servidor DHCP & Integração AD-DNS</p>
          </div>
        </div>

        {/* Status Indicators & Operator Badge */}
        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300 font-medium">{activeIfacesCount} / {interfaces.length} UP</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-300 font-medium">{linkHealth?.default_gateway || "Gateway WAN"}</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${dhcpStatus?.active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-300 font-medium">DHCP: {dhcpStatus?.active ? 'Ativo' : 'Inativo'}</span>
            </div>
          </div>

          <button
            onClick={() => { fetchInventory(); fetchHealth(); fetchL2L3(); fetchVpnAndDhcp(); showToast("Atualizado com o kernel!", "info"); }}
            disabled={loading}
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 transition"
            title="Recarregar dados do SO"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Operator Badge with Logout */}
          {operator && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-semibold text-indigo-300 font-mono">{operator.username}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                {operator.provider || 'admin'}
              </span>
              <button
                onClick={handleLogout}
                title="Encerrar Sessão"
                className="ml-1 text-slate-400 hover:text-rose-400 transition cursor-pointer p-0.5"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container with Left Sidebar */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-slate-900/60 border-r border-slate-800/80 p-3 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Activity className="w-4 h-4" />} label="Painel NOC / Resumo" />
          <NavItem active={activeTab === 'interfaces'} onClick={() => setActiveTab('interfaces')} icon={<Layers className="w-4 h-4 text-emerald-400" />} label="1. Interfaces Físicas (NICs)" badge={`${activeIfacesCount} UP`} />
          <NavItem active={activeTab === 'vlans'} onClick={() => setActiveTab('vlans')} icon={<Layers className="w-4 h-4 text-purple-400" />} label="2. VLANs 802.1Q (Trunk)" badge={vlans.length} />
          <NavItem active={activeTab === 'bridges'} onClick={() => setActiveTab('bridges')} icon={<Router className="w-4 h-4 text-indigo-400" />} label="3. Linux Bridges (br0)" badge={bridges.length} />
          <NavItem active={activeTab === 'bonds'} onClick={() => setActiveTab('bonds')} icon={<ArrowDownUp className="w-4 h-4 text-cyan-400" />} label="4. Bonding LACP (802.3ad)" badge={bonds.length} />
          <NavItem active={activeTab === 'routes'} onClick={() => setActiveTab('routes')} icon={<Globe className="w-4 h-4 text-sky-400" />} label="5. Roteamento L3 & PBR" badge={routes.length} />
          <NavItem active={activeTab === 'dhcp_scopes'} onClick={() => setActiveTab('dhcp_scopes')} icon={<Server className="w-4 h-4 text-emerald-400" />} label="6. Escopos DHCP" badge={dhcpStatus?.scopes?.length || 0} />
          <NavItem active={activeTab === 'dhcp_static'} onClick={() => setActiveTab('dhcp_static')} icon={<Key className="w-4 h-4 text-amber-400" />} label="7. Reservas Estáticas (MAC)" badge={staticLeases.length} />
          <NavItem active={activeTab === 'dhcp_leases'} onClick={() => setActiveTab('dhcp_leases')} icon={<Radio className="w-4 h-4 text-teal-400" />} label="8. Concessões Ativas" badge={activeLeases.length} />
          <NavItem active={activeTab === 'ad_dns'} onClick={() => setActiveTab('ad_dns')} icon={<ShieldCheck className="w-4 h-4 text-indigo-400" />} label="9. Integração Astral AD-DNS" />
          <NavItem active={activeTab === 'wireguard'} onClick={() => setActiveTab('wireguard')} icon={<Shield className="w-4 h-4 text-emerald-400" />} label="10. WireGuard VPN" badge={wireguard?.peers?.length || 0} />
          <NavItem active={activeTab === 'cloudflare'} onClick={() => setActiveTab('cloudflare')} icon={<Cloud className="w-4 h-4 text-cyan-400" />} label="11. Cloudflare Zero Trust" />
          <NavItem active={activeTab === 'diagnostics'} onClick={() => setActiveTab('diagnostics')} icon={<Terminal className="w-4 h-4 text-amber-400" />} label="12. Diagnóstico (Ping & ARP)" />
          <NavItem active={activeTab === 'declarative'} onClick={() => setActiveTab('declarative')} icon={<Save className="w-4 h-4 text-rose-400" />} label="13. Rollback & Declarativo" />
        </aside>

        {/* Tab Content */}
        <main className="flex-1 p-5 lg:p-7 overflow-y-auto space-y-6">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-400" />
                    Visão Geral da Rede & Estado do Host
                  </h2>
                  <p className="text-xs text-slate-400">
                    Monitoramento em tempo real da topologia de rede, links de internet, servidor DHCP e túneis.
                  </p>
                </div>
                <button
                  onClick={handleApplyDeclarative}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-950"
                >
                  <Save className="w-4 h-4" />
                  Salvar Estado c/ Auto-Rollback (60s)
                </button>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center gap-3 shadow">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Interfaces no Kernel</span>
                    <strong className="text-lg text-white font-bold">{activeIfacesCount} UP / {interfaces.length} Total</strong>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center gap-3 shadow">
                  <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Gateway WAN</span>
                    <strong className="text-sm text-cyan-300 font-mono block truncate max-w-[150px]">
                      {linkHealth?.default_gateway || "Detectando..."}
                    </strong>
                    <span className="text-[10px] text-slate-400">
                      {linkHealth?.gateway_rtt_ms ? `Latência: ${linkHealth.gateway_rtt_ms.toFixed(1)}ms` : "Conectado"}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center gap-3 shadow">
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Servidor DHCP</span>
                    <strong className="text-sm text-purple-300 font-bold block">
                      {dhcpStatus?.active ? 'Ativo (dhcpd)' : 'Inativo'}
                    </strong>
                    <span className="text-[10px] text-slate-400">{activeLeases.length} clientes conectados</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center gap-3 shadow">
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Astral AD-DNS</span>
                    <strong className="text-sm text-indigo-300 font-bold block">Source of Truth</strong>
                    <span className="text-[10px] text-slate-400">Conditional Forwarder</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      VLANs 802.1Q
                    </h3>
                    <button onClick={() => setShowVlanModal(true)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Subinterfaces virtuais com isolamento de camada 2.</p>
                  <div className="text-xs space-y-1.5 font-mono">
                    {vlans.length ? vlans.map((v, i) => (
                      <div key={i} className="p-2 bg-slate-950 rounded flex items-center justify-between">
                        <span>VLAN {v.id} ({v.parent_interface}.{v.id})</span>
                        <span className="text-purple-400">{v.ipv4_cidr || 'Sem IP'}</span>
                      </div>
                    )) : <div className="text-slate-500 italic">Nenhuma VLAN configurada.</div>}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Router className="w-4 h-4 text-indigo-400" />
                      Linux Bridges
                    </h3>
                    <button onClick={() => setShowBridgeModal(true)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Switches virtuais L2 para KVM e portas locais.</p>
                  <div className="text-xs space-y-1.5 font-mono">
                    {bridges.length ? bridges.map((b, i) => (
                      <div key={i} className="p-2 bg-slate-950 rounded flex items-center justify-between">
                        <span>{b.name}</span>
                        <span className="text-indigo-400">{b.members?.join(', ') || 'Sem portas'}</span>
                      </div>
                    )) : <div className="text-slate-500 italic">Nenhuma bridge configurada.</div>}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-400" />
                      Rotas Estáticas L3
                    </h3>
                    <button onClick={() => setShowRouteModal(true)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Tabelas de roteamento e gateways do kernel.</p>
                  <div className="text-xs space-y-1.5 font-mono">
                    {routes.slice(0, 3).map((r, i) => (
                      <div key={i} className="p-2 bg-slate-950 rounded flex items-center justify-between">
                        <span>{r.destination}</span>
                        <span className="text-sky-400 truncate max-w-[120px]">via {r.gateway || 'local'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: INTERFACES FÍSICAS */}
          {activeTab === 'interfaces' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-400" />
                    Inventário & Controle de Interfaces de Rede (NICs)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Controle de placas físicas: IP estático/DHCP, MTU, endereço MAC permanente/clonado e ativação UP/DOWN.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Interface</th>
                      <th className="p-3.5">Função (Role)</th>
                      <th className="p-3.5">MAC Atual / Permanente</th>
                      <th className="p-3.5">Link Físico</th>
                      <th className="p-3.5">Velocidade</th>
                      <th className="p-3.5">Endereço IPv4</th>
                      <th className="p-3.5">MTU</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {interfaces.map(iface => {
                      const isUp = iface.state === 'UP';
                      const hasLink = iface.carrier;
                      return (
                        <tr key={iface.name} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 font-medium text-white flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                            {iface.name}
                            {iface.is_bridge && <span className="text-[9px] bg-indigo-950 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-700/40 font-sans">Bridge</span>}
                            {iface.is_vlan && <span className="text-[9px] bg-purple-950 text-purple-300 px-1.5 py-0.2 rounded border border-purple-700/40 font-sans">VLAN {iface.vlan_id}</span>}
                          </td>
                          <td className="p-3.5 font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              iface.role === 'WAN' ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/40' :
                              iface.role === 'LAN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40' :
                              iface.role === 'TRUNK' ? 'bg-purple-950 text-purple-300 border border-purple-700/40' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {iface.role}
                            </span>
                          </td>
                          <td className="p-3.5 text-[11px] text-slate-300">
                            <div>{iface.mac}</div>
                            {iface.permanent_mac && iface.permanent_mac !== iface.mac && (
                              <div className="text-[10px] text-slate-500">Real: {iface.permanent_mac}</div>
                            )}
                          </td>
                          <td className="p-3.5 font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1.5 w-fit ${
                              hasLink ? 'text-emerald-300 bg-emerald-950/80' : 'text-slate-400 bg-slate-950'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${hasLink ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                              {hasLink ? 'Conectado' : 'Sem Cabo'}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-300">
                            {iface.speed_mbps ? `${iface.speed_mbps} Mbps` : '-'}
                          </td>
                          <td className="p-3.5 text-slate-200">
                            {iface.ipv4.length > 0 ? (
                              iface.ipv4.map((ip, i) => <div key={i} className="text-emerald-400 font-bold">{ip}</div>)
                            ) : (
                              <span className="text-slate-500 italic font-sans">Nenhum IP atribuído</span>
                            )}
                          </td>
                          <td className="p-3.5 text-slate-400">{iface.mtu}</td>
                          <td className="p-3.5 text-right font-sans">
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
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition shadow"
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
          )}

          {/* TAB 2: VLANS 802.1Q */}
          {activeTab === 'vlans' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-400" />
                    VLANs 802.1Q (Trunk & Access)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Criação e gerenciamento de subinterfaces virtuais com tag 802.1Q para segmentação de tráfego.
                  </p>
                </div>
                <button
                  onClick={() => setShowVlanModal(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <Plus className="w-4 h-4" /> Nova VLAN
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">VLAN ID</th>
                      <th className="p-3.5">Subinterface Gerada</th>
                      <th className="p-3.5">Interface Física Pai</th>
                      <th className="p-3.5">Endereço IPv4 / CIDR</th>
                      <th className="p-3.5">Modo</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {vlans.length > 0 ? (
                      vlans.map((vl, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 font-bold text-purple-400">VLAN {vl.id}</td>
                          <td className="p-3.5 text-white font-semibold">{vl.parent_interface}.{vl.id}</td>
                          <td className="p-3.5 text-cyan-300">{vl.parent_interface}</td>
                          <td className="p-3.5 text-emerald-400">{vl.ipv4_cidr || '(Sem IP)'}</td>
                          <td className="p-3.5 font-sans"><span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-bold border border-purple-800">{vl.mode}</span></td>
                          <td className="p-3.5 text-right font-sans">
                            <button
                              onClick={() => handleDeleteVlan(`${vl.parent_interface}.${vl.id}`)}
                              className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-xs transition"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-500 italic font-sans">
                          Nenhuma VLAN 802.1Q configurada. Clique em '+ Nova VLAN' para criar subinterfaces.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LINUX BRIDGES */}
          {activeTab === 'bridges' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Router className="w-5 h-5 text-indigo-400" />
                    Linux Bridges (Pontes de Camada 2 & KVM)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Interliga placas de rede físicas a switches virtuais locais para containers e máquinas virtuais.
                  </p>
                </div>
                <button
                  onClick={() => setShowBridgeModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <Plus className="w-4 h-4" /> Nova Bridge
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Nome da Bridge</th>
                      <th className="p-3.5">Interfaces Membros (Escravas)</th>
                      <th className="p-3.5">Endereço IPv4 / CIDR</th>
                      <th className="p-3.5">STP (Spanning Tree)</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {bridges.length > 0 ? (
                      bridges.map((br, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 font-bold text-white">{br.name}</td>
                          <td className="p-3.5 text-indigo-300">{br.members?.join(', ') || '(Nenhum membro)'}</td>
                          <td className="p-3.5 text-emerald-400">{br.ipv4_cidr || '(Sem IP atribuído)'}</td>
                          <td className="p-3.5 font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              br.stp ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {br.stp ? 'Habilitado' : 'Desabilitado'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-sans">
                            <button
                              onClick={() => handleDeleteBridge(br.name)}
                              className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-xs transition"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 italic font-sans">
                          Nenhuma bridge configurada. Clique em '+ Nova Bridge' para criar pontes L2.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: BONDING */}
          {activeTab === 'bonds' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ArrowDownUp className="w-5 h-5 text-cyan-400" />
                    Link Aggregation (Bonding / LACP 802.3ad)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Agrega múltiplas portas físicas em um canal de dados redundante com tolerância a falhas.
                  </p>
                </div>
                <button
                  onClick={() => setShowBondModal(true)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <Plus className="w-4 h-4" /> Novo Bond
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Nome do Bond</th>
                      <th className="p-3.5">Modo de Operação</th>
                      <th className="p-3.5">Interfaces Escravas (Slaves)</th>
                      <th className="p-3.5">Endereço IPv4 / CIDR</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {bonds.length > 0 ? (
                      bonds.map((bo, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 font-bold text-cyan-300">{bo.name}</td>
                          <td className="p-3.5 font-sans font-semibold text-white">{bo.mode}</td>
                          <td className="p-3.5 text-slate-300">{bo.slaves?.join(', ') || '-'}</td>
                          <td className="p-3.5 text-emerald-400">{bo.ipv4_cidr || '(Sem IP)'}</td>
                          <td className="p-3.5 text-right font-sans">
                            <button
                              onClick={() => handleDeleteBond(bo.name)}
                              className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-xs transition"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 italic font-sans">
                          Nenhum bond configurado. Clique em '+ Novo Bond' para agregar interfaces.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: ROTEAMENTO L3 */}
          {activeTab === 'routes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-sky-400" />
                    Tabela de Roteamento L3 do Kernel (ip route)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Rotas estáticas do sistema operacional, rotas padrão de saída (gateways) e métricas.
                  </p>
                </div>
                <button
                  onClick={() => setShowRouteModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <Plus className="w-4 h-4" /> Adicionar Rota Estática
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px] font-sans">
                    <tr>
                      <th className="p-3.5">Destino / Rede</th>
                      <th className="p-3.5">Gateway (Next-Hop)</th>
                      <th className="p-3.5">Interface de Saída</th>
                      <th className="p-3.5">Métrica</th>
                      <th className="p-3.5">Origem / Protocolo</th>
                      <th className="p-3.5 text-right font-sans">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {routes.map((rt, i) => (
                      <tr key={i} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-bold text-white">{rt.destination}</td>
                        <td className="p-3.5 text-emerald-400">{rt.gateway || '(Direta / Conectada)'}</td>
                        <td className="p-3.5 text-cyan-300">{rt.interface || '-'}</td>
                        <td className="p-3.5 text-slate-400">{rt.metric || '-'}</td>
                        <td className="p-3.5 text-slate-500">{rt.protocol || 'kernel'}</td>
                        <td className="p-3.5 text-right font-sans">
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
          )}

          {/* TAB 6: ESCOPOS DHCP */}
          {activeTab === 'dhcp_scopes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-emerald-400" />
                    Configuração de Escopos DHCP (Pools por Interface)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Definição de subredes, faixas de distribuição, gateways e servidores DNS entregues via /etc/dhcp/dhcpd.conf.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/v1/network/dhcp/restart', { method: 'POST' });
                    const d = await res.json();
                    showToast(d.message || "Daemon DHCP reiniciado!", res.ok ? "success" : "error");
                    fetchVpnAndDhcp();
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reiniciar Serviço DHCP
                </button>
              </div>

              {/* Form de Escopo */}
              <form onSubmit={handleSaveDhcpScopeDirect} className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Criar / Ativar Escopo em Interface LAN</h3>
                  <span className="text-xs text-slate-500 font-mono">/etc/dhcp/dhcpd.conf</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Interface LAN / Bridge</label>
                    <select
                      value={scopeForm.iface}
                      onChange={e => setScopeForm({ ...scopeForm, iface: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
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
                    <label className="block text-slate-300 mb-1 font-semibold">Subrede CIDR</label>
                    <input
                      type="text"
                      value={scopeForm.subnet}
                      onChange={e => setScopeForm({ ...scopeForm, subnet: e.target.value })}
                      placeholder="192.168.1.0/24"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Gateway Padrão (Router)</label>
                    <input
                      type="text"
                      value={scopeForm.gateway}
                      onChange={e => setScopeForm({ ...scopeForm, gateway: e.target.value })}
                      placeholder="192.168.1.1"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Faixa Inicial (Range Start)</label>
                    <input
                      type="text"
                      value={scopeForm.start}
                      onChange={e => setScopeForm({ ...scopeForm, start: e.target.value })}
                      placeholder="192.168.1.100"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Faixa Final (Range End)</label>
                    <input
                      type="text"
                      value={scopeForm.end}
                      onChange={e => setScopeForm({ ...scopeForm, end: e.target.value })}
                      placeholder="192.168.1.200"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Servidores DNS Entregues</label>
                    <input
                      type="text"
                      value={scopeForm.dns}
                      onChange={e => setScopeForm({ ...scopeForm, dns: e.target.value })}
                      placeholder="192.168.1.1, 8.8.8.8"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
                  >
                    <Save className="w-4 h-4" /> Salvar e Ativar Escopo
                  </button>
                </div>
              </form>

              {/* Escopos Configurados */}
              {dhcpStatus?.scopes && dhcpStatus.scopes.length > 0 && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white">Escopos Ativos em Execução</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {dhcpStatus.scopes.map((sc, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-400 font-mono text-sm">{sc.subnet}/{sc.netmask}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700">Ativo</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300 font-mono pt-1">
                          <div><span className="text-slate-500 font-sans">Faixa:</span> {sc.range_start} - {sc.range_end}</div>
                          <div><span className="text-slate-500 font-sans">Gateway:</span> {sc.routers?.join(', ') || '-'}</div>
                          <div className="col-span-2"><span className="text-slate-500 font-sans">DNS:</span> {sc.dns_servers?.join(', ') || '-'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: RESERVAS ESTÁTICAS */}
          {activeTab === 'dhcp_static' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Key className="w-5 h-5 text-amber-400" />
                    Reservas Estáticas de IP (DHCP Static Leases / MAC Fixo)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Fixa endereços IP específicos para servidores, impressoras e estações baseado no MAC Address.
                  </p>
                </div>
                <button
                  onClick={() => setShowStaticLeaseModal(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <Plus className="w-4 h-4" /> Nova Reserva Estática
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px] font-sans">
                    <tr>
                      <th className="p-3.5">MAC Address</th>
                      <th className="p-3.5">Endereço IP Fixo</th>
                      <th className="p-3.5">Hostname</th>
                      <th className="p-3.5">Descrição</th>
                      <th className="p-3.5 text-right font-sans">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {staticLeases.length > 0 ? (
                      staticLeases.map((st, i) => (
                        <tr key={i} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 text-slate-300">{st.mac}</td>
                          <td className="p-3.5 text-amber-400 font-bold">{st.ip}</td>
                          <td className="p-3.5 text-white">{st.hostname}</td>
                          <td className="p-3.5 text-slate-400 font-sans">{st.description || '-'}</td>
                          <td className="p-3.5 text-right font-sans">
                            <button
                              onClick={() => handleDeleteStaticLease(st.mac)}
                              className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/40 text-rose-300 rounded text-[10px] transition"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 italic font-sans">
                          Nenhuma reserva estática cadastrada. Clique em '+ Nova Reserva Estática' para adicionar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: CONCESSÕES ATIVAS */}
          {activeTab === 'dhcp_leases' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Radio className="w-5 h-5 text-teal-400" />
                    Concessões DHCP Ativas em Tempo Real
                  </h2>
                  <p className="text-xs text-slate-400">
                    Dispositivos conectados na rede local que receberam endereço IP pelo servidor DHCP.
                  </p>
                </div>
                <span className="text-xs text-teal-400 font-mono bg-teal-950/60 border border-teal-800 px-3 py-1 rounded-full">
                  {activeLeases.length} clientes conectados
                </span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px] font-sans">
                    <tr>
                      <th className="p-3.5">Endereço IP</th>
                      <th className="p-3.5">MAC Address</th>
                      <th className="p-3.5">Hostname</th>
                      <th className="p-3.5">Expiração</th>
                      <th className="p-3.5 text-right font-sans">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {activeLeases.length ? (
                      activeLeases.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 text-emerald-400 font-bold">{l.ip}</td>
                          <td className="p-3.5 text-slate-300">{l.mac}</td>
                          <td className="p-3.5 text-white">{l.hostname || '-'}</td>
                          <td className="p-3.5 text-slate-400">{l.ends || l.expires_at || '-'}</td>
                          <td className="p-3.5 text-right font-sans">
                            <button
                              onClick={() => {
                                setStaticLeaseForm({ mac: l.mac, ip: l.ip, hostname: l.hostname || '', description: '' });
                                setShowStaticLeaseModal(true);
                              }}
                              className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 rounded text-xs transition font-semibold"
                            >
                              Tornar Estático
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 italic font-sans">
                          Nenhuma concessão ativa registrada no momento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: INTEGRAÇÃO AD-DNS */}
          {activeTab === 'ad_dns' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    Integração com Astral AD-DNS (Source of Truth)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Encaminhamento condicional sem duplicação de registros SRV, Kerberos ou DDNS do Samba AD.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/v1/network/dns/ad-integration', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(adConfig),
                    });
                    if (res.ok) showToast("Conditional Forwarding sincronizado com o AD!", "success");
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <RefreshCw className="w-4 h-4" /> Sincronizar c/ AD DC
                </button>
              </div>

              <div className="bg-slate-900/90 border border-indigo-500/30 p-6 rounded-xl space-y-4 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-white">Resolução de Nomes Sem Split-Brain</h3>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                      Consultas direcionadas ao domínio do Active Directory (<strong className="text-indigo-300 font-mono">{adConfig.ad_domain}</strong> e <strong className="text-indigo-300 font-mono">_msdcs.{adConfig.ad_domain}</strong>) são encaminhadas via <em>Conditional Forwarding</em> para os IPs do Controlador de Domínio (<strong className="text-indigo-300 font-mono">{adConfig.ad_dc_ips.join(', ')}:53</strong>).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800 text-xs font-mono">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block font-sans">Domínio AD DC Primário</span>
                    <strong className="text-indigo-300 text-sm">{adConfig.ad_domain}</strong>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block font-sans">IPs dos Controladores Samba AD</span>
                    <strong className="text-emerald-400 text-sm">{adConfig.ad_dc_ips.join(', ')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: WIREGUARD VPN */}
          {activeTab === 'wireguard' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-400" />
                    Servidor VPN WireGuard (:51820 UDP)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Acesso remoto seguro e interligação matriz-filial com criptografia de ponta a ponta.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-xl space-y-4 shadow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block font-sans">Subnet VPN</span>
                    <strong className="text-emerald-400 text-sm">{wireguard?.address_cidr || "10.100.0.1/24"}</strong>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block font-sans">Chave Pública do Host</span>
                    <strong className="text-slate-300 text-xs truncate block">{wireguard?.public_key || "Gerada automaticamente"}</strong>
                  </div>
                </div>

                <div className="pt-2">
                  <h4 className="text-xs font-bold text-white mb-3">Peers Cadastrados</h4>
                  <div className="space-y-2 text-xs font-mono">
                    {wireguard?.peers?.length ? wireguard.peers.map(p => (
                      <div key={p.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
                        <div>
                          <strong className="text-white block font-sans">{p.name}</strong>
                          <span className="text-slate-400 text-[11px]">{p.allowed_ips.join(', ')}</span>
                        </div>
                        <span className="text-emerald-400 text-[10px] bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded">Ativo</span>
                      </div>
                    )) : (
                      <div className="p-4 text-center text-slate-500 italic bg-slate-950 rounded-lg font-sans">
                        Nenhum peer remoto cadastrado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: CLOUDFLARE ZERO TRUST */}
          {activeTab === 'cloudflare' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-cyan-400" />
                  Cloudflare Zero Trust (cloudflared tunnels)
                </h2>
                <p className="text-xs text-slate-400">
                  Publicação segura de aplicações e conexão WARP privada sem abrir portas na WAN.
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-xl space-y-4 shadow">
                <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-300">Status do Daemon cloudflared:</span>
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                    cloudflare?.status === 'CONNECTED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {cloudflare?.status || 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: DIAGNÓSTICO (PING & ARP) */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-amber-400" />
                  Diagnóstico de Rede & Verificação de Conectividade
                </h2>
                <p className="text-xs text-slate-400">
                  Ferramentas embutidas de ping ICMP e inspeção da tabela de vizinhos ARP/NDP do kernel.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Teste de Ping ICMP
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pingTarget}
                      onChange={e => setPingTarget(e.target.value)}
                      placeholder="8.8.8.8 ou srvcloud.cloud"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                    <button
                      onClick={handlePingTest}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
                    >
                      <Play className="w-3.5 h-3.5" /> Disparar
                    </button>
                  </div>
                  {pingResult && (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono space-y-1">
                      <div className="text-emerald-400 font-bold">Destino: {pingResult.target} · Perda: {pingResult.packet_loss_percent}%</div>
                      {pingResult.avg_rtt_ms && <div className="text-cyan-300">RTT Médio: {pingResult.avg_rtt_ms.toFixed(2)} ms</div>}
                      <pre className="text-[10px] text-slate-400 overflow-x-auto pt-2 border-t border-slate-800">{pingResult.raw_output}</pre>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-indigo-400" />
                      Tabela ARP do Kernel
                    </h3>
                    <button onClick={handleFetchArp} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold">
                      <RefreshCw className="w-3 h-3" /> Atualizar ARP
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 text-xs font-mono">
                    {arpTable.length ? arpTable.map((a, i) => (
                      <div key={i} className="p-2 bg-slate-950 rounded flex items-center justify-between border border-slate-800">
                        <span className="text-white">{a.ip}</span>
                        <span className="text-slate-400">{a.mac}</span>
                        <span className="text-emerald-400 text-[10px]">{a.interface}</span>
                      </div>
                    )) : (
                      <div className="text-center p-4 text-slate-500 italic font-sans">
                        Clique em 'Atualizar ARP' para ler as entradas de vizinhos.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 13: ROLLBACK & DECLARATIVO */}
          {activeTab === 'declarative' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Save className="w-5 h-5 text-rose-400" />
                    Estado Declarativo & Mecanismo de Auto-Rollback
                  </h2>
                  <p className="text-xs text-slate-400">
                    Aplicações com temporizador de 60 segundos: reversão automática caso a conectividade seja perdida.
                  </p>
                </div>
                <button
                  onClick={handleApplyDeclarative}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                >
                  <Save className="w-4 h-4" /> Aplicar c/ Rollback (60s)
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-xl space-y-4 shadow">
                <h3 className="text-sm font-bold text-white">Segurança Contra Perda de Acesso</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Toda alteração declarativa de rede é salva em um snapshot de segurança com reversão automática. Se você alterar um IP, rota ou VLAN e não conseguir confirmar na barra superior em 60 segundos, o kernel reverte o estado anterior automaticamente.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ============================================================================== */}
      {/* MODALS OPERACIONAIS */}
      {/* ============================================================================== */}

      {/* 1. Modal de Configuração de Interface */}
      {editingIface && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 border border-indigo-500/30">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Papel da Interface (Role)</label>
                  <select
                    value={ifaceForm.role}
                    onChange={e => setIfaceForm({ ...ifaceForm, role: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="apply">Manter Ativo / Aplicar Parâmetros</option>
                    <option value="up">Forçar Ativação (ip link set up)</option>
                    <option value="down">Desativar Interface (ip link set down)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Método de Endereçamento IPv4</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIfaceForm({ ...ifaceForm, method: 'dhcp' })}
                    className={`py-2 rounded-lg text-xs font-semibold border transition ${
                      ifaceForm.method === 'dhcp'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    DHCP Cliente (Automático)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIfaceForm({ ...ifaceForm, method: 'static' })}
                    className={`py-2 rounded-lg text-xs font-semibold border transition ${
                      ifaceForm.method === 'static'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    IP Estático (Manual)
                  </button>
                </div>
              </div>

              {ifaceForm.method === 'static' && (
                <div className="space-y-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Endereço IPv4 / CIDR</label>
                    <input
                      type="text"
                      value={ifaceForm.ipv4_cidr}
                      onChange={e => setIfaceForm({ ...ifaceForm, ipv4_cidr: e.target.value })}
                      placeholder="ex.: 192.168.1.1/24"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Servidores DNS</label>
                      <input
                        type="text"
                        value={ifaceForm.dns}
                        onChange={e => setIfaceForm({ ...ifaceForm, dns: e.target.value })}
                        placeholder="1.1.1.1, 8.8.8.8"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">MTU da Interface</label>
                  <input
                    type="number"
                    value={ifaceForm.mtu}
                    onChange={e => setIfaceForm({ ...ifaceForm, mtu: e.target.value })}
                    placeholder="1500"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Clonar MAC (Opcional)</label>
                  <input
                    type="text"
                    value={ifaceForm.mac}
                    onChange={e => setIfaceForm({ ...ifaceForm, mac: e.target.value })}
                    placeholder="00:11:22:33:44:55"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
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
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar e Aplicar no Kernel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Nova VLAN */}
      {showVlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateVlan} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Nome Subinterface</label>
                  <input
                    type="text"
                    value={vlanForm.name || (vlanForm.parent_interface ? `${vlanForm.parent_interface}.${vlanForm.vlan_id}` : '')}
                    onChange={e => setVlanForm({ ...vlanForm, name: e.target.value })}
                    placeholder="ex.: ens34.10"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowVlanModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition shadow">
                Criar VLAN no Kernel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Modal Nova Bridge */}
      {showBridgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBridge} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Interfaces Membros (Escravas)</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
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

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowBridgeModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow">
                Criar Bridge no Kernel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Modal Novo Bond */}
      {showBondModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBond} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Modo de Agregação</label>
                  <select
                    value={bondForm.mode}
                    onChange={e => setBondForm({ ...bondForm, mode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="802.3ad">802.3ad LACP (Dinâmico)</option>
                    <option value="active-backup">Active-Backup</option>
                    <option value="balance-rr">Balance Round-Robin</option>
                    <option value="balance-xor">Balance XOR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Interfaces Escravas (Slaves)</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowBondModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition shadow">
                Criar Bond no Kernel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Modal Rota Estática */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateRoute} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Globe className="w-5 h-5 text-sky-400" />
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Interface de Saída</label>
                  <select
                    value={routeForm.interface}
                    onChange={e => setRouteForm({ ...routeForm, interface: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowRouteModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow">
                Adicionar Rota
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. Modal Reserva Estática DHCP */}
      {showStaticLeaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateStaticLease} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Key className="w-5 h-5 text-amber-400" />
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Descrição / Observações</label>
                <input
                  type="text"
                  value={staticLeaseForm.description}
                  onChange={e => setStaticLeaseForm({ ...staticLeaseForm, description: e.target.value })}
                  placeholder="ex.: Impressora HP LaserJet 1020"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowStaticLeaseModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow">
                Salvar Reserva no DHCP
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 text-center text-xs text-slate-500 bg-slate-950">
        Astral Network · Enterprise Routing & Security Platform · Licenciado sob termos da SrvCloud
      </footer>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, badge }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition cursor-pointer w-full text-left ${
        active 
          ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-950/50' 
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </div>
      {badge !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
          active ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
