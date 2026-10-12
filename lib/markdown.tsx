// Markdown mínimo para mostrar las guías de docs/ dentro del panel (títulos, listas, tablas, citas, negrita,
// código). Es para textos nuestros, no para lo que escribe un usuario: no admite HTML.
import { Fragment, type ReactNode } from "react";

// **negrita**, *cursiva*, `código`
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean).map((t, i) => {
    if (t.startsWith("**")) return <b key={i}>{t.slice(2, -2)}</b>;
    if (t.startsWith("`")) return <code key={i} className="rounded bg-gray-100 px-1 text-[0.9em]">{t.slice(1, -1)}</code>;
    if (t.startsWith("*") && t.length > 2) return <i key={i}>{t.slice(1, -1)}</i>;
    return <Fragment key={i}>{t}</Fragment>;
  });
}

type Item = { texto: string; hijos: string[] };

// Una lista (numerada o con viñetas); los renglones con sangría son de su ítem
function Lista({ renglones }: { renglones: string[] }) {
  const numerada = /^\d+\./.test(renglones[0].trim());
  const items: Item[] = [];
  for (const r of renglones) {
    const it = items[items.length - 1];
    const marca = /^(-\s|\d+\.\s|>|\|)/.test(r.trim());
    if (/^\s/.test(r) && it && !marca) {
      // Continuación de un renglón largo: se pega al último texto (del ítem o de su sublista)
      if (it.hijos.length) it.hijos[it.hijos.length - 1] += " " + r.trim();
      else it.texto += " " + r.trim();
    } else if (/^\s/.test(r) && it) it.hijos.push(r.replace(/^ {2,3}/, ""));
    else items.push({ texto: r.replace(/^(\d+\.|-)\s+/, ""), hijos: [] });
  }
  const Etiqueta = numerada ? "ol" : "ul";
  return (
    <Etiqueta className={`${numerada ? "list-decimal" : "list-disc"} space-y-1.5 pl-5`}>
      {items.map((it, i) => (
        <li key={i}>{enLinea(it.texto)}{it.hijos.length > 0 && <div className="mt-1.5">{bloques(it.hijos)}</div>}</li>
      ))}
    </Etiqueta>
  );
}

function bloques(lineas: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith("# ")) { out.push(<h1 key={i} className="text-2xl font-bold">{enLinea(l.slice(2))}</h1>); i++; continue; }
    if (l.startsWith("## ")) { out.push(<h2 key={i} className="pt-3 text-lg font-bold">{enLinea(l.slice(3))}</h2>); i++; continue; }
    if (l.trim() === "---") { out.push(<hr key={i} className="border-borde" />); i++; continue; }
    if (l.trimStart().startsWith(">")) {
      const cita: string[] = [];
      while (i < lineas.length && lineas[i].trimStart().startsWith(">")) cita.push(lineas[i++].trimStart().replace(/^>\s?/, ""));
      out.push(<blockquote key={i} className="rounded-lg bg-marca-suave px-3 py-2">{enLinea(cita.join(" "))}</blockquote>);
      continue;
    }
    if (l.startsWith("|")) {
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].startsWith("|")) {
        if (!/^\|[\s|:-]+\|$/.test(lineas[i])) filas.push(lineas[i].slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      const [cab, ...resto] = filas;
      out.push(
        <div key={i} className="-mx-4 overflow-x-auto px-4"><table className="tabla">
          <thead><tr>{cab.map((c, j) => <th key={j}>{enLinea(c)}</th>)}</tr></thead>
          <tbody>{resto.map((f, k) => <tr key={k}>{f.map((c, j) => <td key={j}>{enLinea(c)}</td>)}</tr>)}</tbody>
        </table></div>);
      continue;
    }
    if (/^(\d+\.|-)\s/.test(l)) {
      const lista: string[] = [];
      while (i < lineas.length && (/^(\d+\.|-)\s/.test(lineas[i]) || (/^\s+\S/.test(lineas[i]) && lista.length)
             || (!lineas[i].trim() && /^\s+\S/.test(lineas[i + 1] ?? "")))) {
        if (lineas[i].trim()) lista.push(lineas[i]);
        i++;
      }
      out.push(<Lista key={i} renglones={lista} />);
      continue;
    }
    // Párrafo: renglones seguidos hasta uno vacío
    const p: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#|\||>|-\s|\d+\.\s|---)/.test(lineas[i])) p.push(lineas[i++].trim());
    if (p.length) out.push(<p key={i}>{enLinea(p.join(" "))}</p>);
    else i++;
  }
  return out;
}

export function Markdown({ texto }: { texto: string }) {
  return <div className="space-y-3 text-sm leading-relaxed">{bloques(texto.split("\n"))}</div>;
}
