/**
 * HAP credentials for Apple TV authentication
 *
 * Stores the long-term keys and identifiers needed for
 * reconnecting to a paired Apple TV.
 */

/**
 * HAP credentials structure
 */
export interface HapCredentials {
  /** Apple TV's long-term public key (Ed25519) */
  ltpk: Buffer;
  /** Client's long-term secret key (Ed25519) */
  ltsk: Buffer;
  /** Apple TV's identifier */
  atvId: Buffer;
  /** Client's identifier (UUID) */
  clientId: Buffer;
}

/**
 * Serialize credentials to a storable format
 */
export function serializeCredentials(credentials: HapCredentials): string {
  return JSON.stringify({
    ltpk: credentials.ltpk.toString('base64'),
    ltsk: credentials.ltsk.toString('base64'),
    atvId: credentials.atvId.toString('base64'),
    clientId: credentials.clientId.toString('base64'),
  });
}

/**
 * Deserialize credentials from stored format
 */
export function deserializeCredentials(data: string): HapCredentials {
  const parsed = JSON.parse(data);
  return {
    ltpk: Buffer.from(parsed.ltpk, 'base64'),
    ltsk: Buffer.from(parsed.ltsk, 'base64'),
    atvId: Buffer.from(parsed.atvId, 'base64'),
    clientId: Buffer.from(parsed.clientId, 'base64'),
  };
}
