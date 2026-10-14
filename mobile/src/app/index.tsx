import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";

/** Entry: signed-in users go to the app, everyone else to sign-in. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? "/chat" : "/sign-in"} />;
}
