"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EnokiClient } from "@mysten/enoki";
import { Loader2 } from "lucide-react";

const enokiClient = new EnokiClient({
  apiKey: process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY || "",
});

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // @ts-ignore - handleAuthCallback might be nested or typed differently in this version
        await enokiClient.handleAuthCallback();
        router.replace("/dashboard");
      } catch (error) {
        console.error("Auth callback error:", error);
        router.replace("/");
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-pine-950 text-mist space-y-4">
      <Loader2 className="w-12 h-12 text-sprout-400 animate-spin" />
      <h1 className="text-2xl font-display font-medium">Signing you in…</h1>
      <p className="text-mist/40">Securing your session with zkLogin</p>
    </div>
  );
}
