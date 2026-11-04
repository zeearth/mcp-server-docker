import { describe, expect, it } from "vitest";
import { sanitizeUrl } from "../../toolbox/sanitizeUrl.js";

describe("sanitizeUrl", () => {
  it("strips the password but keeps the user", () => {
    expect(sanitizeUrl("ssh://bob:secret@nas.lan")).toBe("ssh://bob@nas.lan");
  });

  it("leaves clean URLs alone", () => {
    expect(sanitizeUrl("unix:///var/run/docker.sock")).toBe("unix:///var/run/docker.sock");
    expect(sanitizeUrl("ssh://bob@nas.lan")).toBe("ssh://bob@nas.lan");
  });

  it("does not throw on invalid input", () => {
    expect(sanitizeUrl("not a url")).toBe("(invalid url)");
  });
});
