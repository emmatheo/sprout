module sprout::spending_source {
    use sui::tx_context::{Self, TxContext};
    use sprout::vault::{Self, Vault};

    const ENotOwner: u64 = 0;

    /// Seal access policy: only the vault owner can approve a decryption share request.
    /// This is used by off-chain spending sources (like Enoki-managed browser wallets) 
    /// to prove authority before key servers release decryption shares.
    public fun seal_approve_source(vault: &Vault, ctx: &TxContext) {
        assert!(vault::owner(vault) == tx_context::sender(ctx), ENotOwner);
    }
}
