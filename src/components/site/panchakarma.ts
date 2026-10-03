/** The five classical Panchakarma therapies (descriptions are traditional, not outcome claims). */
export const PANCHAKARMA_THERAPIES = [
  {
    name: "Vamana",
    hindi: "वमन",
    short: "Therapeutic emesis, traditionally associated with Kapha.",
    detail:
      "A carefully prepared and closely supervised procedure that classical texts associate with Kapha dosha. It is recommended only for suitable individuals, after thorough preparation.",
  },
  {
    name: "Virechana",
    hindi: "विरेचन",
    short: "Therapeutic purgation, traditionally associated with Pitta.",
    detail:
      "Herbal preparations are used to support gentle elimination. Classical texts associate Virechana with Pitta dosha. It follows a period of oleation and is planned day by day.",
  },
  {
    name: "Basti",
    hindi: "बस्ति",
    short: "Medicated enema therapy, traditionally associated with Vata.",
    detail:
      "Herbal decoctions or medicated oils are administered as a course of enemas. Basti is described in the classical texts as especially important for Vata dosha.",
  },
  {
    name: "Nasya",
    hindi: "नस्य",
    short: "Nasal administration of herbal oils for the head and neck region.",
    detail:
      "After a gentle facial massage and steam, prescribed oils are administered through the nostrils. In Ayurveda, the nose is described as the gateway to the head.",
  },
  {
    name: "Raktamokshana",
    hindi: "रक्तमोक्षण",
    short: "Classical blood-letting therapy, used selectively.",
    detail:
      "Described in the classical texts and used only in specific, carefully assessed situations. Your physician will explain whether it has any place in your plan.",
  },
] as const;
