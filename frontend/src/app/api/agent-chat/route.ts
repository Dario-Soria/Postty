/**
 * Agent Chat API Route - Proxy to backend
 * Handles multipart form data for image uploads
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();

    // userId is already in formData from frontend, just forward it
    // Forward the form data to the backend (includes userId if present)
    const response = await fetch(`${BACKEND_URL}/agent-chat`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Agent chat proxy error:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to connect to backend',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
