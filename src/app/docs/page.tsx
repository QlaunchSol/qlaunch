import type { Metadata } from "next";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { AUTH_PATH_BYTES, HEIGHT, LEAVES, LEN, LEN1, LEN2, PROTOCOL, SIGNATURE_BYTES, W, WOTS_SIG_BYTES } from "@/lib/pq";
import { SCRYPT } from "@/lib/pq/keys";

// Rendered per request, like every page: each carries a fresh CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "How it works", description: `The ${site.name} protocol: WOTS+ one-time signatures, Merkle identities, anchors and launch attestations.` };

const TOC = [
  ["overview", "Overview"],
  ["threat", "Threat model"],
  ["primitives", "Primitives"],
  ["wots", "WOTS+ one-time signatures"],
  ["identity", "Merkle identities"],
  ["derivation", "Key derivation"],
  ["registration", "Registration"],
  ["anchor", "On-chain anchor"],
  ["launch", "Launch attestation"],
  ["fees", "Creator fees"],
  ["proofs", "Proof of possession"],
  ["security", "Security analysis"],
  ["parameters", "Parameters"],
  ["verify", "Verify it yourself"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 border-t border-line pt-10 first:border-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-tight text-fg">
        <a href={`#${id}`} className="group">
          {title}
          <span className="ml-2 text-faint opacity-0 group-hover:opacity-100">#</span>
        </a>
      </h2>
      {children}
    </section>
  );
}

/** A path in the repo, linked to GitHub when the repo URL is configured. */
const Src = ({ path }: { path: string }) =>
  site.github ? (
    <a href={`${site.github}/${path.includes(".") ? "blob" : "tree"}/main/${path}`} target="_blank" rel="noreferrer" className="hover:underline">
      <C>{path}</C>
    </a>
  ) : (
    <C>{path}</C>
  );
const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-7 text-muted">{children}</p>;
const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[13px] text-fg">{children}</code>;
const Pre = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-lg border border-line bg-panel p-4 font-mono text-[12.5px] leading-relaxed text-muted">{children.trim()}</pre>
);
const Ul = ({ children }: { children: ReactNode }) => <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-muted marker:text-faint">{children}</ul>;

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-panel-2 text-xs text-faint">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "px-4 py-2.5 text-fg" : "px-4 py-2.5 font-mono text-[13px] text-muted"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[200px_1fr]">
      <nav className="hidden lg:block">
        <div className="sticky top-24 space-y-1 text-sm">
          <div className="mb-3 font-mono text-xs text-mint">docs</div>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted hover:bg-panel-2 hover:text-fg">
              {label}
            </a>
          ))}
        </div>
      </nav>
      <article className="min-w-0 max-w-3xl space-y-10">
        <header>
          <div className="font-mono text-xs text-mint">{PROTOCOL}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">How {site.name} works</h1>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            The complete protocol: what is signed, by which key, how anyone checks it, and what it does and doesn&apos;t protect. Everything here is
            implemented in{" "}
            <Src path="src/lib/pq" /> and cross-checked by an independent Python verifier, <Src path="scripts/verify.py" />.
          </p>
        </header>

        <Section id="overview" title="Overview">
          <P>
            Every coin launched here carries a <strong className="text-fg">post-quantum attestation</strong>: a hash-based signature, by the launcher, over
            the coin&apos;s mint address, name, ticker, image and description. The signature lives inside the coin&apos;s IPFS metadata, next to the fields it
            covers, so it travels with the coin wherever its metadata goes.
          </P>
          <Table
            head={["Step", "What happens"]}
            rows={[
              ["Derive", "Your wallet signs a fixed message. That deterministic signature, optionally stretched with a passphrase, seeds 256 one-time keys, generated in your browser."],
              ["Register", "The keys hash into a Merkle tree whose root is your post-quantum public key. Your wallet and key #0 sign one statement, binding the two."],
              ["Anchor", "An SPL memo puts the root on Solana, a timestamp nobody can forge later."],
              ["Launch", "A fresh one-time key signs the coin. The coin is created on pump.fun in one transaction, the attestation pinned in its metadata."],
              ["Verify", "Anyone rebuilds the digest from public fields and walks the signature to the root. Only SHA-256 is involved."],
            ]}
          />
        </Section>

        <Section id="threat" title="Threat model">
          <P>
            A Solana address <em>is</em> an ed25519 public key. Unlike a never-spent Bitcoin address, there is no hash in front of it to hide behind: a
            cryptographically relevant quantum computer (or a classical break of the curve) exposes every account at once. When that happens, an ed25519
            signature stops proving anything: an attacker can produce one for any address.
          </P>
          <P>
            What survives is anything resting on hash functions alone. Grover&apos;s algorithm speeds up preimage search quadratically, which takes SHA-256
            from 256 to roughly 128 bits of security: still far out of reach. So we give every creator a hash-based identity <em>now</em>, while ed25519 can
            still vouch for it, and use it to sign every launch.
          </P>
          <Ul>
            <li>
              <strong className="text-fg">Protects:</strong> proof of who launched a coin, after a curve break, for identities with a passphrase (see
              below); identity ownership, via a challenge-response that never touches ed25519.
            </li>
            <li>
              <strong className="text-fg">Does not protect:</strong> funds. SOL and tokens in ordinary Solana accounts are guarded by ed25519 and nothing
              else. Moving value under hash-based control needs an on-chain verifier program; that is on the roadmap.
            </li>
            <li>
              <strong className="text-fg">Wallet-only identities</strong> have no post-quantum value: the keys come from a wallet signature, so whoever recovers
              the wallet&apos;s ed25519 key after a break can re-derive them. Verifiers can&apos;t tell such identities apart. With a passphrase, an attacker
              also has to guess it, offline, at scrypt (2^17) cost per guess: use a long, random one.
            </li>
          </Ul>
        </Section>

        <Section id="primitives" title="Primitives">
          <P>
            One hash function, SHA-256, used as a <em>tweakable</em> hash in the style of SPHINCS+: every call is keyed by the identity&apos;s public seed and
            a 32-byte address naming its exact position in the structure. No two calls anywhere hash the same (seed, position), which is what defeats
            multi-target attacks.
          </P>
          <Pre>{`
F(pubSeed, ADRS, x)     = SHA-256(pubSeed ‖ ADRS ‖ x)               one chain step (96-byte input)
H(pubSeed, ADRS, l, r)  = SHA-256(pubSeed ‖ ADRS ‖ l ‖ r)           Merkle node
T(pubSeed, ADRS, pk)    = SHA-256(pubSeed ‖ ADRS ‖ pk[0] ‖ … ‖ pk[66])   WOTS key compression
PRF(skSeed, ADRS)       = HMAC-SHA-256(skSeed, pubSeed ‖ ADRS)      secret chain start

ADRS (32 bytes, big-endian u32 words):
  type ‖ epoch ‖ leaf ‖ a ‖ b ‖ 0 ‖ 0 ‖ 0
  type: 0 chain step · 1 key compression · 2 tree node · 3 secret derivation
  a, b: chain index and step (WOTS) · node height and index (tree)
`}</Pre>
        </Section>

        <Section id="wots" title="WOTS+ one-time signatures">
          <P>
            A Winternitz key with <C>w = {W}</C> is {LEN} hash chains of length {W - 1}. The secret key is each chain&apos;s start, the public key each
            chain&apos;s end. The 32-byte message digest is split into {LEN1} base-16 digits, followed by {LEN2} checksum digits:
          </P>
          <Pre>{`
digits[0..63]  = nibbles of digest, high first
checksum       = Σ (15 − digits[i])          ≤ 960 < 16³
digits[64..66] = nibbles of (checksum << 4) as two bytes, first three
`}</Pre>
          <P>
            Signing reveals position <C>digits[i]</C> of chain <C>i</C>. Verifying walks each chain the remaining <C>15 − digits[i]</C> steps and must land on
            the public end. To forge, an attacker would need to raise some digit, which the checksum turns into lowering another, meaning walking a chain
            backwards: a SHA-256 preimage. A signature is {LEN} × 32 = {WOTS_SIG_BYTES.toLocaleString("en-US")} bytes.
          </P>
          <P>
            <strong className="text-fg">One-time</strong> is literal: two signatures from one key reveal two positions per chain and let anyone sign
            messages in between. Every key here signs exactly once, and the database enforces it with a primary key on (identity, leaf).
          </P>
        </Section>

        <Section id="identity" title="Merkle identities">
          <P>
            {LEAVES} one-time keys are the leaves of a complete binary tree of height {HEIGHT}. The root, together with the public seed, is your post-quantum
            public key: 64 bytes that commit to all {LEAVES} keys. A full signature is the leaf index, the WOTS signature and the {HEIGHT} sibling hashes on
            the path to the root:
          </P>
          <Pre>{`
signature = u32 leaf ‖ WOTS signature (2,144 B) ‖ auth path (${HEIGHT} × 32 = ${AUTH_PATH_BYTES} B)   = ${SIGNATURE_BYTES.toLocaleString("en-US")} bytes
address   = bech32m("pq", SHA-256("${PROTOCOL}/address" ‖ 0x00 ‖ height ‖ u32 epoch ‖ pubSeed ‖ root))
`}</Pre>
          <P>
            The address keeps all 256 bits of the hash, so a second identity with the same address costs 2^128 work even for a quantum attacker. Key #0 is
            reserved for registration; keys #1 to #255 sign launches and proofs.
          </P>
        </Section>

        <Section id="derivation" title="Key derivation">
          <P>Keys are derived, never stored: unlock again on any device with the same wallet (and passphrase) and you get the same tree.</P>
          <Pre>{`
walletSig  = ed25519 signature by your wallet over a fixed message   (RFC 8032: deterministic)
stretched  = scrypt(passphrase, "${PROTOCOL}/passphrase/<wallet>", N = 2^${Math.log2(SCRYPT.N)}, r = ${SCRYPT.r}, p = ${SCRYPT.p})   or empty
seed       = HKDF-SHA-256(walletSig ‖ stretched, salt "${PROTOCOL}", info "identity-seed")
skSeed     = HKDF(seed, info "wots-secret/<epoch>")
pubSeed    = HKDF(seed, info "public-seed/<epoch>")
mint key   = ed25519 keypair from HKDF(seed, info "mint/<epoch>/<leaf as 8 hex digits>")
`}</Pre>
          <P>
            The fixed message names no site and no domain on purpose: if it changed, every identity would change with it. It does say plainly, in the
            wallet prompt, that the signature is key material. The mint key is derived per leaf so that a launch interrupted at any point retries with the
            same mint and the same one-time key, and never wastes either.
          </P>
        </Section>

        <Section id="registration" title="Registration">
          <P>
            Your wallet (ed25519) and your key #0 (WOTS) both sign one statement naming the wallet, the address, the root and the public seed. The server
            checks both before recording the identity. The binding runs both ways: a wallet can&apos;t claim an identity it can&apos;t sign for, and an
            identity can&apos;t claim a wallet that didn&apos;t sign for it. Both signatures and the exact statement are public, so anyone can re-check them.
          </P>
        </Section>

        <Section id="anchor" title="On-chain anchor">
          <P>
            Optional, and recommended: an SPL memo <C>{`${PROTOCOL}:anchor:<pq address>:<root hex>`}</C>, signed by your wallet. After a curve break anyone
            can forge a wallet signature, but nobody can rewrite a memo that is already in Solana&apos;s history. The anchor proves the root existed, and was
            claimed by that wallet, while ed25519 still meant something.
          </P>
        </Section>

        <Section id="launch" title="Launch attestation">
          <P>
            The launch digest covers the mint, the launching wallet, the identity and key, and the coin&apos;s name, ticker, description, image and links,
            each length-prefixed so no boundary can shift. Not signed: the dev buy (the site shows the amount read from the creation transaction) and
            the anchor (a separate on-chain fact).
          </P>
          <Pre>{`
digest = SHA-256("${PROTOCOL}/launch" ‖ 0x00 ‖ lp(mint) ‖ lp(creator) ‖ lp(pqAddress) ‖ lp(u32 leaf)
                 ‖ lp(name) ‖ lp(symbol) ‖ lp(description) ‖ lp(image) ‖ lp(twitter) ‖ lp(telegram))
lp(x)  = u32 byte length ‖ x (UTF-8)
`}</Pre>
          <P>
            The server re-derives the digest from the submitted fields, verifies the signature against your registered root, spends the key, pins the
            metadata and builds pump.fun&apos;s <C>create_v2</C> transaction. You sign it with your wallet and the derived mint key. The metadata
            pump.fun displays carries the attestation under <C>pq</C>:
          </P>
          <Pre>{`
{
  "name": "Quantum Frog", "symbol": "QFROG", "description": "…", "image": "https://…/ipfs/…",
  "website": "${site.url}/coin/<mint>",
  "pq": {
    "protocol": "${PROTOCOL}",
    "scheme": "WOTS+(w=16, SHA-256) + Merkle(h=8)",
    "mint": "<mint>", "creator": "<launching wallet>", "leaf": 7,
    "identity": { "address": "pq1…", "root": "<hex>", "pubSeed": "<hex>", "height": 8, "epoch": 0 },
    "anchor": "<memo tx signature or null>",
    "digest": "<hex>", "signature": "<base64, ${SIGNATURE_BYTES} bytes>"
  }
}
`}</Pre>
        </Section>

        <Section id="fees" title="Creator fees">
          <P>
            pump.fun fixes a coin&apos;s fee recipient at creation, through the <C>creator</C> argument of <C>create_v2</C>. On {site.name} it is always the
            launching wallet: <strong className="text-fg">creator fees from trading go to you, the launcher.</strong> pump.fun shows your wallet as the
            creator, and you claim the fees on pump.fun like for any coin you create there. {site.name} charges no fee of its own: you pay only pump.fun&apos;s
            creation rent, your optional dev buy and the network fee.
          </P>
          <P>
            Your browser checks this before your wallet signs: the transaction is refused unless its <C>creator</C> is your wallet and no option that would
            redirect the fees (holder rewards, for instance) is switched on. Once the coin exists, the server checks the bonding curve&apos;s creator on chain
            again before listing it.
          </P>
        </Section>

        <Section id="proofs" title="Proof of possession">
          <P>
            To prove you hold an identity, request a random 32-byte challenge and sign <C>{`SHA-256("${PROTOCOL}/prove" ‖ 0x00 ‖ lp(address) ‖ lp(challenge) ‖ lp(u32 leaf) ‖ lp(note))`}</C>{" "}
            with your next one-time key. The server checks it against your registered root and spends the key the moment the signature verifies, then the
            challenge. No wallet and no
            elliptic curve are involved, so this is the login that keeps working after a break. Each proof gets a public page that re-verifies it.
          </P>
        </Section>

        <Section id="security" title="Security analysis">
          <Ul>
            <li>
              <strong className="text-fg">Forgery</strong> requires a SHA-256 preimage or second preimage under a fixed, position-unique key: about 2^256
              classically and 2^128 with Grover.
            </li>
            <li>
              <strong className="text-fg">Key reuse</strong> is the one way to break WOTS: two signatures from one key let anyone who sees both forge
              messages. Three layers prevent it. The browser journals every key it signs with (permanently, before the signature leaves the page) and
              never signs a different message with one, across tabs too. The server spends a key the moment it sees a valid signature, before anything
              else can fail. The database refuses a second use of (identity, leaf). A retried launch with identical details re-signs the identical
              digest on purpose: nothing new is revealed.
            </li>
            <li>
              <strong className="text-fg">The server</strong> never sees your seed, your secret keys or your mint key. It can refuse service; on its own it
              can&apos;t forge your signature or move funds, and the page checks the launch transaction before your wallet signs it (exact name, ticker,
              metadata, buy cap, no extra instructions). It does see each signature as you submit it, which is why reuse is prevented in the browser,
              not only on the server. You trust it to serve honest page code, as with any web wallet flow; the protocol checks don&apos;t depend on it
              and can be re-run independently.
            </li>
            <li>
              <strong className="text-fg">Keys in the browser</strong> stay in memory only and are dropped when the tab closes. They are never written to
              storage; only the list of keys already used (and what each signed) is kept, so they can&apos;t be reused.
            </li>
            <li>
              <strong className="text-fg">Exhaustion:</strong> an identity has 255 usable keys. Rotating to a fresh tree (a new epoch) certified by the last
              key is on the roadmap.
            </li>
          </Ul>
        </Section>

        <Section id="parameters" title="Parameters">
          <Table
            head={["Parameter", "Value"]}
            rows={[
              ["Hash", "SHA-256 (n = 32)"],
              ["Winternitz parameter", `w = ${W} (${LEN1} + ${LEN2} = ${LEN} chains)`],
              ["Tree height", `${HEIGHT} (${LEAVES} one-time keys)`],
              ["WOTS signature", `${WOTS_SIG_BYTES.toLocaleString("en-US")} B`],
              ["Full signature", `${SIGNATURE_BYTES.toLocaleString("en-US")} B`],
              ["Public key", "64 B (root + public seed)"],
              ["Verification cost", "≤ 1,005 + 9 SHA-256 calls"],
              ["Passphrase KDF", `scrypt N = 2^${Math.log2(SCRYPT.N)}, r = ${SCRYPT.r}, p = ${SCRYPT.p}`],
              ["Protocol tag", PROTOCOL],
            ]}
          />
        </Section>

        <Section id="verify" title="Verify it yourself">
          <P>
            A standalone verifier, written separately from the site&apos;s TypeScript and using only Python&apos;s standard library. Given a mint, it reads
            the coin&apos;s metadata URI from Solana itself (not from this site), checks the on-chain name and ticker, requires the attestation to name
            this mint, rebuilds the digest, walks the chains and the tree, and checks the address. The test vectors it ships with are the same ones the
            site&apos;s tests use.
          </P>
          <Pre>{`
curl -O ${site.url}/verify.py
python3 verify.py <mint>                     # or a coin page link; --rpc <url> for another RPC
`}</Pre>
          <P>Or in TypeScript, against this repository&apos;s library:</P>
          <Pre>{`
import { launchDigest, pqAddress, verify, identityFromHex, signatureFromBase64 } from "@/lib/pq";

// metadataUri: read it from the mint's on-chain Token-2022 metadata, not from a website.
const meta = await fetch(metadataUri).then((r) => r.json());
const { pq } = meta;
const identity = identityFromHex(pq.identity)!;
if (pq.mint !== mint) throw new Error("attestation is for another coin");
if (pqAddress(identity) !== pq.identity.address) throw new Error("address doesn't match the root");
if (pq.leaf === 0) throw new Error("key 0 only signs registrations");
const digest = launchDigest({
  mint: pq.mint, creator: pq.creator, pqAddress: pq.identity.address, leaf: pq.leaf,
  name: meta.name, symbol: meta.symbol, description: meta.description ?? "", image: meta.image,
  twitter: meta.twitter ?? "", telegram: meta.telegram ?? "",
});
const { valid } = verify(digest, signatureFromBase64(pq.signature)!, identity);
`}</Pre>
        </Section>
      </article>
    </div>
  );
}
