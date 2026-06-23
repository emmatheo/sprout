"use client";

import { useCurrentAccount, useCurrentWallet, ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { useEffect, useState } from "react";
import SproutGrowth from "@/components/SproutGrowth";
import { useVaultActions } from "@/lib/vault";
import { API_URL } from "@/lib/suiClient";
import { Loader2, Plus, ArrowUpRight, History, Wallet, CheckCircle2 } from "lucide-react";

import confetti from "canvas-confetti";

export default function Dashboard() {
  const account = useCurrentAccount();
  const { isConnected } = useCurrentWallet();
  const [vault, setVault] = useState<any>(null);
  const [pending, setPending] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const { openVault, deposit, withdraw } = useVaultActions();
  const [payWithUsdc, setPayWithUsdc] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState<any[]>([]);

  const fetchVault = async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_URL}/api/vaults/${account.address}`);
      if (res.ok) {
        setVault(await res.json());
      } else {
        setVault(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPending = async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_URL}/api/roundups/${account.address}/pending`);
      if (res.ok) {
        setPending(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_URL}/api/vaults/${account.address}/deposits`);
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSeedDemo = async () => {
    if (!account) return;
    setSeeding(true);
    try {
      await fetch(`${API_URL}/api/roundups/seed-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address })
      });
      await fetchPending();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
        colors: ["#86C454", "#9FD66B", "#E8B865"]
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    if (account) {
      setLoading(true);
      Promise.all([fetchVault(), fetchPending(), fetchHistory()]).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [account]);

  const handleOpenVault = async () => {
    if (!account) return;
    setDepositing(true);
    try {
      await openVault(account.address);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#86C454", "#E8B865"]
      });
      // Wait for indexer
      setTimeout(fetchVault, 3000);
    } catch (e) {
      alert("Failed to open vault");
    } finally {
      setDepositing(false);
    }
  };

  const handleDeposit = async () => {
    if (!account || !vault || !pending) return;
    setDepositing(true);
    try {
      await deposit({
        vaultId: vault.vault_id,
        amountMist: pending.pendingMist,
        sourceLabel: "Bulk deposit",
        payWithUsdc,
        sender: account.address
      });

      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.7 },
        colors: ["#86C454", "#9FD66B", "#E8B865", "#FFFFFF"]
      });

      setTimeout(() => {
        fetchVault();
        fetchPending();
        fetchHistory();
      }, 3000);
    } catch (e) {
      alert("Deposit failed");
    } finally {
      setDepositing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-pine-950 text-mist">
        <div className="bg-pine-900/60 p-12 rounded-[2rem] border border-pine-800 flex flex-col items-center space-y-8 max-w-lg w-full text-center">
          <div className="p-6 bg-sprout-500/10 rounded-full">
            <Wallet className="w-16 h-16 text-sprout-400" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-display font-bold">Connect to Sprout</h1>
            <p className="text-mist/60 text-lg">
              Sign in with Google or your Sui wallet to start micro-investing your spare change.
            </p>
          </div>
          <ConnectButton connectText="Get started" />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pine-950">
        <Loader2 className="w-12 h-12 text-sprout-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pine-950 text-mist p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-2xl font-display font-bold text-sprout-400">Sprout</Link>
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="text-xs bg-pine-900 hover:bg-pine-800 text-mist/40 hover:text-mist/60 px-3 py-1 rounded-full border border-pine-800 transition-all flex items-center gap-2"
            >
              {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Seed Demo Data
            </button>
          </div>
          <ConnectButton />
        </header>

        {!vault ? (
          <div className="bg-pine-900/40 border border-pine-800 rounded-[3rem] p-12 flex flex-col items-center space-y-8 text-center max-w-2xl mx-auto">
            <SproutGrowth totalDepositedSui={0} size={180} />
            <div className="space-y-4">
              <h2 className="text-3xl font-display font-bold">You don't have a vault yet.</h2>
              <p className="text-mist/60 max-w-md mx-auto">
                Opening one is free — Sprout covers the gas fee. Your micro-savings need a home!
              </p>
            </div>
            <button
              onClick={handleOpenVault}
              disabled={depositing}
              className="bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-10 py-4 rounded-2xl flex items-center gap-3 disabled:opacity-50 transition-all text-xl"
            >
              {depositing ? <Loader2 className="animate-spin" /> : <Plus />}
              Open my vault
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
              <div className="md:col-span-4 bg-pine-900/40 border border-pine-800 rounded-[2.5rem] p-8 flex flex-col items-center justify-center">
                <SproutGrowth totalDepositedSui={Number(vault.balance) / 1_000_000_000} size={220} />
                <div className="mt-6 text-center">
                  <div className="text-hint text-mist/40 text-sm font-medium uppercase tracking-wider">Current Balance</div>
                  <div className="text-5xl font-display font-bold text-harvest-400 mt-2">
                    {(Number(vault.balance) / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 2 })} SUI
                  </div>
                </div>
              </div>

              <div className="md:col-span-8 grid grid-cols-2 gap-4">
                <div className="bg-pine-900/60 p-8 rounded-3xl border border-pine-800 flex flex-col justify-between">
                  <div className="text-mist/40 text-sm font-medium uppercase tracking-wider">Total Deposited</div>
                  <div className="text-4xl font-display font-bold text-mist mt-4">
                    {(Number(vault.total_deposited) / 1_000_000_000).toFixed(2)} SUI
                  </div>
                </div>
                <div className="bg-pine-900/60 p-8 rounded-3xl border border-pine-800 flex flex-col justify-between">
                  <div className="text-mist/40 text-sm font-medium uppercase tracking-wider">Deposits made</div>
                  <div className="text-4xl font-display font-bold text-mist mt-4">
                    {vault.deposit_count}
                  </div>
                </div>
                <div className="col-span-2 bg-sprout-500/10 p-8 rounded-3xl border border-sprout-500/20 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sprout-400 text-sm font-medium uppercase tracking-wider">Pending round-ups</div>
                      <div className="text-4xl font-display font-bold text-sprout-400 mt-4">
                        {(Number(pending?.pendingMist || 0) / 1_000_000_000).toFixed(4)} SUI
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="space-y-6">
              <div className="flex gap-4 border-b border-pine-800">
                {["overview", "history", "withdraw"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-6 py-4 font-bold capitalize transition-all relative ${activeTab === tab ? "text-sprout-400" : "text-mist/40 hover:text-mist/60"
                      }`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-sprout-500 rounded-full"></div>
                    )}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <div className="space-y-6">
                  {Number(pending?.pendingMist || 0) > 0 ? (
                    <div className="bg-pine-900/30 p-10 rounded-[2rem] border border-pine-800/50 space-y-8">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-2">
                          <h3 className="text-2xl font-display font-bold">Flush your micro-savings</h3>
                          <p className="text-mist/60">
                            You have {pending?.sinceLastDeposit} pending round-ups ready to be moved on-chain.
                          </p>
                        </div>
                        <button
                          onClick={handleDeposit}
                          disabled={depositing}
                          className="bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-10 py-4 rounded-2xl flex items-center gap-3 disabled:opacity-50 transition-all text-xl"
                        >
                          {depositing ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                          Deposit now
                        </button>
                      </div>

                      <label className="flex items-center gap-4 p-4 rounded-xl bg-pine-950/50 cursor-pointer border border-pine-800 group hover:border-sprout-500/30 transition-all w-fit">
                        <input
                          type="checkbox"
                          checked={payWithUsdc}
                          onChange={(e) => setPayWithUsdc(e.target.checked)}
                          className="w-5 h-5 accent-sprout-500"
                        />
                        <div className="space-y-0.5">
                          <div className="font-bold">Fund from USDC</div>
                          <div className="text-xs text-mist/40">Atomic swap via DeepBook</div>
                        </div>
                      </label>
                    </div>
                  ) : (
                    <div className="bg-pine-900/10 p-16 rounded-[2rem] border border-dashed border-pine-800 flex flex-col items-center text-center space-y-4">
                      <div className="w-16 h-16 bg-pine-900/40 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="text-pine-800 w-8 h-8" />
                      </div>
                      <div className="text-xl font-display text-mist/30">No pending round-ups to deposit.</div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "history" && (
                <div className="bg-pine-900/30 rounded-3xl overflow-hidden border border-pine-800">
                  <table className="w-full text-left">
                    <thead className="bg-pine-900/60 text-xs uppercase tracking-widest text-mist/40 font-bold">
                      <tr>
                        <th className="px-8 py-4">Source</th>
                        <th className="px-8 py-4">Amount</th>
                        <th className="px-8 py-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pine-800/30">
                      {history.length > 0 ? history.map((item, idx) => (
                        <tr key={idx} className="hover:bg-pine-800/10 text-sm">
                          <td className="px-8 py-4 font-medium">{item.source_label}</td>
                          <td className="px-8 py-4 text-sprout-400 font-bold">{(Number(item.amount_mist) / 1_000_000_000).toFixed(4)} SUI</td>
                          <td className="px-8 py-4 text-mist/40">{new Date(item.deposited_at).toLocaleDateString()}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={3} className="px-8 py-12 text-center text-mist/30">No deposit history yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "withdraw" && (
                <div className="bg-pine-900/30 p-10 rounded-[2rem] border border-pine-800/50 space-y-6 max-w-xl">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-display font-bold">Withdraw from Vault</h3>
                    <p className="text-mist/40 text-sm">A 0.5% withdrawal fee applies. Funds go back to your wallet.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full bg-pine-950 border border-pine-800 rounded-xl p-4 text-3xl font-display focus:outline-none focus:border-harvest-400 transition-all pl-12"
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-harvest-400 font-bold text-xl">SUI</div>
                    </div>
                    <button className="w-full bg-harvest-400/10 hover:bg-harvest-400 text-harvest-400 hover:text-pine-950 font-bold py-4 rounded-xl transition-all">
                      Confirm Withdrawal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
