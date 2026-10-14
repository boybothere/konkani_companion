// Firebase Auth persistence backed by the OS keychain/keystore (expo-secure-store),
// so the refresh token isn't stored in plain AsyncStorage.
//
// SecureStore keys may only contain letters, digits, ".", "-" and "_", and large
// values are unreliable, so keys are sanitised and values are split into chunks.
import * as SecureStore from "expo-secure-store";

const CHUNK = 1800;
const safeKey = (key: string) => `kc_${key.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const count = await SecureStore.getItemAsync(`${base}__n`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${base}__${i}`);
      if (part === null) return null; // incomplete write: treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    const previous = Number((await SecureStore.getItemAsync(`${base}__n`)) ?? 0);
    for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${base}__${i}`, chunks[i]);
    await SecureStore.setItemAsync(`${base}__n`, String(chunks.length));
    for (let i = chunks.length; i < previous; i++) await SecureStore.deleteItemAsync(`${base}__${i}`);
  },

  async removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const count = Number((await SecureStore.getItemAsync(`${base}__n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${base}__${i}`);
    await SecureStore.deleteItemAsync(`${base}__n`);
  },
};
