import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { algorithmsFor, findHostKeys } from "../../toolbox/knownHosts.js";

function hashed(token: string): string {
  const salt = Buffer.from("saltsaltsaltsaltsalt");
  const hash = createHmac("sha1", salt).update(token).digest("base64");
  return `|1|${salt.toString("base64")}|${hash}`;
}

describe("findHostKeys", () => {
  it("matches plain and comma-separated entries", () => {
    const content = "# comment\nnas.lan,10.0.0.5 ssh-ed25519 AAAAkey1\nother ssh-rsa AAAAkey2\n";
    expect(findHostKeys(content, "nas.lan", 22)).toEqual([{ type: "ssh-ed25519", keyBase64: "AAAAkey1" }]);
    expect(findHostKeys(content, "10.0.0.5", 22)).toHaveLength(1);
    expect(findHostKeys(content, "unknown", 22)).toEqual([]);
  });

  it("matches hashed entries", () => {
    const content = `${hashed("nas.lan")} ssh-ed25519 AAAAhashed\n`;
    expect(findHostKeys(content, "nas.lan", 22)).toEqual([{ type: "ssh-ed25519", keyBase64: "AAAAhashed" }]);
    expect(findHostKeys(content, "other.lan", 22)).toEqual([]);
  });

  it("uses the [host]:port form for non-default ports", () => {
    const content = "[nas.lan]:2222 ssh-ed25519 AAAAport\nnas.lan ssh-ed25519 AAAAplain\n";
    expect(findHostKeys(content, "nas.lan", 2222)).toEqual([{ type: "ssh-ed25519", keyBase64: "AAAAport" }]);
    expect(findHostKeys(content, "nas.lan", 22)).toEqual([{ type: "ssh-ed25519", keyBase64: "AAAAplain" }]);
  });

  it("ignores revoked keys and certificate authorities", () => {
    const content = "@revoked nas.lan ssh-ed25519 AAAArevoked\n@cert-authority nas.lan ssh-rsa AAAAca\n";
    expect(findHostKeys(content, "nas.lan", 22)).toEqual([]);
  });
});

describe("algorithmsFor", () => {
  it("expands ssh-rsa to its SHA-2 signature algorithms", () => {
    expect(algorithmsFor([{ type: "ssh-rsa", keyBase64: "x" }])).toEqual(["rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"]);
  });

  it("keeps other types as is, without duplicates", () => {
    const entry = { type: "ssh-ed25519", keyBase64: "x" };
    expect(algorithmsFor([entry, entry])).toEqual(["ssh-ed25519"]);
  });
});
