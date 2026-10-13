"use client";
// «Datos para facturar» de un cliente: categoría frente al IVA, documento, razón social, domicilio fiscal y mail para las facturas. Lo usan la ficha del
// cliente y el alta rápida de la caja. Dice qué letra le sale y avisa si el CUIT está mal escrito; el control de verdad lo hace la base al guardar.
import { useState } from "react";
import { CircleAlert, CircleCheck, FileCheck2 } from "lucide-react";
import { CONDICIONES, conCuit, cuitValido, PROVINCIAS, TIPOS_DOCUMENTO, letraPara, type CondicionIva, type TipoDocumento } from "@/lib/fiscal";

export type Fiscal = {
  condicion_iva?: CondicionIva | null; tipo_documento?: TipoDocumento | null; documento?: string | null; razon_social?: string | null;
  domicilio_fiscal?: string | null; localidad_fiscal?: string | null; provincia?: string | null; email_facturas?: string | null;
};

// letraLocal: la que le sale a un consumidor final («B» si el local es inscripto, «C» si es monotributista); null si no factura con ARCA
export default function DatosFiscales({ f = {}, letraLocal = null, abierto = false, compacto = false }: { f?: Fiscal; letraLocal?: string | null; abierto?: boolean; compacto?: boolean }) {
  const [condicion, setCondicion] = useState<CondicionIva>(f.condicion_iva ?? "consumidor_final");
  const [tipo, setTipo] = useState<TipoDocumento>(f.tipo_documento ?? "DNI");
  const [documento, setDocumento] = useState(f.documento ?? "");
  const [ver, setVer] = useState(abierto || (f.condicion_iva ?? "consumidor_final") !== "consumidor_final");
  // Elegir una categoría que factura con CUIT pasa el tipo a CUIT
  const elegirCondicion = (c: CondicionIva) => { setCondicion(c); if (conCuit(c)) setTipo("CUIT"); setVer(true); };
  const esCuit = tipo === "CUIT" || tipo === "CUIL";
  const digitos = documento.replace(/\D/g, "");
  const cuitMal = esCuit && digitos.length > 0 && !cuitValido(digitos);
  const faltaCuit = conCuit(condicion) && (tipo !== "CUIT" || !cuitValido(digitos));
  const letra = letraLocal ? letraPara(letraLocal, { condicion_iva: condicion, tipo_documento: tipo, documento }) : null;
  const grilla = compacto ? "grid gap-2" : "grid gap-3 sm:grid-cols-2";

  return (
    <fieldset className="space-y-3 rounded-xl border border-borde p-3">
      <legend className="px-1 text-sm font-semibold">Datos para facturar</legend>
      <div className={grilla}>
        <div><label className="etiqueta" htmlFor="condicion_iva">Categoría frente al IVA</label>
          <select id="condicion_iva" name="condicion_iva" value={condicion} onChange={(e) => elegirCondicion(e.target.value as CondicionIva)} className="campo">
            {Object.entries(CONDICIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <div><label className="etiqueta" htmlFor="tipo_documento">Documento</label>
            <select id="tipo_documento" name="tipo_documento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} className="campo">
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t} disabled={conCuit(condicion) && t !== "CUIT"}>{t === "pasaporte" ? "Pasaporte" : t}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="documento">Número</label>
            <input id="documento" name="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode={tipo === "pasaporte" ? "text" : "numeric"}
              placeholder={esCuit ? "20-12345678-6" : "30123456"} aria-invalid={cuitMal || undefined} className={`campo ${cuitMal ? "border-error" : ""}`} /></div>
        </div>
      </div>
      {cuitMal && <p className="flex items-center gap-1.5 text-xs text-error"><CircleAlert size={14} /> Ese {tipo} no es válido: revisá los 11 números (el último es el verificador).</p>}
      {!cuitMal && faltaCuit && <p className="flex items-center gap-1.5 text-xs text-alerta"><CircleAlert size={14} /> Para un {CONDICIONES[condicion].toLowerCase()} hace falta su CUIT.</p>}
      {letra && <p className={`flex items-center gap-1.5 text-xs font-semibold ${letra === "A" ? "text-marca" : "text-texto-2"}`}>
        {letra === "A" ? <FileCheck2 size={14} /> : <CircleCheck size={14} />} Le sale Factura {letra}{letra === "A" ? " (con el IVA discriminado)" : ""}.</p>}
      {!ver ? (
        <button type="button" onClick={() => setVer(true)} className="text-sm font-semibold text-marca">+ Razón social, domicilio fiscal y mail para facturas</button>
      ) : (
        <div className={grilla}>
          <div className={compacto ? "" : "sm:col-span-2"}><label className="etiqueta" htmlFor="razon_social">Razón social {conCuit(condicion) ? "" : "(si es distinta del nombre)"}</label>
            <input id="razon_social" name="razon_social" defaultValue={f.razon_social ?? ""} maxLength={150} className="campo" /></div>
          <div className={compacto ? "" : "sm:col-span-2"}><label className="etiqueta" htmlFor="domicilio_fiscal">Domicilio fiscal</label>
            <input id="domicilio_fiscal" name="domicilio_fiscal" defaultValue={f.domicilio_fiscal ?? ""} maxLength={200} placeholder="Calle y número" className="campo" /></div>
          <div><label className="etiqueta" htmlFor="localidad_fiscal">Localidad</label>
            <input id="localidad_fiscal" name="localidad_fiscal" defaultValue={f.localidad_fiscal ?? ""} maxLength={100} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="provincia">Provincia</label>
            <select id="provincia" name="provincia" defaultValue={f.provincia ?? ""} className="campo"><option value="">—</option>{PROVINCIAS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className={compacto ? "" : "sm:col-span-2"}><label className="etiqueta" htmlFor="email_facturas">Mail para mandarle las facturas</label>
            <input id="email_facturas" name="email_facturas" type="email" defaultValue={f.email_facturas ?? ""} placeholder="Vacío = el mail del cliente" className="campo" /></div>
        </div>
      )}
    </fieldset>
  );
}
