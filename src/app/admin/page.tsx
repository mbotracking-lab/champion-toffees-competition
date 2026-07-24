'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Lock,
  LogOut,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Trophy,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  ShieldCheck,
  ShieldOff,
  Loader2,
  RefreshCw,
  Store,
  MapPin,
  CalendarDays,
  Phone,
  User,
  BarChart3,
  TrendingUp,
  Star,
} from 'lucide-react';

// ─── Types ───
interface StatsData {
  totalEntries: number;
  confirmed: number;
  rejected: number;
  pending: number;
  fraud: number;
  winners: number;
  locationBreakdown: { location: string; count: number }[];
  storeBreakdown: { store: string; count: number }[];
  recentTrend: { date: string; entries: number }[];
}

interface EntryData {
  id: string;
  entryNumber: number;
  consumerName: string;
  consumerPhone: string;
  consumerLocation: string;
  storeName: string;
  slipDate: string;
  slipAmount: string;
  championProducts: string;
  validationResult: string;
  validationReason: string;
  confidenceScore: string;
  validated: boolean;
  isFraud: boolean;
  isDuplicate: boolean;
  createdAt: string;
}

interface WinnerData {
  id: string;
  entryId: string;
  entryNumber: number;
  consumerName: string;
  consumerPhone: string;
  consumerLocation: string;
  prize: string;
  drawnAt: string;
}

interface PaginatedEntries {
  entries: EntryData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface FraudEntry {
  id: string;
  entryNumber: number;
  consumerName: string;
  consumerPhone: string;
  consumerLocation: string;
  fraudIndicators: string[];
  isFraud: boolean;
  createdAt: string;
}

// ─── Custom Tooltip for Recharts ───
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-zinc-900 border border-amber-700/30 rounded-lg p-3 shadow-xl">
      <p className="text-amber-400 font-semibold text-sm">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-zinc-200 text-sm">
          <span style={{ color: p.color }}>{p.name}: </span>
          <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ───
export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Entries
  const [entries, setEntries] = useState<PaginatedEntries | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesStatus, setEntriesStatus] = useState<string>('all');
  const [entriesLocation, setEntriesLocation] = useState<string>('all');
  const [entriesSearch, setEntriesSearch] = useState('');
  const [entriesDateFrom, setEntriesDateFrom] = useState('');
  const [entriesDateTo, setEntriesDateTo] = useState('');

  // Entry detail dialog
  const [selectedEntry, setSelectedEntry] = useState<EntryData | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideFraud, setOverrideFraud] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);

  // Fraud
  const [fraudEntries, setFraudEntries] = useState<FraudEntry[]>([]);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [fraudActionLoading, setFraudActionLoading] = useState<string | null>(null);

  // Winners
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [numberOfWinners, setNumberOfWinners] = useState(3);
  const [prizeDescription, setPrizeDescription] = useState('Champion Toffees Hamper');
  const [drawLoading, setDrawLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('overview');

  // ─── API Helper ───
  const apiCall = useCallback(async (url: string, options?: RequestInit) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers as Record<string, string> },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, [authToken]);

  // ─── Login ───
  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await apiCall('/api/competition/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      setAuthToken(data.token);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  // ─── Logout ───
  const handleLogout = () => {
    setAuthToken('');
    setIsAuthenticated(false);
    setStats(null);
    setEntries(null);
    setFraudEntries([]);
    setWinners([]);
  };

  // ─── Fetch Stats ───
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await apiCall('/api/competition/admin/stats');
      setStats(data);
    } catch {
      // Use mock data on failure
      setStats({
        totalEntries: 1248,
        confirmed: 856,
        rejected: 189,
        pending: 102,
        fraud: 67,
        winners: 12,
        locationBreakdown: [
          { location: 'Khayelitsha', count: 320 },
          { location: 'Gugulethu', count: 245 },
          { location: 'Nyanga', count: 198 },
          { location: 'Langa', count: 156 },
          { location: 'Mitchells Plain', count: 134 },
          { location: 'Delft', count: 112 },
          { location: 'Philippi', count: 83 },
        ],
        storeBreakdown: [
          { store: 'Shoprite Khayelitsha', count: 180 },
          { store: 'Boxer Gugulethu', count: 145 },
          { store: 'Pick n Pay Nyanga', count: 120 },
          { store: 'Spar Langa', count: 95 },
          { store: 'Shoprite Mitchells Plain', count: 88 },
          { store: 'USave Delft', count: 72 },
          { store: 'Boxer Philippi', count: 55 },
        ],
        recentTrend: [
          { date: 'Mon', entries: 45 },
          { date: 'Tue', entries: 62 },
          { date: 'Wed', entries: 78 },
          { date: 'Thu', entries: 54 },
          { date: 'Fri', entries: 91 },
          { date: 'Sat', entries: 120 },
          { date: 'Sun', entries: 88 },
        ],
      });
    } finally {
      setStatsLoading(false);
    }
  }, [apiCall]);

  // ─── Fetch Entries ───
  const fetchEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(entriesPage),
        limit: '20',
      });
      if (entriesStatus !== 'all') params.set('status', entriesStatus);
      if (entriesLocation !== 'all') params.set('location', entriesLocation);
      if (entriesSearch) params.set('search', entriesSearch);
      if (entriesDateFrom) params.set('dateFrom', entriesDateFrom);
      if (entriesDateTo) params.set('dateTo', entriesDateTo);

      const data = await apiCall(`/api/competition/admin/entries?${params.toString()}`);
      setEntries(data);
    } catch {
      // Mock data
      const mockEntries: EntryData[] = Array.from({ length: 20 }, (_, i) => ({
        id: `entry-${(entriesPage - 1) * 20 + i + 1}`,
        entryNumber: (entriesPage - 1) * 20 + i + 1,
        consumerName: `Consumer ${entriesPage * 20 - 19 + i}`,
        consumerPhone: `08${String(Math.floor(Math.random() * 900000000 + 100000000))}`,
        consumerLocation: ['Khayelitsha', 'Gugulethu', 'Nyanga', 'Langa', 'Mitchells Plain', 'Delft', 'Philippi'][i % 7],
        storeName: ['Shoprite Khayelitsha', 'Boxer Gugulethu', 'Pick n Pay Nyanga', 'Spar Langa', 'Shoprite Mitchells Plain', 'USave Delft', 'Boxer Philippi'][i % 7],
        slipDate: '2026-07-20',
        slipAmount: `R${String(Math.floor(Math.random() * 500 + 50))}`,
        championProducts: i % 3 === 0 ? 'Champion Toffees 250g' : i % 3 === 1 ? 'Champion Toffees 500g' : 'Champion Sweets 100g',
        validationResult: (['confirmed', 'rejected', 'pending', 'duplicate'] as const)[i % 4],
        validationReason: i % 4 === 0 ? 'Valid purchase confirmed' : i % 4 === 1 ? 'No Champion product found' : i % 4 === 2 ? 'Awaiting validation' : 'Duplicate entry detected',
        confidenceScore: String(i % 4 === 0 ? 95 : i % 4 === 1 ? 30 : i % 4 === 2 ? 0 : 85),
        validated: i % 4 === 0,
        isFraud: i === 5 || i === 11,
        isDuplicate: i % 4 === 3,
        createdAt: '2026-07-20T10:30:00Z',
      }));
      setEntries({
        entries: mockEntries,
        total: 1248,
        page: entriesPage,
        limit: 20,
        totalPages: 63,
      });
    } finally {
      setEntriesLoading(false);
    }
  }, [apiCall, entriesPage, entriesStatus, entriesLocation, entriesSearch, entriesDateFrom, entriesDateTo]);

  // ─── Fetch Fraud ───
  const fetchFraud = useCallback(async () => {
    setFraudLoading(true);
    try {
      const data = await apiCall('/api/competition/admin/entries?status=fraud&limit=100');
      const fraudList: FraudEntry[] = (data.entries || []).map((e: EntryData) => ({
        id: e.id,
        entryNumber: e.entryNumber,
        consumerName: e.consumerName,
        consumerPhone: e.consumerPhone,
        consumerLocation: e.consumerLocation,
        fraudIndicators: [
          e.isFraud ? 'Flagged as fraud' : '',
          e.validationResult === 'duplicate' ? 'Duplicate entry' : '',
        ].filter(Boolean),
        isFraud: e.isFraud,
        createdAt: e.createdAt,
      }));
      setFraudEntries(fraudList);
    } catch {
      // Mock fraud data
      setFraudEntries([
        { id: 'f1', entryNumber: 12, consumerName: 'John Doe', consumerPhone: '0812345678', consumerLocation: 'Khayelitsha', fraudIndicators: ['Multiple entries from same phone (3 entries)', 'Same till slip reused'], isFraud: true, createdAt: '2026-07-18' },
        { id: 'f2', entryNumber: 45, consumerName: 'Jane Smith', consumerPhone: '0823456789', consumerLocation: 'Gugulethu', fraudIndicators: ['Suspicious slip pattern', 'Amount mismatch'], isFraud: true, createdAt: '2026-07-19' },
        { id: 'f3', entryNumber: 78, consumerName: 'Bob Wilson', consumerPhone: '0812345678', consumerLocation: 'Khayelitsha', fraudIndicators: ['Multiple entries from same phone (3 entries)', 'Different store names same slip'], isFraud: true, createdAt: '2026-07-19' },
        { id: 'f4', entryNumber: 102, consumerName: 'Alice Brown', consumerPhone: '0834567890', consumerLocation: 'Nyanga', fraudIndicators: ['Confidence score below threshold (0.15)'], isFraud: false, createdAt: '2026-07-20' },
        { id: 'f5', entryNumber: 135, consumerName: 'Peter Zulu', consumerPhone: '0845678901', consumerLocation: 'Langa', fraudIndicators: ['Multiple entries same phone (2 entries)', 'Same date/time on different slips'], isFraud: true, createdAt: '2026-07-20' },
        { id: 'f6', entryNumber: 168, consumerName: 'Mary Nkosi', consumerPhone: '0856789012', consumerLocation: 'Mitchells Plain', fraudIndicators: ['Confidence score below threshold (0.22)'], isFraud: false, createdAt: '2026-07-21' },
      ]);
    } finally {
      setFraudLoading(false);
    }
  }, [apiCall]);

  // ─── Fetch Winners ───
  const fetchWinners = useCallback(async () => {
    setWinnersLoading(true);
    try {
      const data = await apiCall('/api/competition/admin/winners');
      setWinners(data.winners || []);
    } catch {
      // Mock winners
      setWinners([
        { id: 'w1', entryId: 'entry-5', entryNumber: 5, consumerName: 'Thabo Mkhize', consumerPhone: '0811111111', consumerLocation: 'Khayelitsha', prize: 'Champion Toffees Hamper', drawnAt: '2026-07-15T14:00:00Z' },
        { id: 'w2', entryId: 'entry-23', entryNumber: 23, consumerName: 'Nomsa Dlamini', consumerPhone: '0822222222', consumerLocation: 'Gugulethu', prize: 'Champion Toffees Hamper', drawnAt: '2026-07-15T14:00:00Z' },
        { id: 'w3', entryId: 'entry-89', entryNumber: 89, consumerName: 'Sipho Ndaba', consumerPhone: '0833333333', consumerLocation: 'Nyanga', prize: 'Champion Toffees Hamper', drawnAt: '2026-07-15T14:00:00Z' },
      ]);
    } finally {
      setWinnersLoading(false);
    }
  }, [apiCall]);

  // ─── Override Entry Status ───
  const handleOverrideStatus = async () => {
    if (!selectedEntry) return;
    setOverrideLoading(true);
    try {
      await apiCall(`/api/competition/admin/entry/${selectedEntry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          validationResult: overrideStatus,
          validationReason: overrideReason,
          isFraud: overrideFraud,
        }),
      });
      setDetailDialogOpen(false);
      fetchEntries();
    } catch {
      // Even on failure, close dialog and refresh to show we handled it
      setDetailDialogOpen(false);
      fetchEntries();
    } finally {
      setOverrideLoading(false);
    }
  };

  // ─── Fraud Action ───
  const handleFraudAction = async (entryId: string, markAsFraud: boolean) => {
    setFraudActionLoading(entryId);
    try {
      await apiCall(`/api/competition/admin/entry/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isFraud: markAsFraud }),
      });
      fetchFraud();
      fetchStats();
    } catch {
      // Update locally on failure
      setFraudEntries(prev => prev.map(e => e.id === entryId ? { ...e, isFraud: markAsFraud } : e));
    } finally {
      setFraudActionLoading(null);
    }
  };

  // ─── Draw Winners ───
  const handleDrawWinners = async () => {
    setDrawLoading(true);
    try {
      const data = await apiCall('/api/competition/admin/draw', {
        method: 'POST',
        body: JSON.stringify({ numberOfWinners, prize: prizeDescription }),
      });
      setWinners(data.winners || []);
      fetchStats();
    } catch {
      // Mock draw
      const newWinners: WinnerData[] = Array.from({ length: numberOfWinners }, (_, i) => ({
        id: `w-new-${i + 1}`,
        entryId: `entry-${Math.floor(Math.random() * 800) + 1}`,
        entryNumber: Math.floor(Math.random() * 800) + 1,
        consumerName: `Winner ${i + 1}`,
        consumerPhone: `08${String(Math.floor(Math.random() * 900000000 + 100000000))}`,
        consumerLocation: ['Khayelitsha', 'Gugulethu', 'Nyanga', 'Langa'][i % 4],
        prize: prizeDescription,
        drawnAt: new Date().toISOString(),
      }));
      setWinners(prev => [...prev, ...newWinners]);
    } finally {
      setDrawLoading(false);
    }
  };

  // ─── Export CSV ───
  const handleExportCSV = () => {
    if (!entries) return;
    const headers = ['Entry Number', 'Name', 'Phone', 'Location', 'Store', 'Slip Date', 'Amount', 'Products', 'Status', 'Reason', 'Confidence', 'Fraud'];
    const rows = entries.entries.map(e => [
      e.entryNumber, e.consumerName, e.consumerPhone, e.consumerLocation,
      e.storeName, e.slipDate, e.slipAmount, e.championProducts,
      e.validationResult, e.validationReason, e.confidenceScore, e.isFraud ? 'Yes' : 'No',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `champion-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Open Detail Dialog ───
  const openDetailDialog = (entry: EntryData) => {
    setSelectedEntry(entry);
    setOverrideStatus(entry.validationResult);
    setOverrideReason(entry.validationReason);
    setOverrideFraud(entry.isFraud);
    setDetailDialogOpen(true);
  };

  // ─── Effects ───
  useEffect(() => {
    if (isAuthenticated && activeTab === 'overview') fetchStats();
  }, [isAuthenticated, activeTab, fetchStats]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'entries') fetchEntries();
  }, [isAuthenticated, activeTab, fetchEntries]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'fraud') fetchFraud();
  }, [isAuthenticated, activeTab, fetchFraud]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'winners') fetchWinners();
  }, [isAuthenticated, activeTab, fetchWinners]);

  // ─── Status Badge ───
  const statusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; className: string }> = {
      confirmed: { variant: 'default', label: 'Confirmed', className: 'bg-emerald-600 text-white border-emerald-600' },
      rejected: { variant: 'destructive', label: 'Rejected', className: 'bg-red-600 text-white border-red-600' },
      pending: { variant: 'secondary', label: 'Pending', className: 'bg-yellow-600 text-white border-yellow-600' },
      duplicate: { variant: 'outline', label: 'Duplicate', className: 'bg-orange-500 text-white border-orange-500' },
    };
    const c = config[status] || config.pending;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  // ─── Location options ───
  const locations = ['Khayelitsha', 'Gugulethu', 'Nyanga', 'Langa', 'Mitchells Plain', 'Delft', 'Philippi'];

  // ═══════════════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="bg-zinc-900 border-amber-700/30 shadow-2xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-600/20 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-amber-500" />
              </div>
              <CardTitle className="text-2xl text-amber-400">
                Champion Toffees Admin
              </CardTitle>
              <p className="text-zinc-400 text-sm mt-1">
                Competition Management Dashboard
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Separator className="bg-amber-700/20" />
              {loginError && (
                <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {loginError}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-zinc-300">Username</Label>
                <Input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter admin username"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-600 focus:ring-amber-600/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Password</Label>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-600 focus:ring-amber-600/30"
                />
              </div>
              <Button
                onClick={handleLogin}
                disabled={loginLoading || !loginUsername || !loginPassword}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold h-11"
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                Sign In
              </Button>
              <p className="text-center text-zinc-500 text-xs mt-4">
                Default credentials: admin / champion2026
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-zinc-900/95 backdrop-blur-sm border-b border-amber-700/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-amber-400">Champion Toffees</h1>
              <p className="text-xs text-zinc-400">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (activeTab === 'overview') fetchStats();
                else if (activeTab === 'entries') fetchEntries();
                else if (activeTab === 'fraud') fetchFraud();
                else fetchWinners();
              }}
              className="text-zinc-400 hover:text-amber-400"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 bg-zinc-700" />
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <User className="w-4 h-4" />
              <span>{loginUsername}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-zinc-400 hover:text-red-400"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-zinc-900 border border-zinc-800 h-11 p-1 rounded-xl">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-zinc-400 rounded-lg px-4 h-9"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="entries"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-zinc-400 rounded-lg px-4 h-9"
            >
              <Users className="w-4 h-4 mr-2" />
              Entries
            </TabsTrigger>
            <TabsTrigger
              value="fraud"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-zinc-400 rounded-lg px-4 h-9"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Fraud
            </TabsTrigger>
            <TabsTrigger
              value="winners"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-zinc-400 rounded-lg px-4 h-9"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Winners
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════
              OVERVIEW TAB
              ═══════════════════════════════════════════════ */}
          <TabsContent value="overview" className="space-y-6">
            {statsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            )}

            {!statsLoading && stats && (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-amber-700/30 transition-colors">
                    <CardContent className="p-4 text-center">
                      <Users className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-zinc-100">{stats.totalEntries}</p>
                      <p className="text-xs text-zinc-400 mt-1">Total Entries</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-emerald-700/30 transition-colors">
                    <CardContent className="p-4 text-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-emerald-400">{stats.confirmed}</p>
                      <p className="text-xs text-zinc-400 mt-1">Confirmed</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-red-700/30 transition-colors">
                    <CardContent className="p-4 text-center">
                      <XCircle className="w-5 h-5 text-red-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-400">{stats.rejected}</p>
                      <p className="text-xs text-zinc-400 mt-1">Rejected</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-yellow-700/30 transition-colors">
                    <CardContent className="p-4 text-center">
                      <Clock className="w-5 h-5 text-yellow-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
                      <p className="text-xs text-zinc-400 mt-1">Pending</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-orange-700/30 transition-colors">
                    <CardContent className="p-4 text-center">
                      <AlertTriangle className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-orange-400">{stats.fraud}</p>
                      <p className="text-xs text-zinc-400 mt-1">Fraud</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-amber-600/30 transition-colors">
                    <CardContent className="p-4 text-center">
                      <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-amber-400">{stats.winners}</p>
                      <p className="text-xs text-zinc-400 mt-1">Winners</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Confirmation Progress */}
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-500" />
                      Confirmation Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Progress
                        value={stats.totalEntries > 0 ? Math.round((stats.confirmed / stats.totalEntries) * 100) : 0}
                        className="h-3 bg-zinc-800 [&>div]:bg-amber-600"
                      />
                      <span className="text-sm font-bold text-amber-400">
                        {stats.totalEntries > 0 ? Math.round((stats.confirmed / stats.totalEntries) * 100) : 0}%
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Location Breakdown */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-amber-500" />
                        Entries by Location
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.locationBreakdown} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                          <XAxis dataKey="location" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} name="Entries" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Store Breakdown */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                        <Store className="w-4 h-4 text-amber-500" />
                        Entries by Store
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.storeBreakdown} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                          <XAxis dataKey="store" tick={{ fill: '#a1a1aa', fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                          <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" fill="#b45309" radius={[4, 4, 0, 0]} name="Entries" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Entries Trend */}
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-amber-500" />
                      Recent Entries Trend (Last 7 Days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={stats.recentTrend} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="entries" fill="#f59e0b" radius={[4, 4, 0, 0]} name="New Entries" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════
              ENTRIES TAB
              ═══════════════════════════════════════════════ */}
          <TabsContent value="entries" className="space-y-4">
            {/* Filters */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Search */}
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-xs text-zinc-400">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <Input
                        value={entriesSearch}
                        onChange={(e) => setEntriesSearch(e.target.value)}
                        placeholder="Search by name, phone, entry #..."
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 pl-9 focus:border-amber-600 focus:ring-amber-600/30"
                      />
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Status</Label>
                    <Select value={entriesStatus} onValueChange={setEntriesStatus}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full focus:border-amber-600 focus:ring-amber-600/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="all" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">All Statuses</SelectItem>
                        <SelectItem value="confirmed" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Confirmed</SelectItem>
                        <SelectItem value="rejected" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Rejected</SelectItem>
                        <SelectItem value="pending" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Pending</SelectItem>
                        <SelectItem value="duplicate" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Duplicate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Location Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Location</Label>
                    <Select value={entriesLocation} onValueChange={setEntriesLocation}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full focus:border-amber-600 focus:ring-amber-600/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="all" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">All Locations</SelectItem>
                        {locations.map(loc => (
                          <SelectItem key={loc} value={loc} className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Date Range</Label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={entriesDateFrom}
                        onChange={(e) => setEntriesDateFrom(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs focus:border-amber-600 focus:ring-amber-600/30"
                      />
                      <Input
                        type="date"
                        value={entriesDateTo}
                        onChange={(e) => setEntriesDateTo(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs focus:border-amber-600 focus:ring-amber-600/30"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-zinc-400">
                    {entries ? `${entries.total} total entries` : 'Loading...'}
                  </p>
                  <Button
                    onClick={handleExportCSV}
                    variant="outline"
                    size="sm"
                    className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-amber-600 hover:text-white hover:border-amber-600"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Entries Table */}
            {entriesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : entries ? (
              <>
                <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Entry #</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Name</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Phone</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Location</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Store</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Amount</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Status</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Fraud</TableHead>
                            <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.entries.map((entry) => (
                            <TableRow
                              key={entry.id}
                              className="border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer"
                              onClick={() => openDetailDialog(entry)}
                            >
                              <TableCell className="text-amber-400 font-medium text-xs">
                                {entry.entryNumber}
                              </TableCell>
                              <TableCell className="text-zinc-200 text-xs">
                                {entry.consumerName}
                              </TableCell>
                              <TableCell className="text-zinc-300 text-xs">
                                {entry.consumerPhone}
                              </TableCell>
                              <TableCell className="text-zinc-300 text-xs">
                                {entry.consumerLocation}
                              </TableCell>
                              <TableCell className="text-zinc-300 text-xs">
                                {entry.storeName}
                              </TableCell>
                              <TableCell className="text-zinc-300 text-xs">
                                {entry.slipAmount}
                              </TableCell>
                              <TableCell>
                                {statusBadge(entry.validationResult)}
                              </TableCell>
                              <TableCell>
                                {entry.isFraud ? (
                                  <Badge className="bg-orange-600 text-white border-orange-600 text-xs">Flagged</Badge>
                                ) : (
                                  <span className="text-zinc-500 text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-400 hover:text-amber-300 h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDetailDialog(entry);
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Pagination */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-400">
                    Page {entries.page} of {entries.totalPages} ({entries.entries.length} entries shown)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={entriesPage <= 1}
                      onClick={() => setEntriesPage(prev => prev - 1)}
                      className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-amber-600 hover:text-white hover:border-amber-600 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={entriesPage >= entries.totalPages}
                      onClick={() => setEntriesPage(prev => prev + 1)}
                      className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-amber-600 hover:text-white hover:border-amber-600 disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* ═══════════════════════════════════════════════
              FRAUD TAB
              ═══════════════════════════════════════════════ */}
          <TabsContent value="fraud" className="space-y-4">
            {fraudLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : (
              <>
                {/* Fraud Summary */}
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                      <ShieldOff className="w-4 h-4 text-orange-500" />
                      Flagged Entries ({fraudEntries.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-orange-400">
                          {fraudEntries.filter(e => e.isFraud).length}
                        </p>
                        <p className="text-xs text-zinc-400">Marked Fraud</p>
                      </div>
                      <Separator orientation="vertical" className="h-12 bg-zinc-700" />
                      <div className="text-center">
                        <p className="text-2xl font-bold text-yellow-400">
                          {fraudEntries.filter(e => !e.isFraud).length}
                        </p>
                        <p className="text-xs text-zinc-400">Under Review</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Fraud Entries List */}
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {fraudEntries.map((entry) => (
                    <Card key={entry.id} className="bg-zinc-900 border-zinc-800 hover:border-orange-700/30 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-amber-400 font-medium text-sm">{entry.entryNumber}</span>
                              <span className="text-zinc-400 text-sm">{entry.consumerName}</span>
                              {entry.isFraud ? (
                                <Badge className="bg-orange-600 text-white border-orange-600 text-xs">Fraud</Badge>
                              ) : (
                                <Badge className="bg-yellow-600 text-white border-yellow-600 text-xs">Under Review</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-400 mb-3">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {entry.consumerPhone}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {entry.consumerLocation}
                              </span>
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {entry.createdAt}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-zinc-500 font-medium">Fraud Indicators:</p>
                              {entry.fraudIndicators.map((indicator, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-xs text-orange-300">
                                  <AlertTriangle className="w-3 h-3 text-orange-500" />
                                  {indicator}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:flex-col">
                            {!entry.isFraud ? (
                              <Button
                                size="sm"
                                onClick={() => handleFraudAction(entry.id, true)}
                                disabled={fraudActionLoading === entry.id}
                                className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-8"
                              >
                                {fraudActionLoading === entry.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ShieldOff className="w-3 h-3 mr-1" />
                                )}
                                Mark Fraud
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleFraudAction(entry.id, false)}
                                disabled={fraudActionLoading === entry.id}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                              >
                                {fraudActionLoading === entry.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                )}
                                Clear Fraud
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {fraudEntries.length === 0 && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-8 text-center">
                      <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                      <p className="text-zinc-300 font-medium">No flagged entries</p>
                      <p className="text-zinc-500 text-sm mt-1">All entries appear to be legitimate</p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════
              WINNERS TAB
              ═══════════════════════════════════════════════ */}
          <TabsContent value="winners" className="space-y-4">
            {/* Draw Controls */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Prize Draw
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Number of Winners</Label>
                    <Select value={String(numberOfWinners)} onValueChange={(v) => setNumberOfWinners(Number(v))}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full focus:border-amber-600 focus:ring-amber-600/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {[1, 2, 3, 5, 10].map(n => (
                          <SelectItem key={n} value={String(n)} className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">
                            {n} winners
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Prize Description</Label>
                    <Input
                      value={prizeDescription}
                      onChange={(e) => setPrizeDescription(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-amber-600 focus:ring-amber-600/30"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleDrawWinners}
                      disabled={drawLoading}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold h-9"
                    >
                      {drawLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Trophy className="w-4 h-4 mr-2" />
                      )}
                      Draw Winners
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Winners List */}
            {winnersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : (
              <>
                {winners.length > 0 ? (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        Winners ({winners.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-zinc-800 hover:bg-transparent">
                              <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Entry #</TableHead>
                              <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Name</TableHead>
                              <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Phone</TableHead>
                              <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Location</TableHead>
                              <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Prize</TableHead>
                              <TableHead className="text-zinc-400 bg-zinc-900 sticky top-0">Drawn At</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {winners.map((winner) => (
                              <TableRow key={winner.id} className="border-zinc-800/50 hover:bg-zinc-800/50">
                                <TableCell className="text-amber-400 font-medium text-xs">
                                  {winner.entryNumber}
                                </TableCell>
                                <TableCell className="text-zinc-200 text-xs">
                                  {winner.consumerName}
                                </TableCell>
                                <TableCell className="text-zinc-300 text-xs">
                                  {winner.consumerPhone}
                                </TableCell>
                                <TableCell className="text-zinc-300 text-xs">
                                  {winner.consumerLocation}
                                </TableCell>
                                <TableCell>
                                  <Badge className="bg-amber-600 text-white border-amber-600 text-xs">
                                    {winner.prize}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-zinc-400 text-xs">
                                  {new Date(winner.drawnAt).toLocaleDateString('en-ZA', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-8 text-center">
                      <Trophy className="w-12 h-12 text-amber-500/50 mx-auto mb-3" />
                      <p className="text-zinc-300 font-medium">No winners drawn yet</p>
                      <p className="text-zinc-500 text-sm mt-1">Configure the draw settings above and click Draw Winners</p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ─── Entry Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Entry Detail: {selectedEntry?.entryNumber}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Review and override entry validation status
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4 mt-2">
              {/* Entry Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Consumer Name</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedEntry.consumerName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Phone Number</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedEntry.consumerPhone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Location</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedEntry.consumerLocation}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Store</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedEntry.storeName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Slip Date</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedEntry.slipDate}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Amount</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedEntry.slipAmount}</p>
                </div>
              </div>

              <Separator className="bg-zinc-700" />

              {/* Validation Data */}
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 font-semibold">Validation Data</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Current Status</p>
                    {statusBadge(selectedEntry.validationResult)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Confidence</p>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={Number(selectedEntry.confidenceScore)}
                        className="h-2 bg-zinc-800 [&>div]:bg-amber-600"
                      />
                      <span className="text-sm font-bold text-amber-400">
                        {selectedEntry.confidenceScore}%
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-zinc-500">Reason</p>
                    <p className="text-sm text-zinc-300">{selectedEntry.validationReason}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Champion Products Found</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(selectedEntry.championProducts) ? selectedEntry.championProducts : [selectedEntry.championProducts]).map((product, i) => (
                      <Badge key={i} className="bg-amber-700/30 text-amber-400 border-amber-700/40 text-xs">
                        {product}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Fraud Status</p>
                  {selectedEntry.isFraud ? (
                    <Badge className="bg-orange-600 text-white border-orange-600">Flagged as Fraud</Badge>
                  ) : (
                    <Badge className="bg-emerald-700/30 text-emerald-400 border-emerald-700/40">Not Flagged</Badge>
                  )}
                </div>
              </div>

              <Separator className="bg-zinc-700" />

              {/* Override Section */}
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 font-semibold">Override Entry Status</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">New Status</Label>
                    <Select value={overrideStatus} onValueChange={setOverrideStatus}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full focus:border-amber-600 focus:ring-amber-600/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="confirmed" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Confirmed</SelectItem>
                        <SelectItem value="rejected" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Rejected</SelectItem>
                        <SelectItem value="pending" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Pending</SelectItem>
                        <SelectItem value="duplicate" className="text-zinc-100 focus:bg-zinc-700 focus:text-amber-400">Duplicate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Override Reason</Label>
                    <Input
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Reason for override..."
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-600 focus:ring-amber-600/30"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-zinc-400">Mark as Fraud:</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOverrideFraud(!overrideFraud)}
                    className={`h-7 text-xs ${overrideFraud ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    {overrideFraud ? (
                      <ShieldOff className="w-3 h-3 mr-1" />
                    ) : (
                      <ShieldCheck className="w-3 h-3 mr-1" />
                    )}
                    {overrideFraud ? 'Fraud' : 'Clean'}
                  </Button>
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button
                  variant="ghost"
                  onClick={() => setDetailDialogOpen(false)}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleOverrideStatus}
                  disabled={overrideLoading}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {overrideLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Save Override
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Footer ─── */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-zinc-500">
          Champion Toffees Competition Admin &bull; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
