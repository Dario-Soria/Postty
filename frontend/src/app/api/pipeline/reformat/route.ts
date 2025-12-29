/**
 * Pipeline Reformat API Route
 * Adapta la misma imagen a un formato diferente (sin regenerar)
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('[Reformat API] Request:', {
      hasBaseImage: !!body.baseImageBase64,
      newAspectRatio: body.newAspectRatio,
      style: body.style,
      hasText: !!body.textContent,
    });

    const response = await fetch(`${BACKEND_URL}/pipeline/reformat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    console.log('[Reformat API] Response:', {
      success: data.success,
      error: data.error,
      format: data.format,
    });

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Reformat proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect to backend' },
      { status: 500 }
    );
  }
}

