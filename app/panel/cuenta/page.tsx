import { cambiarMiClaveAccion } from "@/app/panel/acciones-usuarios";
import { momento } from "@/componentes/formato";
import { BotonEnviar, Campo, EncabezadoDePagina, Formulario, Insignia, Tarjeta } from "@/componentes/primitivos";
import { DESCRIPCION_DE_ROL, NOMBRE_DE_ROL } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { CLAVE_MINIMA } from "@/servidor/usuarios";

export default async function MiCuenta() {
  const yo = await paginaConPermiso("ver");
  return (
    <>
      <EncabezadoDePagina titulo="Mi cuenta" descripcion={yo.email ?? undefined} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Mi rol">
          <p className="flex items-center gap-2">
            <Insignia tono="oscuro">{NOMBRE_DE_ROL[yo.rol]}</Insignia> {DESCRIPCION_DE_ROL[yo.rol]}
          </p>
          <p className="mt-3 text-sm text-neutral-700">
            Último ingreso: {yo.ultimoIngresoAt ? momento(yo.ultimoIngresoAt) : "este"}. Para cambiar de rol, hablá con un administrador.
          </p>
        </Tarjeta>
        <Tarjeta titulo="Cambiar mi clave" descripcion={`Mínimo ${CLAVE_MINIMA} caracteres. Cierra todas tus sesiones abiertas, también esta.`}>
          <Formulario accion={cambiarMiClaveAccion}>
            <Campo etiqueta="Clave actual" name="actual" type="password" required autoComplete="current-password" />
            <Campo etiqueta="Clave nueva" name="nueva" type="password" minLength={CLAVE_MINIMA} required autoComplete="new-password" />
            <Campo etiqueta="Repetí la clave nueva" name="repetida" type="password" minLength={CLAVE_MINIMA} required autoComplete="new-password" />
            <BotonEnviar>Cambiar clave</BotonEnviar>
          </Formulario>
        </Tarjeta>
      </div>
    </>
  );
}
