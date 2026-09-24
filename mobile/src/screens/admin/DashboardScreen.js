import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import client from "../../api/client";
import { useAuth } from "../../api/AuthContext";

function StatCard({ label, value }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get("/reports/dashboard");
      setData(data);
    } catch (err) {
      // Keep last known data on transient failure; "No Internet Connection" is handled by the client interceptor
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text>Loading dashboard…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Dashboard</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        <StatCard label="Total Members" value={data.totalMembers} />
        <StatCard label="Total Vehicles" value={data.totalVehicles} />
        <StatCard label="Total Drivers" value={data.totalDrivers} />
        <StatCard label="Active Drivers" value={data.activeDrivers} />
        <StatCard label="Running Vehicles" value={data.runningVehicles} />
        <StatCard label="In Maintenance" value={data.maintenanceVehicles} />
      </View>

      <Text style={styles.sectionTitle}>Finance</Text>
      <View style={styles.grid}>
        <StatCard label="Income" value={`₹${data.monthlyIncome}`} />
        <StatCard label="Expenses" value={`₹${data.monthlyExpenses}`} />
        <StatCard label="Balance" value={`₹${data.currentBalance}`} />
        <StatCard label="Pending Dues" value={`₹${data.pendingDues}`} />
      </View>

      <Text style={styles.sectionTitle}>Salary</Text>
      <View style={styles.grid}>
        <StatCard label="Pending" value={data.pendingSalaries} />
        <StatCard label="Approved" value={data.approvedSalaries} />
        <StatCard label="Paid" value={data.paidSalaries} />
        <StatCard label="Increments Due" value={data.upcomingIncrements} />
      </View>

      <Text style={styles.sectionTitle}>Alerts</Text>
      <View style={styles.grid}>
        <StatCard label="Expiring Documents" value={data.expiringDocuments} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 48, backgroundColor: "#F4F6F8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#0F3D5C" },
  logout: { color: "#C0392B", fontWeight: "600" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#333", marginTop: 16, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, width: "31%", elevation: 1 },
  cardValue: { fontSize: 18, fontWeight: "700", color: "#0F3D5C" },
  cardLabel: { fontSize: 11, color: "#666", marginTop: 4 },
});
