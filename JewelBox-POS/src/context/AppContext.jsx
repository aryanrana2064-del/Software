import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { all, getSettings, put } from "@/lib/db";
import { seedIfEmpty } from "@/lib/seed";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const PERMS = {
  Owner: ["*"],
  Manager: ["products", "inventory", "billing", "purchases", "sales", "customers", "suppliers", "returns", "reports", "labels", "importexport", "activity", "settings", "price_permanent", "stock_adjust", "void_bill"],
  Cashier: ["billing", "customers", "sales", "products_view"],
  Staff: ["billing", "products_view"],
};

export const AppProvider = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("jbx_user")) || null; } catch { return null; }
  });
  const [settings, setSettings] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      setSettings(await getSettings());
      setReady(true);
    })();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const login = async (name, pin) => {
    const users = await all("users");
    const found = users.find((u) => u.name.toLowerCase() === String(name).toLowerCase().trim() && u.pin === String(pin).trim());
    if (!found) return false;
    const u = { id: found.id, name: found.name, role: found.role };
    sessionStorage.setItem("jbx_user", JSON.stringify(u));
    setUser(u);
    return true;
  };

  const logout = () => {
    sessionStorage.removeItem("jbx_user");
    setUser(null);
  };

  const can = (perm) => {
    if (!user) return false;
    const list = PERMS[user.role] || [];
    return list.includes("*") || list.includes(perm);
  };

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch, key: "settings" };
    await put("settings", next);
    setSettings(next);
  };

  return (
    <AppCtx.Provider value={{ ready, user, login, logout, can, settings, saveSettings, online, refresh, tick }}>
      {children}
    </AppCtx.Provider>
  );
};
