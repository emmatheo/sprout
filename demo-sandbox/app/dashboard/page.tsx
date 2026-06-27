"use client";

import { useCurrentAccount, useCurrentWallet, ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import SproutGrowth from "@/components/SproutGrowth";
import { useVaultActions } from "@/lib/vault";
import { API_URL } from "@/lib/suiClient";
import {
    Loader2,
    Plus,
    ArrowUpRight,
    History,
    Wallet,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    Settings,
    TrendingUp,
    LayoutDashboard
} from "lucide-react";
import confetti from "canvas-confetti";

export default function Dashboard() {
    const account = useCurrentAccount();
    const { isConnected } = useCurrentWallet();
    const [vault, setVault] = useState<any>(null);
    const [pending, setPending] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("overview");
    const [history, setHistory] = useState<any[]>([]);
    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [seeding, setSeeding] = useState(false);

    // Production transaction management
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState("");
    const txLock = useRef(false);

    const { openVault, deposit, withdraw } = useVaultActions();

    /**
     * Fetch vault summary from backend / indexer
     */
    const fetchVault = useCallback(async (): Promise<boolean> => {
        if (!account) return false;

        try {
            console.log(`[Dashboard] [LOG] Checking vault for: ${account.address}`);
            const res = await fetch(`${API_URL}/api/vaults/${account.address}`);

            if (res.ok) {
                const data = await res.json();
                console.log(`[Dashboard] [SUCCESS] Vault detected: ${data.vault_id}`);
                setVault(data);
                return true;
            } else if (res.status === 404) {
                console.log("[Dashboard] [INFO] No vault record found in backend.");
                setVault(null);
                return false;
            } else {
                const err = await res.json().catch(() => ({ error: 'Unknown server error' }));
                console.error(`[Dashboard] [ERROR] Backend returned ${res.status}:`, err.error);
                return false;
            }
        } catch (e) {
            console.error("[Dashboard] [ERROR] Network failure during vault lookup:", e);
            return false;
        }
    }, [account]);

    const fetchPending = useCallback(async () => {
        if (!account) return;
        try {
            const res = await fetch(`${API_URL}/api/roundups/${account.address}/pending`);
            if (res.ok) {
                const data = await res.json();
                setPending(data);
            }
        } catch (e) {
            console.error("[Dashboard] [ERROR] Failed to fetch pending roundups:", e);
        }
    }, [account]);

    const fetchHistory = useCallback(async () => {
        if (!account) return;
        try {
            const res = await fetch(`${API_URL}/api/vaults/${account.address}/deposits`);
            if (res.ok) {
                setHistory(await res.json());
            }
        } catch (e) {
            console.error("[Dashboard] [ERROR] Failed to fetch history:", e);
        }
    }, [account]);

    /**
     * Handle Vault Creation
     */
    const handleOpenVault = useCallback(async () => {
        if (!account || isProcessing || txLock.current) return;

        console.log("[Dashboard] [START] Vault Creation Flow");
        setIsProcessing(true);
        setProcessingStatus("Preparing secure transaction...");
        txLock.current = true;

        try {
            setProcessingStatus("Awaiting wallet signature...");
            console.log("[Dashboard] [ACTION] Requesting wallet signature for open_vault...");
            const result = await openVault();
            console.log("[Dashboard] [SUCCESS] On-chain transaction confirmed. Digest:", result.digest);

            setProcessingStatus("Waiting for blockchain confirmation...");

            // Polling for indexer to catch up
            let synced = false;
            for (let i = 0; i < 6; i++) {
                setProcessingStatus(`Syncing with ledger (attempt ${i + 1}/6)...`);
                console.log(`[Dashboard] [SYNC] Polling backend (attempt ${i + 1})...`);
                synced = await fetchVault();
                if (synced) break;
                await new Promise(r => setTimeout(r, 2000));
            }

            if (synced) {
                console.log("[Dashboard] [FINISH] Vault successfully linked and loaded.");
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ["#86C454", "#9FD66B", "#E8B865"]
                });
            } else {
                console.warn("[Dashboard] [TIMEOUT] Search for vault timed out. Manual refresh may be needed.");
                alert("Transaction confirmed! Your vault is being initialized. It will appear on your dashboard in a few moments.");
            }
        } catch (e: any) {
            console.error("[Dashboard] [CRITICAL] Vault creation failed:", e);

            let errorMessage = "Transaction rejected or network error.";
            if (e?.message) errorMessage = e.message;

            // Handle the "Incorrect password" issue by providing more context if it happens
            if (errorMessage.toLowerCase().includes("password")) {
                console.error("[Dashboard] [AUTH_ERROR] Password-related failure detected during wallet signing.");
            }

            alert(`Vault Initialization Failed: ${errorMessage}`);
        } finally {
            setIsProcessing(false);
            setProcessingStatus("");
            txLock.current = false;
            console.log("[Dashboard] [MUTEX] Transaction lock released.");
        }
    }, [account, openVault, fetchVault, isProcessing]);

    /**
     * Handle Deposit
     */
    const handleDeposit = useCallback(async () => {
        if (!account || !vault || !pending || isProcessing || txLock.current) return;

        setIsProcessing(true);
        setProcessingStatus("Calculating round-ups...");
        txLock.current = true;

        try {
            setProcessingStatus("Confirming deposit in wallet...");
            const result = await deposit(vault.vault_id, pending.pendingMist, "Bulk deposit");
            console.log("[Dashboard] [SUCCESS] Deposit confirmed:", result.digest);

            confetti({
                particleCount: 200,
                spread: 100,
                origin: { y: 0.7 },
                colors: ["#86C454", "#9FD66B", "#E8B865", "#FFFFFF"]
            });

            setProcessingStatus("Refreshing portfolio state...");
            setTimeout(() => {
                fetchVault();
                fetchPending();
                fetchHistory();
            }, 2000);
        } catch (e: any) {
            console.error("[Dashboard] [ERROR] Deposit failed:", e);
            alert(`Deposit Failed: ${e?.message || "Unknown error"}`);
        } finally {
            setIsProcessing(false);
            setProcessingStatus("");
            txLock.current = false;
        }
    }, [account, vault, pending, deposit, fetchVault, fetchPending, fetchHistory, isProcessing]);

    /**
     * Handle Withdrawal
     */
    const handleWithdraw = useCallback(async () => {
        if (!account || !vault || !withdrawAmount || isProcessing || txLock.current) return;

        setIsProcessing(true);
        setProcessingStatus("Validating withdrawal amount...");
        txLock.current = true;

        try {
            setProcessingStatus("Approving withdrawal in wallet...");
            const amountMist = Math.round(parseFloat(withdrawAmount) * 1_000_000_000).toString();
            const result = await withdraw(vault.vault_id, amountMist);
            console.log("[Dashboard] [SUCCESS] Withdrawal complete:", result.digest);

            confetti({
                particleCount: 80,
                spread: 60,
                origin: { y: 0.7 },
                colors: ["#E8B865", "#FFFFFF"]
            });

            setWithdrawAmount("");
            setProcessingStatus("Updating balances...");
            setTimeout(() => fetchVault(), 2000);
        } catch (e: any) {
            console.error("[Dashboard] [ERROR] Withdrawal failed:", e);
            alert(`Withdrawal Failed: ${e?.message || "Unknown error"}`);
        } finally {
            setIsProcessing(false);
            setProcessingStatus("");
            txLock.current = false;
        }
    }, [account, vault, withdrawAmount, withdraw, fetchVault, isProcessing]);

    useEffect(() => {
        if (account?.address) {
            setLoading(true);
            const init = async () => {
                await fetchVault();
                await Promise.all([fetchPending(), fetchHistory()]);
                setLoading(false);
            };
            init();
        } else {
            setLoading(false);
            setVault(null);
        }
    }, [account?.address, fetchVault, fetchPending, fetchHistory]);

    if (!isConnected) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-pine-950 text-mist">
                <div className="glass-card p-12 flex flex-col items-center space-y-8 max-w-lg w-full text-center">
                    <div className="p-6 bg-sprout-500/10 rounded-full animate-float">
                        <Wallet className="w-16 h-16 text-sprout-400" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-4xl font-display font-bold text-mist">Ready to Sprout?</h1>
                        <p className="text-mist/60 text-lg">
                            Connect your Sui wallet to access your private savings vault and start investing your spare change.
                        </p>
                    </div>
                    <ConnectButton connectText="Connect Wallet" />
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-pine-950">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <Loader2 className="w-16 h-16 text-sprout-400 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 bg-sprout-400 rounded-full animate-ping" />
                        </div>
                    </div>
                    <p className="text-mist/40 animate-pulse font-bold tracking-[0.3em] text-xs uppercase">Authenticating Session...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-pine-950 text-mist p-4 md:p-8 font-body">
            {/* Global Transaction Overlay */}
            {isProcessing && (
                <div className="fixed inset-0 bg-pine-950/80 backdrop-blur-md z-[100] flex items-center justify-center transition-all animate-in fade-in duration-300">
                    <div className="glass-card p-10 flex flex-col items-center gap-8 max-w-sm text-center shadow-2xl">
                        <div className="relative">
                            <Loader2 className="w-20 h-20 text-sprout-400 animate-spin" />
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-2xl font-display font-bold text-mist uppercase tracking-widest">Transaction in Progress</h3>
                            <p className="text-mist/50 text-sm font-medium">{processingStatus}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto space-y-10">
                {/* Navigation Bar */}
                <header className="flex justify-between items-center py-4">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="group flex items-center gap-2">
                            <div className="w-8 h-8 bg-sprout-500 rounded-lg flex items-center justify-center transform group-hover:rotate-12 transition-transform">
                                <LayoutDashboard className="w-5 h-5 text-pine-950" />
                            </div>
                            <span className="text-2xl font-display font-bold text-sprout-400">Sprout</span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center bg-pine-900/50 rounded-full px-4 py-2 border border-pine-800">
                            <div className="w-2 h-2 bg-sprout-500 rounded-full mr-3 animate-pulse" />
                            <span className="text-xs font-bold text-mist/40 uppercase tracking-widest">Testnet Active</span>
                        </div>
                        <ConnectButton />
                    </div>
                </header>

                {!vault ? (
                    <div className="glass-card p-16 flex flex-col items-center space-y-12 text-center max-w-2xl mx-auto relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-b from-sprout-500/5 to-transparent pointer-events-none" />
                        <div className="animate-float">
                            <SproutGrowth totalDepositedSui={0} size={240} />
                        </div>
                        <div className="space-y-4 relative z-10">
                            <h2 className="text-5xl font-display font-bold text-mist">Seed Your Future</h2>
                            <p className="text-mist/50 text-lg max-w-sm mx-auto leading-relaxed">
                                Initialize your personal, on-chain vault to start harvesting spare change automatically.
                            </p>
                        </div>
                        <button
                            onClick={handleOpenVault}
                            disabled={isProcessing}
                            className="bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-16 py-6 rounded-2xl flex items-center gap-4 shadow-xl active:scale-95 transition-all text-xl disabled:opacity-50 relative z-10"
                        >
                            {isProcessing ? <Loader2 className="animate-spin" /> : <Plus className="w-6 h-6" />}
                            Create My Vault
                        </button>
                    </div>
                ) : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                        {/* Dashboard Sections */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Asset Growth Visualization */}
                            <div className="lg:col-span-12 xl:col-span-5 glass-card p-10 flex flex-col items-center justify-center relative overflow-hidden">
                                <div className="absolute top-8 right-8">
                                    <TrendingUp className="text-sprout-500/20 w-12 h-12" />
                                </div>
                                <div className="animate-float">
                                    <SproutGrowth totalDepositedSui={Number(vault.balance) / 1_000_000_000} size={280} />
                                </div>
                                <div className="mt-8 text-center">
                                    <div className="text-mist/30 text-[10px] font-bold uppercase tracking-[0.4em]">Vault Portfolio</div>
                                    <div className="text-7xl font-display font-bold text-harvest-400 mt-4 flex items-baseline justify-center">
                                        {(Number(vault.balance) / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <span className="text-xl ml-3 text-harvest-400/40 font-bold">SUI</span>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Stats Grid */}
                            <div className="lg:col-span-12 xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="glass-card p-8 flex flex-col justify-between hover:bg-pine-900/80 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <span className="text-mist/30 text-[10px] font-bold uppercase tracking-widest">Total Seeded</span>
                                        <Settings className="w-4 h-4 text-mist/10" />
                                    </div>
                                    <div className="text-5xl font-display font-bold text-mist mt-6 tabular-nums">
                                        {(Number(vault.total_deposited) / 1_000_000_000).toFixed(2)}
                                        <span className="text-sm ml-2 text-mist/20">SUI</span>
                                    </div>
                                </div>

                                <div className="glass-card p-8 flex flex-col justify-between hover:bg-pine-900/80 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <span className="text-mist/30 text-[10px] font-bold uppercase tracking-widest">Investments</span>
                                        <History className="w-4 h-4 text-mist/10" />
                                    </div>
                                    <div className="text-5xl font-display font-bold text-mist mt-6">
                                        {vault.deposit_count}
                                        <span className="text-sm ml-2 text-mist/20 uppercase tracking-widest font-bold">Tx</span>
                                    </div>
                                </div>

                                <div className="sm:col-span-2 bg-sprout-500/5 p-10 rounded-[2.5rem] border border-sprout-500/10 flex flex-col sm:flex-row justify-between items-center relative overflow-hidden group hover:border-sprout-500/30 transition-all">
                                    <div className="absolute right-0 top-0 w-64 h-64 bg-sprout-400/5 blur-[100px] rounded-full group-hover:bg-sprout-400/10 transition-all duration-1000" />
                                    <div className="space-y-4 relative z-10">
                                        <div className="text-sprout-400/60 text-[10px] font-bold uppercase tracking-widest">Available Round-Ups</div>
                                        <div className="text-6xl font-display font-bold text-sprout-400 flex items-baseline">
                                            {(Number(pending?.pendingMist || 0) / 1_000_000_000).toFixed(4)}
                                            <span className="text-lg ml-3 opacity-40">SUI</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleDeposit}
                                        disabled={isProcessing || !pending || Number(pending.pendingMist) === 0}
                                        className="bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-12 py-5 rounded-2xl flex items-center gap-3 shadow-lg active:scale-95 transition-all text-lg disabled:opacity-20 relative z-10 whitespace-nowrap"
                                    >
                                        <ArrowUpRight className="w-6 h-6" />
                                        Invest Now
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content Tabs */}
                        <div className="space-y-8 pt-8">
                            <div className="flex gap-10 border-b border-pine-800">
                                {["overview", "history", "withdraw"].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-1 py-4 font-bold uppercase tracking-[0.2em] text-xs transition-all relative ${activeTab === tab ? "text-sprout-400" : "text-mist/20 hover:text-mist/40"
                                            }`}
                                    >
                                        {tab}
                                        {activeTab === tab && (
                                            <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-sprout-500 shadow-lg shadow-sprout-500/50" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[300px]">
                                {activeTab === "overview" && (
                                    <div className="animate-in fade-in slide-in-from-left-4 duration-700">
                                        {Number(pending?.pendingMist || 0) > 0 ? (
                                            <div className="glass-card p-12 flex flex-col md:flex-row items-center justify-between gap-10 group bg-pine-900/30">
                                                <div className="space-y-3">
                                                    <h3 className="text-4xl font-display font-bold text-mist">Pending Harvest</h3>
                                                    <p className="text-mist/40 text-lg max-w-sm">
                                                        You've accumulated spare change from recent actions. Transfer them to your vault to see them grow.
                                                    </p>
                                                </div>
                                                <div className="p-8 bg-pine-950 rounded-3xl border border-pine-800 text-center">
                                                    <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest mb-2">Queue Size</div>
                                                    <div className="text-4xl font-display font-bold text-sprout-400">{pending?.sinceLastDeposit || 0}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-20 rounded-[3rem] border border-dashed border-pine-800/40 flex flex-col items-center text-center space-y-6">
                                                <CheckCircle2 className="text-pine-800/20 w-16 h-16" />
                                                <div className="space-y-2">
                                                    <div className="text-2xl font-display font-bold text-mist/20 uppercase tracking-widest">Vault Synchronized</div>
                                                    <p className="text-mist/10 text-sm font-medium">All pending savings have been safely deposited.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === "history" && (
                                    <div className="glass-card overflow-hidden animate-in fade-in slide-in-from-left-4 duration-700">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-pine-900/40 border-b border-pine-800/60">
                                                        <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-mist/30 font-bold">Source</th>
                                                        <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-mist/30 font-bold text-right">Amount</th>
                                                        <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-mist/30 font-bold text-right">Date</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-pine-800/30">
                                                    {history.length > 0 ? history.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-sprout-500/[0.02] transition-colors group">
                                                            <td className="px-10 py-6">
                                                                <div className="text-mist font-bold text-sm">{item.source_label}</div>
                                                                <div className="text-[9px] text-sprout-400/40 uppercase font-bold mt-1 tracking-tighter">On-Chain Verified</div>
                                                            </td>
                                                            <td className="px-10 py-6 text-right">
                                                                <div className="text-sprout-400 font-bold text-lg tabular-nums">
                                                                    {(Number(item.amount_mist) / 1_000_000_000).toFixed(4)}
                                                                </div>
                                                                <div className="text-[9px] text-mist/20 font-bold uppercase tracking-widest">SUI</div>
                                                            </td>
                                                            <td className="px-10 py-6 text-right tabular-nums text-mist/40 text-xs">
                                                                {new Date(item.deposited_at).toLocaleDateString(undefined, {
                                                                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                                                })}
                                                            </td>
                                                        </tr>
                                                    )) : (
                                                        <tr>
                                                            <td colSpan={3} className="px-10 py-24 text-center">
                                                                <History className="w-12 h-12 text-mist/5 mx-auto mb-4" />
                                                                <div className="font-bold uppercase tracking-widest text-xs text-mist/10">No records found</div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "withdraw" && (
                                    <div className="glass-card p-12 max-w-2xl animate-in fade-in slide-in-from-left-4 duration-700">
                                        <div className="space-y-10">
                                            <div className="space-y-4">
                                                <h3 className="text-3xl font-display font-bold text-mist">Liquidate Capital</h3>
                                                <p className="text-mist/40 text-sm leading-relaxed">
                                                    Sprout charges a nominal 0.5% protocol fee to support the automated infrastructure. Funds are transferred instantly to your connected wallet.
                                                </p>
                                            </div>
                                            <div className="space-y-6">
                                                <div className="relative group">
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={withdrawAmount}
                                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                                        className="w-full bg-pine-950/40 border-2 border-pine-800/50 rounded-2xl p-10 text-5xl font-display focus:outline-none focus:border-harvest-400/50 transition-all pl-24 text-mist"
                                                    />
                                                    <div className="absolute left-8 top-1/2 -translate-y-1/2 text-harvest-400/30 font-bold text-xl uppercase font-display">Sui</div>
                                                    <button
                                                        onClick={() => setWithdrawAmount((Number(vault.balance) / 1_000_000_000).toString())}
                                                        className="absolute right-8 top-1/2 -translate-y-1/2 bg-pine-900 border border-pine-800 px-4 py-2 rounded-xl text-mist/30 hover:text-sprout-400 text-[10px] font-bold uppercase transition-all"
                                                    >
                                                        Max
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-4 bg-harvest-400/5 p-5 rounded-2xl border border-harvest-400/10">
                                                    <AlertCircle className="w-5 h-5 text-harvest-400/40" />
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-harvest-400/60 font-bold uppercase tracking-wider">Protocol Fee</p>
                                                        <p className="text-xs text-harvest-400/40 font-medium tabular-nums">
                                                            Est. Fee: {(Number(withdrawAmount || 0) * 0.005).toFixed(6)} SUI
                                                        </p>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={handleWithdraw}
                                                    disabled={isProcessing || !withdrawAmount || Number(withdrawAmount) <= 0}
                                                    className="w-full bg-harvest-400 hover:bg-harvest-500 text-pine-950 font-bold py-7 rounded-2xl transition-all disabled:opacity-20 flex items-center justify-center gap-4 text-xl shadow-xl active:scale-[0.98]"
                                                >
                                                    {isProcessing ? <Loader2 className="animate-spin" /> : <ArrowLeft className="w-6 h-6" />}
                                                    Liquidate Selection
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
