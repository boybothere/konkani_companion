import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { FileSearch, MessageSquare } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

/** Everything in (app) requires a signed-in user, like the website's sign-in gate. */
export default function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{ title: "Chat", tabBarIcon: ({ color, size }) => <MessageSquare size={size - 2} color={color} /> }}
      />
      <Tabs.Screen
        name="documents"
        options={{ title: "Document Lens", tabBarIcon: ({ color, size }) => <FileSearch size={size - 2} color={color} /> }}
      />
    </Tabs>
  );
}
