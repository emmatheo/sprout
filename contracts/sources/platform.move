module sprout::platform {
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::object::{Self, UID};

    const MAX_WITHDRAWAL_FEE_BPS: u16 = 200; // 2%
    
    const EInvalidFee: u64 = 0;

    public struct PlatformConfig has key {
        id: UID,
        treasury: address,
        withdrawal_fee_bps: u16,
    }

    public struct PlatformAdminCap has key {
        id: UID,
    }

    fun init(ctx: &mut TxContext) {
        let config = PlatformConfig {
            id: object::new(ctx),
            treasury: tx_context::sender(ctx),
            withdrawal_fee_bps: 50, // 0.5%
        };
        transfer::share_object(config);

        let admin_cap = PlatformAdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    public entry fun set_fee(config: &mut PlatformConfig, _cap: &PlatformAdminCap, new_fee_bps: u16) {
        assert!(new_fee_bps <= MAX_WITHDRAWAL_FEE_BPS, EInvalidFee);
        config.withdrawal_fee_bps = new_fee_bps;
    }

    public entry fun set_treasury(config: &mut PlatformConfig, _cap: &PlatformAdminCap, new_treasury: address) {
        config.treasury = new_treasury;
    }

    public fun treasury(config: &PlatformConfig): address {
        config.treasury
    }

    public fun withdrawal_fee_bps(config: &PlatformConfig): u16 {
        config.withdrawal_fee_bps
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
