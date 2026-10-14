import { StyleSheet, View } from "react-native";
import { CircleAlert } from "lucide-react-native";
import { colors, radius } from "@/lib/theme";
import { AppText } from "./AppText";

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <CircleAlert size={16} color={colors.destructive} style={{ marginTop: 2 }} />
      <AppText size={14} color={colors.destructive} style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(248,113,113,0.3)",
    backgroundColor: colors.destructiveSoft,
  },
});
