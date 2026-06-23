module sprout::vault {
    use std::string::String;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::dynamic_field as df;
    use sui::sui::SUI;
    use sprout::platform::{Self, PlatformConfig};

    // --- Errors ---
    const ENotOwner: u64 = 0;
    const EInsufficientBalance: u64 = 1;

    // --- Objects ---
    
    public struct Vault has key {
        id: UID,
        owner: address,
        balance: Balance<SUI>,
        total_deposited: u64,
        total_withdrawn: u64,
        deposit_count: u64,
        opened_at_ms: u64,
    }

    public struct DepositLog has store, drop {
        amount: u64,
        timestamp_ms: u64,
        source_label: String,
    }

    // --- Events ---

    public struct VaultOpened has copy, drop {
        vault_id: ID,
        owner: address,
    }

    public struct RoundupDeposited has copy, drop {
        vault_id: ID,
        owner: address,
        amount: u64,
        total_deposited: u64,
        source_label: String,
    }

    public struct Withdrawn has copy, drop {
        vault_id: ID,
        owner: address,
        amount: u64,
        fee: u64,
    }

    // --- Public Functions ---

    public fun open_vault(clock: &Clock, ctx: &mut TxContext) {
        let vault = Vault {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            balance: balance::zero(),
            total_deposited: 0,
            total_withdrawn: 0,
            deposit_count: 0,
            opened_at_ms: clock::timestamp_ms(clock),
        };

        event::emit(VaultOpened {
            vault_id: object::id(&vault),
            owner: vault.owner,
        });

        transfer::transfer(vault, tx_context::sender(ctx));
    }

    public fun deposit(
        vault: &mut Vault,
        payment: Coin<SUI>,
        source_label: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(vault.owner == tx_context::sender(ctx), ENotOwner);
        
        let amount = coin::value(&payment);
        balance::join(&mut vault.balance, coin::into_balance(payment));
        
        vault.total_deposited = vault.total_deposited + amount;
        vault.deposit_count = vault.deposit_count + 1;

        let log = DepositLog {
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
            source_label,
        };

        df::add(&mut vault.id, vault.deposit_count, log);

        event::emit(RoundupDeposited {
            vault_id: object::id(vault),
            owner: vault.owner,
            amount,
            total_deposited: vault.total_deposited,
            source_label,
        });
    }

    public fun withdraw(
        vault: &mut Vault,
        config: &PlatformConfig,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(vault.owner == tx_context::sender(ctx), ENotOwner);
        assert!(balance::value(&vault.balance) >= amount, EInsufficientBalance);

        let fee_bps = (platform::withdrawal_fee_bps(config) as u64);
        let fee_amount = amount * fee_bps / 10000;
        let withdrawal_amount = amount - fee_amount;

        let mut total_coin = coin::from_balance(balance::split(&mut vault.balance, amount), ctx);
        
        let fee_coin = coin::split(&mut total_coin, fee_amount, ctx);
        transfer::public_transfer(fee_coin, platform::treasury(config));
        transfer::public_transfer(total_coin, vault.owner);

        vault.total_withdrawn = vault.total_withdrawn + amount;

        event::emit(Withdrawn {
            vault_id: object::id(vault),
            owner: vault.owner,
            amount,
            fee: fee_amount,
        });
    }

    // --- Package-visibility accessors ---

    public(package) fun uid(vault: &Vault): &UID {
        &vault.id
    }

    public(package) fun uid_mut(vault: &mut Vault): &mut UID {
        &mut vault.id
    }

    // --- Public accessors ---

    public fun owner(vault: &Vault): address {
        vault.owner
    }

    public fun balance_value(vault: &Vault): u64 {
        balance::value(&vault.balance)
    }

    public fun total_deposited(vault: &Vault): u64 {
        vault.total_deposited
    }

    public fun deposit_count(vault: &Vault): u64 {
        vault.deposit_count
    }
}
