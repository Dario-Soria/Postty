export class FontValidationError extends Error {
  public readonly code: "fonts_dir_missing" | "no_fonts_found" | "font_family_not_found";
  public readonly family?: string;

  constructor(args: { code: FontValidationError["code"]; message: string; family?: string }) {
    super(args.message);
    this.name = "FontValidationError";
    this.code = args.code;
    this.family = args.family;
  }
}


