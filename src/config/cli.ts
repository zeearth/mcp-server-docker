export interface CliOptions {
  configPath?: string;
  readOnly: boolean;
  redact: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { readOnly: false, redact: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--read-only") {
      options.readOnly = true;
    } else if (arg === "--no-redact") {
      options.redact = false;
    } else if (arg === "--config") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new ConfigError("--config requires a file path");
      }
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else {
      throw new ConfigError(`unknown argument "${arg}"`);
    }
  }
  return options;
}
