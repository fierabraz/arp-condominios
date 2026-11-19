"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

/** Cambiar de comunidad sin salir de Transferencias informadas. */
export function ElegirComunidadTransferencias({ actual, comunidades }: { actual: string; comunidades: { id: string; nombre: string }[] }) {
  const router = useRouter();
  if (comunidades.length < 2) return null;
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">Comunidad</span>
      <Select value={actual} onChange={(e) => router.push(`/condominios/${e.target.value}/transferencias`)}>
        {comunidades.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
    </label>
  );
}
