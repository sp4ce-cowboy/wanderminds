// app/screens/ExplorerScreen.tsx
import React, { useState, useRef, useMemo, useEffect } from "react";
import MapView, { Marker, Region } from "react-native-maps";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Dimensions,
  Alert,
  StyleSheet,
  Pressable,
  Switch
} from "react-native";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import MapViewDirections from "react-native-maps-directions";
import BottomSheet, {
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { generateItinerary, GOOGLE_MAPS_API_KEY } from "../utils/api"; // Import your API key from the utils file


const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ExplorerScreen() {
  // Stepper limits
  const MIN_TIME = 1;
  const MAX_TIME = 24;
  const MIN_BUDGET = 0;
  const MAX_BUDGET = 1000;

  // User input state
  const [time, setTime] = useState<number>(2);
  const [interest, setInterest] = useState<string>("");
  const [genre, setGenre] = useState<string>("");
  const [budget, setBudget] = useState<number>(20);
  const [travelPreference, setTravelPreference] = useState<string | null>(null);
  const [numberOfPlaces, setNumberOfPlaces] = useState<number>(3);

  // App state
  const [showAdventure, setShowAdventure] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showGenreInput, setShowGenreInput] = useState<boolean>(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [explorationData, setExplorationData] = useState<any>(null);
  const [currentPlaceIndex, setCurrentPlaceIndex] = useState<number>(0);
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["40%", "80%"], []);

    // at the top of ExplorerScreen()
  const [directionsSteps, setDirectionsSteps] = useState<
  {
    instruction: string;
    distance: string;
    duration: string;
    end_location: { lat: number; lng: number };
  }[]
  >([]);
  const [sheetMode, setSheetMode] = useState<"itinerary" | "directions">(
  "directions"
  );

  function getArrowIcon(instruction: string): React.ComponentProps<typeof Ionicons>["name"] {
    const txt = instruction.toLowerCase();
    if (txt.includes("turn left")) return "arrow-back";
    if (txt.includes("turn right")) return "arrow-forward";
    if (txt.includes("slight left")) return "caret-back";
    if (txt.includes("slight right")) return "caret-forward";
    if (txt.includes("merge") || txt.includes("onto")) return "git-branch"; 
    return "navigate";  // fallback
  }

  const openInGoogleMaps = () => {
    const origin = `${location!.coords.latitude},${location!.coords.longitude}`;
    const dest = explorationData.places.slice(-1)[0];
    const destination = `${dest.latitude},${dest.longitude}`;
    const waypoints = explorationData.places
      .slice(1, -1)
      .map((p: any) => `${p.latitude},${p.longitude}`)
      .join('%7C');
    const mode = travelPreference; // 'driving'|'walking'|'bicycling'
  
    // universal link (will open in-app if Google Maps is installed, 
    // otherwise in browser), with auto-start
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      //`&origin=${origin}` +
      `&destination=${destination}` +
      `&travelmode=${mode}` +
      (waypoints ? `&waypoints=${waypoints}` : '');
  
    console.log("url is", url)
    Linking.openURL(url);
  };

  const goToNextStep = () => {
    const maxIndex = explorationData.places.length - 1;

    if (currentPlaceIndex < maxIndex) {
      setCurrentPlaceIndex(i => i + 1);
    } else {
      Alert.alert("🎉 Adventure completed!");
      // reset all your state here (as before)
      setShowAdventure(false);
      setExplorationData(null);
      setLocation(null);
      setTime(2);
      setInterest("");
      setGenre("")
      setBudget(20);
      setTravelPreference(null);
      setDirectionsSteps([]);
      setSheetMode("itinerary");
      Speech.stop();
    }
  };

  useEffect(() => {
    if (!explorationData || !location) return;
  
    // if index is 0, center on user; otherwise center on selected place
    const { latitude, longitude } =
      currentPlaceIndex === -1
        ? location.coords
        : explorationData.places[currentPlaceIndex];
  
    const region: Region = {
      latitude,
      longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  
    mapRef.current?.animateToRegion(region, 500);  // 500ms animation
  }, [currentPlaceIndex, explorationData, location]);

  // Speak description on index change
  
  useEffect(() => {
    if (showAdventure && explorationData) {
      const desc = explorationData.places[currentPlaceIndex]?.description;
      if (desc) {
        Speech.stop();
        Speech.speak(desc, {
          // on iOS these bundle IDs give you the Siri voices:
          // female Siri:
          voice: 'com.apple.ttsbundle.siri_female_en-US_premium',
          // (or male Siri):
          // voice: 'com.apple.ttsbundle.siri_male_en-US_compact',
  
          // ensure US English
          language: 'en-US',
          // adjust pitch & rate if you like
          pitch: 1.1,
          rate: 0.9,
        });
      }
    }
  }, [currentPlaceIndex, explorationData, showAdventure]);

  // Combined handler: request location, then call AI, then show map
  async function handleAdventureStart() {
    if (!time || !interest || !travelPreference) {
      Alert.alert("Please fill all fields including travel preference!");
      return;
    }

    setLoading(true);
    try {
      // 1) Ensure we have location
      let userLoc = location;
      if (!userLoc) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission to access location was denied");
          throw new Error("Location permission denied");
        }
        userLoc = await Location.getCurrentPositionAsync({});
        setLocation(userLoc);
      }
      const { latitude, longitude } = userLoc.coords;

      // 2) Build OpenAI prompts
      let systemPrompt = "";
      let userPrompt = "";
  
      if (genre) {
        // If genre is provided, create a fictional story prompt
        systemPrompt = `You are a creative writer who specializes in crafting alternate reality stories. Your task is to create a detailed narrative for each location, within the context of the user's chosen genre. Each location will be part of a larger fictional story, with a unique storyline and characters in a world that reflects the genre.\n\nYour response should strictly be in the following format:\n\n{\n  "title": "Journey title",\n  "duration": "Approximate total duration (e.g. 2 hours)",\n  "cost": "Approximate total cost in EUR",\n  "places": [\n      {\n      "name": "Place name", \n      "description": "Creative, genre-specific story about the place. The story should immerse the user in a fictional world, e.g., futuristic, fantasy, sci-fi, etc. Extend the description to about 100 words.",\n      "latitude": number,\n      "longitude": number\n      },\n      ...\n  ]\n}\n\nEnsure:\n- All places are geographically within a 1000 km radius from the user's current location.\n- The total cost is realistic and fits the user's budget.\n- Keep the narrative engaging and exciting based on the genre.\n- Return JSON only, with no additional text outside the JSON block.`;
  
        userPrompt = `User details:\n- Available time: ${time} hours\n- Interest: ${interest}\n- Budget: ${budget} euros\n- Travel preference: ${travelPreference}\n- Genre: ${genre}\n- Current location: lat ${latitude}, lon ${longitude}\n\nGenerate a mini itinerary of ${numberOfPlaces} places, each with a fictional story based on the chosen genre. The first and last stop should be the current location. The other places should be engaging, imaginative, and incorporate elements of the genre. Return the result strictly in JSON format.`;
      } else {
        // Regular non-fiction prompt if no genre is provided
        systemPrompt = `You are a travel expert who creates personalized mini city exploration itineraries based on user inputs.\n\nYour task is to generate a JSON-only response strictly in this format:\n\n{\n  "title": "Journey title",\n  "duration": "Approximate total duration (e.g. 2 hours)",\n  "cost": "Approximate total cost in EUR",\n  "places": [\n      {\n      "name": "Place name", \n      "description": "Brief and engaging description of the place. Extend the description to about 50 words.",\n      "latitude": number,\n      "longitude": number\n      },\n      ...\n  ]\n}\n\nEnsure:\n- All places are geographically within a 1000 km radius from the user's current location.\n- The itinerary includes anywhere from 1 to 10 places, which will be specified by the user.\n- The total cost is realistic and fits the user's budget.\n- Return JSON only, with no additional text outside the JSON block.`;
  
        userPrompt = `User details:\n- Available time: ${time} hours\n- Interest: ${interest}\n- Budget: ${budget} euros\n- Travel preference: ${travelPreference}\n- Current location: lat ${latitude}, lon ${longitude}\n\nGenerate a mini itinerary of ${numberOfPlaces} interesting places to explore based on these inputs. Return the result strictly in JSON format. ADDITIONALLY, order the coordinates in such a manner that the TOTAL distance travelled when going through all the stops is the minimum. FINALLY, add two more stops such that the first and the last stop are the current location coordinates.`;
      }
      // 3) Call the AI
      const parsed = await generateItinerary({systemPrompt, userPrompt});
      console.log("Coordinates are;", parsed, parsed.places.length)

      // 4) Update state and show adventure
      setExplorationData(parsed);
      setCurrentPlaceIndex(0);
      setShowAdventure(true);
      setSheetMode("directions");
      sheetRef.current?.snapToIndex(0); // peek at 40%
      setShowModal(false);
    } catch (error: any) {
      console.error(error);
      Alert.alert(error.message || "Failed to generate itinerary. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  // Stepper handlers
  const incrementPlaces = () => setNumberOfPlaces(prev => prev + 1);
  const decrementPlaces = () => setNumberOfPlaces(prev => Math.max(1, prev - 1)); // prevent going below 1
  const incrementTime = () => setTime((t) => Math.min(t + 2, MAX_TIME));
  const decrementTime = () => setTime((t) => Math.max(t - 1, MIN_TIME));
  const incrementBudget = () => setBudget((b) => Math.min(b + 10, MAX_BUDGET));
  const decrementBudget = () => setBudget((b) => Math.max(b - 10, MIN_BUDGET));

  // Travel Preference Button
  const TravelButton = ({ label, iconName, value }: { label: string; iconName: string; value: string }) => {
    const selected = travelPreference === value;
    return (
      <TouchableOpacity
        onPress={() => setTravelPreference(value)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          marginRight: 8,
          backgroundColor: selected ? "#1566a8" : "#eee",
          borderWidth: selected ? 0 : 1,
          borderColor: "#999",
          minWidth: 80,
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={iconName as any}
          size={22}
          color={selected ? "white" : "#555"}
          style={{ marginRight: 4 }}
        />
        <Text style={{ color: selected ? "white" : "#555", fontWeight: "600", fontSize: 16 }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // Loading screen
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "white" }}>
        <ActivityIndicator size="large" color="#1566a8" />
        <Text style={{ color: "#545454", marginTop: 16 }}>Preparing your adventure...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      {!showAdventure && !explorationData && !location && (
      <SafeAreaView style={{ flex: 1 }}>
          <View style={{ height: SCREEN_HEIGHT * 0.9 }}>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={{
                latitude: 48.137154,
                longitude: 11.576124,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Marker
                coordinate={{ latitude: 48.137154, longitude: 11.576124 }}
                title="You are here"
                pinColor="green"
              />
          </MapView>
          </View>
          </SafeAreaView>
          )}
      {/* Adventure Map & Details */}
      {showAdventure && explorationData && location && (
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ height: SCREEN_HEIGHT * 0.9 }}>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Marker
                coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
                title="You are here"
                pinColor="green"
              />
              {explorationData.places.map((place: any, idx: number) => (
              <Marker
              key={idx}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              tracksViewChanges={false}      // improve performance
              >
                <View
                  style={[
                    styles.markerWrap,
                    idx === currentPlaceIndex && styles.markerWrapActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.markerText,
                      idx === currentPlaceIndex && styles.markerTextActive,
                    ]}
                  >
                    {idx == 0 || idx == explorationData.places.length - 1 ? "1/" + explorationData.places.length : idx + 1}
                  </Text>
                </View>
              </Marker>
              ))}
              <MapViewDirections
                origin={location.coords}
                // we assume the last place in the array is the “return to start” waypoint;
                // if not, set destination to that.
                destination={explorationData.places.slice(-1)[0]}
                waypoints={explorationData.places
                  // leave off the final “return” item if you included it as destination
                  .slice(0, -1)
                  .map((p: { latitude: any; longitude: any; }) => ({ latitude: p.latitude, longitude: p.longitude }))}
                apikey={GOOGLE_MAPS_API_KEY}
                mode={
                  travelPreference === "walk"
                    ? "WALKING"
                    : travelPreference === "drive"
                    ? "DRIVING"
                    : "BICYCLING"
                }
                strokeWidth={4}
                strokeColor="#1566a8"
                // inside your <MapViewDirections onReady={…} /> callback
                onReady={async (result) => {
                  // adjust camera
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: { top: 50, right: 50, bottom: SCREEN_HEIGHT * 0.4, left: 50 },
                  });

                  // build URLs
                  const origin = `${location.coords.latitude},${location.coords.longitude}`;
                  const destCoords = explorationData.places.slice(-1)[0];
                  const destination = `${destCoords.latitude},${destCoords.longitude}`;
                  const wp = explorationData.places
                    .slice(0, -1)
                    .map((p: any) => `${p.latitude},${p.longitude}`)
                    .join("|");

                    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${wp}&mode=${
                      travelPreference === "walk"
                        ? "walking"
                        : travelPreference === "drive"
                        ? "driving"
                        : "bicycling"
                    }&key=${GOOGLE_MAPS_API_KEY}`;

                  try {
                    const res = await fetch(url);
                    const json = await res.json();
                    const legs = json.routes[0].legs;
                    // flatten each leg’s steps
                    const steps = legs.flatMap((leg: any) =>
                      leg.steps.map((s: any) => ({
                        instruction: s.html_instructions.replace(/<[^>]+>/g, ""),
                        distance: s.distance.text,
                        duration: s.duration.text,
                        end_location: s.end_location,
                      }))
                    );
                    setDirectionsSteps(steps);
                  } catch (e) {
                    console.warn("Failed to fetch steps:", e);
                  }
                }}
              />
            </MapView>
            {(sheetMode === "directions" || sheetMode === "itinerary") && directionsSteps.length > 0 && (
              <Pressable
                style={styles.navCard}
                onPress={() => sheetRef.current?.snapToIndex(1)} // full expand on tap
              >

                {/* 2) Google Maps button */}
                <TouchableOpacity
                  onPress={openInGoogleMaps}
                  style={styles.iconButton}
                >
                  <Ionicons name="logo-google" size={28} color="#1566a8" />
                </TouchableOpacity>

                {/* 4) Voice button 
                <TouchableOpacity
                  onPress={() =>
                    Speech.speak(
                      directionsSteps[currentPlaceIndex].instruction,
                      { language: "en-US" }
                    )
                  }
                  style={styles.iconButton}
                >
                  <Ionicons name="volume-high-outline" size={24} color="#333" />
                </TouchableOpacity>
                */}

                {/* 5) Next step button */}
                <TouchableOpacity
                  onPress={goToNextStep}
                  style={styles.nextButton}
                >
                  <Text style={styles.nextButtonText}>Next Stop</Text>
                </TouchableOpacity>
              </Pressable>
            )}
            <BottomSheet
              ref={sheetRef}
              index={-1}
              snapPoints={snapPoints}
              enablePanDownToClose={true}
            >
              <ScrollView>
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
                  Itinerary
                </Text>
                {explorationData.places.map((place: any, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      // jump map to that stop
                      setCurrentPlaceIndex(idx);
                      sheetRef.current?.snapToIndex(0);
                    }}
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor:
                        idx === currentPlaceIndex ? "#1566a8" : "#fff",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: idx === currentPlaceIndex ? "#fff" : "#333",
                      }}
                    >
                      {idx + 1}. {place.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: idx === currentPlaceIndex ? "#eee" : "#666",
                      }}
                    >
                      {place.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              </ScrollView>
            </BottomSheet>
            
            {/* … inside your SafeAreaView, replacing the old BottomSheet … */}
            <BottomSheet
              ref={sheetRef}
              index={-1}
              snapPoints={snapPoints}
              enablePanDownToClose
            >
              <View style={{ padding: 16 }}> 
              <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 8 }}>{ explorationData.title}</Text>
              <Text style={{ fontSize: 16, marginBottom: 8 }}>🕐 {explorationData.duration}</Text>
              <Text style={{ fontSize: 16, marginBottom: 8 }}>💵 {explorationData.cost}</Text>
              </View> 
              
              <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
                {/* toggle tabs */}
                <View style={{ flexDirection: "row", marginBottom: 12 }}>
                  {["itinerary", "directions"].map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setSheetMode(mode as any)}
                      style={{
                        flex: 1,
                        padding: 8,
                        backgroundColor:
                          sheetMode === mode ? "#1566a8" : "transparent",
                        borderRadius: 8,
                        marginRight: mode === "itinerary" ? 8 : 0,
                      }}
                    >
                      <Text
                        style={{
                          textAlign: "center",
                          color: sheetMode === mode ? "#fff" : "#333",
                          fontWeight: "600",
                        }}
                      >
                        {mode === "itinerary" ? "Itinerary" : "Directions"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {sheetMode === "itinerary" ? (
                  // your existing list of places
                  explorationData.places.map((place: any, idx: number) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => {
                        // jump map to that stop
                        setCurrentPlaceIndex(idx);
                        sheetRef.current?.snapToIndex(0);
                      }}
                      style={{
                        marginBottom: 12,
                        padding: 12,
                        borderRadius: 20,
                        backgroundColor:
                          idx === currentPlaceIndex ? "#1566a8" : "#fff", 
                      }}
                    >
                      <View style={{ marginTop: 20 }}>
                        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: idx === currentPlaceIndex ? "#fff" : "#333"}}>
                          {place.name}
                        </Text>
                        <Text style={{ fontSize: 14, color: idx === currentPlaceIndex ? "#eee" : "#666"}}>
                          {place.description}
                        </Text>
                      </View>

                    </TouchableOpacity>
                  ))
                ) : (
                  // the new list of steps
                  directionsSteps.map((step, idx) => (
                    <View
                      key={idx}
                      style={{
                        marginBottom: 16,
                        padding: 12,
                        backgroundColor: "#fff",
                        borderRadius: 8,
                      }}
                    >
                       {/* 1) Big arrow icon */}
                      <Ionicons
                        name={getArrowIcon(directionsSteps[currentPlaceIndex].instruction)}
                        size={32}
                        color="#1566a8"
                      />

                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: "#333",
                        }}
                      >
                        {idx + 1}. {step.instruction}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#666",
                          marginTop: 4,
                        }}
                      >
                        {step.distance} · {step.duration}
                      </Text>
                    </View>
                  ))
                )}
              </BottomSheetScrollView>
            </BottomSheet>
          </View>
        </SafeAreaView>
      )}

      {/* Open modal button */}
      {!showAdventure && !showModal && (
        <TouchableOpacity
          activeOpacity={0.8}
          style={{
            position: "absolute",
            bottom: 30,
            right: 20,
            backgroundColor: "#1566a8",
            padding: 12,
            borderRadius: 999,
            shadowColor: "#1566a8",
            shadowOpacity: 0.4,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 10,
            elevation: 10,
            width: 56,
            height: 56,
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="search-outline" size={28} color="white" />
        </TouchableOpacity>
      )}

      {/* Preferences Modal */}
      <Modal animationType="slide" transparent visible={showModal} onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center" }}>
          <View
            style={{ backgroundColor: "white", borderRadius: 20, padding: 20, maxHeight: "100%", marginHorizontal: 10, alignSelf: "center", width: "90%" }}
          >
            <TouchableOpacity
              style={{ position: "absolute", top: 16, right: 16, backgroundColor: "white", padding: 8, borderRadius: 999, zIndex: 99 }}
              onPress={() => setShowModal(false)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{height: 600}}>
              <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 24 }}>Your Preferences</Text>
            
              {/* Toggle switch for genre input */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
                <Text style={{ fontWeight: "600", fontSize: 16, marginRight: 8 }}>Story Mode</Text>
                <Switch
                  value={showGenreInput}
                  onValueChange={(value) => setShowGenreInput(value)} // Toggle visibility of genre input
                  thumbColor={showGenreInput ? "#ccc" : "#ccc"} // Green when on, grey when off
                  trackColor={{ false: "#1566a8", true: "#1566a8" }} // Green track color when on
                />
              </View>
              
              {/* Time stepper */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Time (hours)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <TouchableOpacity style={{ padding: 12, backgroundColor: "#1566a8", borderRadius: 8, width: 48, alignItems: "center" }} onPress={decrementTime}>
                    <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>–</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 20, fontWeight: "600" }}>{time}</Text>
                  <TouchableOpacity style={{ padding: 12, backgroundColor: "#1566a8", borderRadius: 8, width: 48, alignItems: "center" }} onPress={incrementTime}>
                    <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Interest */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Interest</Text>
                <TextInput
                  placeholder="Interest? (e.g., Artsy, Adventure)"
                  placeholderTextColor="#888"
                  value={interest}
                  onChangeText={setInterest}
                  style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: "#333" }}
                  returnKeyType="done"
                />
              </View>

              {/* Genre input field (conditionally rendered based on the toggle state) */}
              {showGenreInput && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Genre</Text>
                  <TextInput
                    placeholder="Genre? (e.g., Horror, Fantasy)"
                    placeholderTextColor="#888"
                    value={genre}
                    onChangeText={setGenre}
                    style={{
                      borderWidth: 1,
                      borderColor: "#ddd",
                      borderRadius: 8,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: "#333",
                    }}
                    returnKeyType="done"
                  />
                </View>
              )}


              {/* Number of Places stepper */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Number of Places</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <TouchableOpacity
                    style={{ padding: 12, backgroundColor: "#1566a8", borderRadius: 8, width: 48, alignItems: "center" }}
                    onPress={decrementPlaces}
                  >
                    <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>–</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 20, fontWeight: "600" }}>{numberOfPlaces}</Text>
                  <TouchableOpacity
                    style={{ padding: 12, backgroundColor: "#1566a8", borderRadius: 8, width: 48, alignItems: "center" }}
                    onPress={incrementPlaces}
                  >
                    <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>


              {/* Budget stepper */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Budget (€)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <TouchableOpacity style={{ padding: 12, backgroundColor: "#1566a8", borderRadius: 8, width: 48, alignItems: "center" }} onPress={decrementBudget}>
                    <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>–</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 20, fontWeight: "600" }}>{budget}</Text>
                  <TouchableOpacity style={{ padding: 12, backgroundColor: "#1566a8", borderRadius: 8, width: 48, alignItems: "center" }} onPress={incrementBudget}>
                    <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Travel preference */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 12 }}>Travel Preference</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TravelButton label="Walk" iconName="walk-outline" value="walk" />
                  <TravelButton label="Drive" iconName="car-outline" value="drive" />
                  <TravelButton label="Cycle" iconName="bicycle-outline" value="cycle" />
                </View>
              </View>

              <TouchableOpacity style={{ backgroundColor: "#1566a8", borderRadius: 24, paddingVertical: 16, marginBottom: 20}} onPress={handleAdventureStart}>
                <Text style={{ color: "white", fontSize: 18, fontWeight: "600", textAlign: "center" }}>Start Adventure</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  markerWrap: {
    backgroundColor: 'red',
    borderRadius: 16,
    padding: 6,
    borderColor: 'white',
    borderWidth: 2,
  },
  markerText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  markerWrapActive: {
    backgroundColor: 'blue',
  },
  markerTextActive: {
    color: 'white',
  },
  navCard: {
    position: "absolute",
    bottom: SCREEN_HEIGHT * 0.4 + 320,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
    justifyContent: "space-between",
  },
  iconButton: {
    padding: 6,
    marginHorizontal: 6,
  },
  navTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  nextButton: {
    backgroundColor: "#1566a8",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  nextButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  navDistance: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1566a8",
  },
  navInstruction: {
    fontSize: 16,
    color: "#333",
    marginTop: 4,
  },
});
