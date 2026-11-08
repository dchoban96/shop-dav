/**
 * Dati aziendali mostrati nel sito pubblico (forniti dall'ufficio l'8/11/2026).
 * I campi vuoti non vengono renderizzati: compilarli quando confermati.
 */
export const azienda = {
  ragioneSociale: "D.A.V. snc di Francesco Fumarola & C.",
  /** Forma breve per i testi correnti e il copyright. */
  ragioneSocialeBreve: "D.A.V. snc",
  nomeEsteso: "Distribuzione Alimentare Valtellinese",
  nomeBreve: "DAV",
  descrizioneBreve:
    "Distribuzione alimentare per pasticceria, panificazione, pizzeria e ristorazione in provincia di Sondrio.",
  fondazione: "17 aprile 1997",
  indirizzo: "Via Valeriana 18/B",
  cap: "23010",
  sede: "Caiolo (SO)",
  partitaIva: "00718760143",
  /** Codice univoco per la fatturazione elettronica (SDI). */
  codiceUnivoco: "1N74KED",
  email: "info@davsnc.it",
  /** Numero per gli ordini (prefisso da verificare con l'ufficio: 0432 è Udine, Sondrio è 0342). */
  telefonoOrdini: "0432 510616",
  /** Numero WhatsApp per gli ordini: da decidere. */
  whatsapp: "" as string,
  instagram: "davsnc",
  zona: "Provincia di Sondrio, più parte di Lecco, Como, Bergamo e Brescia",
  prodottiAStock: "circa 5.000",
} as const;

export const navigazionePubblica = [
  { href: "/chi-siamo", label: "Chi siamo" },
  { href: "/partner", label: "Partner" },
  { href: "/policy", label: "Policy" },
] as const;
