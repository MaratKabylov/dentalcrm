export const ADULT_UPPER_TEETH = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"] as const;
export const ADULT_LOWER_TEETH = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"] as const;
export const CHILD_UPPER_TEETH = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"] as const;
export const CHILD_LOWER_TEETH = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"] as const;

export const FDI_TOOTH_CODES = [
  ...ADULT_UPPER_TEETH,
  ...ADULT_LOWER_TEETH,
  ...CHILD_UPPER_TEETH,
  ...CHILD_LOWER_TEETH,
] as const;

export const TOOTH_CONDITION_CODES = [
  "healthy",
  "caries",
  "filling",
  "crown",
  "missing",
  "implant",
  "root",
  "fracture",
  "mobility",
  "extraction_planned",
  "endodontic",
  "temporary_filling",
  "veneer",
  "bridge_part",
  "other",
] as const;

export const TOOTH_CONDITIONS = [
  { value: "healthy", label: "Здоров" },
  { value: "caries", label: "Кариес" },
  { value: "filling", label: "Пломба" },
  { value: "crown", label: "Коронка" },
  { value: "missing", label: "Отсутствует" },
  { value: "implant", label: "Имплант" },
  { value: "root", label: "Корень" },
  { value: "fracture", label: "Перелом" },
  { value: "mobility", label: "Подвижность" },
  { value: "extraction_planned", label: "Планируется удаление" },
  { value: "endodontic", label: "Эндодонтия" },
  { value: "temporary_filling", label: "Временная пломба" },
  { value: "veneer", label: "Винир" },
  { value: "bridge_part", label: "Часть моста" },
  { value: "other", label: "Другое" },
] as const;

export const TOOTH_SURFACES = ["M", "D", "O", "V", "L", "I"] as const;

export const TOOTH_SURFACE_LABELS: Record<(typeof TOOTH_SURFACES)[number], string> = {
  M: "Медиальная",
  D: "Дистальная",
  O: "Окклюзионная",
  V: "Вестибулярная",
  L: "Лингвальная",
  I: "Режущий край",
};
