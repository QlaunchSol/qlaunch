import { describe, expect, it } from "vitest";
import { fromBase64 } from "@/lib/pq/bytes";
import { parseTokenMetadata } from "./verify-coin";

// A real pump.fun create_v2 mint (devnet), as returned by getAccountInfo.
const MINT_ACCOUNT = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDGpH6NAwAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABs5JUKBGNR3Bo2WhVjA0G4vmkS7sOhjpKxaDSbTdPUsEwDXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGzklQoEY1HcGjZaFWMDQbi+aRLuw6GOkrFoNJtN09SwMAAAAVUkgVGVzdCBITzU2BwAAAFVJVEhPNTZ0AAAAaHR0cHM6Ly9jaG9jb2xhdGUtdG90YWwtbWFja2VyZWwtODQzLm15cGluYXRhLmNsb3VkL2lwZnMvYmFma3JlaWh3eGZvcTVyZ3g0bW43bzJidGpqZ2hiZTV1ZmU3c3M3M3JuYXhzeGtjaXh3aG9iYW92dHkAAAAA";

describe("parseTokenMetadata", () => {
  it("reads name, symbol and uri from a real Token-2022 mint", () => {
    const meta = parseTokenMetadata(fromBase64(MINT_ACCOUNT));
    expect(meta?.name).toBe("UI Test HO56");
    expect(meta?.symbol).toBe("UITHO56");
    expect(meta?.uri).toMatch(/^https:\/\/chocolate-total-mackerel-843\.mypinata\.cloud\/ipfs\/bafkrei[a-z2-7]{52}$/);
  });

  it("returns null for an account without the extension", () => {
    expect(parseTokenMetadata(new Uint8Array(165))).toBeNull();
  });
});
