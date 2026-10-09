/**
 * Protocol parameters. Changing any of these changes every key, address and
 * signature, so they are versioned together under PROTOCOL.
 */

/** Domain-separation prefix for every hash in the protocol. Brand-independent on purpose. */
export const PROTOCOL = "pqlaunch-v1";

/** Hash output and every WOTS chain value, in bytes (SHA-256). */
export const N = 32;
/** Winternitz parameter: each chain has W - 1 = 15 hash steps. */
export const W = 16;
export const LOG_W = 4;
/** Message digits: 256 bits / 4 bits per digit. */
export const LEN1 = 64;
/** Checksum digits: max checksum is 64 * 15 = 960 < 16^3. */
export const LEN2 = 3;
/** Chains per one-time key. */
export const LEN = LEN1 + LEN2;

/** Merkle tree height: 2^8 = 256 one-time keys per identity. */
export const HEIGHT = 8;
export const LEAVES = 1 << HEIGHT;

/** Leaf 0 signs the registration statement; launches and proofs use 1..255. */
export const REGISTRATION_LEAF = 0;

export const WOTS_SIG_BYTES = LEN * N; // 2,144
export const AUTH_PATH_BYTES = HEIGHT * N; // 256
/** Serialized signature: u32 leaf index ‖ WOTS signature ‖ auth path. */
export const SIGNATURE_BYTES = 4 + WOTS_SIG_BYTES + AUTH_PATH_BYTES; // 2,404
