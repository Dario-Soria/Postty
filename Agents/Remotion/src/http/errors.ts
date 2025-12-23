import type { ZodIssue } from "zod";

export type ApiErrorBody =
  | {
      error: "validation_error";
      message: string;
      issues: Array<{ path: string; code: string; message: string }>;
    }
  | {
      error: "unsupported_media_type";
      allowed: string[];
      got?: string;
    }
  | {
      error: "internal_error";
    };

export function zodIssuesToApiIssues(issues: ZodIssue[]) {
  return issues.map((i) => ({
    path: i.path.join("."),
    code: i.code,
    message: i.message,
  }));
}


