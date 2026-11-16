import { NextResponse } from "next/server";

export async function forwardBackendResponse(
  response: Response,
  fallbackMessage: string,
): Promise<NextResponse> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    if (response.ok) {
      return new NextResponse(null, {
        status: response.status,
      });
    }

    return NextResponse.json(
      { message: fallbackMessage },
      { status: response.status },
    );
  }

  try {
    const result: unknown = JSON.parse(rawText);

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { message: fallbackMessage },
      { status: response.ok ? 502 : response.status },
    );
  }
}
