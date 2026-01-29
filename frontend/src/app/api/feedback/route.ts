import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, rating1, rating2, comment } = body;

    if (!email) {
      return NextResponse.json(
        { status: "error", message: "Email is required" },
        { status: 400 }
      );
    }

    // Create feedback entry
    const feedbackEntry = {
      timestamp: new Date().toISOString(),
      email,
      easeOfUseRating: rating1,
      resultQualityRating: rating2,
      comment: comment || "",
    };

    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), "feedback-logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create filename from email (sanitized)
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "_");
    const logFile = path.join(logsDir, `${sanitizedEmail}.json`);

    // Read existing entries or create new array
    let entries: typeof feedbackEntry[] = [];
    if (fs.existsSync(logFile)) {
      const existingData = fs.readFileSync(logFile, "utf-8");
      try {
        entries = JSON.parse(existingData);
        if (!Array.isArray(entries)) {
          entries = [entries];
        }
      } catch {
        entries = [];
      }
    }

    // Add new entry
    entries.push(feedbackEntry);

    // Write back to file
    fs.writeFileSync(logFile, JSON.stringify(entries, null, 2));

    // Also append to a master log file
    const masterLogFile = path.join(logsDir, "_all_feedback.json");
    let allEntries: typeof feedbackEntry[] = [];
    if (fs.existsSync(masterLogFile)) {
      const existingData = fs.readFileSync(masterLogFile, "utf-8");
      try {
        allEntries = JSON.parse(existingData);
        if (!Array.isArray(allEntries)) {
          allEntries = [allEntries];
        }
      } catch {
        allEntries = [];
      }
    }
    allEntries.push(feedbackEntry);
    fs.writeFileSync(masterLogFile, JSON.stringify(allEntries, null, 2));

    return NextResponse.json({
      status: "success",
      message: "Feedback saved successfully",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    console.error("Error saving feedback:", message);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
