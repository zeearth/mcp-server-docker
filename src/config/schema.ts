import { z } from "zod";

const SUPPORTED_SCHEMES = ["unix:", "tcp:", "http:", "https:", "ssh:"];

// Host names end up in a tool enum, so keep them simple.
const HOST_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const HOST_NAME_HINT = "host names may only use letters, digits, '-' or '_'";
const hostNameSchema = z.string().regex(HOST_NAME_PATTERN, HOST_NAME_HINT);

const urlSchema = z.string().superRefine((value, context) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({ code: "custom", message: `invalid URL "${value}"` });
    return;
  }
  if (!SUPPORTED_SCHEMES.includes(parsed.protocol)) {
    context.addIssue({
      code: "custom",
      message: `unsupported scheme "${parsed.protocol}" (expected unix, tcp, http, https or ssh)`,
    });
  }
  if (parsed.password) {
    context.addIssue({ code: "custom", message: "the URL must not embed a password" });
  }
});

export const hostConfigSchema = z.strictObject({
  url: urlSchema,
  readOnly: z.boolean().default(false),
  ca: z.string().optional(),
  cert: z.string().optional(),
  key: z.string().optional(),
});

export const fileConfigSchema = z
  .strictObject({
    defaultHost: hostNameSchema.optional(),
    // Keys are checked below: zod only reports "Invalid key in record" for them.
    hosts: z.record(z.string(), hostConfigSchema),
  })
  .superRefine((value, context) => {
    const names = Object.keys(value.hosts);
    for (const name of names) {
      if (!HOST_NAME_PATTERN.test(name)) {
        context.addIssue({ code: "custom", path: ["hosts", name], message: `"${name}": ${HOST_NAME_HINT}` });
      }
    }
    if (names.length === 0) {
      context.addIssue({ code: "custom", path: ["hosts"], message: "at least one host is required" });
    }
    if (value.defaultHost !== undefined && !names.includes(value.defaultHost)) {
      context.addIssue({
        code: "custom",
        path: ["defaultHost"],
        message: `"${value.defaultHost}" is not a configured host`,
      });
    }
  });

export type HostConfig = z.infer<typeof hostConfigSchema>;

export interface AppConfig {
  hosts: Record<string, HostConfig>;
  defaultHost?: string;
  // Global flag: forces every host to read-only.
  readOnly: boolean;
  redact: boolean;
}
