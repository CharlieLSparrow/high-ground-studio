import { NextRequest, NextResponse } from "next/server";
import { PublishingDispatcher, QuipslyPublicPackage } from "@/lib/publishing/DestinationAdapters";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { package: pkg, destinations } = body as {
      package: QuipslyPublicPackage;
      destinations: string[];
    };

    if (!pkg || !pkg.id || !pkg.title || !pkg.body) {
      return NextResponse.json({ error: "Invalid QuipslyPublicPackage payload" }, { status: 400 });
    }

    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      return NextResponse.json({ error: "Missing destinations array" }, { status: 400 });
    }

    const dispatcher = new PublishingDispatcher();
    
    // Validate first
    const validationResults = await dispatcher.validateForDestinations(pkg, destinations);
    
    // Check if there are critical validation errors
    const errors: Record<string, string[]> = {};
    let hasCriticalErrors = false;
    for (const [dest, result] of Object.entries(validationResults)) {
      if (!result.isValid) {
        errors[dest] = result.errors;
        hasCriticalErrors = true;
      }
    }

    if (hasCriticalErrors) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 422 });
    }

    // Execute dispatch
    const publishResults = await dispatcher.dispatch(pkg, destinations);

    return NextResponse.json({
      success: true,
      results: publishResults,
    });

  } catch (error: any) {
    console.error("[Publish Handoff Error]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
