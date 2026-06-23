import dotenv from 'dotenv';

dotenv.config();

const WALRUS_PUBLISHER_URL = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR_URL = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';

export async function uploadStatement(content: string): Promise<string> {
  try {
    const response = await fetch(`${WALRUS_PUBLISHER_URL}/v1/store?epochs=1`, {
      method: 'PUT',
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to Walrus: ${response.statusText}`);
    }

    const data = await response.json();
    // Walrus returns info about the stored blob, usually includes a blobId
    const blobId = data.newlyCreated?.blobObject?.blobId || data.alreadyCertified?.blobId;

    if (!blobId) {
      throw new Error('No blobId returned from Walrus');
    }

    return blobId;
  } catch (error) {
    console.error('Walrus upload error:', error);
    throw error;
  }
}

export function getStatementUrl(blobId: string): string {
  return `${WALRUS_AGGREGATOR_URL}/v1/${blobId}`;
}
