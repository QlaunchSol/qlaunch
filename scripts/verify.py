#!/usr/bin/env python3
"""
Independent verifier for pqlaunch-v1 launch attestations. Standard library only.

    python3 verify.py <mint or coin page URL> [--rpc URL]      the coin's metadata URI is read from chain
    python3 verify.py <metadata URL | metadata.json> --mint <mint>
    python3 verify.py --vectors scripts/vectors/launch.json

Written from the protocol description, not translated from the TypeScript, so
the two implementations check each other. Nothing here touches an elliptic
curve: SHA-256 and HMAC are the only primitives.
"""
import base64, hashlib, json, struct, sys, urllib.request

PROTOCOL = b"pqlaunch-v1"
N, W, LEN1, LEN2, HEIGHT = 32, 16, 64, 3, 8
LEN = LEN1 + LEN2
WOTS_PK, WOTS_HASH, TREE = 1, 0, 2


def sha256(*parts: bytes) -> bytes:
    h = hashlib.sha256()
    for p in parts:
        h.update(p)
    return h.digest()


def adrs(typ: int, epoch=0, leaf=0, a=0, b=0) -> bytes:
    return struct.pack(">5I", typ, epoch, leaf, a, b) + bytes(12)


def tagged_digest(tag: str, fields) -> bytes:
    out = [PROTOCOL + b"/" + tag.encode(), b"\x00"]
    for f in fields:
        raw = struct.pack(">I", f) if isinstance(f, int) else f.encode("utf-8")
        out += [struct.pack(">I", len(raw)), raw]
    return sha256(*out)


def launch_digest(f: dict) -> bytes:
    order = ["mint", "creator", "pqAddress", "leaf", "name", "symbol", "description", "image", "twitter", "telegram"]
    return tagged_digest("launch", [f[k] for k in order])


def digits_of(digest: bytes):
    msg = [n for byte in digest for n in (byte >> 4, byte & 15)]
    csum = sum(W - 1 - d for d in msg) << 4  # 12 checksum bits, left-aligned in 16
    return msg + [(csum >> 12) & 15, (csum >> 8) & 15, (csum >> 4) & 15]


def verify(digest: bytes, sig: bytes, root: bytes, pub_seed: bytes, height: int, epoch: int) -> bool:
    if height != HEIGHT or len(sig) != 4 + LEN * N + HEIGHT * N:
        return False
    leaf = struct.unpack(">I", sig[:4])[0]
    if leaf >= 1 << HEIGHT:
        return False
    ends = b""
    for i, d in enumerate(digits_of(digest)):
        x = sig[4 + i * N : 4 + (i + 1) * N]
        for step in range(d, W - 1):
            x = sha256(pub_seed, adrs(WOTS_HASH, epoch, leaf, i, step), x)
        ends += x
    node = sha256(pub_seed, adrs(WOTS_PK, epoch, leaf), ends)
    auth, index = sig[4 + LEN * N :], leaf
    for h in range(HEIGHT):
        sib = auth[h * N : (h + 1) * N]
        a = adrs(TREE, epoch, 0, h + 1, index >> 1)
        node = sha256(pub_seed, a, sib, node) if index & 1 else sha256(pub_seed, a, node, sib)
        index >>= 1
    return node == root


# bech32m (BIP 350), for the pq1… address
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values):
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if (top >> i) & 1 else 0
    return chk


def bech32m(hrp: str, data: bytes) -> str:
    acc, bits, words = 0, 0, []
    for b in data:
        acc, bits = (acc << 8) | b, bits + 8
        while bits >= 5:
            bits -= 5
            words.append((acc >> bits) & 31)
    if bits:
        words.append((acc << (5 - bits)) & 31)
    expanded = [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]
    pm = _polymod(expanded + words + [0] * 6) ^ 0x2BC830A3
    return hrp + "1" + "".join(CHARSET[d] for d in words + [(pm >> 5 * (5 - i)) & 31 for i in range(6)])


def pq_address(root: bytes, pub_seed: bytes, height: int, epoch: int) -> str:
    return bech32m("pq", sha256(PROTOCOL + b"/address", bytes([0, height]), struct.pack(">I", epoch), pub_seed, root))


def check(identity: dict, fields: dict, signature_b64: str) -> bool:
    if not isinstance(fields["leaf"], int) or isinstance(fields["leaf"], bool) or fields["leaf"] < 1:
        return False  # key 0 only ever signs the registration
    root, seed = bytes.fromhex(identity["root"]), bytes.fromhex(identity["pubSeed"])
    height, epoch = identity["height"], identity.get("epoch", 0)
    address_ok = pq_address(root, seed, height, epoch) == identity["address"] == fields["pqAddress"]
    sig = base64.b64decode(signature_b64)
    leaf_ok = struct.unpack(">I", sig[:4])[0] == fields["leaf"]
    return address_ok and leaf_ok and verify(launch_digest(fields), sig, root, seed, height, epoch)


def from_metadata(meta: dict, mint: str) -> bool:
    pq = meta["pq"]
    if pq.get("protocol") != PROTOCOL.decode():
        print("INVALID: unknown protocol", pq.get("protocol"))
        return False
    if pq.get("mint") != mint:
        print(f"INVALID: this attestation is for mint {pq.get('mint')}, not {mint}")
        return False
    fields = {
        "mint": mint, "creator": pq["creator"], "pqAddress": pq["identity"]["address"], "leaf": pq["leaf"],
        "name": meta["name"], "symbol": meta["symbol"], "description": meta.get("description", ""),
        "image": meta["image"], "twitter": meta.get("twitter", ""), "telegram": meta.get("telegram", ""),
    }
    ok = check(pq["identity"], fields, pq["signature"])
    print(f"{meta['name']} (${meta['symbol']})  mint {mint}")
    print(f"identity {pq['identity']['address']}  leaf {pq['leaf']}  launcher {pq['creator']}")
    print("VALID: signed by this identity's one-time key" if ok else "INVALID")
    return ok


def fetch_json(url: str):
    # Some IPFS gateways refuse Python's default User-Agent; say who we are.
    req = urllib.request.Request(url, headers={"User-Agent": "qlaunch-verify/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def onchain_metadata(mint: str, rpc: str):
    """The mint's Token-2022 metadata (name, symbol, uri), straight from a Solana RPC."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo", "params": [mint, {"encoding": "base64"}]}).encode()
    req = urllib.request.Request(rpc, data=body, headers={"Content-Type": "application/json", "User-Agent": "qlaunch-verify/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        value = json.load(res)["result"]["value"]
    if not value:
        sys.exit(f"{mint}: no such account on this cluster")
    data = base64.b64decode(value["data"][0])
    at = 166  # Token-2022 mint: 82-byte base, padding to 165, account type, then TLV extensions
    while at + 4 <= len(data):
        typ, length = struct.unpack("<HH", data[at : at + 4])
        if typ == 19:  # TokenMetadata: update authority, mint, then three borsh strings
            p, out = at + 4 + 64, []
            for _ in range(3):
                n = struct.unpack("<I", data[p : p + 4])[0]
                out.append(data[p + 4 : p + 4 + n].decode())
                p += 4 + n
            return {"name": out[0], "symbol": out[1], "uri": out[2]}
        at += 4 + length
    sys.exit(f"{mint}: not a Token-2022 mint with metadata")


def main(argv):
    if len(argv) == 3 and argv[1] == "--vectors":
        vectors = json.load(open(argv[2]))
        bad = 0
        for i, v in enumerate(vectors):
            got = check(v["identity"], v["fields"], v["signature"])
            assert launch_digest(v["fields"]).hex() == v["digest"], f"vector {i}: digest mismatch"
            print(f"vector {i}: {'valid' if got else 'invalid'} (expected {'valid' if v['expect'] else 'invalid'})")
            bad += got != v["expect"]
        sys.exit(1 if bad else 0)
    args = argv[1:]
    opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
    rpc = opt("--rpc", "https://api.mainnet-beta.solana.com")
    positional = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in ("--rpc", "--mint"))]
    if len(positional) != 1:
        sys.exit(__doc__)
    src = positional[0]
    mint = opt("--mint")
    if "/coin/" in src or (not src.startswith("http") and not src.endswith(".json")):
        # A coin: trust only the chain for where its metadata lives.
        mint = src.rstrip("/").split("/")[-1].split("?")[0]
        chain = onchain_metadata(mint, rpc)
        meta = fetch_json(chain["uri"])
        if (meta.get("name"), meta.get("symbol")) != (chain["name"], chain["symbol"]):
            print(f"INVALID: on chain this coin is {chain['name']} (${chain['symbol']}), its metadata says {meta.get('name')} (${meta.get('symbol')})")
            sys.exit(1)
    else:
        if not mint:
            sys.exit("pass --mint <mint>: an attestation means nothing until it's bound to a coin")
        meta = fetch_json(src) if src.startswith("http") else json.load(open(src))
    sys.exit(0 if from_metadata(meta, mint) else 1)


if __name__ == "__main__":
    main(sys.argv)
