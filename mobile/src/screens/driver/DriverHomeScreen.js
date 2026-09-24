import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";
import { useAuth } from "../../api/AuthContext";

export default function DriverHomeScreen() {
  const { user, logout } = useAuth();
  const [driver, setDriver] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: d }, { data: s }] = await Promise.all([
        client.get(`/drivers/${user.driverId}`),
        client.get(`/attendance/work/${user.driverId}`),
      ]);
      setDriver(d);
      setSessions(s);
    } catch (err) {
      // handled inline below via empty state
    }
  }, [user.driverId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activeSession = sessions.find((s) => !s.endTime);
  const isApproved = driver?.approvalStatus === "APPROVED";
  const isPending = driver?.approvalStatus === "PENDING";
  const isRejected = driver?.approvalStatus === "REJECTED";

  async function startWork() {
    try {
      await client.post("/attendance/work/start");
      load();
    } catch (err) {
      Alert.alert("Error", err.error || "Could not start work");
    }
  }

  async function endWork() {
    try {
      await client.post("/attendance/work/end");
      load();
    } catch (err) {
      Alert.alert("Error", err.error || "Could not end work");
    }
  }

  async function requestSalary() {
    try {
      await client.post("/salaries/request");
      Alert.alert("Requested", "Your admin has been notified. You'll get a notification once it's processed.");
    } catch (err) {
      Alert.alert(err.error?.includes("already exists") ? "Already requested" : "Could not request", err.error || "Try again later");
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.headerRow}>
        <Text style={styles.welcome}>Welcome, {driver?.fullName || user.name}</Text>
        <TouchableOpacity onPress={logout}><Text style={styles.logout}>Logout</Text></TouchableOpacity>
      </View>

      {isPending && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingTitle}>Approval Pending</Text>
          <Text style={styles.pendingText}>
            Upload your Aadhar, PAN, and Licence in the Profile tab. An admin will review them before your account is
            activated — you'll be able to work and get paid once approved.
          </Text>
        </View>
      )}
      {isRejected && (
        <View style={[styles.pendingBanner, { backgroundColor: "#FBEAE7" }]}>
          <Text style={[styles.pendingTitle, { color: "#C0392B" }]}>Application Not Approved</Text>
          <Text style={styles.pendingText}>{driver?.rejectionReason || "Contact your association admin for details."}</Text>
        </View>
      )}

      {isApproved && (
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Work Status</Text>
          <Text style={[styles.statusValue, { color: activeSession ? "#1E8449" : "#888" }]}>
            {activeSession ? "WORKING" : "OFF DUTY"}
          </Text>
          <TouchableOpacity
            style={[styles.workBtn, { backgroundColor: activeSession ? "#C0392B" : "#1E8449" }]}
            onPress={activeSession ? endWork : startWork}
          >
            <Text style={styles.workBtnText}>{activeSession ? "END WORK" : "START WORK"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {driver?.vehicleAssignments?.[0] && (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Assigned Vehicle</Text>
          <Text style={styles.infoValue}>{driver.vehicleAssignments[0].vehicle.registrationNumber}</Text>
        </View>
      )}

      {isApproved && (
        <TouchableOpacity style={styles.requestBtn} onPress={requestSalary}>
          <Text style={styles.requestBtnText}>REQUEST THIS MONTH'S SALARY</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 48, backgroundColor: "#F4F6F8" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  welcome: { fontSize: 18, fontWeight: "700", color: "#0F3D5C" },
  logout: { color: "#C0392B", fontWeight: "600" },
  pendingBanner: { backgroundColor: "#FDF2E3", borderRadius: 14, padding: 16, marginBottom: 16 },
  pendingTitle: { fontWeight: "700", color: "#B9770E", marginBottom: 6 },
  pendingText: { color: "#666", fontSize: 13, lineHeight: 18 },
  statusCard: { backgroundColor: "#fff", borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 16 },
  statusLabel: { color: "#666", fontSize: 13 },
  statusValue: { fontSize: 20, fontWeight: "700", marginVertical: 8 },
  workBtn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 30, marginTop: 8 },
  workBtnText: { color: "#fff", fontWeight: "700" },
  infoCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12 },
  infoLabel: { color: "#666", fontSize: 12 },
  infoValue: { fontSize: 16, fontWeight: "700", color: "#0F3D5C", marginTop: 4 },
  requestBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  requestBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
