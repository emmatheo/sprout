#[test_only]
module sprout::vault_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use std::string::{Self};
    use sprout::vault::{Self, Vault};
    use sprout::platform::{Self};
    use sprout::badge::{Self};

    #[test]
    fun test_vault_flow() {
        let owner = @0xA;
        let mut scenario = ts::begin(owner);

        // 1. Init platform
        {
            platform::init_for_testing(ts::ctx(&mut scenario));
        };

        // 2. Open vault
        ts::next_tx(&mut scenario, owner);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            vault::open_vault(&clock, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
        };

        // 3. Deposit x3
        ts::next_tx(&mut scenario, owner);
        {
            let mut vault = ts::take_from_sender<Vault>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            
            let coin1 = coin::mint_for_testing<SUI>(300_000_000, ts::ctx(&mut scenario));
            vault::deposit(&mut vault, coin1, string::utf8(b"purchase 1"), &clock, ts::ctx(&mut scenario));
            
            let coin2 = coin::mint_for_testing<SUI>(300_000_000, ts::ctx(&mut scenario));
            vault::deposit(&mut vault, coin2, string::utf8(b"purchase 2"), &clock, ts::ctx(&mut scenario));

            let coin3 = coin::mint_for_testing<SUI>(300_000_000, ts::ctx(&mut scenario));
            vault::deposit(&mut vault, coin3, string::utf8(b"purchase 3"), &clock, ts::ctx(&mut scenario));

            assert!(vault::total_deposited(&vault) == 900_000_000, 1);
            assert!(vault::deposit_count(&vault) == 3, 2);
            assert!(vault::balance_value(&vault) == 900_000_000, 3);

            clock::destroy_for_testing(clock);
            ts::return_to_sender(&scenario, vault);
        };

        // 4. Claim FIRST_DEPOSIT badge
        ts::next_tx(&mut scenario, owner);
        {
            let mut vault = ts::take_from_sender<Vault>(&scenario);
            badge::claim_milestone_badge(&mut vault, 0, ts::ctx(&mut scenario));
            ts::return_to_sender(&scenario, vault);
        };

        // 5. Withdraw 450_000_000
        ts::next_tx(&mut scenario, owner);
        {
            let mut vault = ts::take_from_sender<Vault>(&scenario);
            let config = ts::take_shared<sprout::platform::PlatformConfig>(&scenario);
            
            // Default fee is 0.5% (50 bps)
            // 450_000_000 * 50 / 10000 = 2_250_000
            
            vault::withdraw(&mut vault, &config, 450_000_000, ts::ctx(&mut scenario));

            assert!(vault::balance_value(&vault) == 450_000_000, 4);
            
            ts::return_to_sender(&scenario, vault);
            ts::return_shared(config);
        };

        ts::end(scenario);
    }
}
