# wanderminds: architecture

> [!NOTE]
> This architecture write-up was added by
> [Claude Opus 5.5](https://docs.anthropic.com/en/docs/claude-code) in Nov 2026 using my
> [agentic-repo-analysis](https://github.com/sp4ce-cowboy/agentic-workflows) skill, from the
> project's code, git history and the team's pitch deck.

How the Makeathon build works, and what a native version would change. Back to the
[README](README.md).

**Contents:**
1. [Shape of the app](#1-shape-of-the-app)
2. [From preferences to a route](#2-from-preferences-to-a-route)
3. [The prompts](#3-the-prompts)
4. [Maps and directions](#4-maps-and-directions)
5. [Narration](#5-narration)
6. [Decisions and trade-offs](#6-decisions-and-trade-offs)
7. [Toward a Swift version](#7-toward-a-swift-version)

## 1. Shape of the app

```text
wanderMinds/
├── app.config.js            Expo config; reads the API keys from .env into `extra`
├── app/(tabs)/index.tsx     entry: one screen inside a gesture-handler root
├── app/screens/
│   ├── ExplorerScreen.tsx   the app: preferences, map, itinerary, directions, narration
│   └── StorytellerScreen.tsx an earlier version of the explorer screen, not used
└── app/utils/api.ts         OpenAI client and a Directions helper
```

- **Expo SDK 52 with expo-router** and React Native 0.76 (new architecture), in TypeScript.
- **One screen, two layers:** a full-screen `MapView`, and a `@gorhom/bottom-sheet` that snaps
  between 40% and 80% and switches between **Itinerary** and **Directions**.

## 2. From preferences to a route

[`handleAdventureStart`](https://github.com/sp4ce-cowboy/wanderminds/blob/fab9d975a66c29973dc4231b0daf19e0303a0051/wanderMinds/app/screens/ExplorerScreen.tsx#L173-L224):

1. Check the inputs: time, interest and a travel mode are required.
2. Ask for location permission once, and read the current position (Expo Location).
3. Build the prompts: factual for explore mode, fictional when a genre is set.
4. Call GPT-4.1 ([`generateItinerary`](https://github.com/sp4ce-cowboy/wanderminds/blob/fab9d975a66c29973dc4231b0daf19e0303a0051/wanderMinds/app/utils/api.ts#L11-L29)) and parse the JSON.
5. Store the plan, reset to the first stop, open the sheet on **Directions**.

## 3. The prompts

Both prompts ([source](https://github.com/sp4ce-cowboy/wanderminds/blob/fab9d975a66c29973dc4231b0daf19e0303a0051/wanderMinds/app/screens/ExplorerScreen.tsx#L196-L211)) pin the reply to one JSON shape, so the app can render it
without any guessing:

```json
{
  "title": "Journey title",
  "duration": "Approximate total duration",
  "cost": "Approximate total cost in EUR",
  "places": [{ "name": "…", "description": "…", "latitude": 0, "longitude": 0 }]
}
```

- **Explore:** a travel expert; about 50 words per place; a realistic cost within the budget; all
  places within reach; stops ordered to **minimise the total distance**; and two extra stops so the
  trip **starts and ends at the user's position**.
- **Story:** a creative writer of alternate-reality stories; about 100 words per place, set in the
  chosen genre, still tied to real coordinates.
- **Temperature 0.7**, and "return JSON only", so the reply parses directly.

## 4. Maps and directions

[Directions](https://github.com/sp4ce-cowboy/wanderminds/blob/fab9d975a66c29973dc4231b0daf19e0303a0051/wanderMinds/app/screens/ExplorerScreen.tsx#L345-L405):
- **Markers** for each stop, the current one highlighted, and the camera animating to it as the
  traveller moves on.
- **`MapViewDirections`** draws the route through every stop with the Google Directions API, in the
  chosen mode (walking, driving or bicycling), and fits the camera to the route, leaving room for
  the sheet.
- **Turn-by-turn steps:** on `onReady`, a second Directions call returns the legs; each step's HTML
  instruction is stripped to text with its distance and duration, and gets an arrow icon from its
  wording (turn left, slight right, merge).
- **Hand-off:** a button opens the same trip in Google Maps.

## 5. Narration

When the current stop changes, its description (or story chapter) is read aloud with Expo Speech,
in a Siri voice on iOS, at a slightly slower rate ([source](https://github.com/sp4ce-cowboy/wanderminds/blob/fab9d975a66c29973dc4231b0daf19e0303a0051/wanderMinds/app/screens/ExplorerScreen.tsx#L148-L169)). Starting a new trip
stops any speech in progress.

## 6. Decisions and trade-offs

| Decision | Why | Cost |
|---|---|---|
| React Native with Expo | One codebase, fast iteration on the simulator and on phones over a weekend | Not native; maps and speech go through wrappers |
| The model plans the route | One call gives places, descriptions, a cost estimate and an order | Coordinates and costs are the model's estimates, not checked against a places API |
| A strict JSON schema in the prompt | Rendering needs no parsing logic | A malformed reply fails the whole request |
| Google Directions for routing | Real paths and step-by-step instructions for three modes | A billable key, and two calls per route |

## 7. Toward a Swift version

The plan is to rebuild it natively. What would change:
- **SwiftUI with MapKit:** `Map` with annotations and `MapPolyline`, and `MKDirections` for routes and
  steps, so no Google key is needed for directions.
- **A small backend** to hold the OpenAI key and validate the model's JSON, instead of shipping the
  key inside the app.
- **Real places:** check each suggested stop against MapKit's points of interest (`MKLocalSearch`),
  so names, coordinates and opening hours are real.
- **`AVSpeechSynthesizer`** for narration, and Core Location for arrival detection, so the next chapter
  starts when you reach a stop rather than on a button.
- **Structured outputs** (a JSON schema in the API call) instead of a schema in the prompt.
