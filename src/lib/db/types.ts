import type { AnswerSource, AnswerState, SourceRef } from '@/src/engine/types';

export type Relationship = 'self' | 'spouse' | 'family' | 'client' | 'other';
export type CasePurpose = 'pre_lodgment' | 'assessment_review' | 'amendment' | 'planning';
export type CaseStatus = 'draft' | 'in_review' | 'final';

export const PURPOSE_LABELS: Record<CasePurpose, string> = {
  pre_lodgment: 'Estimate before lodging',
  assessment_review: 'Check an assessment I received',
  amendment: 'Consider an amendment',
  planning: 'Plan for next year',
};

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: 'Me',
  spouse: 'My spouse or partner',
  family: 'Family member',
  client: 'Client',
  other: 'Other',
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  final: 'Final',
};

export interface ProfileRow {
  id: string;
  owner_id: string;
  display_name: string;
  relationship: Relationship;
  birth_year: number | null;
  occupations: string[];
  created_at: string;
  updated_at: string;
}

export interface CaseRow {
  id: string;
  profile_id: string;
  owner_id: string;
  financial_year: string;
  purpose: CasePurpose;
  status: CaseStatus;
  rule_set_version: string | null;
  created_at: string;
}

export interface RepeaterItemRow {
  id: string;
  case_id: string;
  owner_id: string;
  group_id: string;
  label: string | null;
  sort_order: number;
  created_at: string;
}


export interface AnswerRow {
  id: string;
  case_id: string;
  owner_id: string;
  question_id: string;
  repeater_item_id: string | null;
  value: unknown;
  state: AnswerState;
  source: AnswerSource;
  version: number;
  created_at: string;
  source_ref?: SourceRef | null;
}

export interface EstimateRow {
  id: string;
  case_id: string;
  owner_id: string;
  rule_set_version: string;
  result: unknown;
  confidence: 'high' | 'medium' | 'low';
  completeness_pct: number;
  created_at: string;
}

export interface FlagRow {
  id: string;
  case_id: string;
  owner_id: string;
  estimate_id: string | null;
  kind: 'review' | 'opportunity' | 'consistency' | 'missing';
  severity: 'info' | 'warning' | 'blocker';
  code: string;
  message: string;
  question_ids: string[];
}

export interface ReportRow {
  id: string;
  case_id: string;
  owner_id: string;
  snapshot: unknown;
  pdf_path: string | null;
  is_final: boolean;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  case_id: string;
  owner_id: string;
  storage_path: string;
  doc_type: string;
  original_name: string | null;
  created_at: string;
}
