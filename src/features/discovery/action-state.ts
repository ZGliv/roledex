export type SourceMutationActionState = {
  fieldErrors?: Partial<
    Record<
      "companyDomain" | "companyName" | "refreshIntervalHours" | "sourceUrl",
      string[]
    >
  >;
  message: string;
  ok: boolean;
};

export const EMPTY_SOURCE_MUTATION_STATE: SourceMutationActionState = {
  message: "",
  ok: false,
};
