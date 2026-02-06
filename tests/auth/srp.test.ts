/**
 * SRP authentication tests
 *
 * Test vectors generated from pyatv's srptools implementation
 * to ensure TypeScript implementation matches Python behavior.
 */

import { describe, it, expect } from 'vitest';
import { createSRPClient } from 'js-srp6a';

// Test vector generated from pyatv srptools
// Using fixed auth_private = 60975527035cf2ad1989806f0407210bc81edc04e2762a56afd529ddda2d4393
// and PIN = 1111
const testVector = {
  username: 'Pair-Setup',
  pin: '1111',
  salt: '9e43766ff93b55b6',
  clientPrivate: '60975527035cf2ad1989806f0407210bc81edc04e2762a56afd529ddda2d4393',
  clientPublic:
    'fab6f5d2615d1e323512e7991cc37443f487da604ca8c9230fcb04e541dce6280b27ca4680b0374f179dc3bdc7553fe62459798c701ad864a91390a28c93b644adbf9c00745b942b79f9012a21b9b78782319d83a1f8362866fbd6f46bfc0ddb2e1ab6e4b45a9906b82e37f05d6f97f6a3eb6e182079759c4f6847837b62321ac1b4fa68641fcb4bb98dd697a0c73641385f4bab25b793584cc39fc8d48d4bd867a9a3c10f8ea12170268e34fe3bbe6ff89998d60da2f3e4283cbec1393d52af724a57230c604e9fbce583d7613e6bffd67596ad121a8707eec46944957033686a155f644d5c5863b48f61bdbf19a53eab6dad0a186b8c152e5f5d8cad4b0ef8aa4ea5008834c3cd342e5e0f167ad04592cd8bd279639398ef9e114dfaaab919e14e850989224ddd98576d79385d2210902e9f9b1f2d86cfa47ee244635465f71058421a0184be51dd10cc9d079e6f1604e7aa9b7cf7883c7d4ce12b06ebe16081e23f27a231d18432d7d1bb55c28ae21ffcf005f57528d15a88881bb3bbb7fe',
  serverPublic:
    '155d3cbe6821be902fd488899c98c6e6a5d6e88662acbf57730baf17d58a7838065e559143a08818f25a516a8bf49073d9352d0fd299333c53f5c9bb27a1bf9dfbd3d0c91f6d5dbd10bb5b24e23ccab1630945745ec632077f7054aa94f36367a940778fd99aff9ee3f785f0a72f9d1b25e8ba843d45d34d1a4fdb2c901806009e35ead607a4c333840e682abce32bc95794e9385b2c00a69bf4052895ae6e4fd77cbd800a0df7eb0f3cc4c9f84f265d5e4d9d2baadbd6c750a911ebcd553f8828077a8c4f0134578611df69678e9f92771a6f9acab194adae0dc47f7c8c5748bc1e3cf31796112aba2607e3a0ad3fa96149bbcde7be4a265ea59cae2190d777ca9a007a92dae9d4f344fc6307acf0b98994bfece59cd63969136fc63c1319062332fb2e816782bea126a70e06659b16cfc688c6f345cae32169fc2e9fd07af4346b3e2458427f41dff82ba709ba3dc6cec9bcc08880573f151d1802bc0aa23a3bcb30fcc27b3bc947192d840c51c75404516e214aa7d28a8cd4e0c25e4092c4',
  sessionKey:
    'f4e167b25ae84df7fb5d21af8a944b47d749b9277f7f7107b417bfb3b2f53a83e880348c5bf3cf714515d0ae9e085c743def46d4f1b0efa7109fd7dd25860358',
  clientProof:
    '0aef906ecd1f5fb5ffca2ada2622d36ba5b942f06a17181f7595906a3bddf281162bbd01b98dedb14d5e55019caa45134745be8a5827668759ad4d871e408894',
  serverProof:
    '347d8af585363d04d8c96806853b03bcc4f66c596073585b6da49f3dc0637ac2e3ec4837e612abd9ce552a3ea1c108264da0968c6c51c7026e8287af0ed3eed9',
};

// SRP-3072 prime (RFC 5054) - same as in pyatv
const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF';
const N = BigInt('0x' + N_HEX);
const G = 5n;

/**
 * Modular exponentiation: base^exp mod mod
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Compute A = g^a mod N (client public ephemeral)
 */
function computePublicEphemeral(secretHex: string): string {
  const a = BigInt('0x' + secretHex);
  const A = modPow(G, a, N);
  return A.toString(16).padStart(768, '0');
}

describe('SRP', () => {
  describe('computePublicEphemeral', () => {
    it('should compute A = g^a mod N matching pyatv', () => {
      const A = computePublicEphemeral(testVector.clientPrivate);
      expect(A).toBe(testVector.clientPublic);
    });
  });

  describe('js-srp6a integration', () => {
    it('should derive private key (x) from salt, username, and PIN', async () => {
      const client = createSRPClient('SHA-512', 3072);
      const x = await client.derivePrivateKey(
        testVector.salt,
        testVector.username,
        testVector.pin
      );
      // x is an intermediate value, just verify it's a valid hex string
      expect(x).toMatch(/^[0-9a-f]+$/i);
      expect(x.length).toBeGreaterThan(0);
    });

    it('should derive session key and proof matching pyatv', async () => {
      const client = createSRPClient('SHA-512', 3072);

      // Derive private key (x)
      const x = await client.derivePrivateKey(
        testVector.salt,
        testVector.username,
        testVector.pin
      );

      // Derive session using client's secret 'a', server's public 'B', salt, username, and x
      const session = await client.deriveSession(
        testVector.clientPrivate,
        testVector.serverPublic,
        testVector.salt,
        testVector.username,
        x
      );

      // Session key should match
      expect(session.key).toBe(testVector.sessionKey);

      // Client proof (M1) should match
      expect(session.proof).toBe(testVector.clientProof);
    });

    it('should verify server proof', async () => {
      const client = createSRPClient('SHA-512', 3072);

      const x = await client.derivePrivateKey(
        testVector.salt,
        testVector.username,
        testVector.pin
      );

      // Derive session first
      const session = await client.deriveSession(
        testVector.clientPrivate,
        testVector.serverPublic,
        testVector.salt,
        testVector.username,
        x
      );

      // Compute A for verification
      const A = computePublicEphemeral(testVector.clientPrivate);

      // Verify server proof - needs clientPublicEphemeral, clientSession, serverSessionProof
      await client.verifySession(A, session, testVector.serverProof);
      // If no exception thrown, verification passed
    });
  });
});
