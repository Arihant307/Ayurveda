export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Role = "admin" | "analyst" | "viewer";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface Alert {
  id: number;
  created_at: string;
  last_seen_at: string | null;
  occurrences: number;
  module: string;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: number;
  status: string;
  source: string;
  is_simulated: boolean;
  detector: string;
  detector_version: string;
  mitre_technique: string;
  host: string;
  src_ip: string;
  dst_ip: string;
  user_name: string;
  evidence: Record<string, unknown>;
  incident_id: number | null;
  analysis_id: number | null;
  resolution_note: string;
  resolved_at: string | null;
  entities: { kind: string; value: string }[];
}

export interface AlertPage {
  total: number;
  items: Alert[];
}

export interface Incident {
  id: number;
  created_at: string;
  updated_at: string | null;
  title: string;
  severity: Severity;
  status: string;
  correlation_reason: string;
  shared_entities: { kind: string; value: string }[];
  modules: string[];
  notes: string;
  alert_ids: number[];
}

export interface Indicator {
  code: string;
  severity: string;
  description: string;
  evidence: string;
}

export interface AnalysisBase {
  analysis_id: number;
  model_name: string;
  model_version: string;
  predicted_label: string;
  risk_score: number;
  threshold: number;
  is_threat: boolean;
  severity: Severity | null;
  alert_id: number | null;
  latency_ms: number;
  created_at: string;
}

export interface EmailResult extends AnalysisBase {
  indicators: Indicator[];
  top_terms: { term: string; weight: number }[];
  url_domains: string[];
  url_count: number;
  attachments: string[];
  raw_content_stored: boolean;
}

export interface UrlResult extends AnalysisBase {
  host: string;
  registered_domain: string;
  reasons: Indicator[];
  features: Record<string, number>;
  ngram_contributions: { ngram: string; contribution: number }[];
  threat_intel: {
    checked: boolean;
    feed_status: string;
    feed_last_success_at: string | null;
    matches: { type: string; threat: string; tags: string; reference: string }[];
  };
  safety_notice: string;
}

export interface MulticlassReport {
  n: number;
  per_class: Record<string, { precision: number; recall: number; "f1-score": number; support: number }>;
  macro_f1: number;
  weighted_f1: number;
  confusion_matrix: { labels: string[]; matrix: number[][] };
  attack_vs_benign: {
    precision: number;
    recall: number;
    f1: number;
    false_positive_rate: number;
    roc_auc?: number;
    pr_auc?: number;
    confusion_matrix: number[][];
  };
  rows_with_known_labels?: number;
}

export interface BatchResult {
  model_name: string;
  model_version: string;
  feature_set: string;
  rows_received: number;
  rows_analyzed: number;
  rows_rejected: number;
  rejected_examples: string[];
  threshold: number;
  category_counts: Record<string, number>;
  alerts_created: number[];
  evaluation: MulticlassReport | null;
  sample_predictions: Record<string, number | string>[];
  duration_ms: number;
}

export interface ModelStatus {
  name: string;
  ready: boolean;
  version: string;
  error: string;
  selected_model: string | null;
  trained_at: string | null;
  datasets: string[];
  threshold: number | null;
  loaded_at: string | null;
  inferences: number;
  failures: number;
  last_inference_at: string | null;
  mean_latency_ms: number | null;
}

export interface Tailer {
  name: string;
  kind: string;
  path: string;
  status: string;
  events_total: number;
  duplicates_total: number;
  errors_total: number;
  last_event_at: string | null;
  seconds_since_last_event: number | null;
  stale: boolean;
  last_error: string;
}

export interface Freshness {
  tailers: Tailer[];
  configured: Record<string, boolean>;
  received_by_source: { source: string; events: number; last_received_at: string | null }[];
  feeds: { feed: string; status: string; indicators: number; last_success_at: string | null; last_error: string; next_attempt_at: string | null }[];
  live_subscribers: number;
  stale_after_seconds: number;
}

export interface Metrics {
  generated_at: string;
  window: string;
  totals: {
    events_analyzed: number;
    analyses: number;
    telemetry_events: number;
    alerts: number;
    alert_occurrences: number;
    alerts_in_window: number;
    open_by_severity: Partial<Record<Severity, number>>;
    open_incidents: number;
    simulated_alerts: number;
  };
  analyses_by_kind: Record<string, number>;
  threats_by_kind: Record<string, number>;
  alerts_by_module: Record<string, number>;
  alerts_by_category: Record<string, number>;
  alerts_by_source: Record<string, number>;
  trend: ({ bucket_start: string } & Record<Severity, number>)[];
  feedback: Record<string, Record<string, number>>;
  model_last_inference: Record<string, string | null>;
  freshness: Freshness;
}
