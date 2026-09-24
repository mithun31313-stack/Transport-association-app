import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Set the real backend URL in app.json -> expo.extra.apiBaseUrl (or override with an env-based config).
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || "http://localhost:4000/api";

const client = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    // Surface a consistent { error } shape to screens regardless of failure type
    if (!error.response) {
      return Promise.reject({ error: "No Internet Connection" });
    }
    return Promise.reject(error.response.data || { error: "Something went wrong" });
  }
);

export async function saveSession(token, user) {
  await AsyncStorage.setItem("auth_token", token);
  await AsyncStorage.setItem("auth_user", JSON.stringify(user));
}

export async function loadSession() {
  const token = await AsyncStorage.getItem("auth_token");
  const userRaw = await AsyncStorage.getItem("auth_user");
  return { token, user: userRaw ? JSON.parse(userRaw) : null };
}

export async function getToken() {
  return AsyncStorage.getItem("auth_token");
}

export async function clearSession() {
  await AsyncStorage.multiRemove(["auth_token", "auth_user"]);
}

export default client;
