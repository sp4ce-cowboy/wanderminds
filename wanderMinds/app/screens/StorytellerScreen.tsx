// app/screens/StorytellerScreen.tsx
import React, { useState } from "react";
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
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import OpenAI from "openai";
import Constants from "expo-constants";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Load API key from expo config (injected via app.config.js)
const OPENAI_API_KEY = Constants.expoConfig?.extra?.openaiApiKey ?? "";

export default function ExplorerScreen() {
  // Stepper limits
  const MIN_TIME = 1;
  const MAX_TIME = 12;
  const MIN_BUDGET = 0;
  const MAX_BUDGET = 500;

  // User input state
  const [time, setTime] = useState<number>(2);
  const [interest, setInterest] = useState<string>("");
  const [budget, setBudget] = useState<number>(20);
  const [travelPreference, setTravelPreference] = useState<string | null>(null);

  // App state
  const [showAdventure, setShowAdventure] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [explorationData, setExplorationData] = useState<any>(null);
  const [currentPlaceIndex, setCurrentPlaceIndex] = useState<number>(0);

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  // Combined handler: request location, then call AI, then show map
  async function handleAdventureStart() {
    if (!time || !interest || !budget || !travelPreference) {
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
      const systemPrompt = `You are a travel expert who creates personalized mini city exploration itineraries based on user inputs.\n\nYour task is to generate a JSON-only response strictly in this format:\n\n{\n  "title": "Journey title",\n  "duration": "Approximate total duration (e.g. 2 hours)",\n  "cost": "Approximate total cost in EUR",\n  "places": [\n      {\n      "name": "Place name",\n      "description": "Brief and engaging description of the place",\n      "latitude": number,\n      "longitude": number\n      },\n      ...\n  ]\n}\n\nEnsure:\n- All places are MAXIMUM geographically within a 500 km radius from the user's current location, even factoring in the chosen travel preference and the available time.\n- The itinerary includes 3 to 10 places.\n- The total cost is realistic and fits the user's budget.\n- Return JSON only, with no additional text outside the JSON block.`;

      const userPrompt = `User details:\n- Available time: ${time} hours\n- Interest: ${interest}\n- Budget: ${budget} euros\n- Travel preference: ${travelPreference}\n- Current location: lat ${latitude}, lon ${longitude}\n\nGenerate a mini itinerary of 3-10 interesting places to explore based on these inputs. Return the result strictly in JSON format. ADDITIONALLY, order the coordinates in such a manner that the TOTAL distance travelled when going through all the stops is the minimum.`;

      // 3) Call the AI
      
      const response = await client.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      console.log("Coordinates are;", parsed)

      // 4) Update state and show adventure
      setExplorationData(parsed);
      setCurrentPlaceIndex(0);
      setShowAdventure(true);
      setShowModal(false);
    } catch (error: any) {
      console.error(error);
      Alert.alert(error.message || "Failed to generate itinerary. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  // Build polyline coordinates for map
  const routeCoordinates =
    location && explorationData
      ? [
          { latitude: location.coords.latitude, longitude: location.coords.longitude },
          ...explorationData.places.map((place: any) => ({
            latitude: place.latitude,
            longitude: place.longitude,
          })),
        ]
      : [];

  // Stepper handlers
  const incrementTime = () => setTime((t) => Math.min(t + 1, MAX_TIME));
  const decrementTime = () => setTime((t) => Math.max(t - 1, MIN_TIME));
  const incrementBudget = () => setBudget((b) => Math.min(b + 5, MAX_BUDGET));
  const decrementBudget = () => setBudget((b) => Math.max(b - 5, MIN_BUDGET));

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
          marginRight: 12,
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
          style={{ marginRight: 8 }}
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
      {/* Adventure Map & Details */}
      {showAdventure && explorationData && location && (
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ height: SCREEN_HEIGHT * 0.5 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Polyline coordinates={routeCoordinates} strokeColor="#1566a8" strokeWidth={4} />
              <Marker
                coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
                title="You are here"
                pinColor="green"
              />
              {explorationData.places.map((place: any, idx: number) => (
                <Marker
                  key={idx}
                  coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                  title={place.name}
                  pinColor={idx === currentPlaceIndex ? "blue" : "red"}
                  description={place.description}
                />
              ))}
            </MapView>
          </View>

          <ScrollView style={{ flex: 1, backgroundColor: "#f0f8ff", padding: 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 8 }}>{explorationData.title}</Text>
            <Text style={{ fontSize: 16, marginBottom: 8 }}>🕐 {explorationData.duration} | 💵 {explorationData.cost}</Text>

            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
                {explorationData.places[currentPlaceIndex]?.name}
              </Text>
              <Text style={{ fontSize: 14, color: "#555" }}>
                {explorationData.places[currentPlaceIndex]?.description}
              </Text>
            </View>

            <TouchableOpacity
              style={{ backgroundColor: "#1566a8", borderRadius: 24, paddingVertical: 16, marginTop: 30 }}
              onPress={() => {
                if (currentPlaceIndex < explorationData.places.length - 1) {
                  setCurrentPlaceIndex(currentPlaceIndex + 1);
                } else {
                  Alert.alert("🎉 Adventure completed!");
                  setShowAdventure(false);
                  setExplorationData(null);
                  setLocation(null);
                  setTime(2);
                  setInterest("");
                  setBudget(20);
                  setTravelPreference(null);
                }
              }}
            >
              <Text style={{ color: "white", fontSize: 18, fontWeight: "600", textAlign: "center" }}>
                {currentPlaceIndex < explorationData.places.length - 1 ? "Next Stop" : "End Journey"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingVertical: 32, maxHeight: "70%", marginHorizontal: 10, alignSelf: "center", width: "90%" }}
          >
            <TouchableOpacity
              style={{ position: "absolute", top: 16, right: 16, backgroundColor: "white", padding: 8, borderRadius: 999, zIndex: 99 }}
              onPress={() => setShowModal(false)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 24 }}>Your Preferences</Text>

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

              <TouchableOpacity style={{ backgroundColor: "#1566a8", borderRadius: 24, paddingVertical: 16 }} onPress={handleAdventureStart}>
                <Text style={{ color: "white", fontSize: 18, fontWeight: "600", textAlign: "center" }}>Start Adventure</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}