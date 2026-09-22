export type FormActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialFormState: FormActionState = { status: "idle" };
