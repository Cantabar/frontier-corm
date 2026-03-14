import { useEffect, useState } from "react";

export interface ItemEntry {
  typeId: number;
  name: string;
  icon: string;
}

let cache: ItemEntry[] | null = null;
let cachePromise: Promise<ItemEntry[]> | null = null;

function fetchItems(): Promise<ItemEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!cachePromise) {
    cachePromise = fetch("/items.json")
      .then((r) => r.json())
      .then((data: ItemEntry[]) => {
        cache = data;
        return data;
      });
  }
  return cachePromise;
}

export function useItems() {
  const [items, setItems] = useState<ItemEntry[]>(cache ?? []);

  useEffect(() => {
    if (cache) {
      setItems(cache);
      return;
    }
    fetchItems().then(setItems);
  }, []);

  function getItem(typeId: number): ItemEntry | undefined {
    return items.find((i) => i.typeId === typeId);
  }

  return { items, getItem };
}
