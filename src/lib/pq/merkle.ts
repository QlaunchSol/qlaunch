import { AdrsType, H, adrs } from "./hash";
import { HEIGHT, LEAVES, N } from "./params";

/**
 * A complete binary tree over the 256 one-time keys. levels[0] are the leaves,
 * levels[HEIGHT] = [root]. Node (h, i) = H(left child, right child) addressed
 * by its height and index, so every node hash is position-bound.
 */
export function buildTree(pubSeed: Uint8Array, epoch: number, leaves: Uint8Array[]): Uint8Array[][] {
  if (leaves.length !== LEAVES) throw new Error(`need ${LEAVES} leaves`);
  const levels: Uint8Array[][] = [leaves];
  for (let h = 1; h <= HEIGHT; h++) {
    const below = levels[h - 1];
    const level: Uint8Array[] = [];
    for (let i = 0; i < below.length / 2; i++) {
      level.push(H(pubSeed, adrs({ type: AdrsType.Tree, epoch, a: h, b: i }), below[2 * i], below[2 * i + 1]));
    }
    levels.push(level);
  }
  return levels;
}

/** The sibling of every node on the leaf's path to the root, bottom up. */
export function authPath(levels: Uint8Array[][], leaf: number): Uint8Array {
  const path = new Uint8Array(HEIGHT * N);
  let index = leaf;
  for (let h = 0; h < HEIGHT; h++) {
    path.set(levels[h][index ^ 1], h * N);
    index >>= 1;
  }
  return path;
}

/** Recomputes the root from a leaf and its auth path; `onLevel` sees every node on the way up. */
export function rootFromPath(
  pubSeed: Uint8Array,
  epoch: number,
  leafIndex: number,
  leafHash: Uint8Array,
  path: Uint8Array,
  onLevel?: (height: number, index: number, node: Uint8Array, sibling: Uint8Array) => void,
): Uint8Array {
  if (path.length !== HEIGHT * N) throw new Error("auth path must be 256 bytes");
  let node = leafHash;
  let index = leafIndex;
  for (let h = 0; h < HEIGHT; h++) {
    const sibling = path.subarray(h * N, (h + 1) * N);
    const parent = index >> 1;
    const address = adrs({ type: AdrsType.Tree, epoch, a: h + 1, b: parent });
    node = index & 1 ? H(pubSeed, address, sibling, node) : H(pubSeed, address, node, sibling);
    index = parent;
    onLevel?.(h + 1, index, node, sibling);
  }
  return node;
}
