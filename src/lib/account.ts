import type { DeepDiveResult } from "@/lib/deepdive";

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
};

export type SavedDive = {
  id: string;
  user_id: string;
  title: string;
  source_url: string;
  content_type: "youtube" | "webpage";
  summary: string;
  full_analysis_json: DeepDiveResult;
  created_at: string;
  updated_at?: string;
};
