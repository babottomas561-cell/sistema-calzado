// Pagar con Mercado Pago un pedido que quedó sin pagar (la base arma el cobro con el total del pedido)
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";

async function pagar(f: FormData) {
  "use server";
  const id = Number(f.get("pedido_id"));
  const supabase = await crearCliente();
  const { data: link, error } = await supabase.rpc("mp_pagar_pedido", { p_pedido: id });
  if (error || !link) redirect(`/mi-cuenta/pedidos/${id}?pago=error`);
  redirect(link);
}

export default function PagarPedido({ pedido }: { pedido: number }) {
  return (
    <form action={pagar}>
      <input type="hidden" name="pedido_id" value={pedido} />
      <button className="boton w-full"><CreditCard size={18} /> Pagar con Mercado Pago</button>
    </form>
  );
}
