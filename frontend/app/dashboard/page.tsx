"use client";

import { useCurrentAccount, useCurrentWallet, ConnectButton, useSuiClient } from "@mysten/dapp-kit";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import SproutGrowth from "@/components/SproutGrowth";
import { useVaultActions } from "@/lib/vault";
import { API_URL, SPROUT_PACKAGE_ID } from "@/lib/suiClient";
import { Loader2, Plus, ArrowUpRight, History, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { useRouter } from "next/navigation";

function traceDashboard(event: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[DashboardFlow] ${event}`, details);
  } else {
    console.log(`[DashboardFlow] ${event}`);
  }
}

export default function Dashboard() {
  const account = useCurrentAccount();
  const { isConnected } = useCurrentWallet();
  const router = useRouter();
  const suiClient = useSuiClient();
  const [vault, setVault] = useState<any>(null);
  const [pending, setPending] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState<any[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Production transaction management
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const txLock = useRef(false);
  const currentVaultRef = useRef<any>(null);

  const { openVault, deposit, withdraw } = useVaultActions();

  useEffect(() => {
    traceDashboard("Dashboard mounted");
  }, []);

  useEffect(() => {
    currentVaultRef.current = vault;
    if (vault) {
      traceDashboard("Vault rendered", {
        owner: vault.owner,
        vaultId: vault.vault_id,
        balance: vault.balance,
      });
    } else {
      traceDashboard("Vault cleared");
    }
  }, [vault]);

  const normalizeVault = useCallback((owner: string, objectId: string, fields: any) => {
    const balance = fields?.balance?.fields?.value ?? fields?.balance ?? 0;
    const totalDeposited = fields?.total_deposited ?? 0;
    const depositCount = fields?.deposit_count ?? 0;
    const openedAt = fields?.opened_at_ms ? new Date(Number(fields.opened_at_ms)) : new Date();

    return {
      owner,
      vault_id: objectId,
      balance: balance.toString(),
      total_deposited: totalDeposited.toString(),
      deposit_count: Number(depositCount) || 0,
      opened_at: openedAt,
    };
  }, []);

  const getFieldAddress = useCallback((value: any): string | undefined => {
    if (typeof value === "string") return value;
    return value?.fields?.bytes ?? value?.fields?.value;
  }, []);

  const fetchVaultFromChain = useCallback(async () => {
    if (!account) {
      return { status: "missing" as const };
    }

    if (!SPROUT_PACKAGE_ID) {
      return { status: "error" as const, message: "Sprout package ID is not configured." };
    }

    try {
      const objects = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${SPROUT_PACKAGE_ID}::vault::Vault` },
        options: { showContent: true },
      });

      const candidate = objects.data.find((entry) => entry.data?.content?.dataType === "moveObject");
      const vaultObject = candidate?.data as any;
      const vaultId = vaultObject?.objectId;
      const fields = vaultObject?.content?.fields;

      const objectOwner = getFieldAddress(fields?.owner);

      if (vaultId && fields && (!objectOwner || objectOwner.toLowerCase() === account.address.toLowerCase())) {
        return {
          status: "found" as const,
          vault: normalizeVault(account.address, vaultId, fields),
        };
      }

      return { status: "missing" as const };
    } catch (error) {
      console.error("[fetchVaultFromChain] FAILED:", error);
      return { status: "error" as const, message: "Direct Sui vault lookup failed." };
    }
  }, [account, getFieldAddress, normalizeVault, suiClient]);

  const hydrateCreatedVault = useCallback((vaultId: string) => {
    if (!account) return;
    traceDashboard("Vault state update started", {
      source: "confirmed-transaction",
      owner: account.address,
      vaultId,
    });
    setVault({
      owner: account.address,
      vault_id: vaultId,
      balance: "0",
      total_deposited: "0",
      deposit_count: 0,
      opened_at: new Date().toISOString(),
    });
    setLoading(false);
    setLoadError("");
    traceDashboard("Vault state updated", {
      source: "confirmed-transaction",
      owner: account.address,
      vaultId,
    });
    setActiveTab("overview");
  }, [account]);

  const syncCreatedVault = useCallback(async (vaultId: string) => {
    if (!account) return null;

    try {
      traceDashboard("Backend sync started", {
        owner: account.address,
        vaultId,
      });
      const res = await fetch(`${API_URL}/api/vaults/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: account.address, vaultId }),
      });

      if (!res.ok) {
        traceDashboard("Backend sync failed", {
          owner: account.address,
          vaultId,
          status: res.status,
        });
        console.warn("[syncCreatedVault] Backend sync failed with status:", res.status);
        return null;
      }

      const data = await res.json();
      traceDashboard("Backend sync completed", {
        owner: data.owner,
        vaultId: data.vault_id,
      });
      traceDashboard("Vault state update started", {
        source: "backend-sync",
        owner: data.owner,
        vaultId: data.vault_id,
      });
      setVault(data);
      traceDashboard("Vault state updated", {
        source: "backend-sync",
        owner: data.owner,
        vaultId: data.vault_id,
      });
      return data;
    } catch (error) {
      traceDashboard("Backend sync failed", {
        owner: account.address,
        vaultId,
        reason: error instanceof Error ? error.message : String(error),
      });
      console.warn("[syncCreatedVault] Backend sync unavailable:", error);
      return null;
    }
  }, [account]);

  /**
   * Final Production Vault Lookup
   * Checks backend (which queries on-chain if necessary).
   */
  const fetchVault = useCallback(async (options?: { preserveExisting?: boolean }): Promise<"found" | "missing" | "error"> => {
    if (!account) {
      console.log("[fetchVault] ABORTED: No account connected.");
      return "missing";
    }

    const preserveExisting = options?.preserveExisting ?? false;
    traceDashboard("Vault fetch started", {
      owner: account.address,
      preserveExisting,
    });
    console.log(`[fetchVault] STARTED: Fetching vault for address ${account.address}`);
    if (!preserveExisting) setLoadError("");
    try {
      const res = await fetch(`${API_URL}/api/vaults/${account.address}`);
      console.log(`[fetchVault] COMPLETED: API responded with status ${res.status}`);

      if (res.ok) {
        const data = await res.json();
        console.log(`[fetchVault] DATA: Found Vault ID: ${data.vault_id}`);
        traceDashboard("Vault fetch succeeded", {
          source: "backend",
          owner: data.owner,
          vaultId: data.vault_id,
        });
        setVault(data);
        return "found";
      } else if (res.status === 404) {
        console.log("[fetchVault] INFO: No vault found in database.");
        const chainResult = await fetchVaultFromChain();
        if (chainResult.status === "found") {
          traceDashboard("Vault fetch succeeded", {
            source: "chain",
            owner: chainResult.vault.owner,
            vaultId: chainResult.vault.vault_id,
          });
          setVault(chainResult.vault);
          return "found";
        }
        if (!preserveExisting) setVault(null);
        if (chainResult.status === "error") {
          if (!preserveExisting) setLoadError("Sprout could not verify your vault. The chain lookup also failed.");
          return "error";
        }
        return "missing";
      } else {
        const errText = await res.text();
        console.error(`[fetchVault] FAILED: Server Error: ${errText}`);
        const chainResult = await fetchVaultFromChain();
        if (chainResult.status === "found") {
          traceDashboard("Vault fetch succeeded", {
            source: "chain-after-backend-error",
            owner: chainResult.vault.owner,
            vaultId: chainResult.vault.vault_id,
          });
          setVault(chainResult.vault);
          return "found";
        }
        if (!preserveExisting) setVault(null);
        if (chainResult.status === "missing") {
          if (!preserveExisting) setLoadError("Sprout could not verify your vault from the backend, but the chain has no vault for this wallet yet.");
          return "missing";
        }
        if (!preserveExisting) setLoadError("Sprout could not verify your vault. Please retry before creating a new one.");
        return "error";
      }
    } catch (e) {
      console.error("[fetchVault] FAILED: Network Error:", e);
      const chainResult = await fetchVaultFromChain();
      if (chainResult.status === "found") {
        traceDashboard("Vault fetch succeeded", {
          source: "chain-after-network-error",
          owner: chainResult.vault.owner,
          vaultId: chainResult.vault.vault_id,
        });
        setVault(chainResult.vault);
        return "found";
      }
      if (!preserveExisting) setVault(null);
      if (chainResult.status === "missing") {
        return "missing";
      }
      if (!preserveExisting) setLoadError("Sprout API is unreachable and direct vault lookup failed.");
      return "error";
    }
  }, [account, fetchVaultFromChain]);

  const fetchPending = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_URL}/api/roundups/${account.address}/pending`);
      if (res.ok) {
        setPending(await res.json());
      }
    } catch (e) {
      console.error("[Dashboard] Pending fetch fail:", e);
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
      console.error("[Dashboard] History fetch fail:", e);
    }
  }, [account]);

  /**
   * Authoritative Flow: handleOpenVault
   */
  const handleOpenVault = useCallback(async () => {
    console.log("[handleOpenVault] CLICKED: Initialize Vault Button Triggered");
    traceDashboard("Initialize vault clicked");

    if (!account) {
      console.error("[handleOpenVault] FAILED: No wallet connected.");
      alert("Please connect your wallet first.");
      return;
    }

    if (isProcessing || txLock.current) {
      console.warn("[handleOpenVault] ABORTED: Transaction already in progress (Locked).");
      return;
    }

    console.log("[handleOpenVault] STARTED: Initializing Vault Flow");
    traceDashboard("Vault fetch started", {
      owner: account.address,
      preserveExisting: false,
      phase: "preflight-existence-check",
    });
    setIsProcessing(true);
    setProcessingStatus("Checking for an existing vault...");
    txLock.current = true;

    try {
      const existingVault = await fetchVault();
      if (existingVault === "found") {
        console.log("[handleOpenVault] ABORTED: Existing vault found before creation.");
        return;
      }
      if (existingVault === "error") {
        throw new Error("Could not verify whether this wallet already has a vault.");
      }

      setProcessingStatus("Preparing secure connection...");
      console.log("[handleOpenVault] STEP: Calling openVault() lib action...");
      const result = await openVault();
      traceDashboard("Transaction confirmed", {
        digest: result.digest,
        createdVaultId: result.createdVaultId ?? null,
      });
      console.log("[handleOpenVault] COMPLETED: Transaction Successful. Digest:", result.digest);
      traceDashboard("Vault ID returned", {
        vaultId: result.createdVaultId ?? null,
      });

      if (result.createdVaultId) {
        console.log("[handleOpenVault] DATA: Created Vault ID:", result.createdVaultId);
        hydrateCreatedVault(result.createdVaultId);
        void syncCreatedVault(result.createdVaultId);
      }

      traceDashboard("Dashboard navigation started", {
        href: "/dashboard",
        method: "replace",
        vaultId: result.createdVaultId ?? null,
      });
      router.replace("/dashboard");

      setProcessingStatus("Waiting for indexer to catch up...");

      let synced = false;
      const MAX_ATTEMPTS = 8;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        setProcessingStatus(`Confirming setup (${i + 1}/${MAX_ATTEMPTS})...`);
        console.log(`[handleOpenVault] SYNC: Polling backend (Attempt ${i + 1}/${MAX_ATTEMPTS})...`);
        const syncState = await fetchVault({ preserveExisting: !!result.createdVaultId });
        synced = syncState === "found";
        if (synced) {
          console.log("[handleOpenVault] COMPLETED: Vault found and synchronized.");
          break;
        }
        if (syncState === "error") break;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (synced) {
        console.log("[handleOpenVault] SUCCESS: User should now see the dashboard.");
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#86C454", "#9FD66B", "#E8B865"]
        });
      } else {
        console.warn("[handleOpenVault] TIMEOUT: Vault created on-chain but not yet indexed.");
        if (result.createdVaultId) {
          alert("Transaction confirmed! Your vault is opening now.");
        } else {
          alert("Transaction confirmed! Your vault is being created. Please wait a few moments and refresh the page.");
        }
      }

    } catch (e: any) {
      console.error("[handleOpenVault] FAILED: Critical Error in Flow:", e);
      const msg = e?.message || "Unknown error occurred.";
      alert(`Initialization Failed: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      txLock.current = false;
      console.log("[handleOpenVault] FINISHED: Flow ended, lock released.");
    }
  }, [account, openVault, fetchVault, hydrateCreatedVault, syncCreatedVault, isProcessing, router]);

  /**
   * Authoritative Flow: handleDeposit
   */
  const handleDeposit = useCallback(async () => {
    if (!account || !vault || !pending || isProcessing || txLock.current) return;

    setIsProcessing(true);
    setProcessingStatus("Syncing your savings...");
    txLock.current = true;

    try {
      console.log("[Dashboard] Phase: Deposit Started");
      const result = await deposit(vault.vault_id, pending.pendingMist, "Bulk deposit");
      console.log("[Dashboard] Phase: Deposit Success. Digest:", result.digest);

      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.7 },
        colors: ["#86C454", "#9FD66B", "#E8B865", "#FFFFFF"]
      });

      setProcessingStatus("Updating ledger...");
      setTimeout(() => {
        fetchVault();
        fetchPending();
        fetchHistory();
        console.log("[Dashboard] Phase: Ledger Updated.");
      }, 2000);
    } catch (e: any) {
      console.error("[Dashboard] Deposit Flow Error:", e);
      alert(`Deposit Error: ${e?.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      txLock.current = false;
    }
  }, [account, vault, pending, deposit, fetchVault, fetchPending, fetchHistory, isProcessing]);

  /**
   * Authoritative Flow: handleWithdraw
   */
  const handleWithdraw = useCallback(async () => {
    if (!account || !vault || !withdrawAmount || isProcessing || txLock.current) return;

    setIsProcessing(true);
    setProcessingStatus("Authenticating withdrawal...");
    txLock.current = true;

    try {
      console.log("[Dashboard] Phase: Withdrawal Started");
      const amountMist = Math.round(parseFloat(withdrawAmount) * 1_000_000_000).toString();
      const result = await withdraw(vault.vault_id, amountMist);
      console.log("[Dashboard] Phase: Withdrawal Success. Digest:", result.digest);

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#E8B865", "#FFFFFF"]
      });

      setWithdrawAmount("");
      setProcessingStatus("Finalizing transfer...");
      setTimeout(() => {
        fetchVault();
        console.log("[Dashboard] Phase: Transfer Complete.");
      }, 2000);
    } catch (e: any) {
      console.error("[Dashboard] Withdrawal Flow Error:", e);
      alert(`Withdrawal Error: ${e?.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      txLock.current = false;
    }
  }, [account, vault, withdrawAmount, withdraw, fetchVault, isProcessing]);

  const handleSeedDemo = useCallback(async () => {
    if (!account || seeding) return;
    setSeeding(true);
    try {
      console.log("[Dashboard] Triggering demo seeds...");
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
      console.error("[Dashboard] Demo seed failed:", e);
    } finally {
      setSeeding(false);
    }
  }, [account, seeding, fetchPending]);

  /**
   * Main Lifecycle Management
   */
  useEffect(() => {
    // Safety reset when switching wallets
    setIsProcessing(false);
    txLock.current = false;
    setProcessingStatus("");

    if (account?.address) {
      const existingVault = currentVaultRef.current;
      const preserveExisting = Boolean(
        existingVault?.owner &&
        existingVault.owner.toLowerCase() === account.address.toLowerCase()
      );

      console.log("[Dashboard] Phase: Account Connected. Root:", account.address);
      traceDashboard("Account connected", {
        owner: account.address,
        preserveExisting,
        existingVaultId: preserveExisting ? existingVault.vault_id : null,
      });
      setLoading(true);
      if (!preserveExisting) {
        traceDashboard("Vault state update started", {
          source: "account-change",
          owner: account.address,
        });
        setVault(null);
      }

      const init = async () => {
        try {
          const fetchState = await fetchVault({ preserveExisting });
          traceDashboard("Initial vault fetch completed", {
            owner: account.address,
            status: fetchState,
            preserveExisting,
          });
          await Promise.all([fetchPending(), fetchHistory()]);
        } catch (err) {
          console.error("[Dashboard] Initial fetch critical failure:", err);
          traceDashboard("Initial load failed", {
            owner: account.address,
            reason: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setLoading(false);
          traceDashboard("Initial load completed", {
            owner: account.address,
          });
          console.log("[Dashboard] Phase: Initial Load Complete.");
        }
      };

      init();
    } else {
      setLoading(false);
      traceDashboard("No account available");
      setVault(null);
      setHistory([]);
      setLoadError("");
    }
  }, [account?.address, fetchVault, fetchPending, fetchHistory]);

  // Session recovery check
  useEffect(() => {
    if (!isConnected && !account?.address) {
      console.log("[Dashboard] Phase: Wallet Disconnected.");
      traceDashboard("Wallet disconnected");
      setVault(null);
      setPending(null);
      setHistory([]);
      setLoadError("");
    }
  }, [account?.address, isConnected]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-pine-950 text-mist">
        <div className="bg-pine-900/60 p-12 rounded-[2rem] border border-pine-800 flex flex-col items-center space-y-8 max-w-lg w-full text-center">
          <div className="p-6 bg-sprout-500/10 rounded-full">
            <Wallet className="w-16 h-16 text-sprout-400" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-display font-bold text-mist">Restricted Access</h1>
            <p className="text-mist/60 text-lg">
              Connect your Sui wallet to access your private savings vault.
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
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-sprout-400 animate-spin" />
          <p className="text-mist/40 animate-pulse font-bold tracking-widest text-xs uppercase">Authenticating Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pine-950 text-mist p-4 md:p-8">
      {/* Production Transaction Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-pine-950/90 backdrop-blur-md z-[100] flex items-center justify-center transition-all">
          <div className="bg-pine-900 border border-pine-800 p-10 rounded-[2.5rem] flex flex-col items-center gap-8 max-w-sm text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="relative">
              <Loader2 className="w-20 h-20 text-sprout-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-sprout-400 rounded-full animate-ping" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-display font-bold text-mist uppercase tracking-wider">On-Chain Action</h3>
              <p className="text-mist/50 text-sm font-medium">{processingStatus}</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-2xl font-display font-bold text-sprout-400 hover:text-sprout-300 transition-colors">Sprout</Link>
            <button
              onClick={handleSeedDemo}
              disabled={seeding || isProcessing}
              className="text-[10px] bg-pine-900 hover:bg-pine-800 text-mist/40 hover:text-mist/60 px-4 py-2 rounded-full border border-pine-800 transition-all flex items-center gap-2 uppercase font-bold tracking-widest"
            >
              {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Seed Demo
            </button>
          </div>
          <div className="flex items-center gap-4">
            <ConnectButton />
          </div>
        </header>

        {!vault ? (
          <div className="bg-pine-900/40 border border-pine-800 rounded-[3.5rem] p-16 flex flex-col items-center space-y-10 text-center max-w-2xl mx-auto relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-sprout-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
            <SproutGrowth totalDepositedSui={0} size={220} />
            <div className="space-y-4">
              <h2 className="text-4xl font-display font-bold text-mist">{loadError ? "Vault Check Failed" : "Open Your Savings Vault"}</h2>
              <p className="text-mist/50 text-lg max-w-sm mx-auto leading-relaxed">
                {loadError || "Connect your account to an on-chain vault to start harvesting micro-savings automatically."}
              </p>
            </div>
            <button
              onClick={loadError ? () => fetchVault() : handleOpenVault}
              disabled={isProcessing}
              className="bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-14 py-6 rounded-2xl flex items-center gap-4 shadow-[0_15px_30px_rgba(134,196,84,0.15)] hover:shadow-[0_20px_40px_rgba(134,196,84,0.25)] active:scale-95 transition-all text-xl disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <Plus className="w-6 h-6" />}
              {loadError ? "Retry Vault Check" : "Initialize Vault"}
            </button>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {/* Main Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-12 xl:col-span-5 bg-pine-900/40 border border-pine-800 rounded-[2.5rem] p-10 flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 flex items-center gap-3">
                  <div className="text-[10px] font-bold text-sprout-400 uppercase tracking-widest bg-sprout-400/10 px-3 py-1 rounded-full border border-sprout-400/20">
                    Vault Active
                  </div>
                  <div className="w-2 h-2 bg-sprout-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(134,196,84,0.5)]" />
                </div>
                <SproutGrowth totalDepositedSui={Number(vault.balance) / 1_000_000_000} size={260} />
                <div className="mt-8 text-center relative z-10">
                  <div className="text-mist/30 text-[10px] font-bold uppercase tracking-[0.3em]">Total Balance</div>
                  <div className="text-7xl font-display font-bold text-harvest-400 mt-4 tabular-nums flex items-baseline justify-center">
                    {(Number(vault.balance) / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xl ml-3 text-harvest-400/40 font-bold">SUI</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-12 xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-pine-900/60 p-8 rounded-[2.5rem] border border-pine-800 flex flex-col justify-between hover:border-pine-700 transition-all group">
                  <div className="text-mist/30 text-[10px] font-bold uppercase tracking-widest">Total Seeded</div>
                  <div className="text-5xl font-display font-bold text-mist mt-6 tabular-nums flex items-baseline">
                    {(Number(vault.total_deposited) / 1_000_000_000).toFixed(2)}
                    <span className="text-sm ml-2 text-mist/20 font-bold">SUI</span>
                  </div>
                </div>
                <div className="bg-pine-900/60 p-8 rounded-[2.5rem] border border-pine-800 flex flex-col justify-between hover:border-pine-700 transition-all group">
                  <div className="text-mist/30 text-[10px] font-bold uppercase tracking-widest">Savings Events</div>
                  <div className="text-5xl font-display font-bold text-mist mt-6 tabular-nums">
                    {vault.deposit_count}
                    <span className="text-sm ml-2 text-mist/20 font-bold uppercase tracking-widest">Tx</span>
                  </div>
                </div>
                <div className="sm:col-span-2 bg-sprout-500/5 p-10 rounded-[2.5rem] border border-sprout-500/10 flex flex-col justify-between relative overflow-hidden group hover:border-sprout-500/30 transition-all">
                  <div className="absolute right-[-5%] top-[-50%] w-64 h-64 bg-sprout-500/10 blur-[100px] rounded-full group-hover:scale-110 transition-transform duration-1000" />
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center relative z-10 gap-6">
                    <div className="space-y-4">
                      <div className="text-sprout-400/60 text-[10px] font-bold uppercase tracking-widest">Accumulated Spare Change</div>
                      <div className="text-6xl font-display font-bold text-sprout-400 tabular-nums flex items-baseline">
                        {(Number(pending?.pendingMist || 0) / 1_000_000_000).toFixed(4)}
                        <span className="text-lg ml-3 opacity-40 font-bold">SUI</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="bg-sprout-500/10 px-6 py-3 rounded-full text-sprout-400 text-xs font-bold border border-sprout-500/20 whitespace-nowrap">
                        {pending?.sinceLastDeposit || 0} PENDING ACTIONS
                      </div>
                      <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest pr-2">
                        Assets: SUI, USDC, CETUS
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="space-y-10 pt-4">
              <div className="flex flex-wrap gap-x-10 gap-y-2 border-b border-pine-800 shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.1)]">
                {["overview", "history", "withdraw", "wallet"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-1 py-6 font-bold uppercase tracking-[0.2em] text-[10px] transition-all relative ${activeTab === tab ? "text-sprout-400" : "text-mist/20 hover:text-mist/40"
                      }`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-sprout-500 shadow-[0_0_15px_rgba(134,196,84,0.6)]"></div>
                    )}
                  </button>
                ))}
              </div>

              <div className="min-h-[400px]">
                {activeTab === "overview" && (
                  <div className="animate-in fade-in duration-700">
                    {Number(pending?.pendingMist || 0) > 0 ? (
                      <div className="bg-pine-900/20 p-14 rounded-[3rem] border border-pine-800/40 flex flex-col md:flex-row items-center justify-between gap-12 group">
                        <div className="space-y-3 text-center md:text-left">
                          <h3 className="text-4xl font-display font-bold text-mist">Flush to Vault</h3>
                          <p className="text-mist/40 text-lg max-w-sm">
                            Move your local spare change onto the blockchain to start earning rewards.
                          </p>
                        </div>
                        <button
                          onClick={handleDeposit}
                          disabled={isProcessing}
                          className="bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-14 py-6 rounded-2xl flex items-center gap-4 shadow-[0_20px_40px_rgba(134,196,84,0.1)] hover:shadow-[0_25px_50px_rgba(134,196,84,0.2)] active:scale-95 transition-all text-xl"
                        >
                          <ArrowUpRight className="w-7 h-7" />
                          Deposit Now
                        </button>
                      </div>
                    ) : (
                      <div className="bg-pine-900/5 p-24 rounded-[3rem] border border-dashed border-pine-800/30 flex flex-col items-center text-center space-y-8">
                        <div className="w-24 h-24 bg-pine-900/40 rounded-full flex items-center justify-center border border-pine-800/50 shadow-inner">
                          <CheckCircle2 className="text-pine-800/40 w-12 h-12" />
                        </div>
                        <div className="space-y-3">
                          <div className="text-3xl font-display font-bold text-mist/20 uppercase tracking-widest">Vault Synchronized</div>
                          <p className="text-mist/10 text-sm max-w-xs mx-auto font-medium">All savings have been secured in your on-chain vault.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "history" && (
                  <div className="bg-pine-900/20 rounded-[2.5rem] overflow-hidden border border-pine-800/60 animate-in fade-in duration-700">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-pine-900/40 border-b border-pine-800/60">
                            <th className="px-12 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold">Transaction Source</th>
                            <th className="px-12 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold text-right">Amount</th>
                            <th className="px-12 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold text-right">Execution Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-pine-800/20">
                          {history.length > 0 ? history.map((item, idx) => (
                            <tr key={idx} className="hover:bg-sprout-500/[0.02] transition-colors group">
                              <td className="px-12 py-6">
                                <div className="text-mist/70 font-bold text-sm tracking-wide">{item.source_label}</div>
                                <div className="text-[10px] text-mist/20 uppercase font-bold mt-1">Confirmed Layer 1</div>
                              </td>
                              <td className="px-12 py-6 text-right">
                                <div className="text-sprout-400 font-bold tabular-nums text-lg">{(Number(item.amount_mist) / 1_000_000_000).toFixed(4)}</div>
                                <div className="text-[9px] text-sprout-400/30 font-bold uppercase tracking-widest">SUI Native</div>
                              </td>
                              <td className="px-12 py-6 text-right tabular-nums text-mist/40 font-medium text-xs">{new Date(item.deposited_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={3} className="px-12 py-24 text-center">
                                <div className="flex flex-col items-center gap-6 opacity-10">
                                  <History className="w-16 h-16" />
                                  <div className="font-bold uppercase tracking-[0.3em] text-xs">No Deposit History Record</div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "withdraw" && (
                  <div className="bg-pine-900/20 p-14 rounded-[3rem] border border-pine-800/40 space-y-12 max-w-2xl animate-in fade-in duration-700">
                    <div className="space-y-4">
                      <h3 className="text-4xl font-display font-bold text-mist">Withdraw Capital</h3>
                      <p className="text-mist/40 text-lg leading-relaxed">Sprout charges a nominal 0.5% protocol fee on withdrawals to maintain the automated micro-savings infrastructure.</p>
                    </div>
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="relative group">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            className="w-full bg-pine-950/50 border-2 border-pine-800/50 rounded-3xl p-8 text-5xl font-display focus:outline-none focus:border-harvest-400/50 transition-all pl-24 tabular-nums text-mist"
                          />
                          <div className="absolute left-8 top-1/2 -translate-y-1/2 text-harvest-400/50 font-bold text-2xl uppercase font-display">Sui</div>
                          <button
                            onClick={() => setWithdrawAmount((Number(vault.balance) / 1_000_000_000).toString())}
                            className="absolute right-8 top-1/2 -translate-y-1/2 bg-pine-900 hover:bg-pine-800 px-4 py-2 rounded-xl text-mist/30 hover:text-sprout-400 text-[10px] font-bold uppercase tracking-widest transition-all border border-pine-800"
                          >
                            Max
                          </button>
                        </div>

                        <div className="flex items-center gap-4 bg-harvest-400/5 p-5 rounded-2xl border border-harvest-400/10">
                          <AlertCircle className="w-6 h-6 text-harvest-400/40" />
                          <div className="space-y-1">
                            <p className="text-xs text-harvest-400/60 font-bold uppercase tracking-wider">Protocol Fee Estimator</p>
                            <p className="text-sm text-harvest-400/40 font-medium tabular-nums">Network Fee: {(Number(withdrawAmount || 0) * 0.005).toFixed(6)} SUI</p>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleWithdraw}
                        disabled={isProcessing || !withdrawAmount || Number(withdrawAmount) <= 0}
                        className="w-full bg-harvest-400 hover:bg-harvest-500 text-pine-950 font-bold py-8 rounded-3xl transition-all disabled:opacity-50 flex items-center justify-center gap-4 text-2xl shadow-[0_20px_40px_rgba(232,184,101,0.1)] active:scale-[0.98]"
                      >
                        {isProcessing ? <Loader2 className="animate-spin w-8 h-8" /> : <Wallet className="w-8 h-8" />}
                        Execute Withdrawal
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "wallet" && (
                  <div className="bg-pine-900/20 p-14 rounded-[3rem] border border-pine-800/40 space-y-10 max-w-2xl animate-in fade-in duration-700">
                    <div className="space-y-4">
                      <h3 className="text-4xl font-display font-bold text-mist">Wallet Security</h3>
                      <p className="text-mist/40 text-lg leading-relaxed">Your vault is cryptographically linked to your Sui address. Only you can authorize deposits and withdrawals.</p>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-pine-950/50 p-8 rounded-3xl border border-pine-800 space-y-4">
                        <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest">Connected Address</div>
                        <div className="text-sprout-400 font-mono break-all text-sm bg-pine-900/50 p-4 rounded-xl border border-pine-800/50">
                          {account?.address || "Not connected"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-pine-950/50 p-6 rounded-3xl border border-pine-800">
                          <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest mb-2">Network</div>
                          <div className="text-mist font-bold">Sui Testnet</div>
                        </div>
                        <div className="bg-pine-950/50 p-6 rounded-3xl border border-pine-800">
                          <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest mb-2">Auth Method</div>
                          <div className="text-mist font-bold">Standard Wallet</div>
                        </div>
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
