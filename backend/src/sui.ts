import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import dotenv from 'dotenv';

dotenv.config();

const NETWORK = (process.env.SUI_NETWORK as 'mainnet' | 'testnet' | 'devnet' | 'localnet') || 'testnet';
export const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
export const PACKAGE_ID = process.env.SPROUT_PACKAGE_ID ?? '';
