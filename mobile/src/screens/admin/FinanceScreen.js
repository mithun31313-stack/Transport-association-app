import React, { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, FlatList, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import client, { getToken } from "../../api/client";

const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl || "";

const INCOME_CATEGORIES = ["MEMBERSHIP_FEE", "VEHICLE_FEE", "REGISTRATION_FEE", "RENEWAL_FEE", "ASSOCIATION_COLLECTION", "OTHER"];
const EXPENSE_CATEGORIES = ["VEHICLE_MAINTENANCE", "OFFICE", "ELECTRICITY", "RENT", "MEETING_EVENT", "INSURANCE", "TRAVEL", "OTHER"];
const PAYMENT_METHODS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinanceScreen() {
  const [tab, setTab] = useState("income"); // "income" | "expense"
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: bal }, { data: list }] = await Promise.all([
        client.get("/balance"),
        client.get(tab === "income" ? "/income" : "/expenses"),
      ]);
      setBalance(bal);
      setHistory(list);
    } catch (err) {
      // empty state below
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function switchTab(next) {
    setTab(next);
    setCategory(next === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  }

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("Enter an amount", "Amount must be greater than zero.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { category, amount: amt, date, paymentMethod, description: description || undefined };
      await client.post(tab === "income" ? "/income" : "/expenses", payload);
      setAmount("");
      setDescription("");
      Alert.alert("Saved", `${tab === "income" ? "Income" : "Expense"} entry recorded.`);
      load();
    } catch (err) {
      Alert.alert("Error", err.error || "Could not save entry");
    } finally {
      setSubmitting(false);
    }
  }

  const categories = tab === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function confirmDelete(item) {
    Alert.alert("Delete entry?", `${item.category.replace(/_/g, " ")} — ₹${item.amount}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(tab === "income" ? `/income/${item.id}` : `/expenses/${item.id}`);
            load();
          } catch (err) {
            Alert.alert("Couldn't delete", err.error || "Try again");
          }
        },
      },
    ]);
  }

  async function downloadExcel() {
    const token = await getToken();
    const url = `${API_BASE}/reports/export/${tab === "income" ? "income" : "expenses"}?token=${token}`;
    Linking.openURL(url).catch(() => Alert.alert("Couldn't open", "Try again, or open this link in a browser."));
  }

  return (
    <View style={styles.container}>
      {balance && (
        <View style={styles.balanceRow}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Income</Text>
            <Text style={[styles.balanceValue, { color: "#1E8449" }]}>₹{balance.totalIncome}</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Expenses</Text>
            <Text style={[styles.balanceValue, { color: "#C0392B" }]}>₹{balance.totalExpense}</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <Text style={styles.balanceValue}>₹{balance.currentBalance}</Text>
          </View>
        </View>
      )}

      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.toggleBtn, tab === "income" && styles.toggleBtnActiveIncome]} onPress={() => switchTab("income")}>
          <Text style={[styles.toggleText, tab === "income" && { color: "#1E8449" }]}>Income</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, tab === "expense" && styles.toggleBtnActiveExpense]} onPress={() => switchTab("expense")}>
          <Text style={[styles.toggleText, tab === "expense" && { color: "#C0392B" }]}>Expense</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {categories.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c.replace(/_/g, " ")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Amount (₹)</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" />

        <Text style={styles.label}>Date</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

        <Text style={styles.label}>Payment Method</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity key={m} style={[styles.chip, paymentMethod === m && styles.chipActive]} onPress={() => setPaymentMethod(m)}>
              <Text style={[styles.chipText, paymentMethod === m && styles.chipTextActive]}>{m.replace(/_/g, " ")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Note" />

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
          <Text style={styles.submitBtnText}>{submitting ? "Saving…" : `SAVE ${tab === "income" ? "INCOME" : "EXPENSE"}`}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.exportBtn} onPress={downloadExcel}>
          <Text style={styles.exportBtnText}>DOWNLOAD AS EXCEL</Text>
        </TouchableOpacity>

        <Text style={styles.historyTitle}>Recent {tab === "income" ? "Income" : "Expenses"}</Text>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyCat}>{item.category.replace(/_/g, " ")}</Text>
                <Text style={styles.historyDate}>{new Date(item.date).toLocaleDateString("en-IN")}</Text>
              </View>
              <Text style={[styles.historyAmt, { color: tab === "income" ? "#1E8449" : "#C0392B" }]}>₹{item.amount}</Text>
              <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No entries yet.</Text>}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },
  balanceRow: { flexDirection: "row", gap: 8, padding: 12, paddingBottom: 0 },
  balanceCard: { flex: 1, backgroundColor: "#fff", borderRadius: 10, padding: 10, alignItems: "center" },
  balanceLabel: { fontSize: 11, color: "#666" },
  balanceValue: { fontSize: 14, fontWeight: "700", marginTop: 2, color: "#0F3D5C" },
  toggleRow: { flexDirection: "row", gap: 8, padding: 12 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#DDD", alignItems: "center" },
  toggleBtnActiveIncome: { backgroundColor: "#E4F1EC", borderColor: "#1E8449" },
  toggleBtnActiveExpense: { backgroundColor: "#FBEAE7", borderColor: "#C0392B" },
  toggleText: { fontWeight: "700", color: "#666" },
  form: { paddingHorizontal: 12, paddingBottom: 40 },
  label: { fontSize: 12, color: "#666", marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: "#fff", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#DDD" },
  chipRow: { flexDirection: "row" },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#DDD", marginRight: 8, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#0F3D5C", borderColor: "#0F3D5C" },
  chipText: { fontSize: 12, color: "#666" },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  submitBtn: { backgroundColor: "#0F3D5C", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 20 },
  submitBtnText: { color: "#fff", fontWeight: "700" },
  exportBtn: { borderWidth: 1, borderColor: "#0F3D5C", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 24 },
  exportBtnText: { color: "#0F3D5C", fontWeight: "700", fontSize: 12 },
  historyTitle: { fontSize: 14, fontWeight: "700", marginTop: 24, marginBottom: 8 },
  historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8 },
  historyCat: { fontWeight: "600", fontSize: 13 },
  historyDate: { fontSize: 11, color: "#999", marginTop: 2 },
  historyAmt: { fontWeight: "700", marginRight: 10 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: "#999", fontSize: 16 },
  empty: { textAlign: "center", color: "#999", marginTop: 20 },
});
