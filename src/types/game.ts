export type ChapterId = "inbox" | "trail" | "insider" | "containment";

export type Chapter = {
  id: ChapterId;
  number: string;
  title: string;
  focus: string;
};
