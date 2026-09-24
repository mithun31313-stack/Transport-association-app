import React, { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, FlatList, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import client, { getToken } from "../../api/client";

const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl || "";

const STATUSES = [
  { key: "PRESENT", label: "Present", color: "#1E8449" },
  { key: "ABSENT", label: "Absent", color: "#C0392B" },
  { key: "HALF_DAY", label: "Half Day", color: "#D68910" },
  { key: "LEAVE", label: "Leave", color: "#2471A3" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceScreen() {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState("PRESENT");
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState([]);

  const load = useCallback(async () => {
    try {
      const [{ data: driverList }, { data: recentRecords }] = await Promise.all([
        client.get("/drivers", { params: { status: "ACTIVE" } }),
        client.get("/attendance"),
      ]);
      setDrivers(driverList);
      setRecords(recentRecords);
      if (!selectedDriverId && driverList.length > 0) setSelectedDriverId(driverList[0].id);
    } catch (err) {
      Alert.alert("Error", err.error || "Could not load attendance data");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markAttendance() {
    if (!selectedDriverId) {
      Alert.alert("Select a driver", "Choose which driver you're marking attendance for.");
      return;
    }
    setSaving(true);
    try {
      await client.post("/attendance", { driverId: selectedDriverId, date, status });
      Alert.alert("Saved", "Attendance recorded.");
      load();
    } catch (err) {
      Alert.alert("Error", err.error || "Could not save attendance");
    } finally {
      setSaving(false);
    }
  }

  async function downloadExcel() {
    const token = await getToken();
    Linking.openURL(`${API_BASE}/reports/export/attendance?token=${token}`).catch(() =>
      Alert.alert("Couldn't open", "Try opening this link in a browser instead.")
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Mark Attendance</Text>

      <Text style={styles.label}>Driver</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {drivers.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.chip, selectedDriverId === d.id && styles.chipActive]}
            onPress={() => setSelectedDriverId(d.id)}
          >
            <Text style={[styles.chipText, selectedDriverId === d.id && styles.chipTextActive]}>{d.fullName}</Text>
          </TouchableOpacity>
        ))}
        {drivers.length === 0 && <Text style={styles.empty}>No active drivers yet.</Text>}
      </ScrollView>

      <Text style={styles.label}>Date</Text>
      <View style={styles.dateRow}>
        <TextInput style={styles.dateInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <TouchableOpacity onPress={() => setDate(todayIso())}>
          <Text style={styles.todayLink}>Today</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Status</Text>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.statusBtn, status === s.key && { backgroundColor: s.color, borderColor: s.color }]}
            onPress={() => setStatus(s.key)}
          >
            <Text style={[styles.statusText, status === s.key && { color: "#fff" }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={markAttendance} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? "Saving…" : "SAVE ATTENDANCE"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.exportBtn} onPress={downloadExcel}>
        <Text style={styles.exportBtnText}>DOWNLOAD ATTENDANCE (EXCEL)</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Recent Records</Text>
      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const driver = drivers.find((d) => d.id === item.driverId);
          const statusMeta = STATUSES.find((s) => s.key === item.status);
          return (
            <View style={styles.recordRow}>
              <View>
                <Text style={styles.recordDriver}>{driver?.fullName || "Driver"}</Text>
                <Text style={styles.recordDate}>{new Date(item.date).toLocaleDateString("en-IN")}</Text>
              </View>
              <Text style={[styles.recordStatus, { color: statusMeta?.color || "#666" }]}>{item.status}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No attendance marked yet.</Text>}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F4F6F8" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0F3D5C", marginTop: 20, marginBottom: 10 },
  label: { fontSize: 12, color: "#666", marginTop: 6, marginBottom: 6, fontWeight: "600" },
  chipRow: { flexDirection: "row" },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#DDD", marginRight: 8, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#0F3D5C", borderColor: "#0F3D5C" },
  chipText: { fontSize: 13, color: "#666" },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  dateInput: { flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#DDD" },
  todayLink: { color: "#0F3D5C", fontWeight: "600", fontSize: 12 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "#DDD", backgroundColor: "#fff" },
  statusText: { fontSize: 13, fontWeight: "600", color: "#666" },
  saveBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  exportBtn: { borderWidth: 1, borderColor: "#0F3D5C", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 10 },
  exportBtnText: { color: "#0F3D5C", fontWeight: "700", fontSize: 12 },
  recordRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8 },
  recordDriver: { fontWeight: "600", fontSize: 13 },
  recordDate: { fontSize: 11, color: "#999", marginTop: 2 },
  recordStatus: { fontWeight: "700", fontSize: 12 },
  empty: { textAlign: "center", color: "#999", marginTop: 10, marginBottom: 10 },
});
