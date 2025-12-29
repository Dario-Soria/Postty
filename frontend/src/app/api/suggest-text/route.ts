/**
 * Suggest Text API Route
 * Uses Gemini to generate creative headlines based on user intent
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIntent, style, useCase } = body;

    console.log('[Suggest Text] Request:', { userIntent, style, useCase });

    // Call backend endpoint for text suggestions
    const response = await fetch(`${BACKEND_URL}/suggest-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIntent, style, useCase }),
    });

    const data = await response.json();

    console.log('[Suggest Text] Response:', data);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Suggest text error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}

