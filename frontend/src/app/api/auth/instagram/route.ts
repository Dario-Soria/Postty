import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

export async function GET(request: NextRequest) {
  // Redirect to backend OAuth initiation
  return NextResponse.redirect(`${BACKEND_URL}/auth/instagram`);
}

