// Mock database pool for the demo
type MockVault = {
    owner: string;
    vault_id: string;
    total_deposited: string;
    balance: string;
    deposit_count: number;
    opened_at: Date;
};

type MockDeposit = {
    owner: string;
    vault_id: string;
    amount_mist: string;
    source_label: string;
    tx_digest: string;
    deposited_at: Date;
};

type MockWithdrawal = {
    owner: string;
    vault_id?: string;
    amount_mist: string;
    fee_mist: string;
    tx_digest: string;
    withdrawn_at: Date;
};

type MockPendingRoundup = {
    owner: string;
    amount_mist: string;
    source_label: string;
    deposited: boolean;
};

type MockData = {
    vaults: MockVault[];
    deposits: MockDeposit[];
    pending_roundups: MockPendingRoundup[];
    withdrawals: MockWithdrawal[];
    cursor: { id: number; last_seq: string | null };
};

declare global {
    var mockData: MockData | undefined;
}

export const pool = {
    query: async (text: string, params: any[] = []) => {
        // Simple state management for the demo
        if (!global.mockData) {
            global.mockData = {
                vaults: [],
                deposits: [],
                pending_roundups: [],
                withdrawals: [],
                cursor: { id: 1, last_seq: null }
            };
        }

        const mockData = global.mockData;
        const lowerText = text.toLowerCase();

        if (lowerText.includes('select * from vaults where owner = $1')) {
            const vault = mockData.vaults.find((v) => v.owner === params[0]);
            return { rows: vault ? [vault] : [] };
        }

        if (lowerText.includes('insert into vaults')) {
            const existing = mockData.vaults.find((v) => v.owner === params[0]);
            const vault = {
                owner: params[0],
                vault_id: params[1],
                balance: (params[2] ?? '0').toString(),
                total_deposited: (params[3] ?? '0').toString(),
                deposit_count: Number(params[4] ?? 0),
                opened_at: params[5] || new Date()
            };
            if (existing) {
                Object.assign(existing, vault);
            } else {
                mockData.vaults.push(vault);
            }
            return { rows: [vault] };
        }

        if (lowerText.includes('select sum(amount_mist)')) {
            const pending = mockData.pending_roundups.filter((r) => r.owner === params[0] && !r.deposited);
            const sum = pending.reduce((acc, r) => acc + BigInt(r.amount_mist), BigInt(0));
            return { rows: [{ pending_mist: sum.toString(), count: pending.length }] };
        }

        if (lowerText.includes('insert into pending_roundups')) {
            mockData.pending_roundups.push({
                owner: params[0],
                amount_mist: params[1].toString(),
                source_label: params[2],
                deposited: false
            });
            return { rows: [] };
        }

        if (lowerText.includes('select * from deposits')) {
            const deposits = mockData.deposits.filter((d) => d.owner === params[0]);
            return { rows: deposits };
        }

        if (lowerText.includes('select * from withdrawals')) {
            const withdrawals = mockData.withdrawals.filter((w) => w.owner === params[0]);
            return { rows: withdrawals };
        }

        if (lowerText.includes('select coalesce(sum(amount_mist), 0) as total_deposited')) {
            const deposits = mockData.deposits.filter((d) => d.owner === params[0]);
            const sum = deposits.reduce((acc, d) => acc + BigInt(d.amount_mist), BigInt(0));
            return { rows: [{ total_deposited: sum.toString(), deposit_count: deposits.length }] };
        }

        if (lowerText.includes('select coalesce(sum(amount_mist), 0) as total_withdrawn')) {
            const withdrawals = mockData.withdrawals.filter((w) => w.owner === params[0]);
            const sum = withdrawals.reduce((acc, w) => acc + BigInt(w.amount_mist), BigInt(0));
            return { rows: [{ total_withdrawn: sum.toString(), withdrawal_count: withdrawals.length }] };
        }

        if (lowerText.includes('select deposited_at as occurred_at')) {
            const deposits = mockData.deposits
                .filter((d) => d.owner === params[0])
                .sort((a, b) => b.deposited_at.getTime() - a.deposited_at.getTime());
            return { rows: deposits[0] ? [{ occurred_at: deposits[0].deposited_at }] : [] };
        }

        if (lowerText.includes('select withdrawn_at as occurred_at')) {
            const withdrawals = mockData.withdrawals
                .filter((w) => w.owner === params[0])
                .sort((a, b) => b.withdrawn_at.getTime() - a.withdrawn_at.getTime());
            return { rows: withdrawals[0] ? [{ occurred_at: withdrawals[0].withdrawn_at }] : [] };
        }

        if (lowerText.includes('update vaults set balance = balance + $1')) {
            const vault = mockData.vaults.find((v) => v.owner === params[2]);
            if (vault) {
                vault.balance = (BigInt(vault.balance) + BigInt(params[0])).toString();
                vault.total_deposited = params[1].toString();
                vault.deposit_count += 1;
            }
            return { rows: [] };
        }

        if (lowerText.includes('insert into deposits')) {
            if (mockData.deposits.some((d) => d.tx_digest === params[4])) {
                return { rows: [] };
            }
            mockData.deposits.push({
                owner: params[0],
                vault_id: params[1],
                amount_mist: params[2].toString(),
                source_label: params[3],
                tx_digest: params[4],
                deposited_at: params[5]
            });
            return { rows: [{ id: mockData.deposits.length }] };
        }

        if (lowerText.includes('update vaults set balance = balance - $1')) {
            const vault = mockData.vaults.find((v) => v.owner === params[1]);
            if (vault) {
                vault.balance = (BigInt(vault.balance) - BigInt(params[0])).toString();
            }
            return { rows: [] };
        }

        if (lowerText.includes('insert into withdrawals')) {
            const txDigest = lowerText.includes('owner, vault_id') ? params[4] : params[3];
            if (mockData.withdrawals.some((w) => w.tx_digest === txDigest)) {
                return { rows: [] };
            }
            mockData.withdrawals.push({
                owner: params[0],
                vault_id: lowerText.includes('owner, vault_id') ? params[1] : undefined,
                amount_mist: (lowerText.includes('owner, vault_id') ? params[2] : params[1]).toString(),
                fee_mist: (lowerText.includes('owner, vault_id') ? params[3] : params[2]).toString(),
                tx_digest: txDigest,
                withdrawn_at: lowerText.includes('owner, vault_id') ? params[5] : params[4]
            });
            return { rows: [{ id: mockData.withdrawals.length }] };
        }

        if (lowerText.includes('update pending_roundups set deposited = true')) {
            mockData.pending_roundups.forEach((r) => {
                if (r.owner === params[0]) r.deposited = true;
            });
            return { rows: [] };
        }

        if (lowerText.includes('select last_seq from indexer_cursor')) {
            return { rows: [mockData.cursor] };
        }

        if (lowerText.includes('update indexer_cursor')) {
            mockData.cursor.last_seq = params[0];
            return { rows: [] };
        }

        return { rows: [] };
    },
    on: (event: string, cb: (error: Error) => void) => {
        void event;
        void cb;
    }
};
