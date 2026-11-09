import type { Metadata } from "next";
import { PaginaDocumentoCliente } from "@/components/documenti/PaginaDocumentoCliente";

export const metadata: Metadata = { title: "Fattura" };

export default function PaginaFattura({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaDocumentoCliente params={params} scheda="fatture" />;
}
