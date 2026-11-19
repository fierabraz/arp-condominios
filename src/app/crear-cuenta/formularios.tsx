"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { ORDEN_RELACIONES, RELACIONES } from "@/lib/cuentas-reglas";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

/** Después de registrarse: revisar el correo. Nunca muestra el enlace de verificación. */
function RevisaTuCorreo({ estado, ingreso, ayudaSinCorreo }: { estado: EstadoForm; ingreso: string; ayudaSinCorreo: string }) {
  const correo = estado.valores?.correo;
  const sinCorreo = estado.valores?.sinCorreo === "1";
  return (
    <div className="space-y-4" role="status">
      <div className="flex items-start gap-3 rounded-2xl bg-exito-suave p-4 text-exito">
        <MailCheck size={28} aria-hidden="true" className="shrink-0" />
        <div>
          <p className="font-bold">Tu cuenta quedó creada</p>
          <p className="text-sm">
            Falta un paso: confirmar tu correo <strong>{correo}</strong>.
          </p>
        </div>
      </div>
      {sinCorreo ? (
        <p className="rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">{ayudaSinCorreo}</p>
      ) : (
        <p className="text-sm text-texto-suave">
          Te enviamos un enlace a ese correo. Ábrelo para confirmar tu cuenta y después ingresa. Si no llega en unos minutos,
          revisa la carpeta de spam. Si ya tenías una cuenta con ese correo, te enviamos las instrucciones para entrar.
        </p>
      )}
      <Link href={ingreso} className="flex min-h-11 items-center justify-center rounded-xl bg-convive px-4 font-semibold text-white">
        Ir a ingresar
      </Link>
    </div>
  );
}

function CamposCuenta({ estado }: { estado: EstadoForm }) {
  const e = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <>
      <Campo etiqueta="Nombre y apellido" error={e.nombre}>
        <Input name="nombre" autoComplete="name" required defaultValue={v.nombre} />
      </Campo>
      <Campo etiqueta="Correo" error={e.correo}>
        <Input name="correo" type="email" autoComplete="email" required defaultValue={v.correo} />
      </Campo>
      <Campo etiqueta="Teléfono (opcional)" error={e.telefono}>
        <Input name="telefono" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" defaultValue={v.telefono} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Contraseña (mínimo 8)" error={e.clave}>
          <Input name="clave" type="password" autoComplete="new-password" required minLength={8} />
        </Campo>
        <Campo etiqueta="Repite la contraseña" error={e.repetir}>
          <Input name="repetir" type="password" autoComplete="new-password" required />
        </Campo>
      </div>
    </>
  );
}

export function RegistroAdministracionForm({ accion, codigo }: { accion: Accion; codigo?: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) {
    return (
      <RevisaTuCorreo
        estado={estado}
        ingreso="/login"
        ayudaSinCorreo="El envío de correos de Convive todavía no está activo. Avisa a quien te dio el código de acceso para que te envíe tu enlace de confirmación."
      />
    );
  }
  const e = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={enviar} className="space-y-4">
      <Campo etiqueta="Código de acceso" error={e.codigo}>
        <Input
          name="codigo"
          required
          autoCapitalize="characters"
          placeholder="CV-XXXX-XXXX-XXXX"
          defaultValue={v.codigo ?? codigo}
          className="min-h-11 w-full rounded-xl border border-borde bg-white px-3 py-2 font-mono text-base uppercase md:text-sm"
        />
      </Campo>
      <CamposCuenta estado={estado} />
      <Campo etiqueta="Nombre de tu administración (opcional)" error={e.administracion}>
        <Input name="administracion" placeholder="Ej. Administraciones del Sur" defaultValue={v.administracion} />
      </Campo>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Creando tu cuenta…" : "Crear mi cuenta de administración"}
      </Boton>
      <p className="text-xs text-texto-suave">
        Tu cuenta verá solo las comunidades que tú crees o que te asignen. No da acceso a comunidades de otras administraciones.
      </p>
    </form>
  );
}

export function RegistroResidenteForm({
  accion,
  consultar,
  comunidad,
  nombreComunidad,
}: {
  accion: Accion;
  consultar: (codigo: string) => Promise<string | null>;
  comunidad?: string;
  nombreComunidad?: string | null;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const v = estado.valores ?? {};
  const [codigo, setCodigo] = useState(v.comunidad ?? comunidad ?? "");
  const [nombre, setNombre] = useState<string | null>(nombreComunidad ?? null);
  const [buscando, empezar] = useTransition();
  if (estado.ok) {
    return (
      <RevisaTuCorreo
        estado={estado}
        ingreso="/login/residentes"
        ayudaSinCorreo="El envío de correos todavía no está activo. Pide a la administración de tu comunidad tu enlace de confirmación: lo ve junto a tu solicitud."
      />
    );
  }
  const e = estado.errores ?? {};
  const buscar = () =>
    empezar(async () => {
      setNombre(codigo.trim() ? await consultar(codigo) : null);
    });
  return (
    <form action={enviar} className="space-y-4">
      <CamposCuenta estado={estado} />
      <fieldset className="space-y-4 rounded-2xl border border-borde p-4">
        <legend className="px-1 text-sm font-bold text-convive-oscuro">Tu comunidad</legend>
        <p className="text-sm text-texto-suave">
          Pide el código a tu administración (suele estar en el aviso de cobro o en el diario mural). Si no lo tienes, déjalo en
          blanco: podrás agregarlo después desde tu cuenta.
        </p>
        <Campo etiqueta="Código de la comunidad" error={e.comunidad}>
          <div className="flex gap-2">
            <Input
              name="comunidad"
              value={codigo}
              onChange={(ev) => {
                setCodigo(ev.target.value);
                setNombre(null);
              }}
              onBlur={buscar}
              autoCapitalize="characters"
              placeholder="XXXX-XXXX"
            />
            <Boton type="button" variante="secundario" onClick={buscar} disabled={buscando}>
              {buscando ? "…" : "Buscar"}
            </Boton>
          </div>
        </Campo>
        {nombre && (
          <p className="rounded-xl bg-convive-suave px-3 py-2 text-sm font-semibold text-convive-oscuro">Comunidad: {nombre}</p>
        )}
        {codigo.trim() && (
          <>
            <Campo etiqueta="Tu unidad" error={e.unidad}>
              <Input name="unidad" placeholder="Ej. Depto 302, Casa 14" defaultValue={v.unidad} />
            </Campo>
            <Campo etiqueta="Tu relación con la unidad" error={e.relacion}>
              <Select name="relacion" defaultValue={v.relacion ?? ""}>
                <option value="" disabled>
                  Elige…
                </option>
                {ORDEN_RELACIONES.map((r) => (
                  <option key={r} value={r}>
                    {RELACIONES[r].texto}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Mensaje para la administración (opcional)" error={e.mensaje}>
              <Input name="mensaje" maxLength={500} placeholder="Ej. Soy la hija del propietario" defaultValue={v.mensaje} />
            </Campo>
            <p className="text-xs text-texto-suave">
              La administración revisará tu solicitud antes de darte acceso a la información de la unidad.
            </p>
          </>
        )}
      </fieldset>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Creando tu cuenta…" : "Crear mi cuenta"}
      </Boton>
    </form>
  );
}

export function ConfirmarCorreoForm({ accion }: { accion: () => Promise<EstadoForm> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-4">
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Confirmando…" : "Confirmar mi correo"}
      </Boton>
    </form>
  );
}
