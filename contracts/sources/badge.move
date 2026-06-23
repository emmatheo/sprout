module sprout::badge {
    use sui::tx_context::{Self, TxContext};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::dynamic_field as df;
    use sprout::vault::{Self, Vault};

    // --- Constants ---
    const FIRST_DEPOSIT: u8 = 0;
    const ONE_SUI: u8 = 1;
    const TEN_SUI: u8 = 2;
    const HUNDRED_SUI: u8 = 3;

    const MIST_PER_SUI: u64 = 1_000_000_000;

    // --- Errors ---
    const ENotOwner: u64 = 0;
    const EThresholdNotMet: u64 = 1;
    const EAlreadyClaimed: u64 = 2;
    const EInvalidMilestone: u64 = 3;

    // --- Objects ---

    public struct MilestoneBadge has key {
        id: UID,
        owner: address,
        milestone: u8,
        total_deposited_at_claim: u64,
    }

    public struct MilestoneClaimedKey has copy, drop, store {
        milestone: u8
    }

    // --- Public Functions ---

    public fun claim_milestone_badge(vault: &mut Vault, milestone: u8, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(vault::owner(vault) == sender, ENotOwner);

        let threshold = threshold_for(milestone);
        let total_deposited = vault::total_deposited(vault);
        assert!(total_deposited >= threshold, EThresholdNotMet);

        let key = MilestoneClaimedKey { milestone };
        assert!(!df::exists_(vault::uid(vault), key), EAlreadyClaimed);

        df::add(vault::uid_mut(vault), key, true);

        let badge = MilestoneBadge {
            id: object::new(ctx),
            owner: sender,
            milestone,
            total_deposited_at_claim: total_deposited,
        };

        transfer::transfer(badge, sender);
    }

    // --- Internal Functions ---

    fun threshold_for(milestone: u8): u64 {
        if (milestone == FIRST_DEPOSIT) {
            1
        } else if (milestone == ONE_SUI) {
            1 * MIST_PER_SUI
        } else if (milestone == TEN_SUI) {
            10 * MIST_PER_SUI
        } else if (milestone == HUNDRED_SUI) {
            100 * MIST_PER_SUI
        } else {
            abort EInvalidMilestone
        }
    }
}
