/** A review-box line. `blocking` issues disable export; warnings do not. */
export interface Issue {
  id: string;
  level: "blocking" | "warning";
  message: string;
}
