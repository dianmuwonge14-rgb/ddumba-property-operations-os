export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absence_records: {
        Row: {
          absence_date: string
          absence_type: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          office_id: string
          status: string
        }
        Insert: {
          absence_date: string
          absence_type: string
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          office_id: string
          status?: string
        }
        Update: {
          absence_date?: string
          absence_type?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          office_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_records_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_timeline: {
        Row: {
          actor: string | null
          company_id: string | null
          created_at: string | null
          event_description: string | null
          event_type: string | null
          id: string
          office_id: string | null
        }
        Insert: {
          actor?: string | null
          company_id?: string | null
          created_at?: string | null
          event_description?: string | null
          event_type?: string | null
          id?: string
          office_id?: string | null
        }
        Update: {
          actor?: string | null
          company_id?: string | null
          created_at?: string | null
          event_description?: string | null
          event_type?: string | null
          id?: string
          office_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_timeline_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_feedback: {
        Row: {
          ai_insight_id: string | null
          company_id: string
          created_at: string
          feedback: string
          id: string
          user_id: string | null
        }
        Insert: {
          ai_insight_id?: string | null
          company_id: string
          created_at?: string
          feedback: string
          id?: string
          user_id?: string | null
        }
        Update: {
          ai_insight_id?: string | null
          company_id?: string
          created_at?: string
          feedback?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_feedback_ai_insight_id_fkey"
            columns: ["ai_insight_id"]
            isOneToOne: false
            referencedRelation: "ai_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_entity_suggestions: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          status: string
          suggested_data: Json
          suggestion_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          status?: string
          suggested_data?: Json
          suggestion_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          status?: string
          suggested_data?: Json
          suggestion_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_entity_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_entity_suggestions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          company_id: string | null
          confidence: number | null
          created_at: string | null
          description: string | null
          id: string
          input_hash: string | null
          insight_type: string | null
          metadata: Json | null
          model_name: string | null
          office_id: string | null
          priority: string | null
          resolved_at: string | null
          severity: string | null
          status: string | null
          subject_id: string | null
          subject_type: string | null
          summary: string | null
          title: string | null
        }
        Insert: {
          company_id?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          input_hash?: string | null
          insight_type?: string | null
          metadata?: Json | null
          model_name?: string | null
          office_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          subject_id?: string | null
          subject_type?: string | null
          summary?: string | null
          title?: string | null
        }
        Update: {
          company_id?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          input_hash?: string | null
          insight_type?: string | null
          metadata?: Json | null
          model_name?: string | null
          office_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          subject_id?: string | null
          subject_type?: string | null
          summary?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_master_spreadsheets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          office_id: string | null
          source: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          office_id?: string | null
          source: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          office_id?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_master_spreadsheets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_master_spreadsheets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_master_spreadsheets_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_spreadsheet_rows: {
        Row: {
          company_id: string
          created_at: string
          entity_type: string
          id: string
          normalized_data: Json
          raw_data: Json
          row_number: number
          spreadsheet_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_type: string
          id?: string
          normalized_data?: Json
          raw_data?: Json
          row_number: number
          spreadsheet_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          normalized_data?: Json
          raw_data?: Json
          row_number?: number
          spreadsheet_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_spreadsheet_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_spreadsheet_rows_spreadsheet_id_fkey"
            columns: ["spreadsheet_id"]
            isOneToOne: false
            referencedRelation: "ai_master_spreadsheets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_validation_results: {
        Row: {
          company_id: string
          created_at: string
          findings: Json
          id: string
          row_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          findings?: Json
          id?: string
          row_id: string
          status: string
        }
        Update: {
          company_id?: string
          created_at?: string
          findings?: Json
          id?: string
          row_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_validation_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_validation_results_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "ai_spreadsheet_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_actions: {
        Row: {
          action: string
          actor_id: string | null
          approval_request_id: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          step_order: number | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          approval_request_id: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          step_order?: number | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          approval_request_id?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          step_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          office_id: string | null
          requested_by: string | null
          status: string
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          office_id?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          office_id?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          company_id: string
          created_at: string
          id: string
          required_permission: string | null
          role_id: string | null
          step_order: number
          workflow_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          required_permission?: string | null
          role_id?: string | null
          step_order: number
          workflow_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          required_permission?: string | null
          role_id?: string | null
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          entity_type: string
          id: string
          max_amount: number | null
          min_amount: number | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          entity_type: string
          id?: string
          max_amount?: number | null
          min_amount?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          max_amount?: number | null
          min_amount?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      arrears_snapshots: {
        Row: {
          arrears_amount: number
          company_id: string
          created_at: string
          days_overdue: number
          id: string
          lease_id: string | null
          office_id: string
          risk_band: string | null
          snapshot_date: string
          tenant_id: string | null
        }
        Insert: {
          arrears_amount?: number
          company_id: string
          created_at?: string
          days_overdue?: number
          id?: string
          lease_id?: string | null
          office_id: string
          risk_band?: string | null
          snapshot_date: string
          tenant_id?: string | null
        }
        Update: {
          arrears_amount?: number
          company_id?: string
          created_at?: string
          days_overdue?: number
          id?: string
          lease_id?: string | null
          office_id?: string
          risk_band?: string | null
          snapshot_date?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrears_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrears_snapshots_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrears_snapshots_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrears_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket: string
          company_id: string
          content_type: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          file_name: string
          id: string
          object_path: string
          office_id: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          bucket: string
          company_id: string
          content_type?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          file_name: string
          id?: string
          object_path: string
          office_id?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          company_id?: string
          content_type?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          file_name?: string
          id?: string
          object_path?: string
          office_id?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          break_minutes: number | null
          clock_in: string | null
          clock_out: string | null
          company_id: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          late_minutes: number | null
          lunch_in: string | null
          lunch_out: string | null
          office_id: string | null
          status: string | null
          total_minutes: number | null
          updated_at: string | null
          user_id: string | null
          work_date: string | null
        }
        Insert: {
          break_minutes?: number | null
          clock_in?: string | null
          clock_out?: string | null
          company_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          late_minutes?: number | null
          lunch_in?: string | null
          lunch_out?: string | null
          office_id?: string | null
          status?: string | null
          total_minutes?: number | null
          updated_at?: string | null
          user_id?: string | null
          work_date?: string | null
        }
        Update: {
          break_minutes?: number | null
          clock_in?: string | null
          clock_out?: string | null
          company_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          late_minutes?: number | null
          lunch_in?: string | null
          lunch_out?: string | null
          office_id?: string | null
          status?: string | null
          total_minutes?: number | null
          updated_at?: string | null
          user_id?: string | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_correction_actions: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          correction_id: string
          created_at: string
          id: string
          notes: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          correction_id: string
          created_at?: string
          id?: string
          notes?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          correction_id?: string
          created_at?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_correction_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_actions_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "attendance_corrections"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          id: string
          office_id: string
          reason: string
          requested_by: string | null
          requested_change: Json
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          office_id: string
          reason: string
          requested_by?: string | null
          requested_change: Json
          status?: string
          updated_at?: string
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          office_id?: string
          reason?: string
          requested_by?: string | null
          requested_change?: Json
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_daily_summaries: {
        Row: {
          break_minutes: number
          company_id: string
          created_at: string
          employee_id: string
          first_check_in: string | null
          id: string
          last_check_out: string | null
          late_minutes: number
          office_id: string
          status: string
          total_minutes: number
          updated_at: string
          work_date: string
        }
        Insert: {
          break_minutes?: number
          company_id: string
          created_at?: string
          employee_id: string
          first_check_in?: string | null
          id?: string
          last_check_out?: string | null
          late_minutes?: number
          office_id: string
          status?: string
          total_minutes?: number
          updated_at?: string
          work_date: string
        }
        Update: {
          break_minutes?: number
          company_id?: string
          created_at?: string
          employee_id?: string
          first_check_in?: string | null
          id?: string
          last_check_out?: string | null
          late_minutes?: number
          office_id?: string
          status?: string
          total_minutes?: number
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_daily_summaries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_summaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_summaries_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          company_id: string
          created_at: string
          device_id: string | null
          employee_id: string
          event_time: string
          event_type: string
          gps_validation_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          office_id: string
          source: string
          status: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          device_id?: string | null
          employee_id: string
          event_time?: string
          event_type: string
          gps_validation_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          office_id: string
          source?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          device_id?: string | null
          employee_id?: string
          event_time?: string
          event_type?: string
          gps_validation_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          office_id?: string
          source?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_gps_validation_id_fkey"
            columns: ["gps_validation_id"]
            isOneToOne: false
            referencedRelation: "gps_validations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_policies: {
        Row: {
          active: boolean
          check_in_time: string
          check_out_time: string
          company_id: string
          created_at: string
          grace_minutes: number
          id: string
          name: string
          office_id: string | null
          require_approved_device: boolean
          require_gps: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          check_in_time: string
          check_out_time: string
          company_id: string
          created_at?: string
          grace_minutes?: number
          id?: string
          name: string
          office_id?: string | null
          require_approved_device?: boolean
          require_gps?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          check_in_time?: string
          check_out_time?: string
          company_id?: string
          created_at?: string
          grace_minutes?: number
          id?: string
          name?: string
          office_id?: string | null
          require_approved_device?: boolean
          require_gps?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_policies_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          office_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          office_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          office_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          active: boolean
          company_id: string
          conditions: Json
          created_at: string
          id: string
          name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          company_id: string
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          company_id?: string
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          automation_rule_id: string | null
          company_id: string
          completed_at: string | null
          error_message: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          automation_rule_id?: string | null
          company_id: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string
          status: string
        }
        Update: {
          automation_rule_id?: string | null
          company_id?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_tasks: {
        Row: {
          automation_run_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          payload: Json
          run_after: string | null
          status: string
          task_type: string
        }
        Insert: {
          automation_run_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          payload?: Json
          run_after?: string | null
          status?: string
          task_type: string
        }
        Update: {
          automation_run_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          payload?: Json
          run_after?: string | null
          status?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_tasks_automation_run_id_fkey"
            columns: ["automation_run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_artifacts: {
        Row: {
          backup_run_id: string
          checksum: string | null
          company_id: string | null
          created_at: string
          encrypted: boolean
          id: string
          retention_until: string | null
          storage_path: string
        }
        Insert: {
          backup_run_id: string
          checksum?: string | null
          company_id?: string | null
          created_at?: string
          encrypted?: boolean
          id?: string
          retention_until?: string | null
          storage_path: string
        }
        Update: {
          backup_run_id?: string
          checksum?: string | null
          company_id?: string | null
          created_at?: string
          encrypted?: boolean
          id?: string
          retention_until?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_artifacts_backup_run_id_fkey"
            columns: ["backup_run_id"]
            isOneToOne: false
            referencedRelation: "backup_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_artifacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_jobs: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          name: string
          schedule_expression: string | null
          scope: Json
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          schedule_expression?: string | null
          scope?: Json
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          schedule_expression?: string | null
          scope?: Json
        }
        Relationships: [
          {
            foreignKeyName: "backup_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_runs: {
        Row: {
          backup_job_id: string | null
          company_id: string | null
          completed_at: string | null
          error_message: string | null
          id: string
          size_bytes: number | null
          started_at: string
          status: string
        }
        Insert: {
          backup_job_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          size_bytes?: number | null
          started_at?: string
          status: string
        }
        Update: {
          backup_job_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          size_bytes?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_runs_backup_job_id_fkey"
            columns: ["backup_job_id"]
            isOneToOne: false
            referencedRelation: "backup_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          cash_account_id: string | null
          company_id: string
          created_at: string
          currency: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          cash_account_id?: string | null
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          cash_account_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          office_id: string | null
          title: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string | null
          title: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_account_balances: {
        Row: {
          balance_date: string
          calculated_at: string
          cash_account_id: string
          closing_balance: number
          company_id: string
          id: string
          office_id: string | null
          opening_balance: number
        }
        Insert: {
          balance_date: string
          calculated_at?: string
          cash_account_id: string
          closing_balance?: number
          company_id: string
          id?: string
          office_id?: string | null
          opening_balance?: number
        }
        Update: {
          balance_date?: string
          calculated_at?: string
          cash_account_id?: string
          closing_balance?: number
          company_id?: string
          id?: string
          office_id?: string | null
          opening_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_account_balances_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_account_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_account_balances_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          account_type: string
          company_id: string
          created_at: string
          currency: string
          id: string
          name: string
          office_id: string | null
          provider_account_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_type: string
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          office_id?: string | null
          provider_account_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          office_id?: string | null
          provider_account_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_position: {
        Row: {
          cash_position: number | null
          collections: number | null
          company_id: string | null
          expenses: number | null
          id: string
          landlord_payments: number | null
          office_id: string | null
          position_date: string | null
          updated_at: string | null
        }
        Insert: {
          cash_position?: number | null
          collections?: number | null
          company_id?: string | null
          expenses?: number | null
          id?: string
          landlord_payments?: number | null
          office_id?: string | null
          position_date?: string | null
          updated_at?: string | null
        }
        Update: {
          cash_position?: number | null
          collections?: number | null
          company_id?: string | null
          expenses?: number | null
          id?: string
          landlord_payments?: number | null
          office_id?: string | null
          position_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_position_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_position_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliation_lines: {
        Row: {
          cash_account_id: string
          company_id: string
          counted_balance: number
          created_at: string
          expected_balance: number
          id: string
          notes: string | null
          reconciliation_id: string
          variance: number | null
        }
        Insert: {
          cash_account_id: string
          company_id: string
          counted_balance?: number
          created_at?: string
          expected_balance?: number
          id?: string
          notes?: string | null
          reconciliation_id: string
          variance?: number | null
        }
        Update: {
          cash_account_id?: string
          company_id?: string
          counted_balance?: number
          created_at?: string
          expected_balance?: number
          id?: string
          notes?: string | null
          reconciliation_id?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliation_lines_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_lines_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          id: string
          office_id: string | null
          reconciliation_date: string
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          office_id?: string | null
          reconciliation_date: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string | null
          reconciliation_date?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          cash_account_id: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          office_id: string | null
          recorded_by: string | null
          source_id: string | null
          source_type: string
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          amount: number
          cash_account_id: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          office_id?: string | null
          recorded_by?: string | null
          source_id?: string | null
          source_type: string
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          cash_account_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          office_id?: string | null
          recorded_by?: string | null
          source_id?: string | null
          source_type?: string
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transfers: {
        Row: {
          amount: number
          company_id: string
          completed_at: string | null
          created_at: string
          from_cash_account_id: string
          id: string
          requested_by: string | null
          status: string
          to_cash_account_id: string
        }
        Insert: {
          amount: number
          company_id: string
          completed_at?: string | null
          created_at?: string
          from_cash_account_id: string
          id?: string
          requested_by?: string | null
          status?: string
          to_cash_account_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string
          from_cash_account_id?: string
          id?: string
          requested_by?: string | null
          status?: string
          to_cash_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_from_cash_account_id_fkey"
            columns: ["from_cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_to_cash_account_id_fkey"
            columns: ["to_cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_actions: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          id: string
          invoice_id: string | null
          lease_id: string | null
          next_follow_up_at: string | null
          notes: string | null
          office_id: string
          outcome: string | null
          performed_by: string | null
          tenant_id: string
        }
        Insert: {
          action_type: string
          company_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          lease_id?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          office_id: string
          outcome?: string | null
          performed_by?: string | null
          tenant_id: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          lease_id?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          office_id?: string
          outcome?: string | null
          performed_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rent_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          amount: number | null
          amount_paid: number | null
          balance: number | null
          collection_number: string | null
          collector_id: string | null
          company_id: string | null
          created_at: string | null
          due_date: string | null
          expected_amount: number | null
          id: string
          landlord_id: string | null
          lease_id: string | null
          notes: string | null
          office_id: string | null
          paid_at: string | null
          payment_date: string | null
          payment_method: string | null
          property_id: string | null
          recorded_by: string | null
          reference_number: string | null
          room_id: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          amount_paid?: number | null
          balance?: number | null
          collection_number?: string | null
          collector_id?: string | null
          company_id?: string | null
          created_at?: string | null
          due_date?: string | null
          expected_amount?: number | null
          id?: string
          landlord_id?: string | null
          lease_id?: string | null
          notes?: string | null
          office_id?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          property_id?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          room_id?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          amount_paid?: number | null
          balance?: number | null
          collection_number?: string | null
          collector_id?: string | null
          company_id?: string | null
          created_at?: string | null
          due_date?: string | null
          expected_amount?: number | null
          id?: string
          landlord_id?: string | null
          lease_id?: string | null
          notes?: string | null
          office_id?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          property_id?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          room_id?: string | null
          status?: string | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_lease_id_fkey_v1"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collector_assignments: {
        Row: {
          active: boolean
          assigned_by: string | null
          collector_user_id: string
          company_id: string
          created_at: string
          id: string
          office_id: string
          property_id: string | null
          tenant_id: string | null
        }
        Insert: {
          active?: boolean
          assigned_by?: string | null
          collector_user_id: string
          company_id: string
          created_at?: string
          id?: string
          office_id: string
          property_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          active?: boolean
          assigned_by?: string | null
          collector_user_id?: string
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string
          property_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collector_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_assignments_collector_user_id_fkey"
            columns: ["collector_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_assignments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collector_collection_targets: {
        Row: {
          collector_user_id: string
          company_id: string
          created_at: string
          id: string
          office_target_id: string
          target_amount: number
        }
        Insert: {
          collector_user_id: string
          company_id: string
          created_at?: string
          id?: string
          office_target_id: string
          target_amount: number
        }
        Update: {
          collector_user_id?: string
          company_id?: string
          created_at?: string
          id?: string
          office_target_id?: string
          target_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "collector_collection_targets_collector_user_id_fkey"
            columns: ["collector_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_collection_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_collection_targets_office_target_id_fkey"
            columns: ["office_target_id"]
            isOneToOne: false
            referencedRelation: "office_collection_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_channels: {
        Row: {
          active: boolean
          channel: string
          company_id: string | null
          config: Json
          created_at: string
          id: string
          provider: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel: string
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          provider?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel?: string
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_provider_logs: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          direction: string
          id: string
          payload: Json
          provider: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          direction: string
          id?: string
          payload: Json
          provider: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          direction?: string
          id?: string
          payload?: Json
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_provider_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          email: string | null
          id: string
          legal_name: string | null
          name: string
          phone: string | null
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          phone?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          phone?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_cash_positions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          position_date: string
          total_bank: number
          total_cash: number
          total_mobile_money: number
          total_position: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          position_date: string
          total_bank?: number
          total_cash?: number
          total_mobile_money?: number
          total_position?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          position_date?: string
          total_bank?: number
          total_cash?: number
          total_mobile_money?: number
          total_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_cash_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_consolidation_snapshots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          payload: Json
          reporting_period_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          payload?: Json
          reporting_period_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          payload?: Json
          reporting_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_consolidation_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_consolidation_snapshots_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: true
            referencedRelation: "company_reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      company_reporting_periods: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_reporting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_scorecards: {
        Row: {
          company_id: string
          created_at: string
          id: string
          payload: Json
          score_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          payload?: Json
          score_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          payload?: Json
          score_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_scorecards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_sensitive: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          company_id: string | null
          created_at: string
          id: string
          setting_key: string
          setting_scope: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          setting_key: string
          setting_scope: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          setting_key?: string
          setting_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuration_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      consolidated_report_exports: {
        Row: {
          company_id: string
          consolidation_snapshot_id: string
          created_at: string
          exported_by: string | null
          file_url: string | null
          id: string
          status: string
        }
        Insert: {
          company_id: string
          consolidation_snapshot_id: string
          created_at?: string
          exported_by?: string | null
          file_url?: string | null
          id?: string
          status?: string
        }
        Update: {
          company_id?: string
          consolidation_snapshot_id?: string
          created_at?: string
          exported_by?: string | null
          file_url?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consolidated_report_exports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidated_report_exports_consolidation_snapshot_id_fkey"
            columns: ["consolidation_snapshot_id"]
            isOneToOne: false
            referencedRelation: "company_consolidation_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidated_report_exports_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consolidation_adjustments: {
        Row: {
          adjustment_type: string
          amount: number | null
          company_id: string
          consolidation_snapshot_id: string
          created_at: string
          created_by: string | null
          id: string
          reason: string
        }
        Insert: {
          adjustment_type: string
          amount?: number | null
          company_id: string
          consolidation_snapshot_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
        }
        Update: {
          adjustment_type?: string
          amount?: number | null
          company_id?: string
          consolidation_snapshot_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "consolidation_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidation_adjustments_consolidation_snapshot_id_fkey"
            columns: ["consolidation_snapshot_id"]
            isOneToOne: false
            referencedRelation: "company_consolidation_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidation_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_cash_positions: {
        Row: {
          closing_cash: number
          company_id: string
          created_at: string
          id: string
          inflows: number
          office_id: string
          opening_cash: number
          outflows: number
          position_date: string
        }
        Insert: {
          closing_cash?: number
          company_id: string
          created_at?: string
          id?: string
          inflows?: number
          office_id: string
          opening_cash?: number
          outflows?: number
          position_date: string
        }
        Update: {
          closing_cash?: number
          company_id?: string
          created_at?: string
          id?: string
          inflows?: number
          office_id?: string
          opening_cash?: number
          outflows?: number
          position_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_cash_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_cash_positions_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_cache_snapshots: {
        Row: {
          cache_key: string
          company_id: string
          created_at: string
          dashboard_key: string
          id: string
          payload: Json
          valid_until: string | null
        }
        Insert: {
          cache_key: string
          company_id: string
          created_at?: string
          dashboard_key: string
          id?: string
          payload?: Json
          valid_until?: string | null
        }
        Update: {
          cache_key?: string
          company_id?: string
          created_at?: string
          dashboard_key?: string
          id?: string
          payload?: Json
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_cache_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_refresh_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          dashboard_key: string
          error_message: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          dashboard_key: string
          error_message?: string | null
          id?: string
          started_at?: string
          status: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          dashboard_key?: string
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_refresh_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_checks: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          entity_type: string
          id: string
          key: string
          rule: Json
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          entity_type: string
          id?: string
          key: string
          rule?: Json
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          key?: string
          rule?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_checks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_findings: {
        Row: {
          check_id: string | null
          company_id: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          resolved_at: string | null
          severity: string
          status: string
        }
        Insert: {
          check_id?: string | null
          company_id: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Update: {
          check_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_findings_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "data_quality_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          entity_type: string
          id: string
          retention_days: number
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          entity_type: string
          id?: string
          retention_days: number
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          retention_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      device_attendance_locks: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          device_id: string
          employee_id: string
          id: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          device_id: string
          employee_id: string
          id?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          device_id?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_attendance_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_attendance_locks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_attendance_locks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          company_id: string | null
          created_at: string
          entity_type: string
          id: string
          key: string
          name: string
          required: boolean
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          entity_type: string
          id?: string
          key: string
          name: string
          required?: boolean
        }
        Update: {
          company_id?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          key?: string
          name?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "document_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_verifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          tenant_document_id: string
          verified_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status: string
          tenant_document_id: string
          verified_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          tenant_document_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_verifications_tenant_document_id_fkey"
            columns: ["tenant_document_id"]
            isOneToOne: false
            referencedRelation: "tenant_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_candidates: {
        Row: {
          company_id: string
          confidence: number | null
          created_at: string
          duplicate_entity_id: string | null
          entity_type: string
          id: string
          primary_entity_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          confidence?: number | null
          created_at?: string
          duplicate_entity_id?: string | null
          entity_type: string
          id?: string
          primary_entity_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          confidence?: number | null
          created_at?: string
          duplicate_entity_id?: string | null
          entity_type?: string
          id?: string
          primary_entity_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedule_assignments: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          ends_on: string | null
          id: string
          schedule_id: string
          starts_on: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          ends_on?: string | null
          id?: string
          schedule_id: string
          starts_on: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          ends_on?: string | null
          id?: string
          schedule_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedule_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_schedule_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_schedule_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          company_id: string | null
          created_at: string | null
          department: string | null
          default_office_id: string | null
          email: string | null
          employee_code: string | null
          employee_assignment_type: string
          employee_pin: string | null
          employment_type: string | null
          full_name: string | null
          hire_date: string | null
          id: string
          is_field_agent: boolean | null
          job_title: string | null
          office_id: string | null
          phone: string | null
          primary_office_id: string | null
          role: string | null
          status: string | null
          termination_date: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          default_office_id?: string | null
          email?: string | null
          employee_code?: string | null
          employee_assignment_type?: string
          employee_pin?: string | null
          employment_type?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          is_field_agent?: boolean | null
          job_title?: string | null
          office_id?: string | null
          phone?: string | null
          primary_office_id?: string | null
          role?: string | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          default_office_id?: string | null
          email?: string | null
          employee_code?: string | null
          employee_assignment_type?: string
          employee_pin?: string | null
          employment_type?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          is_field_agent?: boolean | null
          job_title?: string | null
          office_id?: string | null
          phone?: string | null
          primary_office_id?: string | null
          role?: string | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_rules: {
        Row: {
          actions: Json
          active: boolean
          company_id: string
          conditions: Json
          created_at: string
          entity_type: string
          id: string
          name: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          company_id: string
          conditions?: Json
          created_at?: string
          entity_type: string
          id?: string
          name: string
        }
        Update: {
          actions?: Json
          active?: boolean
          company_id?: string
          conditions?: Json
          created_at?: string
          entity_type?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      eviction_cases: {
        Row: {
          closed_at: string | null
          company_id: string
          id: string
          lease_id: string
          office_id: string
          opened_at: string
          opened_by: string | null
          reason: string
          status: string
          tenant_id: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          id?: string
          lease_id: string
          office_id: string
          opened_at?: string
          opened_by?: string | null
          reason: string
          status?: string
          tenant_id: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          id?: string
          lease_id?: string
          office_id?: string
          opened_at?: string
          opened_by?: string | null
          reason?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eviction_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_cases_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_cases_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_cases_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      eviction_steps: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          eviction_case_id: string
          id: string
          notes: string | null
          status: string
          step_type: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          eviction_case_id: string
          id?: string
          notes?: string | null
          status?: string
          step_type: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          eviction_case_id?: string
          id?: string
          notes?: string | null
          status?: string
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "eviction_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_steps_eviction_case_id_fkey"
            columns: ["eviction_case_id"]
            isOneToOne: false
            referencedRelation: "eviction_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_kpi_snapshots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          payload: Json
          snapshot_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          payload?: Json
          snapshot_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          payload?: Json
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_kpi_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          key: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          key: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          key?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_lines: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          description: string
          expense_id: string
          id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          description: string
          expense_id: string
          id?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          description?: string
          expense_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_lines_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          attachment_id: string | null
          company_id: string
          created_at: string
          expense_id: string
          id: string
        }
        Insert: {
          attachment_id?: string | null
          company_id: string
          created_at?: string
          expense_id: string
          id?: string
        }
        Update: {
          attachment_id?: string | null
          company_id?: string
          created_at?: string
          expense_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          category: string | null
          category_id: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          entered_by: string | null
          expense_date: string | null
          expense_number: string | null
          id: string
          item: string | null
          office_id: string | null
          property_id: string | null
          receipt_url: string | null
          submitted_by: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          entered_by?: string | null
          expense_date?: string | null
          expense_number?: string | null
          id?: string
          item?: string | null
          office_id?: string | null
          property_id?: string | null
          receipt_url?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          entered_by?: string | null
          expense_date?: string | null
          expense_number?: string | null
          id?: string
          item?: string | null
          office_id?: string | null
          property_id?: string | null
          receipt_url?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey_v1"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      external_transaction_imports: {
        Row: {
          company_id: string
          id: string
          imported_at: string
          imported_by: string | null
          provider_account_id: string
          source_file_attachment_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          provider_account_id: string
          source_file_attachment_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          provider_account_id?: string
          source_file_attachment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_transaction_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transaction_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transaction_imports_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transaction_imports_source_file_attachment_id_fkey"
            columns: ["source_file_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      external_transactions: {
        Row: {
          amount: number
          company_id: string
          counterparty: string | null
          created_at: string
          direction: string
          id: string
          import_id: string | null
          provider_account_id: string
          provider_reference: string
          raw_payload: Json
          status: string
          transaction_time: string
        }
        Insert: {
          amount: number
          company_id: string
          counterparty?: string | null
          created_at?: string
          direction: string
          id?: string
          import_id?: string | null
          provider_account_id: string
          provider_reference: string
          raw_payload?: Json
          status?: string
          transaction_time: string
        }
        Update: {
          amount?: number
          company_id?: string
          counterparty?: string | null
          created_at?: string
          direction?: string
          id?: string
          import_id?: string | null
          provider_account_id?: string
          provider_reference?: string
          raw_payload?: Json
          status?: string
          transaction_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "external_transaction_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transactions_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          company_id: string | null
          created_at: string
          enabled: boolean
          id: string
          key: string
          rollout: Json
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          rollout?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          rollout?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      field_agents: {
        Row: {
          agent_type: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          office_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_type?: string
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          office_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_type?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          office_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_agents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_agents_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      field_route_stops: {
        Row: {
          company_id: string
          created_at: string
          id: string
          property_id: string | null
          purpose: string
          room_id: string | null
          route_id: string
          status: string
          stop_order: number
          tenant_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          property_id?: string | null
          purpose: string
          room_id?: string | null
          route_id: string
          status?: string
          stop_order: number
          tenant_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          property_id?: string | null
          purpose?: string
          room_id?: string | null
          route_id?: string
          status?: string
          stop_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_route_stops_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_route_stops_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_route_stops_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "field_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_route_stops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      field_routes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          field_agent_id: string
          id: string
          office_id: string
          route_date: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          field_agent_id: string
          id?: string
          office_id: string
          route_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          field_agent_id?: string
          id?: string
          office_id?: string
          route_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_routes_field_agent_id_fkey"
            columns: ["field_agent_id"]
            isOneToOne: false
            referencedRelation: "field_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_routes_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visit_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          field_visit_id: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          field_visit_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          field_visit_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_visit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_events_field_visit_id_fkey"
            columns: ["field_visit_id"]
            isOneToOne: false
            referencedRelation: "field_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visits: {
        Row: {
          company_id: string
          created_at: string
          field_agent_id: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          office_id: string
          property_id: string | null
          room_id: string | null
          route_stop_id: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          visit_date: string
          visit_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_agent_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          office_id: string
          property_id?: string | null
          room_id?: string | null
          route_stop_id?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          visit_date?: string
          visit_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_agent_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          office_id?: string
          property_id?: string | null
          room_id?: string | null
          route_stop_id?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          visit_date?: string
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_field_agent_id_fkey"
            columns: ["field_agent_id"]
            isOneToOne: false
            referencedRelation: "field_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "field_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          active: boolean
          center_latitude: number
          center_longitude: number
          company_id: string
          created_at: string
          id: string
          name: string
          office_id: string | null
          property_id: string | null
          radius_meters: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          center_latitude: number
          center_longitude: number
          company_id: string
          created_at?: string
          id?: string
          name: string
          office_id?: string | null
          property_id?: string | null
          radius_meters: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          center_latitude?: number
          center_longitude?: number
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          office_id?: string | null
          property_id?: string | null
          radius_meters?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofences_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_validations: {
        Row: {
          company_id: string
          created_at: string
          distance_meters: number | null
          entity_id: string | null
          entity_type: string
          geofence_id: string | null
          id: string
          latitude: number
          longitude: number
          office_id: string | null
          passed: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          distance_meters?: number | null
          entity_id?: string | null
          entity_type: string
          geofence_id?: string | null
          id?: string
          latitude: number
          longitude: number
          office_id?: string | null
          passed: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          distance_meters?: number | null
          entity_id?: string | null
          entity_type?: string
          geofence_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          office_id?: string | null
          passed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gps_validations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_validations_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_validations_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_findings: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          inspection_id: string | null
          office_id: string
          property_id: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          inspection_id?: string | null
          office_id: string
          property_id: string
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          inspection_id?: string | null
          office_id?: string
          property_id?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_findings_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "property_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_findings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_findings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          inspection_id: string
          item_name: string
          notes: string | null
          result: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          inspection_id: string
          item_name: string
          notes?: string | null
          result: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          inspection_id?: string
          item_name?: string
          notes?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "property_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_type: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_type: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rent_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_calculation_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          error_message: string | null
          id: string
          inputs: Json
          metric_definition_id: string | null
          result: Json
          started_at: string
          status: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          inputs?: Json
          metric_definition_id?: string | null
          result?: Json
          started_at?: string
          status: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          inputs?: Json
          metric_definition_id?: string | null
          result?: Json
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_calculation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_calculation_runs_metric_definition_id_fkey"
            columns: ["metric_definition_id"]
            isOneToOne: false
            referencedRelation: "metric_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          branch_name: string | null
          company_id: string
          created_at: string
          currency: string
          id: string
          is_default: boolean
          landlord_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          branch_name?: string | null
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          landlord_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          branch_name?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          landlord_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_bank_accounts_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_payments: {
        Row: {
          amount: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          landlord_id: string | null
          office_id: string | null
          paid_at: string | null
          payment_method: string | null
          payout_reference: string | null
          settlement_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          landlord_id?: string | null
          office_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payout_reference?: string | null
          settlement_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          landlord_id?: string | null
          office_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payout_reference?: string | null
          settlement_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landlord_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payments_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payments_settlement_id_fkey_v1"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "landlord_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_payout_allocations: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          payout_id: string
          settlement_line_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          payout_id: string
          settlement_line_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          payout_id?: string
          settlement_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_payout_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payout_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "landlord_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payout_allocations_settlement_line_id_fkey"
            columns: ["settlement_line_id"]
            isOneToOne: false
            referencedRelation: "landlord_settlement_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_payouts: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          landlord_id: string
          paid_at: string | null
          payout_method: string
          payout_reference: string
          settlement_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          landlord_id: string
          paid_at?: string | null
          payout_method: string
          payout_reference: string
          settlement_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          landlord_id?: string
          paid_at?: string | null
          payout_method?: string
          payout_reference?: string
          settlement_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_payouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payouts_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payouts_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "landlord_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_settlement_lines: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          description: string
          id: string
          property_id: string | null
          room_id: string | null
          settlement_id: string
          source_id: string | null
          source_type: string
          tenant_id: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          description: string
          id?: string
          property_id?: string | null
          room_id?: string | null
          settlement_id: string
          source_id?: string | null
          source_type: string
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          property_id?: string | null
          room_id?: string | null
          settlement_id?: string
          source_id?: string | null
          source_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landlord_settlement_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlement_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlement_lines_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlement_lines_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "landlord_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlement_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_settlement_periods: {
        Row: {
          company_id: string
          created_at: string
          id: string
          landlord_id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          landlord_id: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          landlord_id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_settlement_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlement_periods_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          deductions: number
          gross_collections: number
          id: string
          landlord_id: string
          management_fees: number
          net_payable: number
          settlement_period_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          deductions?: number
          gross_collections?: number
          id?: string
          landlord_id: string
          management_fees?: number
          net_payable?: number
          settlement_period_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          deductions?: number
          gross_collections?: number
          id?: string
          landlord_id?: string
          management_fees?: number
          net_payable?: number
          settlement_period_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_settlements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlements_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_settlements_settlement_period_id_fkey"
            columns: ["settlement_period_id"]
            isOneToOne: false
            referencedRelation: "landlord_settlement_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_statements: {
        Row: {
          company_id: string
          delivery_status: string
          file_url: string | null
          generated_at: string
          id: string
          settlement_id: string
          statement_number: string
        }
        Insert: {
          company_id: string
          delivery_status?: string
          file_url?: string | null
          generated_at?: string
          id?: string
          settlement_id: string
          statement_number: string
        }
        Update: {
          company_id?: string
          delivery_status?: string
          file_url?: string | null
          generated_at?: string
          id?: string
          settlement_id?: string
          statement_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_statements_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "landlord_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      landlords: {
        Row: {
          advance_taken: number | null
          amount_paid: number | null
          balance_remaining: number | null
          company_id: string | null
          created_at: string | null
          email: string | null
          expected_income: number | null
          full_name: string
          id: string
          landlord_code: string | null
          national_id: string | null
          phone: string | null
          status: string | null
          trust_index: number | null
          updated_at: string | null
        }
        Insert: {
          advance_taken?: number | null
          amount_paid?: number | null
          balance_remaining?: number | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          expected_income?: number | null
          full_name: string
          id?: string
          landlord_code?: string | null
          national_id?: string | null
          phone?: string | null
          status?: string | null
          trust_index?: number | null
          updated_at?: string | null
        }
        Update: {
          advance_taken?: number | null
          amount_paid?: number | null
          balance_remaining?: number | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          expected_income?: number | null
          full_name?: string
          id?: string
          landlord_code?: string | null
          national_id?: string | null
          phone?: string | null
          status?: string | null
          trust_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landlords_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_charges: {
        Row: {
          active: boolean
          amount: number
          charge_type: string
          company_id: string
          created_at: string
          description: string | null
          frequency: string
          id: string
          lease_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          charge_type: string
          company_id: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          lease_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          charge_type?: string
          company_id?: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          lease_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_charges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_charges_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_documents: {
        Row: {
          attachment_id: string | null
          company_id: string
          created_at: string
          document_type: string
          id: string
          lease_id: string
          signed_at: string | null
        }
        Insert: {
          attachment_id?: string | null
          company_id: string
          created_at?: string
          document_type: string
          id?: string
          lease_id: string
          signed_at?: string | null
        }
        Update: {
          attachment_id?: string | null
          company_id?: string
          created_at?: string
          document_type?: string
          id?: string
          lease_id?: string
          signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_documents_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          billing_day: number
          company_id: string
          created_at: string
          deposit_amount: number
          end_date: string | null
          id: string
          monthly_rent: number
          office_id: string
          property_id: string
          room_id: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_day?: number
          company_id: string
          created_at?: string
          deposit_amount?: number
          end_date?: string | null
          id?: string
          monthly_rent: number
          office_id: string
          property_id: string
          room_id: string
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_day?: number
          company_id?: string
          created_at?: string
          deposit_amount?: number
          end_date?: string | null
          id?: string
          monthly_rent?: number
          office_id?: string
          property_id?: string
          room_id?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          ends_on: string
          id: string
          leave_type: string
          requested_by: string | null
          starts_on: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          ends_on: string
          id?: string
          leave_type: string
          requested_by?: string | null
          starts_on: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          ends_on?: string
          id?: string
          leave_type?: string
          requested_by?: string | null
          starts_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          description: string | null
          finding_id: string | null
          id: string
          office_id: string
          priority: string
          property_id: string | null
          room_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          finding_id?: string | null
          id?: string
          office_id: string
          priority?: string
          property_id?: string | null
          room_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          finding_id?: string | null
          id?: string
          office_id?: string
          priority?: string
          property_id?: string | null
          room_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "inspection_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      management_fee_rules: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          fee_type: string
          fee_value: number
          id: string
          landlord_id: string | null
          property_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          fee_type: string
          fee_value: number
          id?: string
          landlord_id?: string | null
          property_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          fee_type?: string
          fee_value?: number
          id?: string
          landlord_id?: string | null
          property_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "management_fee_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_fee_rules_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_fee_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      message_delivery_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          company_id: string
          error_code: string | null
          error_message: string | null
          id: string
          message_recipient_id: string
          provider: string | null
          provider_message_id: string | null
          status: string
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          company_id: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_recipient_id: string
          provider?: string | null
          provider_message_id?: string | null
          status: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          company_id?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_recipient_id?: string
          provider?: string | null
          provider_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_delivery_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_delivery_attempts_message_recipient_id_fkey"
            columns: ["message_recipient_id"]
            isOneToOne: false
            referencedRelation: "message_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_delivery_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          message_recipient_id: string
          payload: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          message_recipient_id: string
          payload?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message_recipient_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_delivery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_delivery_events_message_recipient_id_fkey"
            columns: ["message_recipient_id"]
            isOneToOne: false
            referencedRelation: "message_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_recipients: {
        Row: {
          company_id: string
          created_at: string
          destination: string
          id: string
          message_id: string
          recipient_id: string | null
          recipient_type: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          destination: string
          id?: string
          message_id: string
          recipient_id?: string | null
          recipient_type: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          destination?: string
          id?: string
          message_id?: string
          recipient_id?: string | null
          recipient_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          active: boolean
          body: string
          channel: string
          company_id: string | null
          created_at: string
          id: string
          key: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          channel: string
          company_id?: string | null
          created_at?: string
          id?: string
          key: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          channel?: string
          company_id?: string | null
          created_at?: string
          id?: string
          key?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          office_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body: string
          channel_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body?: string
          channel_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "communication_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          category: string
          created_at: string
          formula: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          formula?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          formula?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      metric_snapshots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          metadata: Json
          metric_date: string
          metric_definition_id: string
          office_id: string | null
          value: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          metadata?: Json
          metric_date: string
          metric_definition_id: string
          office_id?: string | null
          value: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          metric_date?: string
          metric_definition_id?: string
          office_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_snapshots_metric_definition_id_fkey"
            columns: ["metric_definition_id"]
            isOneToOne: false
            referencedRelation: "metric_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_snapshots_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_money_accounts: {
        Row: {
          account_name: string
          cash_account_id: string | null
          company_id: string
          created_at: string
          id: string
          phone_number: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          cash_account_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          phone_number: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          cash_account_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          phone_number?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_money_accounts_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_money_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      move_in_records: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          keys_issued: number
          lease_id: string
          meter_readings: Json
          notes: string | null
          room_condition: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          keys_issued?: number
          lease_id: string
          meter_readings?: Json
          notes?: string | null
          room_condition?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          keys_issued?: number
          lease_id?: string
          meter_readings?: Json
          notes?: string | null
          room_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "move_in_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "move_in_records_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "move_in_records_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
        ]
      }
      move_out_records: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deposit_deductions: number
          final_balance: number
          id: string
          lease_id: string
          notes: string | null
          room_condition: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deposit_deductions?: number
          final_balance?: number
          id?: string
          lease_id: string
          notes?: string | null
          room_condition?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deposit_deductions?: number
          final_balance?: number
          id?: string
          lease_id?: string
          notes?: string | null
          room_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "move_out_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "move_out_records_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "move_out_records_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_failures: {
        Row: {
          company_id: string
          created_at: string
          failure_reason: string
          id: string
          message_recipient_id: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          failure_reason: string
          id?: string
          message_recipient_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          failure_reason?: string
          id?: string
          message_recipient_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_failures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_failures_message_recipient_id_fkey"
            columns: ["message_recipient_id"]
            isOneToOne: false
            referencedRelation: "message_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          recipient_id: string
          recipient_type: string
          updated_at: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          recipient_id: string
          recipient_type: string
          updated_at?: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          recipient_id?: string
          recipient_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string | null
          company_id: string | null
          created_at: string | null
          delivery_status: string | null
          id: string
          is_read: boolean | null
          message: string | null
          office_id: string | null
          recipient_id: string | null
          recipient_type: string | null
          title: string | null
        }
        Insert: {
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          delivery_status?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          office_id?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          title?: string | null
        }
        Update: {
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          delivery_status?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          office_id?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_collection_targets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          office_id: string
          period_end: string
          period_start: string
          target_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id: string
          period_end: string
          period_start: string
          target_amount: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          period_end?: string
          period_start?: string
          target_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_collection_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_collection_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_collection_targets_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_consolidation_snapshots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          office_id: string
          payload: Json
          reporting_period_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          office_id: string
          payload?: Json
          reporting_period_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string
          payload?: Json
          reporting_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_consolidation_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_consolidation_snapshots_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_consolidation_snapshots_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "company_reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      office_performance_components: {
        Row: {
          company_id: string
          component_key: string
          component_score: number
          created_at: string
          id: string
          metadata: Json
          office_score_id: string
          weight: number
        }
        Insert: {
          company_id: string
          component_key: string
          component_score?: number
          created_at?: string
          id?: string
          metadata?: Json
          office_score_id: string
          weight?: number
        }
        Update: {
          company_id?: string
          component_key?: string
          component_score?: number
          created_at?: string
          id?: string
          metadata?: Json
          office_score_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_performance_components_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_performance_components_office_score_id_fkey"
            columns: ["office_score_id"]
            isOneToOne: false
            referencedRelation: "office_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      office_performance_snapshots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          office_id: string
          payload: Json
          snapshot_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          office_id: string
          payload?: Json
          snapshot_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string
          payload?: Json
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_performance_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_performance_snapshots_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_rankings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          office_id: string
          rank: number
          ranking_date: string
          total_score: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          office_id: string
          rank: number
          ranking_date: string
          total_score: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string
          rank?: number
          ranking_date?: string
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_rankings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_rankings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_scores: {
        Row: {
          attendance_score: number | null
          collection_score: number | null
          company_id: string | null
          created_at: string | null
          expense_score: number | null
          id: string
          metadata: Json | null
          office_id: string | null
          overall_score: number | null
          promise_score: number | null
          score_date: string | null
          total_score: number | null
          updated_at: string | null
        }
        Insert: {
          attendance_score?: number | null
          collection_score?: number | null
          company_id?: string | null
          created_at?: string | null
          expense_score?: number | null
          id?: string
          metadata?: Json | null
          office_id?: string | null
          overall_score?: number | null
          promise_score?: number | null
          score_date?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Update: {
          attendance_score?: number | null
          collection_score?: number | null
          company_id?: string | null
          created_at?: string | null
          expense_score?: number | null
          id?: string
          metadata?: Json | null
          office_id?: string | null
          overall_score?: number | null
          promise_score?: number | null
          score_date?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_scores_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_sensitive: boolean
          key: string
          office_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          key: string
          office_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          key?: string
          office_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "office_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_settings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          collection_target: number | null
          company_id: string | null
          created_at: string | null
          expense_budget: number | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          manager_name: string | null
          name: string | null
          office_code: string | null
          office_health: string | null
          office_name: string
          office_pin: string | null
          office_score: number | null
          region: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          collection_target?: number | null
          company_id?: string | null
          created_at?: string | null
          expense_budget?: number | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          manager_name?: string | null
          name?: string | null
          office_code?: string | null
          office_health?: string | null
          office_name: string
          office_pin?: string | null
          office_score?: number | null
          region?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          collection_target?: number | null
          company_id?: string | null
          created_at?: string | null
          expense_budget?: number | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          manager_name?: string | null
          name?: string | null
          office_code?: string | null
          office_health?: string | null
          office_name?: string
          office_pin?: string | null
          office_score?: number | null
          region?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rent_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_accounts: {
        Row: {
          account_name: string
          account_number: string
          company_id: string
          created_at: string
          currency: string
          id: string
          office_id: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          office_id?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          office_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_accounts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_webhook_events: {
        Row: {
          company_id: string
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_account_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          provider_account_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_webhook_events_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          lease_id: string | null
          notes: string | null
          office_id: string
          paid_at: string
          payment_method: string
          received_by: string | null
          reference_number: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          lease_id?: string | null
          notes?: string | null
          office_id: string
          paid_at?: string
          payment_method: string
          received_by?: string | null
          reference_number: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          lease_id?: string | null
          notes?: string | null
          office_id?: string
          paid_at?: string
          payment_method?: string
          received_by?: string | null
          reference_number?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          payroll_item_id: string
          reason: string
        }
        Insert: {
          adjustment_type: string
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          payroll_item_id: string
          reason: string
        }
        Update: {
          adjustment_type?: string
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          payroll_item_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_exports: {
        Row: {
          company_id: string
          created_at: string
          exported_by: string | null
          file_url: string | null
          id: string
          payroll_run_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          exported_by?: string | null
          file_url?: string | null
          id?: string
          payroll_run_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          exported_by?: string | null
          file_url?: string | null
          id?: string
          payroll_run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_exports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_exports_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_exports_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          company_id: string
          created_at: string
          deductions: number
          employee_id: string
          gross_pay: number
          id: string
          metadata: Json
          net_pay: number
          payroll_run_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deductions?: number
          employee_id: string
          gross_pay?: number
          id?: string
          metadata?: Json
          net_pay?: number
          payroll_run_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deductions?: number
          employee_id?: string
          gross_pay?: number
          id?: string
          metadata?: Json
          net_pay?: number
          payroll_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          company_id: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_profiles: {
        Row: {
          active: boolean
          base_salary: number
          company_id: string
          created_at: string
          employee_id: string
          id: string
          payment_method: string | null
          salary_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          payment_method?: string | null
          salary_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          payment_method?: string | null
          salary_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          company_id: string
          id: string
          payroll_period_id: string
          run_at: string
          run_by: string | null
          status: string
        }
        Insert: {
          company_id: string
          id?: string
          payroll_period_id: string
          run_at?: string
          run_by?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          id?: string
          payroll_period_id?: string
          run_at?: string
          run_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_targets: {
        Row: {
          company_id: string
          created_at: string
          id: string
          metric_key: string
          office_id: string | null
          period_end: string
          period_start: string
          target_value: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          metric_key: string
          office_id?: string | null
          period_end: string
          period_start: string
          target_value: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          metric_key?: string
          office_id?: string | null
          period_end?: string
          period_start?: string
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_targets_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      petty_cash_disbursements: {
        Row: {
          cash_transaction_id: string | null
          company_id: string
          created_at: string
          disbursed_at: string | null
          disbursed_by: string | null
          id: string
          petty_cash_request_id: string
        }
        Insert: {
          cash_transaction_id?: string | null
          company_id: string
          created_at?: string
          disbursed_at?: string | null
          disbursed_by?: string | null
          id?: string
          petty_cash_request_id: string
        }
        Update: {
          cash_transaction_id?: string | null
          company_id?: string
          created_at?: string
          disbursed_at?: string | null
          disbursed_by?: string | null
          id?: string
          petty_cash_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_disbursements_cash_transaction_id_fkey"
            columns: ["cash_transaction_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_disbursements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_disbursements_disbursed_by_fkey"
            columns: ["disbursed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_disbursements_petty_cash_request_id_fkey"
            columns: ["petty_cash_request_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_requests: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          office_id: string
          purpose: string
          requested_by: string | null
          status: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          office_id: string
          purpose: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string
          purpose?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_credentials: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          failed_attempts: number
          id: string
          last_used_at: string | null
          pin_hash: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          id?: string
          last_used_at?: string | null
          pin_hash: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          id?: string
          last_used_at?: string | null
          pin_hash?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_credentials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promise_followups: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          outcome: string | null
          performed_by: string | null
          promise_id: string
        }
        Insert: {
          action_type: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: string | null
          performed_by?: string | null
          promise_id: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: string | null
          performed_by?: string | null
          promise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promise_followups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_followups_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_followups_promise_id_fkey"
            columns: ["promise_id"]
            isOneToOne: false
            referencedRelation: "promises"
            referencedColumns: ["id"]
          },
        ]
      }
      promises: {
        Row: {
          amount: number | null
          assigned_staff: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          fulfilled_at: string | null
          id: string
          lease_id: string | null
          notes: string | null
          office_id: string | null
          promise_date: string | null
          promised_amount: number | null
          promised_date: string | null
          room_id: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          assigned_staff?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fulfilled_at?: string | null
          id?: string
          lease_id?: string | null
          notes?: string | null
          office_id?: string | null
          promise_date?: string | null
          promised_amount?: number | null
          promised_date?: string | null
          room_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          assigned_staff?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fulfilled_at?: string | null
          id?: string
          lease_id?: string | null
          notes?: string | null
          office_id?: string | null
          promise_date?: string | null
          promised_amount?: number | null
          promised_date?: string | null
          room_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promises_assigned_staff_fkey"
            columns: ["assigned_staff"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_lease_id_fkey_v1"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          company_id: string | null
          created_at: string | null
          district: string | null
          expected_collection: number | null
          gps_location: string | null
          id: string
          landlord_id: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          occupied_units: number | null
          office_id: string | null
          property_code: string | null
          property_name: string | null
          property_type: string | null
          region: string | null
          status: string | null
          total_units: number | null
          updated_at: string | null
          vacant_units: number | null
          village: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string | null
          district?: string | null
          expected_collection?: number | null
          gps_location?: string | null
          id?: string
          landlord_id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          occupied_units?: number | null
          office_id?: string | null
          property_code?: string | null
          property_name?: string | null
          property_type?: string | null
          region?: string | null
          status?: string | null
          total_units?: number | null
          updated_at?: string | null
          vacant_units?: number | null
          village?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string | null
          district?: string | null
          expected_collection?: number | null
          gps_location?: string | null
          id?: string
          landlord_id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          occupied_units?: number | null
          office_id?: string | null
          property_code?: string | null
          property_name?: string | null
          property_type?: string | null
          region?: string | null
          status?: string | null
          total_units?: number | null
          updated_at?: string | null
          vacant_units?: number | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      property_inspections: {
        Row: {
          company_id: string
          created_at: string
          field_agent_id: string | null
          id: string
          inspection_date: string
          office_id: string
          property_id: string
          room_id: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_agent_id?: string | null
          id?: string
          inspection_date?: string
          office_id: string
          property_id: string
          room_id?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_agent_id?: string | null
          id?: string
          inspection_date?: string
          office_id?: string
          property_id?: string
          room_id?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_field_agent_id_fkey"
            columns: ["field_agent_id"]
            isOneToOne: false
            referencedRelation: "field_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      property_landlords: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_primary: boolean
          landlord_id: string
          ownership_percentage: number
          property_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          landlord_id: string
          ownership_percentage?: number
          property_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          landlord_id?: string
          ownership_percentage?: number
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_landlords_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_landlords_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_landlords_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          company_id: string | null
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          company_id: string
          file_url: string | null
          id: string
          issued_at: string
          issued_by: string | null
          issued_to: string
          office_id: string
          payment_id: string
          receipt_number: string
          status: string
        }
        Insert: {
          company_id: string
          file_url?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_to: string
          office_id: string
          payment_id: string
          receipt_number: string
          status?: string
        }
        Update: {
          company_id?: string
          file_url?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_to?: string
          office_id?: string
          payment_id?: string
          receipt_number?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          message_id: string | null
          office_id: string | null
          scheduled_for: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          message_id?: string | null
          office_id?: string | null
          scheduled_for: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          message_id?: string | null
          office_id?: string | null
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_invoices: {
        Row: {
          amount_paid: number
          company_id: string
          created_at: string
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          lease_id: string
          office_id: string
          status: string
          subtotal: number
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          company_id: string
          created_at?: string
          due_date: string
          id?: string
          invoice_date: string
          invoice_number: string
          lease_id: string
          office_id: string
          status?: string
          subtotal?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          company_id?: string
          created_at?: string
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          lease_id?: string
          office_id?: string
          status?: string
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_invoices_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_invoices_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_access_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          id: string
          report_id: string | null
          report_run_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          id?: string
          report_id?: string | null
          report_run_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          id?: string
          report_id?: string | null
          report_run_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_access_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_access_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_access_logs_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          file_url: string | null
          filters: Json
          id: string
          report_id: string
          run_by: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          file_url?: string | null
          filters?: Json
          id?: string
          report_id: string
          run_by?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          file_url?: string | null
          filters?: Json
          id?: string
          report_id?: string
          run_by?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          report_type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          report_type: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          report_type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_drills: {
        Row: {
          company_id: string | null
          id: string
          notes: string | null
          restore_request_id: string | null
          status: string
          tested_at: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          notes?: string | null
          restore_request_id?: string | null
          status: string
          tested_at?: string
        }
        Update: {
          company_id?: string | null
          id?: string
          notes?: string | null
          restore_request_id?: string | null
          status?: string
          tested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_drills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restore_drills_restore_request_id_fkey"
            columns: ["restore_request_id"]
            isOneToOne: false
            referencedRelation: "restore_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_requests: {
        Row: {
          backup_artifact_id: string | null
          company_id: string | null
          created_at: string
          id: string
          reason: string
          requested_by: string | null
          status: string
        }
        Insert: {
          backup_artifact_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          reason: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          backup_artifact_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          reason?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_requests_backup_artifact_id_fkey"
            columns: ["backup_artifact_id"]
            isOneToOne: false
            referencedRelation: "backup_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restore_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restore_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reversal_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          external_transaction_id: string | null
          id: string
          payment_id: string | null
          reason: string
          requested_by: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          external_transaction_id?: string | null
          id?: string
          payment_id?: string | null
          reason: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          external_transaction_id?: string | null
          id?: string
          payment_id?: string | null
          reason?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reversal_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversal_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversal_requests_external_transaction_id_fkey"
            columns: ["external_transaction_id"]
            isOneToOne: false
            referencedRelation: "external_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversal_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversal_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      room_status_history: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          new_status: string
          office_id: string
          old_status: string | null
          reason: string | null
          room_id: string
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          new_status: string
          office_id: string
          old_status?: string | null
          reason?: string | null
          room_id: string
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          new_status?: string
          office_id?: string
          old_status?: string | null
          reason?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_status_history_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_status_history_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          company_id: string | null
          created_at: string | null
          floor: string | null
          id: string
          landlord_id: string | null
          monthly_rent: number | null
          office_id: string | null
          outstanding_balance: number | null
          property_id: string | null
          room_number: string | null
          size_sq_m: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          floor?: string | null
          id?: string
          landlord_id?: string | null
          monthly_rent?: number | null
          office_id?: string | null
          outstanding_balance?: number | null
          property_id?: string | null
          room_number?: string | null
          size_sq_m?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          floor?: string | null
          id?: string
          landlord_id?: string | null
          monthly_rent?: number | null
          office_id?: string | null
          outstanding_balance?: number | null
          property_id?: string | null
          room_number?: string | null
          size_sq_m?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_report_views: {
        Row: {
          company_id: string
          created_at: string
          filters: Json
          id: string
          name: string
          report_id: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          filters?: Json
          id?: string
          name: string
          report_id: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          report_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_report_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_report_views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_report_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          key: string
          payload: Json
          schedule_expression: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          key: string
          payload?: Json
          schedule_expression: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          key?: string
          payload?: Json
          schedule_expression?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          office_id: string | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          office_id?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          office_id?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_change_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          new_value: Json
          office_id: string | null
          old_value: Json | null
          requested_by: string | null
          setting_key: string
          setting_scope: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          new_value: Json
          office_id?: string | null
          old_value?: Json | null
          requested_by?: string | null
          setting_key: string
          setting_scope: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          new_value?: Json
          office_id?: string | null
          old_value?: Json | null
          requested_by?: string | null
          setting_key?: string
          setting_scope?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_change_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_change_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_change_requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_versions: {
        Row: {
          change_request_id: string | null
          changed_by: string | null
          company_id: string | null
          created_at: string
          id: string
          office_id: string | null
          setting_key: string
          setting_scope: string
          value: Json
          version: number
        }
        Insert: {
          change_request_id?: string | null
          changed_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          office_id?: string | null
          setting_key: string
          setting_scope: string
          value: Json
          version: number
        }
        Update: {
          change_request_id?: string | null
          changed_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          office_id?: string | null
          setting_key?: string
          setting_scope?: string
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "settings_versions_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "settings_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_versions_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          is_sensitive: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_sensitive?: boolean
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_sensitive?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tenant_contacts: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          phone: string | null
          relationship: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          relationship?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          relationship?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_documents: {
        Row: {
          attachment_id: string | null
          company_id: string
          created_at: string
          document_type_id: string | null
          expires_at: string | null
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attachment_id?: string | null
          company_id: string
          created_at?: string
          document_type_id?: string | null
          expires_at?: string | null
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string | null
          company_id?: string
          created_at?: string
          document_type_id?: string | null
          expires_at?: string | null
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_documents_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ledger_entries: {
        Row: {
          amount: number
          balance_after: number | null
          company_id: string
          created_at: string
          description: string | null
          entry_type: string
          id: string
          lease_id: string | null
          office_id: string
          source_id: string | null
          source_type: string
          tenant_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          company_id: string
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          lease_id?: string | null
          office_id: string
          source_id?: string | null
          source_type: string
          tenant_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          company_id?: string
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          lease_id?: string | null
          office_id?: string
          source_id?: string | null
          source_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_entries_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_entries_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          alternative_phone: string | null
          balance: number | null
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          monthly_rent: number | null
          national_id: string | null
          office_id: string | null
          phone: string | null
          property_id: string | null
          reliability_score: number | null
          risk_score: number | null
          room_id: string | null
          status: string | null
          tenant_reliability_score: number | null
          tenant_risk_level: string | null
          tenant_score_reason: string | null
          tenant_score_updated_at: string | null
          tenant_code: string | null
          tenant_type: string | null
          updated_at: string | null
        }
        Insert: {
          alternative_phone?: string | null
          balance?: number | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          monthly_rent?: number | null
          national_id?: string | null
          office_id?: string | null
          phone?: string | null
          property_id?: string | null
          reliability_score?: number | null
          risk_score?: number | null
          room_id?: string | null
          status?: string | null
          tenant_reliability_score?: number | null
          tenant_risk_level?: string | null
          tenant_score_reason?: string | null
          tenant_score_updated_at?: string | null
          tenant_code?: string | null
          tenant_type?: string | null
          updated_at?: string | null
        }
        Update: {
          alternative_phone?: string | null
          balance?: number | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          monthly_rent?: number | null
          national_id?: string | null
          office_id?: string | null
          phone?: string | null
          property_id?: string | null
          reliability_score?: number | null
          risk_score?: number | null
          room_id?: string | null
          status?: string | null
          tenant_reliability_score?: number | null
          tenant_risk_level?: string | null
          tenant_score_reason?: string | null
          tenant_score_updated_at?: string | null
          tenant_code?: string | null
          tenant_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_reconciliation_exceptions: {
        Row: {
          company_id: string
          created_at: string
          exception_type: string
          external_transaction_id: string
          id: string
          notes: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          exception_type: string
          external_transaction_id: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          exception_type?: string
          external_transaction_id?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_reconciliation_excepti_external_transaction_id_fkey"
            columns: ["external_transaction_id"]
            isOneToOne: false
            referencedRelation: "external_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reconciliation_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_reconciliation_matches: {
        Row: {
          cash_transaction_id: string | null
          company_id: string
          confidence: number | null
          external_transaction_id: string
          id: string
          match_type: string
          matched_at: string
          matched_by: string | null
          payment_id: string | null
        }
        Insert: {
          cash_transaction_id?: string | null
          company_id: string
          confidence?: number | null
          external_transaction_id: string
          id?: string
          match_type: string
          matched_at?: string
          matched_by?: string | null
          payment_id?: string | null
        }
        Update: {
          cash_transaction_id?: string | null
          company_id?: string
          confidence?: number | null
          external_transaction_id?: string
          id?: string
          match_type?: string
          matched_at?: string
          matched_by?: string | null
          payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_reconciliation_matches_cash_transaction_id_fkey"
            columns: ["cash_transaction_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reconciliation_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reconciliation_matches_external_transaction_id_fkey"
            columns: ["external_transaction_id"]
            isOneToOne: false
            referencedRelation: "external_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reconciliation_matches_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reconciliation_matches_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          last_seen_at: string | null
          platform: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          last_seen_at?: string | null
          platform?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string | null
          platform?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_office_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          office_id: string | null
          role_id: string
          scope: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          office_id?: string | null
          role_id: string
          scope?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string | null
          role_id?: string
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_office_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_office_roles_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_office_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_office_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          company_id: string
          created_at: string
          default_office_id: string | null
          email: string | null
          employee_code: string | null
          full_name: string
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_office_id?: string | null
          email?: string | null
          employee_code?: string | null
          full_name: string
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_office_id?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_default_office_id_fkey"
            columns: ["default_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_approvals: {
        Row: {
          action: string
          approver_id: string | null
          company_id: string
          created_at: string
          id: string
          notes: string | null
          withdrawal_request_id: string
        }
        Insert: {
          action: string
          approver_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          withdrawal_request_id: string
        }
        Update: {
          action?: string
          approver_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          withdrawal_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_approvals_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          cash_account_id: string
          company_id: string
          created_at: string
          id: string
          office_id: string | null
          purpose: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          cash_account_id: string
          company_id: string
          created_at?: string
          id?: string
          office_id?: string | null
          purpose: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cash_account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          office_id?: string | null
          purpose?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          schedule: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          schedule?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          schedule?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ddumba_v1_can_access_entity: {
        Args: { entity_company_id: string; entity_office_id: string }
        Returns: boolean
      }
      ddumba_v1_can_access_office: {
        Args: { target_office_id: string }
        Returns: boolean
      }
      ddumba_v1_current_company_id: { Args: never; Returns: string }
      ddumba_v1_has_permission: {
        Args: { permission_key: string }
        Returns: boolean
      }
      ddumba_v1_is_company_admin: { Args: never; Returns: boolean }
      ddumba_v1_is_service_role: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
