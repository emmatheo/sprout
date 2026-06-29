"use client";

import { useCurrentAccount, useCurrentWallet, ConnectButton, useSuiClient } from "@mysten/dapp-kit";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import SproutGrowth from "@/components/SproutGrowth";
import { useVaultActions } from "@/lib/vault";
import { API_URL, SPROUT_PACKAGE_ID, SUI_NETWORK } from "@/lib/suiClient";
import { Loader2, Plus, ArrowUpRight, History, Wallet, AlertCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { useRouter } from "next/navigation";

const MIST_PER_SUI = 1_000_000_000;
const DEPOSIT_GAS_RESERVE_MIST = 30_000_000n;

function formatSui(mist: string | number | null | undefined, fractionDigits = 2) {
  return (Number(mist || 0) / MIST_PER_SUI).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "No transactions yet";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getExplorerTxUrl(digest: string) {
  return `https://suiexplorer.com/txblock/${digest}?network=${SUI_NETWORK}`;
}

function parseSuiToMist(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null;

  const [whole = "0", fractional = ""] = trimmed.split(".");
  if (!whole && !fractional) return null;

  const normalizedFraction = fractional.slice(0, 9).padEnd(9, "0");
  return BigInt(whole || "0") * BigInt(MIST_PER_SUI) + BigInt(normalizedFraction || "0");
}

function mistToInputValue(mist: string | number | bigint | null | undefined) {
  const amount = BigInt(mist?.toString() || "0");
  const whole = amount / BigInt(MIST_PER_SUI);
  const fraction = (amount % BigInt(MIST_PER_SUI)).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
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
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [walletBalanceMist, setWalletBalanceMist] = useState("0");
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);
  const [walletBalanceError, setWalletBalanceError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const txLock = useRef(false);
  const currentVaultRef = useRef<any>(null);
  const depositEditedRef = useRef(false);

  const { openVault, deposit, withdraw } = useVaultActions();

  useEffect(() => {
    currentVaultRef.current = vault;
  }, [vault]);

  const pendingMist = pending?.pendingMist?.toString() ?? "0";
  const pendingAmount = BigInt(pendingMist);
  const depositAmountMist = parseSuiToMist(depositAmount);
  const walletBalance = BigInt(walletBalanceMist || "0");
  const maxDepositMist = walletBalance > DEPOSIT_GAS_RESERVE_MIST ? walletBalance - DEPOSIT_GAS_RESERVE_MIST : 0n;
  const hasDepositAmount = depositAmountMist !== null && depositAmountMist > 0n;
  const hasDepositBalance = hasDepositAmount && depositAmountMist <= maxDepositMist;
  const canDeposit = Boolean(account && vault && hasDepositBalance && !isProcessing);
  const depositValidationError = hasDepositAmount && depositAmountMist > maxDepositMist ? "Insufficient wallet balance." : "";
  const maxDepositDisplay = mistToInputValue(maxDepositMist);

  useEffect(() => {
    if (!depositEditedRef.current && pendingMist !== "0") {
      setDepositAmount(mistToInputValue(pendingMist));
    }
  }, [pendingMist]);

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
      return { status: "error" as const, message: "Direct Sui vault lookup failed." };
    }
  }, [account, getFieldAddress, normalizeVault, suiClient]);

  const hydrateCreatedVault = useCallback((vaultId: string) => {
    if (!account) return;
    setVault({
      owner: account.address,
      vault_id: vaultId,
      balance: "0",
      total_deposited: "0",
      total_withdrawn: "0",
      total_profit_loss: "0",
      deposit_count: 0,
      withdrawal_count: 0,
      total_transactions: 0,
      opened_at: new Date().toISOString(),
      last_transaction_at: null,
      status: "Active",
    });
    setLoading(false);
    setLoadError("");
    setActiveTab("overview");
  }, [account]);

  const syncCreatedVault = useCallback(async (vaultId: string) => {
    if (!account) return null;

    try {
      const res = await fetch(`${API_URL}/api/vaults/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: account.address, vaultId }),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      setVault(data);
      return data;
    } catch (error) {
      return null;
    }
  }, [account]);

  const fetchVault = useCallback(async (options?: { preserveExisting?: boolean }): Promise<"found" | "missing" | "error"> => {
    if (!account) {
      return "missing";
    }

    const preserveExisting = options?.preserveExisting ?? false;
    if (!preserveExisting) setLoadError("");
    try {
      const res = await fetch(`${API_URL}/api/vaults/${account.address}`);

      if (res.ok) {
        const data = await res.json();
        setVault(data);
        return "found";
      } else if (res.status === 404) {
        const chainResult = await fetchVaultFromChain();
        if (chainResult.status === "found") {
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
        await res.text();
        const chainResult = await fetchVaultFromChain();
        if (chainResult.status === "found") {
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
    } catch {
      const chainResult = await fetchVaultFromChain();
      if (chainResult.status === "found") {
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

  const fetchWalletBalance = useCallback(async () => {
    if (!account) {
      setWalletBalanceMist("0");
      return;
    }

    setWalletBalanceLoading(true);
    setWalletBalanceError("");
    try {
      const balance = await suiClient.getBalance({
        owner: account.address,
        coinType: "0x2::sui::SUI",
      });
      setWalletBalanceMist(balance.totalBalance);
    } catch (error) {
      setWalletBalanceError("Wallet balance could not be refreshed.");
    } finally {
      setWalletBalanceLoading(false);
    }
  }, [account, suiClient]);

  const fetchPending = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_URL}/api/roundups/${account.address}/pending`);
      if (res.ok) {
        setPending(await res.json());
      }
    } catch {
      setNotice({ type: "error", message: "Pending round-ups could not be refreshed." });
    }
  }, [account]);

  const fetchHistory = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_URL}/api/vaults/${account.address}/transactions`);
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch {
      setNotice({ type: "error", message: "Transaction history could not be refreshed." });
    }
  }, [account]);

  const refreshDashboard = useCallback(async (options?: { attempts?: number; waitMs?: number }) => {
    const attempts = options?.attempts ?? 1;
    const waitMs = options?.waitMs ?? 2000;

    for (let attempt = 0; attempt < attempts; attempt++) {
      await Promise.all([
        fetchWalletBalance(),
        fetchVault({ preserveExisting: true }),
        fetchPending(),
        fetchHistory(),
      ]);

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }, [fetchWalletBalance, fetchVault, fetchPending, fetchHistory]);

  const handleOpenVault = useCallback(async () => {
    if (!account) {
      setNotice({ type: "error", message: "Please connect your wallet first." });
      return;
    }

    if (isProcessing || txLock.current) {
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("Checking for an existing vault...");
    setNotice(null);
    txLock.current = true;

    try {
      const existingVault = await fetchVault();
      if (existingVault === "found") {
        setNotice({ type: "info", message: "This wallet already has an active vault." });
        return;
      }
      if (existingVault === "error") {
        throw new Error("Could not verify whether this wallet already has a vault.");
      }

      setProcessingStatus("Preparing secure connection...");
      const result = await openVault();

      if (result.createdVaultId) {
        hydrateCreatedVault(result.createdVaultId);
        void syncCreatedVault(result.createdVaultId);
      }

      router.replace("/dashboard");

      setProcessingStatus("Waiting for indexer to catch up...");

      let synced = false;
      const MAX_ATTEMPTS = 8;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        setProcessingStatus(`Confirming setup (${i + 1}/${MAX_ATTEMPTS})...`);
        const syncState = await fetchVault({ preserveExisting: !!result.createdVaultId });
        synced = syncState === "found";
        if (synced) {
          break;
        }
        if (syncState === "error") break;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (synced) {
        await Promise.all([fetchWalletBalance(), fetchPending(), fetchHistory()]);
        setNotice({ type: "success", message: "Vault opened successfully." });
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#86C454", "#9FD66B", "#E8B865"]
        });
      } else {
        if (result.createdVaultId) {
          setNotice({ type: "success", message: "Transaction confirmed. Your vault is opening now." });
        } else {
          setNotice({ type: "success", message: "Transaction confirmed. Your vault may take a few moments to appear." });
        }
      }

    } catch (e: any) {
      const msg = e?.message || "Unknown error occurred.";
      setNotice({ type: "error", message: `Initialization failed: ${msg}` });
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      txLock.current = false;
    }
  }, [account, openVault, fetchVault, hydrateCreatedVault, syncCreatedVault, isProcessing, router, fetchWalletBalance, fetchPending, fetchHistory]);

  const handleDeposit = useCallback(async () => {
    if (!account || !vault || isProcessing || txLock.current) return;
    if (!depositAmountMist || !hasDepositBalance) {
      setNotice({ type: "error", message: "Insufficient wallet balance." });
      return;
    }

    const previousVault = currentVaultRef.current;
    const previousWalletBalance = BigInt(walletBalanceMist || "0");
    const sourceLabel = pendingAmount > 0n && depositAmountMist === pendingAmount ? "Pending round-ups" : "Manual deposit";

    setIsProcessing(true);
    setProcessingStatus("Confirming deposit...");
    setNotice(null);
    txLock.current = true;

    try {
      const result = await deposit(account.address, vault.vault_id, depositAmountMist.toString(), sourceLabel);
      const occurredAt = new Date().toISOString();
      const expectedBalance = (BigInt(previousVault?.balance || "0") + depositAmountMist).toString();
      const expectedTotalDeposited = (BigInt(previousVault?.total_deposited || "0") + depositAmountMist).toString();
      const expectedDepositCount = Number(previousVault?.deposit_count || 0) + 1;
      const expectedTotalTransactions = Number(previousVault?.total_transactions || 0) + 1;
      const optimisticTransaction = {
        type: "Deposit",
        amount_mist: depositAmountMist.toString(),
        occurred_at: occurredAt,
        tx_digest: result.digest,
        status: "Confirmed",
        source_label: sourceLabel,
      };

      setVault((current: any) => current ? {
        ...current,
        balance: expectedBalance,
        total_deposited: expectedTotalDeposited,
        total_profit_loss: (
          BigInt(expectedBalance) +
          BigInt(current.total_withdrawn || "0") -
          BigInt(expectedTotalDeposited)
        ).toString(),
        deposit_count: expectedDepositCount,
        total_transactions: expectedTotalTransactions,
        last_transaction_at: occurredAt,
      } : current);

      setWalletBalanceMist((previousWalletBalance - depositAmountMist > 0n ? previousWalletBalance - depositAmountMist : 0n).toString());
      setHistory((current) => current.some((item) => item.tx_digest === result.digest) ? current : [optimisticTransaction, ...current]);
      setDepositAmount("");
      depositEditedRef.current = false;
      if (sourceLabel === "Pending round-ups") {
        setPending({ pendingMist: "0", sinceLastDeposit: 0 });
      }

      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.7 },
        colors: ["#86C454", "#9FD66B", "#E8B865", "#FFFFFF"]
      });

      setProcessingStatus("Updating ledger...");
      await refreshDashboard({ attempts: 4, waitMs: 2000 });
      setVault((current: any) => {
        if (!current) return current;
        const ensuredBalance = BigInt(current.balance || "0") >= BigInt(expectedBalance) ? current.balance : expectedBalance;
        const ensuredTotalDeposited = BigInt(current.total_deposited || "0") >= BigInt(expectedTotalDeposited)
          ? current.total_deposited
          : expectedTotalDeposited;
        const ensuredDepositCount = Math.max(Number(current.deposit_count || 0), expectedDepositCount);
        const ensuredTotalTransactions = Math.max(Number(current.total_transactions || 0), expectedTotalTransactions);

        return {
          ...current,
          balance: ensuredBalance,
          total_deposited: ensuredTotalDeposited,
          total_profit_loss: (
            BigInt(ensuredBalance) +
            BigInt(current.total_withdrawn || "0") -
            BigInt(ensuredTotalDeposited)
          ).toString(),
          deposit_count: ensuredDepositCount,
          total_transactions: ensuredTotalTransactions,
          last_transaction_at: current.last_transaction_at || occurredAt,
        };
      });
      setHistory((current) => current.some((item) => item.tx_digest === result.digest) ? current : [optimisticTransaction, ...current]);
      setNotice({ type: "success", message: "Deposit confirmed and dashboard updated." });
    } catch (e: any) {
      setNotice({ type: "error", message: `Deposit failed: ${e?.message || "Unknown error"}` });
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      txLock.current = false;
    }
  }, [account, vault, pendingAmount, walletBalanceMist, depositAmountMist, deposit, refreshDashboard, hasDepositBalance, isProcessing]);

  const handleWithdraw = useCallback(async () => {
    if (!account || !vault || !withdrawAmount || isProcessing || txLock.current) return;

    setIsProcessing(true);
    setProcessingStatus("Authenticating withdrawal...");
    setNotice(null);
    txLock.current = true;

    try {
      const amountMist = Math.round(parseFloat(withdrawAmount) * 1_000_000_000).toString();
      await withdraw(vault.vault_id, amountMist);

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#E8B865", "#FFFFFF"]
      });

      setWithdrawAmount("");
      setProcessingStatus("Finalizing transfer...");
      await refreshDashboard({ attempts: 4, waitMs: 2000 });
      setNotice({ type: "success", message: "Withdrawal confirmed and dashboard updated." });
    } catch (e: any) {
      setNotice({ type: "error", message: `Withdrawal failed: ${e?.message || "Unknown error"}` });
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      txLock.current = false;
    }
  }, [account, vault, withdrawAmount, withdraw, refreshDashboard, isProcessing]);

  const handleSeedDemo = useCallback(async () => {
    if (!account || seeding) return;
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
      setNotice({ type: "error", message: "Demo round-ups could not be seeded." });
    } finally {
      setSeeding(false);
    }
  }, [account, seeding, fetchPending]);

  useEffect(() => {
    setIsProcessing(false);
    txLock.current = false;
    setProcessingStatus("");

    if (account?.address) {
      const existingVault = currentVaultRef.current;
      const preserveExisting = Boolean(
        existingVault?.owner &&
        existingVault.owner.toLowerCase() === account.address.toLowerCase()
      );

      setLoading(true);
      if (!preserveExisting) {
        setVault(null);
      }

      const init = async () => {
        try {
          await Promise.all([
            fetchWalletBalance(),
            fetchVault({ preserveExisting }),
            fetchPending(),
            fetchHistory(),
          ]);
        } catch {
          setNotice({ type: "error", message: "Dashboard data could not be loaded." });
        } finally {
          setLoading(false);
        }
      };

      init();
    } else {
      setLoading(false);
      setVault(null);
      setHistory([]);
      setWalletBalanceMist("0");
      setWalletBalanceError("");
      setLoadError("");
      setNotice(null);
    }
  }, [account?.address, fetchVault, fetchPending, fetchHistory, fetchWalletBalance]);

  useEffect(() => {
    if (!isConnected && !account?.address) {
      setVault(null);
      setPending(null);
      setHistory([]);
      setWalletBalanceMist("0");
      setWalletBalanceError("");
      setLoadError("");
      setNotice(null);
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

        {notice && (
          <div
            className={`rounded-2xl border px-5 py-4 text-sm font-bold ${
              notice.type === "success"
                ? "border-sprout-400/20 bg-sprout-400/10 text-sprout-400"
                : notice.type === "error"
                  ? "border-harvest-400/20 bg-harvest-400/10 text-harvest-400"
                  : "border-pine-700 bg-pine-900/60 text-mist/60"
            }`}
          >
            {notice.message}
          </div>
        )}

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
              <div className="lg:col-span-12 xl:col-span-4 bg-pine-900/40 border border-pine-800 rounded-[2.5rem] p-8 md:p-10 flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 flex items-center gap-3">
                  <div className="text-[10px] font-bold text-sprout-400 uppercase tracking-widest bg-sprout-400/10 px-3 py-1 rounded-full border border-sprout-400/20">
                    {vault.status || "Active"}
                  </div>
                  <div className="w-2 h-2 bg-sprout-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(134,196,84,0.5)]" />
                </div>
                <SproutGrowth totalDepositedSui={Number(vault.balance) / MIST_PER_SUI} size={260} />
                <div className="mt-8 text-center relative z-10">
                  <div className="text-mist/30 text-[10px] font-bold uppercase tracking-[0.3em]">Current Vault Balance</div>
                  <div className="text-5xl md:text-6xl font-display font-bold text-harvest-400 mt-4 tabular-nums flex items-baseline justify-center">
                    {formatSui(vault.balance)}
                    <span className="text-xl ml-3 text-harvest-400/40 font-bold">SUI</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-12 xl:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {[
                  ["Wallet Balance", walletBalanceLoading ? "Refreshing..." : `${formatSui(walletBalanceMist)} SUI`],
                  ["Total Deposited", `${formatSui(vault.total_deposited)} SUI`],
                  ["Total Withdrawn", `${formatSui(vault.total_withdrawn)} SUI`],
                  ["Total Profit/Loss", `${formatSui(vault.total_profit_loss)} SUI`],
                  ["Number of Deposits", vault.deposit_count ?? 0],
                  ["Number of Withdrawals", vault.withdrawal_count ?? 0],
                  ["Total Transactions", vault.total_transactions ?? 0],
                  ["Vault Created Date", formatDate(vault.opened_at)],
                  ["Last Transaction Date", formatDate(vault.last_transaction_at)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-pine-900/60 p-6 rounded-[2rem] border border-pine-800 flex flex-col justify-between hover:border-pine-700 transition-all min-h-32">
                    <div className="text-mist/30 text-[10px] font-bold uppercase tracking-widest">{label}</div>
                    <div className="text-2xl font-display font-bold text-mist mt-5 tabular-nums break-words">{value}</div>
                  </div>
                ))}
                <div className="sm:col-span-2 xl:col-span-3 bg-sprout-500/5 p-8 md:p-10 rounded-[2.5rem] border border-sprout-500/10 flex flex-col justify-between relative overflow-hidden group hover:border-sprout-500/30 transition-all">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center relative z-10 gap-6">
                    <div className="space-y-4">
                      <div className="text-sprout-400/60 text-[10px] font-bold uppercase tracking-widest">Accumulated Spare Change</div>
                      <div className="text-4xl md:text-5xl font-display font-bold text-sprout-400 tabular-nums flex items-baseline">
                        {formatSui(pendingMist, 4)}
                        <span className="text-lg ml-3 opacity-40 font-bold">SUI</span>
                      </div>
                      {walletBalanceError && <p className="text-xs text-harvest-400 font-bold">{walletBalanceError}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="bg-sprout-500/10 px-6 py-3 rounded-full text-sprout-400 text-xs font-bold border border-sprout-500/20 whitespace-nowrap">
                        {pending?.sinceLastDeposit || 0} PENDING ACTIONS
                      </div>
                      <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest pr-2">
                        Vault Status: {vault.status || "Active"}
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
                    <div className="bg-pine-900/20 p-8 md:p-14 rounded-[3rem] border border-pine-800/40 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-10 group">
                      <div className="space-y-6 text-center xl:text-left flex-1">
                        <div className="space-y-3">
                          <h3 className="text-4xl font-display font-bold text-mist">Flush to Vault</h3>
                          <p className="text-mist/40 text-lg max-w-sm">
                            Move available SUI from your wallet into your on-chain vault.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                          <div className="bg-pine-950/50 p-5 rounded-2xl border border-pine-800">
                            <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest">Available Wallet</div>
                            <div className="text-xl font-display font-bold text-mist mt-2 tabular-nums">{formatSui(walletBalanceMist, 4)} SUI</div>
                          </div>
                          <div className="bg-pine-950/50 p-5 rounded-2xl border border-pine-800">
                            <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest">Max Deposit</div>
                            <div className="text-xl font-display font-bold text-sprout-400 mt-2 tabular-nums">{formatSui(maxDepositMist.toString(), 4)} SUI</div>
                          </div>
                          <div className="bg-pine-950/50 p-5 rounded-2xl border border-pine-800">
                            <div className="text-[10px] text-mist/20 font-bold uppercase tracking-widest">Pending Round-Ups</div>
                            <div className="text-xl font-display font-bold text-harvest-400 mt-2 tabular-nums">{formatSui(pendingMist, 4)} SUI</div>
                          </div>
                        </div>
                      </div>

                      <div className="w-full xl:w-[28rem] space-y-4">
                        <div className="relative group">
                          <input
                            type="number"
                            min="0"
                            step="0.000000001"
                            placeholder="0.00"
                            value={depositAmount}
                            onChange={(e) => {
                              depositEditedRef.current = true;
                              setDepositAmount(e.target.value);
                            }}
                            className="w-full bg-pine-950/50 border-2 border-pine-800/50 rounded-3xl p-7 text-4xl font-display focus:outline-none focus:border-sprout-400/50 transition-all pl-24 pr-24 tabular-nums text-mist"
                          />
                          <div className="absolute left-8 top-1/2 -translate-y-1/2 text-sprout-400/50 font-bold text-xl uppercase font-display">Sui</div>
                          <button
                            onClick={() => {
                              depositEditedRef.current = true;
                              setDepositAmount(maxDepositDisplay);
                            }}
                            disabled={maxDepositMist <= 0n || isProcessing}
                            className="absolute right-7 top-1/2 -translate-y-1/2 bg-pine-900 hover:bg-pine-800 px-4 py-2 rounded-xl text-mist/30 hover:text-sprout-400 text-[10px] font-bold uppercase tracking-widest transition-all border border-pine-800 disabled:opacity-40"
                          >
                            Max
                          </button>
                        </div>
                        <p className={`min-h-5 text-sm font-bold ${depositValidationError ? "text-harvest-400" : "text-mist/30"}`}>
                          {depositValidationError || `Available to deposit: ${formatSui(maxDepositMist.toString(), 4)} SUI`}
                        </p>
                        <button
                          onClick={handleDeposit}
                          disabled={!canDeposit}
                          className="w-full bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold px-10 py-6 rounded-2xl flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(134,196,84,0.1)] hover:shadow-[0_25px_50px_rgba(134,196,84,0.2)] active:scale-95 transition-all text-xl disabled:opacity-50 disabled:hover:bg-sprout-500"
                        >
                          {isProcessing ? <Loader2 className="w-7 h-7 animate-spin" /> : <ArrowUpRight className="w-7 h-7" />}
                          {isProcessing ? "Depositing..." : "Deposit Now"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "history" && (
                  <div className="bg-pine-900/20 rounded-[2.5rem] overflow-hidden border border-pine-800/60 animate-in fade-in duration-700">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-pine-900/40 border-b border-pine-800/60">
                            <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold">Type</th>
                            <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold text-right">Amount</th>
                            <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold text-right">Date</th>
                            <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold">Transaction Hash</th>
                            <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.25em] text-mist/20 font-bold text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-pine-800/20">
                          {history.length > 0 ? history.map((item, idx) => (
                            <tr key={idx} className="hover:bg-sprout-500/[0.02] transition-colors group">
                              <td className="px-6 md:px-10 py-6">
                                <div className="text-mist/70 font-bold text-sm tracking-wide">{item.type}</div>
                                <div className="text-[10px] text-mist/20 uppercase font-bold mt-1">{item.source_label}</div>
                              </td>
                              <td className="px-6 md:px-10 py-6 text-right">
                                <div className={`font-bold tabular-nums text-lg ${item.type === "Withdrawal" ? "text-harvest-400" : "text-sprout-400"}`}>
                                  {formatSui(item.amount_mist, 4)}
                                </div>
                                <div className="text-[9px] text-sprout-400/30 font-bold uppercase tracking-widest">SUI Native</div>
                              </td>
                              <td className="px-6 md:px-10 py-6 text-right tabular-nums text-mist/40 font-medium text-xs">{formatDate(item.occurred_at)}</td>
                              <td className="px-6 md:px-10 py-6">
                                <a
                                  href={getExplorerTxUrl(item.tx_digest)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sprout-400/80 hover:text-sprout-300 font-mono text-xs break-all"
                                >
                                  {item.tx_digest?.slice(0, 12)}...{item.tx_digest?.slice(-8)}
                                </a>
                              </td>
                              <td className="px-6 md:px-10 py-6 text-right">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-sprout-400 bg-sprout-400/10 border border-sprout-400/20 rounded-full px-3 py-1">
                                  {item.status || "Confirmed"}
                                </span>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={5} className="px-12 py-24 text-center">
                                <div className="flex flex-col items-center gap-6 opacity-10">
                                  <History className="w-16 h-16" />
                                  <div className="font-bold uppercase tracking-[0.3em] text-xs">No Transactions Yet</div>
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
