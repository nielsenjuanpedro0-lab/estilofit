export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-black">Estilofit</h1>
      <a href="/celular" className="flex min-h-16 items-center justify-center rounded-lg bg-black text-xl font-black text-white">
        Vender en un evento
      </a>
      <a href="/panel" className="flex min-h-16 items-center justify-center rounded-lg border-2 border-black text-xl font-black">
        Panel de stock
      </a>
    </main>
  );
}
