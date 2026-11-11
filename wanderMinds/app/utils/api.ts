// API.ts
import OpenAI from "openai";
import Constants from "expo-constants";

export const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey ?? "";;
// Get your API keys from environment
const OPENAI_API_KEY = Constants.expoConfig?.extra?.openaiApiKey ?? "";

const openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });

// Function to generate itinerary from OpenAI
export async function generateItinerary({
  systemPrompt,
  userPrompt,
}: {
  systemPrompt: string;
  userPrompt: string;
}) {

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content);
}

export async function getTextDirections(
  origin: any,
  destination: any,
  waypoints: any[],
  mode: "driving" | "walking" | "bicycling" = "driving" // default to driving
) {
  const baseUrl = "https://maps.googleapis.com/maps/api/directions/json";
  const waypointStr = waypoints.map(wp => `${wp.latitude},${wp.longitude}`).join("|");
  
  const url = `${baseUrl}?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&waypoints=optimize:true|${waypointStr}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK") {
    console.warn("Directions API error:", data.error_message || data.status);
    return [];
  }

  // Get steps from the first route
  const steps = data.routes[0].legs.flatMap((leg: any) =>
    leg.steps.map((step: any) => step.html_instructions.replace(/<[^>]*>?/gm, ""))
  );

  return steps;
}