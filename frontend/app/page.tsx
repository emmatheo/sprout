"use client";

import Link from "next/link";
import { ConnectButton } from "@mysten/dapp-kit";
import SproutGrowth from "@/components/SproutGrowth";
import { Coins, Zap, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-pine-950 text-mist">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="text-3xl font-display font-bold text-sprout-400">Sprout</div>
        <ConnectButton connectText="Get started" />
      </nav>

      {/* Hero */}
      <main className="flex-grow flex items-center px-8 max-w-7xl mx-auto w-full py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-block px-4 py-1.5 rounded-full bg-pine-900 border border-pine-800 text-sprout-400 font-medium text-sm">
              Spare change, invested automatically
            </div>
            <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight">
              You won't notice saving. <br />
              <span className="text-harvest-400">You'll notice having saved.</span>
            </h1>
            <p className="text-xl text-mist/70 max-w-lg leading-relaxed">
              Every card purchase rounds up to the next whole dollar.
              The change flows directly into your private, on-chain SUI vault.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-sprout-500 hover:bg-sprout-400 text-pine-950 font-bold rounded-xl transition-all text-center"
              >
                Open your vault
              </Link>
              <div className="hidden sm:block">
                <ConnectButton connectText="Connect Wallet" />
              </div>
            </div>
            <p className="text-sm text-mist/40 max-w-md">
              New here? Continue with Google — no wallet install needed.
              Already have a Sui wallet? Connect it the same way.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              <div className="absolute -inset-10 bg-sprout-500/10 blur-[100px] rounded-full"></div>
              <SproutGrowth totalDepositedSui={14} size={400} />
            </div>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="bg-pine-900/30 py-24 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-pine-900/60 p-10 rounded-3xl border border-pine-800 space-y-4">
              <Zap className="text-harvest-400 w-10 h-10" />
              <h3 className="text-2xl font-display font-bold text-harvest-400">It happens in the background</h3>
              <p className="text-mist/70">
                Sprout tracks your daily spending and calculates the spare change for every purchase automatically.
              </p>
            </div>
            <div className="bg-pine-900/60 p-10 rounded-3xl border border-pine-800 space-y-4">
              <Coins className="text-harvest-400 w-10 h-10" />
              <h3 className="text-2xl font-display font-bold text-harvest-400">Deposit with whatever you're holding</h3>
              <p className="text-mist/70">
                Hold USDC? Our DeepBook integration performs atomic swaps to SUI right before your deposit.
              </p>
            </div>
            <div className="bg-pine-900/60 p-10 rounded-3xl border border-pine-800 space-y-4">
              <ShieldCheck className="text-harvest-400 w-10 h-10" />
              <h3 className="text-2xl font-display font-bold text-harvest-400">Consistency becomes a record</h3>
              <p className="text-mist/70">
                Cross savings milestones to claim soulbound badges that verify your micro-investing journey.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-pine-900 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-mist/40 text-sm">
          <div>© 2024 Sprout. Built on Sui.</div>
          <div className="flex gap-8">
            <a href="#" className="hover:text-sprout-400">Documentation</a>
            <a href="#" className="hover:text-sprout-400">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
