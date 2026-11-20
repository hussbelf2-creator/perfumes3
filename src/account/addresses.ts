import { supabase } from "@/lib/supabase";
import { ValidationError } from "@/admin/data/types";
import { cleanAddress, type KitAddress } from "@/kits/types";

// عناوين التسليم المحفوظة في حساب العميل: يختار منها عند تأكيد شحنة العينات.
// في Supabase الجدول client_addresses (RLS: صاحبها فقط)، وفي الوضع التجريبي تُحفظ في المتصفح لكل مستخدم.

export interface SavedAddress extends KitAddress {
  id: string;
  /** تسمية يختارها العميل: المكتب، المستودع، البيت */
  label: string;
  name: string;
  phone: string;
  isDefault: boolean;
  createdAt: string;
}
export type AddressInput = Omit<SavedAddress, "id" | "createdAt">;
export const MAX_ADDRESSES = 10;

export interface AddressesRepo {
  list(userId: string): Promise<SavedAddress[]>;
  save(userId: string, input: AddressInput, id: string | null): Promise<SavedAddress>;
  remove(userId: string, id: string): Promise<void>;
  setDefault(userId: string, id: string): Promise<void>;
}

export function cleanInput(i: AddressInput): AddressInput {
  const a = cleanAddress(i);
  if (!a.city) throw new ValidationError("kit_city_required");
  return { ...a, country: a.country || "SA", label: i.label.trim().slice(0, 40), name: i.name.trim().slice(0, 120), phone: i.phone.trim().slice(0, 30), isDefault: !!i.isDefault };
}
/** الافتراضي أولاً ثم الأحدث */
export const sortAddresses = (list: SavedAddress[]) => [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.localeCompare(a.createdAt));

// ─── الوضع التجريبي ───────────────────────────────────────────────
const KEY = "pp_addresses_v1";
type Store = Record<string, SavedAddress[]>;
function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}
const write = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

/** قواعد الجدول نفسها: عشرة عناوين، الأول افتراضي، وافتراضي واحد فقط */
export function upsert(list: SavedAddress[], input: AddressInput, id: string | null, at = new Date().toISOString(), newId = uid()): SavedAddress[] {
  const clean = cleanInput(input);
  if (!id && list.length >= MAX_ADDRESSES) throw new ValidationError("too_many_addresses");
  const row: SavedAddress = id ? { ...list.find((x) => x.id === id)!, ...clean } : { ...clean, id: newId, createdAt: at, isDefault: clean.isDefault || list.length === 0 };
  if (id && !list.some((x) => x.id === id)) throw new ValidationError("not_found");
  const next = id ? list.map((x) => (x.id === id ? row : x)) : [...list, row];
  return row.isDefault ? next.map((x) => (x.id === row.id ? x : { ...x, isDefault: false })) : next;
}

const localRepo: AddressesRepo = {
  async list(userId) {
    return sortAddresses(read()[userId] ?? []);
  },
  async save(userId, input, id) {
    const s = read();
    const next = upsert(s[userId] ?? [], input, id);
    s[userId] = next;
    write(s);
    return id ? next.find((x) => x.id === id)! : next[next.length - 1];
  },
  async remove(userId, id) {
    const s = read();
    const left = (s[userId] ?? []).filter((x) => x.id !== id);
    if (left.length && !left.some((x) => x.isDefault)) left[0] = { ...left[0], isDefault: true };
    s[userId] = left;
    write(s);
  },
  async setDefault(userId, id) {
    const s = read();
    s[userId] = (s[userId] ?? []).map((x) => ({ ...x, isDefault: x.id === id }));
    write(s);
  },
};

// ─── Supabase ─────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const fromRow = (r: Row): SavedAddress => ({ id: str(r.id), label: str(r.label), name: str(r.name), phone: str(r.phone), country: str(r.country), city: str(r.city), district: str(r.district), street: str(r.street), building: str(r.building), postal: str(r.postal), shortAddress: str(r.short_address), address: str(r.address), lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng), isDefault: !!r.is_default, createdAt: str(r.created_at) });
const toRow = (i: AddressInput) => ({ label: i.label, name: i.name, phone: i.phone, country: i.country, city: i.city, district: i.district, street: i.street, building: i.building, postal: i.postal, short_address: i.shortAddress, address: i.address, lat: i.lat ?? null, lng: i.lng ?? null, is_default: i.isDefault });

function remoteRepo(): AddressesRepo {
  const db = supabase!;
  return {
    async list(userId) {
      const { data, error } = await db.from("client_addresses").select("*").eq("user_id", userId);
      if (error) throw error;
      return sortAddresses((data as Row[]).map(fromRow));
    },
    async save(_userId, input, id) {
      const row = toRow(cleanInput(input));
      const q = id ? db.from("client_addresses").update(row).eq("id", id) : db.from("client_addresses").insert(row);
      const { data, error } = await q.select().single();
      if (error) throw /too_many_addresses/.test(error.message) ? new ValidationError("too_many_addresses") : error;
      return fromRow(data as Row);
    },
    async remove(_userId, id) {
      const { error } = await db.from("client_addresses").delete().eq("id", id);
      if (error) throw error;
    },
    async setDefault(_userId, id) {
      const { error } = await db.from("client_addresses").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
  };
}

export const addressesRepo: AddressesRepo = supabase ? remoteRepo() : localRepo;
