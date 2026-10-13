// Teléfonos argentinos como los escribe la gente → el número que pide wa.me. Sin dependencias: lo usan el servidor, el navegador y las pruebas.

// «0381 15 555-1234», «+54 9 381 5551234», «3815551234»… → «5493815551234» (549 + código de área + número, sin el 0 ni el 15).
// Si es de otro país (más de 10 cifras que no empiezan con 54 ni 0), se deja como está. Null si no alcanza para ser un teléfono.
export function paraWhatsApp(telefono: string | null | undefined): string | null {
  const todo = String(telefono ?? "").replace(/\D/g, "");
  if (todo.length < 8) return null;
  let n = todo.replace(/^00/, "");
  if (n.startsWith("54")) n = n.slice(2); else if (n.startsWith("0")) n = n.slice(1);
  else if (n.length >= 11) return todo;                                  // de otro país: tal cual
  if (n.startsWith("9") && n.length === 11) n = n.slice(1);                 // ya traía el 9 de celular
  if (n.length === 12) {                                                    // el «15» de celular que va después del código de área
    for (const area of [2, 3, 4]) if (n.slice(area, area + 2) === "15") { n = n.slice(0, area) + n.slice(area + 2); break; }
  }
  return n.length === 10 ? `549${n}` : null;
}
