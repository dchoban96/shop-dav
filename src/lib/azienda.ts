/**
 * Dati aziendali mostrati nel sito pubblico.
 * I campi vuoti non vengono renderizzati: compilarli quando confermati dall'ufficio.
 */
export const azienda = {
  ragioneSociale: "D.A.V. snc",
  nomeEsteso: "Distribuzione Alimentare Valtellinese",
  nomeBreve: "DAV",
  descrizioneBreve:
    "Distribuzione alimentare per pasticceria, panificazione, pizzeria e ristorazione in provincia di Sondrio.",
  fondazione: "17 aprile 1997",
  sede: "Caiolo (SO)",
  email: "info@davsnc.it",
  /** Numero per gli ordini: da confermare con l'ufficio prima della pubblicazione. */
  telefonoOrdini: "",
  indirizzo: "",
  zona: "Provincia di Sondrio, più parte di Lecco, Como, Bergamo e Brescia",
  prodottiAStock: "circa 5.000",
} as const;

export const navigazionePubblica = [
  { href: "/chi-siamo", label: "Chi siamo" },
  { href: "/partner", label: "Partner" },
  { href: "/policy", label: "Policy" },
] as const;
