import type { Metadata } from "next";
import { PaginaDocumentoCliente } from "@/components/documenti/PaginaDocumentoCliente";

export const metadata: Metadata = { title: "DDT" };

export default function PaginaDdt({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaDocumentoCliente params={params} scheda="ddt" />;
}
