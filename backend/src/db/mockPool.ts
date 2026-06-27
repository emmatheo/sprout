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
    withdrawals: unknown[];
    cursor: { id: number; last_seq: string | null };
};

declare global {
    var mockData: MockData | undefined;
}

export const pool = {
    query: async (text: string, params: any[] = []) => {
        console.log(`[MOCK DB] Query: ${text}`, params);

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
            mockData.deposits.push({
                owner: params[0],
                vault_id: params[1],
                amount_mist: params[2].toString(),
                source_label: params[3],
                tx_digest: params[4],
                deposited_at: params[5]
            });
            return { rows: [] };
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
        void cb;
        console.log(`[MOCK DB] Registered listener for ${event}`);
    }
};
