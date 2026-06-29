import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const NETWORK = (process.env.SUI_NETWORK as 'mainnet' | 'testnet' | 'devnet' | 'localnet') || 'testnet';
export const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
export const PACKAGE_ID = process.env.SPROUT_PACKAGE_ID ?? '';
