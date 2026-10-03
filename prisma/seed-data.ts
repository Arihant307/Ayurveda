/**
 * Default content inserted by the seed script. Everything here is editable in
 * the admin afterwards. Copy describes traditional uses and general wellbeing
 * support only — it makes no cure or outcome claims.
 */

export const DEFAULT_SESSIONS = [
  { startTime: "10:00", endTime: "13:30", slotMinutes: 30 },
  { startTime: "17:00", endTime: "20:00", slotMinutes: 30 },
];
/** Monday–Saturday; Sunday closed. */
export const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export const DOCTORS = [
  {
    slug: "dr-vijay-kumar",
    name: "Dr. Vijay Kumar",
    specialization: "Ayurvedic Physician · Panchakarma",
    bio: "Dr. Vijay Kumar consults at Kumar Ayurveda in Vaishali Nagar, Jaipur. His consultations begin with a careful conversation about your daily routine, diet, sleep and health history, followed by a traditional Ayurvedic assessment. Recommendations are explained clearly and planned around what is practical for your life, and may include dietary guidance, daily-routine suggestions and, where appropriate, Panchakarma or other classical therapies.",
    expertise: [
      "Ayurvedic consultation and prakriti assessment",
      "Panchakarma planning",
      "Diet and daily-routine (dinacharya) guidance",
      "Seasonal routines (ritucharya)",
    ],
    displayOrder: 1,
  },
  {
    slug: "dr-jolly-sharma",
    name: "Dr. Jolly Sharma",
    specialization: "Ayurvedic Physician",
    bio: "Dr. Jolly Sharma consults at Kumar Ayurveda in Vaishali Nagar, Jaipur. She takes time to understand each person as a whole — their routine, food habits, stress and sleep — before suggesting an Ayurvedic plan. Her approach is gentle and practical, combining traditional therapies with lifestyle guidance that patients can follow at home.",
    expertise: [
      "Ayurvedic consultation",
      "Women's wellbeing through Ayurvedic lifestyle guidance",
      "Stress and lifestyle management",
      "Therapy planning (Abhyanga, Shirodhara)",
    ],
    displayOrder: 2,
  },
];

export const TREATMENTS = [
  {
    slug: "panchakarma",
    name: "Panchakarma",
    shortDescription:
      "The classical five-fold Ayurvedic cleansing programme, planned individually and carried out under a physician's supervision.",
    description:
      "Panchakarma (literally \"five actions\") is the traditional cleansing and rejuvenation programme described in the classical Ayurvedic texts. It is never one-size-fits-all: after a detailed consultation, your physician decides which procedures are suitable for you, in what order and for how long.\n\nA programme usually has three phases — preparation (purvakarma) with internal and external oleation and gentle steam, the main procedures (pradhanakarma), and a careful recovery period (paschatkarma) with a graded diet and routine. Throughout, the focus is on supporting the body's natural balance and on a calm, restful experience.",
    benefits: [
      "Traditionally used to support the body's natural cleansing processes",
      "A structured pause for rest, routine and mindful eating",
      "Plan tailored to your constitution (prakriti) after consultation",
      "Supervised by an Ayurvedic physician throughout",
    ],
    duration: "Typically 7–21 days, decided after consultation",
    isFeatured: true,
    displayOrder: 1,
  },
  {
    slug: "ayurvedic-consultation",
    name: "Ayurvedic Consultation",
    shortDescription:
      "An unhurried, one-to-one assessment of your constitution, routine and concerns, with a clear, practical plan.",
    description:
      "Every journey at Kumar Ayurveda begins with a consultation. Your physician will ask about your health history, digestion, sleep, energy, diet and daily routine, and carry out a traditional assessment including pulse examination (nadi pariksha).\n\nYou will leave with a clear explanation of the Ayurvedic view of your situation and a personalised plan, which may include diet and lifestyle guidance, herbal formulations and, where suitable, therapies. Please bring any recent reports and a list of medicines you currently take.",
    benefits: [
      "Understand your constitution (prakriti) and current balance",
      "Personalised diet and daily-routine guidance",
      "Clear explanation of any recommended therapies",
      "Works alongside your existing medical care",
    ],
    duration: "30–45 minutes",
    isFeatured: true,
    displayOrder: 2,
  },
  {
    slug: "abhyanga",
    name: "Abhyanga",
    shortDescription:
      "A full-body massage with warm herbal oils chosen for your constitution, followed by gentle steam.",
    description:
      "Abhyanga is the traditional Ayurvedic oil massage. Warm, medicated oil — selected for your constitution and the season — is applied with long, rhythmic strokes by trained therapists. It is often followed by svedana, a gentle herbal steam.\n\nIn Ayurveda, regular abhyanga is described as part of a healthy daily routine. Many people find it deeply relaxing and grounding.",
    benefits: [
      "Traditionally used to nourish the skin and support relaxation",
      "May help ease everyday muscular tension",
      "Oils chosen to suit your constitution",
      "Often used as preparation for Panchakarma",
    ],
    duration: "45–60 minutes",
    isFeatured: true,
    displayOrder: 3,
  },
  {
    slug: "shirodhara",
    name: "Shirodhara",
    shortDescription:
      "A continuous, gentle stream of warm herbal oil poured over the forehead — a classical therapy for calm.",
    description:
      "In Shirodhara, a steady stream of warm medicated oil (or other prescribed liquids) flows gently across the forehead while you rest comfortably. The therapy is usually preceded by a light head and shoulder massage.\n\nClassical texts describe Shirodhara as calming for the mind and senses. It is commonly chosen by people looking for a restful pause from a busy life. Your physician will advise whether it suits you and how many sessions to consider.",
    benefits: [
      "Traditionally used to support a calm, settled mind",
      "Commonly chosen to support restful sleep",
      "A quiet, meditative experience",
      "Oil and duration selected by your physician",
    ],
    duration: "45–60 minutes",
    isFeatured: true,
    displayOrder: 4,
  },
  {
    slug: "detox-programme",
    name: "Ayurvedic Detox Programme",
    shortDescription:
      "A gentle, guided programme of diet, routine and supportive therapies to help reset healthy habits.",
    description:
      "Not everyone needs or is ready for full Panchakarma. Our detox programme is a gentler, shorter option built around a simple, easily digestible diet, a supportive daily routine and selected therapies such as abhyanga and steam.\n\nThe programme is planned after consultation and adapted to your schedule, so that it can fit around work and family life.",
    benefits: [
      "A structured reset of diet and daily routine",
      "Supportive therapies chosen for you",
      "Practical guidance you can continue at home",
      "Physician check-ins during the programme",
    ],
    duration: "3–7 days, decided after consultation",
    isFeatured: false,
    displayOrder: 5,
  },
  {
    slug: "stress-management",
    name: "Stress Management",
    shortDescription:
      "Ayurvedic lifestyle guidance and calming therapies to support balance in a demanding routine.",
    description:
      "Long hours, screens and irregular routines take their toll. Our stress-management plans combine an Ayurvedic consultation with practical changes to daily routine, food and sleep habits, and calming therapies such as Shirodhara, Abhyanga or Nasya where suitable.\n\nThe aim is simple, sustainable habits that support a calmer everyday life. This programme complements — and does not replace — care from a mental-health professional where that is needed.",
    benefits: [
      "Personalised routine and sleep-hygiene guidance",
      "Calming traditional therapies",
      "Breathing and relaxation practices you can do at home",
      "Regular follow-ups to adjust the plan",
    ],
    duration: "Plan over 2–6 weeks",
    isFeatured: true,
    displayOrder: 6,
  },
  {
    slug: "lifestyle-management",
    name: "Lifestyle Management",
    shortDescription:
      "Diet, daily and seasonal routines shaped around your constitution — the foundation of Ayurveda.",
    description:
      "Ayurveda places great importance on how we eat, sleep, work and move. In lifestyle-management consultations, your physician helps you build a daily routine (dinacharya) and seasonal routine (ritucharya) suited to your constitution and circumstances.\n\nGuidance is practical and step-by-step, with follow-ups to review what is working and adjust what isn't.",
    benefits: [
      "Food guidance suited to your constitution and digestion",
      "A realistic daily routine",
      "Seasonal adjustments through the year",
      "Ongoing support through follow-up visits",
    ],
    duration: "Consultation plus follow-ups",
    isFeatured: false,
    displayOrder: 7,
  },
  {
    slug: "nasya",
    name: "Nasya",
    shortDescription:
      "A classical therapy in which prescribed herbal oils are gently administered through the nose.",
    description:
      "Nasya is one of the five Panchakarma procedures and is also offered on its own. After a gentle face and head massage and mild steam, a few drops of prescribed medicated oil are administered through the nostrils.\n\nIn Ayurveda, the nose is described as the gateway to the head, and Nasya is traditionally used to support the head and neck region. Suitability and frequency are decided by your physician.",
    benefits: [
      "Traditionally used for the head and neck region",
      "Part of the classical Panchakarma therapies",
      "Short, comfortable sessions",
      "Prescribed after consultation",
    ],
    duration: "20–30 minutes",
    isFeatured: false,
    displayOrder: 8,
  },
  {
    slug: "kati-basti",
    name: "Kati Basti",
    shortDescription:
      "Warm medicated oil is held over the lower back within a ring of herbal dough.",
    description:
      "In Kati Basti, a small ring made from herbal dough is placed on the lower back and filled with warm medicated oil, which is kept at a comfortable temperature for the duration of the therapy. It is followed by a gentle massage.\n\nKati Basti is traditionally used to support comfort and ease of movement in the lower back. Your physician will advise whether it is suitable for you.",
    benefits: [
      "Traditionally used to support lower-back comfort",
      "Localised warmth and nourishment",
      "Followed by a gentle massage",
      "Combined with posture and routine guidance",
    ],
    duration: "30–45 minutes",
    isFeatured: false,
    displayOrder: 9,
  },
  {
    slug: "udvartana",
    name: "Udvartana",
    shortDescription:
      "An invigorating dry massage with herbal powders, applied in upward strokes.",
    description:
      "Udvartana is a traditional massage using fine herbal powders rather than oil, applied briskly in upward strokes. It is usually followed by a warm shower or steam.\n\nIn Ayurveda, Udvartana is described as invigorating and is often included in programmes that focus on lightness and activity, alongside dietary guidance.",
    benefits: [
      "Traditionally used to support the skin and circulation",
      "An energising, invigorating experience",
      "Often combined with diet and activity guidance",
      "Powders chosen for your constitution",
    ],
    duration: "45 minutes",
    isFeatured: false,
    displayOrder: 10,
  },
];
