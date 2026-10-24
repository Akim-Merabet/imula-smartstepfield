export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          auto_lock_form_responses: boolean
          city: string | null
          contact_email: string | null
          country: string | null
          cover_logo: Json | null
          created_at: string
          date_formats: Json
          default_phase_type: string
          default_sequence_type: string
          doc_index_format: Database["public"]["Enums"]["index_format"]
          doc_language_1: Database["public"]["Enums"]["export_language"]
          doc_language_2: Database["public"]["Enums"]["export_language"]
          doc_watermark: string | null
          fax: string | null
          file_module_enabled: boolean
          freeze_signature_date: boolean
          full_name: string | null
          hide_multi_pr_titles: boolean
          id: string
          local_form_creation: boolean
          logo_path: string | null
          name: string
          organization_id: string
          pgac_enabled: boolean
          pgac_subcontractors: string[]
          phone: string | null
          postal_code: string | null
          time_zone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          auto_lock_form_responses?: boolean
          city?: string | null
          contact_email?: string | null
          country?: string | null
          cover_logo?: Json | null
          created_at?: string
          date_formats?: Json
          default_phase_type?: string
          default_sequence_type?: string
          doc_index_format?: Database["public"]["Enums"]["index_format"]
          doc_language_1?: Database["public"]["Enums"]["export_language"]
          doc_language_2?: Database["public"]["Enums"]["export_language"]
          doc_watermark?: string | null
          fax?: string | null
          file_module_enabled?: boolean
          freeze_signature_date?: boolean
          full_name?: string | null
          hide_multi_pr_titles?: boolean
          id?: string
          local_form_creation?: boolean
          logo_path?: string | null
          name: string
          organization_id: string
          pgac_enabled?: boolean
          pgac_subcontractors?: string[]
          phone?: string | null
          postal_code?: string | null
          time_zone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          auto_lock_form_responses?: boolean
          city?: string | null
          contact_email?: string | null
          country?: string | null
          cover_logo?: Json | null
          created_at?: string
          date_formats?: Json
          default_phase_type?: string
          default_sequence_type?: string
          doc_index_format?: Database["public"]["Enums"]["index_format"]
          doc_language_1?: Database["public"]["Enums"]["export_language"]
          doc_language_2?: Database["public"]["Enums"]["export_language"]
          doc_watermark?: string | null
          fax?: string | null
          file_module_enabled?: boolean
          freeze_signature_date?: boolean
          full_name?: string | null
          hide_multi_pr_titles?: boolean
          id?: string
          local_form_creation?: boolean
          logo_path?: string | null
          name?: string
          organization_id?: string
          pgac_enabled?: boolean
          pgac_subcontractors?: string[]
          phone?: string | null
          postal_code?: string | null
          time_zone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_access_tokens: {
        Row: {
          api_client_id: string
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          api_client_id: string
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          api_client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_access_tokens_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_client_secrets: {
        Row: {
          api_client_id: string
          created_at: string
          secret_hash: string
        }
        Insert: {
          api_client_id: string
          created_at?: string
          secret_hash: string
        }
        Update: {
          api_client_id?: string
          created_at?: string
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_client_secrets_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: true
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_clients: {
        Row: {
          account_id: string | null
          active: boolean
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_type: Database["public"]["Enums"]["api_key_type"]
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          secret_rotated_at: string | null
          service_class: Database["public"]["Enums"]["api_service_class"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_type: Database["public"]["Enums"]["api_key_type"]
          last_used_at?: string | null
          name: string
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          secret_rotated_at?: string | null
          service_class?: Database["public"]["Enums"]["api_service_class"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          active?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_type?: Database["public"]["Enums"]["api_key_type"]
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          secret_rotated_at?: string | null
          service_class?: Database["public"]["Enums"]["api_service_class"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clients_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clients_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          account_id: string | null
          api_client_id: string | null
          created_at: string
          duration_ms: number
          error_key: string | null
          id: number
          ip: string | null
          method: string
          organization_id: string | null
          path: string
          query_keys: string[]
          status: number
          user_agent: string | null
        }
        Insert: {
          account_id?: string | null
          api_client_id?: string | null
          created_at?: string
          duration_ms?: number
          error_key?: string | null
          id?: never
          ip?: string | null
          method: string
          organization_id?: string | null
          path: string
          query_keys?: string[]
          status: number
          user_agent?: string | null
        }
        Update: {
          account_id?: string | null
          api_client_id?: string | null
          created_at?: string
          duration_ms?: number
          error_key?: string | null
          id?: never
          ip?: string | null
          method?: string
          organization_id?: string | null
          path?: string
          query_keys?: string[]
          status?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      async_jobs: {
        Row: {
          account_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          params: Json
          project_id: string | null
          requested_by: string | null
          result: Json | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          account_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          params?: Json
          project_id?: string | null
          requested_by?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          account_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          params?: Json
          project_id?: string | null
          requested_by?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "async_jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "async_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "async_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      authorized_devices: {
        Row: {
          created_at: string
          designation: string
          device_id: string
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          designation: string
          device_id: string
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          designation?: string
          device_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorized_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      background_tasks: {
        Row: {
          account_id: string
          attempts: number
          created_at: string
          error: string | null
          file_type: string | null
          finished_at: string | null
          id: string
          kind: string
          metadata: Json
          name: string | null
          project_id: string | null
          result_path: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["bg_task_status"]
          user_id: string | null
        }
        Insert: {
          account_id: string
          attempts?: number
          created_at?: string
          error?: string | null
          file_type?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          metadata?: Json
          name?: string | null
          project_id?: string | null
          result_path?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["bg_task_status"]
          user_id?: string | null
        }
        Update: {
          account_id?: string
          attempts?: number
          created_at?: string
          error?: string | null
          file_type?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name?: string | null
          project_id?: string | null
          result_path?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["bg_task_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "background_tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      block_adr_items: {
        Row: {
          block_id: string
          disabled: boolean
          flow_id: string
          id: string
          library_risk_id: string
          major: boolean
          position: number
        }
        Insert: {
          block_id: string
          disabled?: boolean
          flow_id: string
          id?: string
          library_risk_id: string
          major?: boolean
          position?: number
        }
        Update: {
          block_id?: string
          disabled?: boolean
          flow_id?: string
          id?: string
          library_risk_id?: string
          major?: boolean
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_adr_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_adr_items_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_adr_items_library_risk_id_fkey"
            columns: ["library_risk_id"]
            isOneToOne: false
            referencedRelation: "library_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      block_adr_specific_parades: {
        Row: {
          block_adr_item_id: string
          file_path: string | null
          flow_id: string
          id: string
          name: string
          pictogram: number | null
          position: number
        }
        Insert: {
          block_adr_item_id: string
          file_path?: string | null
          flow_id: string
          id?: string
          name: string
          pictogram?: number | null
          position?: number
        }
        Update: {
          block_adr_item_id?: string
          file_path?: string | null
          flow_id?: string
          id?: string
          name?: string
          pictogram?: number | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_adr_specific_parades_block_adr_item_id_fkey"
            columns: ["block_adr_item_id"]
            isOneToOne: false
            referencedRelation: "block_adr_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_adr_specific_parades_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      block_documents: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          block_id: string
          document_id: string | null
          flow_id: string
          frozen_version_id: string | null
          id: string
          is_attachment: boolean
          pinned_version_id: string | null
          position: number
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          block_id: string
          document_id?: string | null
          flow_id: string
          frozen_version_id?: string | null
          id?: string
          is_attachment?: boolean
          pinned_version_id?: string | null
          position?: number
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          block_id?: string
          document_id?: string | null
          flow_id?: string
          frozen_version_id?: string | null
          id?: string
          is_attachment?: boolean
          pinned_version_id?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_documents_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_documents_document_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_documents_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_documents_frozen_version_fkey"
            columns: ["frozen_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_documents_pinned_version_fkey"
            columns: ["pinned_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      block_dsi_configs: {
        Row: {
          aip: boolean
          block_id: string
          breakpoint_ext_1: boolean
          breakpoint_ext_2: boolean
          breakpoint_ext_3: boolean
          breakpoint_int_1: boolean
          breakpoint_int_2: boolean
          breakpoint_int_3: boolean
          convocation_ext_1: boolean
          convocation_ext_2: boolean
          convocation_ext_3: boolean
          convocation_int_1: boolean
          convocation_int_2: boolean
          convocation_int_3: boolean
          document_reference: string | null
          document_required: boolean
          flow_id: string
          observation: string | null
          signatories_status: Database["public"]["Enums"]["dsi_signatories_status"]
          signatory_disabled_comment: string | null
          technical_control: boolean
          technical_control_details: string | null
          technical_control_step: boolean
        }
        Insert: {
          aip?: boolean
          block_id: string
          breakpoint_ext_1?: boolean
          breakpoint_ext_2?: boolean
          breakpoint_ext_3?: boolean
          breakpoint_int_1?: boolean
          breakpoint_int_2?: boolean
          breakpoint_int_3?: boolean
          convocation_ext_1?: boolean
          convocation_ext_2?: boolean
          convocation_ext_3?: boolean
          convocation_int_1?: boolean
          convocation_int_2?: boolean
          convocation_int_3?: boolean
          document_reference?: string | null
          document_required?: boolean
          flow_id: string
          observation?: string | null
          signatories_status?: Database["public"]["Enums"]["dsi_signatories_status"]
          signatory_disabled_comment?: string | null
          technical_control?: boolean
          technical_control_details?: string | null
          technical_control_step?: boolean
        }
        Update: {
          aip?: boolean
          block_id?: string
          breakpoint_ext_1?: boolean
          breakpoint_ext_2?: boolean
          breakpoint_ext_3?: boolean
          breakpoint_int_1?: boolean
          breakpoint_int_2?: boolean
          breakpoint_int_3?: boolean
          convocation_ext_1?: boolean
          convocation_ext_2?: boolean
          convocation_ext_3?: boolean
          convocation_int_1?: boolean
          convocation_int_2?: boolean
          convocation_int_3?: boolean
          document_reference?: string | null
          document_required?: boolean
          flow_id?: string
          observation?: string | null
          signatories_status?: Database["public"]["Enums"]["dsi_signatories_status"]
          signatory_disabled_comment?: string | null
          technical_control?: boolean
          technical_control_details?: string | null
          technical_control_step?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "block_dsi_configs_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: true
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_dsi_configs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      block_emm_items: {
        Row: {
          block_id: string
          comment: string | null
          consumable: boolean
          disabled: boolean
          display_comment: boolean
          family_id: string | null
          flow_id: string
          id: string
          library_equipment_id: string | null
          name: string
          position: number
          provider: string | null
          quantity: number | null
          reference: string | null
          unit: string | null
        }
        Insert: {
          block_id: string
          comment?: string | null
          consumable?: boolean
          disabled?: boolean
          display_comment?: boolean
          family_id?: string | null
          flow_id: string
          id?: string
          library_equipment_id?: string | null
          name: string
          position?: number
          provider?: string | null
          quantity?: number | null
          reference?: string | null
          unit?: string | null
        }
        Update: {
          block_id?: string
          comment?: string | null
          consumable?: boolean
          disabled?: boolean
          display_comment?: boolean
          family_id?: string | null
          flow_id?: string
          id?: string
          library_equipment_id?: string | null
          name?: string
          position?: number
          provider?: string | null
          quantity?: number | null
          reference?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_emm_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_emm_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_emm_items_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_emm_items_library_equipment_id_fkey"
            columns: ["library_equipment_id"]
            isOneToOne: false
            referencedRelation: "library_equipments"
            referencedColumns: ["id"]
          },
        ]
      }
      block_multi_pr_events: {
        Row: {
          action: string
          actor_id: string | null
          block_id: string
          comment: string | null
          flow_id: string
          from_status_id: string | null
          id: number
          item_id: string | null
          occurred_at: string
          source: Database["public"]["Enums"]["event_source"]
          to_status_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          block_id: string
          comment?: string | null
          flow_id: string
          from_status_id?: string | null
          id?: never
          item_id?: string | null
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_status_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          block_id?: string
          comment?: string | null
          flow_id?: string
          from_status_id?: string | null
          id?: never
          item_id?: string | null
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_status_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_multi_pr_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_events_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      block_multi_pr_items: {
        Row: {
          block_id: string
          content_html: string | null
          content_json: Json | null
          custom_status_id: string | null
          disabled: boolean
          flow_id: string
          hide_on_export: boolean
          id: string
          observation: string | null
          position: number
          title: string | null
          title_auto_filled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          block_id: string
          content_html?: string | null
          content_json?: Json | null
          custom_status_id?: string | null
          disabled?: boolean
          flow_id: string
          hide_on_export?: boolean
          id?: string
          observation?: string | null
          position: number
          title?: string | null
          title_auto_filled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          block_id?: string
          content_html?: string | null
          content_json?: Json | null
          custom_status_id?: string | null
          disabled?: boolean
          flow_id?: string
          hide_on_export?: boolean
          id?: string
          observation?: string | null
          position?: number
          title?: string | null
          title_auto_filled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_multi_pr_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_items_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_items_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      block_multi_pr_signatures: {
        Row: {
          flow_id: string
          id: string
          item_id: string
          signatory_id: string | null
          signature_path: string | null
          signed_at: string
          source: Database["public"]["Enums"]["event_source"]
        }
        Insert: {
          flow_id: string
          id?: string
          item_id: string
          signatory_id?: string | null
          signature_path?: string | null
          signed_at?: string
          source?: Database["public"]["Enums"]["event_source"]
        }
        Update: {
          flow_id?: string
          id?: string
          item_id?: string
          signatory_id?: string | null
          signature_path?: string | null
          signed_at?: string
          source?: Database["public"]["Enums"]["event_source"]
        }
        Relationships: [
          {
            foreignKeyName: "block_multi_pr_signatures_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_signatures_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "block_multi_pr_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_multi_pr_signatures_signatory_id_fkey"
            columns: ["signatory_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      block_object_items: {
        Row: {
          block_id: string
          flow_id: string
          id: string
          position: number
          technical_object_id: string
        }
        Insert: {
          block_id: string
          flow_id: string
          id?: string
          position?: number
          technical_object_id: string
        }
        Update: {
          block_id?: string
          flow_id?: string
          id?: string
          position?: number
          technical_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_object_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_object_items_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_object_items_technical_object_id_fkey"
            columns: ["technical_object_id"]
            isOneToOne: false
            referencedRelation: "technical_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      block_rhp_item_skills: {
        Row: {
          item_id: string
          skill_family_id: string
        }
        Insert: {
          item_id: string
          skill_family_id: string
        }
        Update: {
          item_id?: string
          skill_family_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_rhp_item_skills_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "block_rhp_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_rhp_item_skills_skill_family_id_fkey"
            columns: ["skill_family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      block_rhp_items: {
        Row: {
          block_id: string
          count: number
          disabled: boolean
          flow_id: string
          function_family_id: string
          id: string
          observation: string | null
          position: number
        }
        Insert: {
          block_id: string
          count: number
          disabled?: boolean
          flow_id: string
          function_family_id: string
          id?: string
          observation?: string | null
          position?: number
        }
        Update: {
          block_id?: string
          count?: number
          disabled?: boolean
          flow_id?: string
          function_family_id?: string
          id?: string
          observation?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_rhp_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_rhp_items_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_rhp_items_function_family_id_fkey"
            columns: ["function_family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      block_state_events: {
        Row: {
          action: Database["public"]["Enums"]["block_validation_action"]
          actor_id: string | null
          block_id: string
          comment: string | null
          flow_id: string
          from_state: Database["public"]["Enums"]["block_state"] | null
          id: number
          occurred_at: string
          source: Database["public"]["Enums"]["event_source"]
          to_state: Database["public"]["Enums"]["block_state"]
        }
        Insert: {
          action: Database["public"]["Enums"]["block_validation_action"]
          actor_id?: string | null
          block_id: string
          comment?: string | null
          flow_id: string
          from_state?: Database["public"]["Enums"]["block_state"] | null
          id?: never
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_state: Database["public"]["Enums"]["block_state"]
        }
        Update: {
          action?: Database["public"]["Enums"]["block_validation_action"]
          actor_id?: string | null
          block_id?: string
          comment?: string | null
          flow_id?: string
          from_state?: Database["public"]["Enums"]["block_state"] | null
          id?: never
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_state?: Database["public"]["Enums"]["block_state"]
        }
        Relationships: [
          {
            foreignKeyName: "block_state_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_state_events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_state_events_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          content_html: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          enabled: boolean
          flow_id: string
          id: string
          multi_pr_requires_signature: boolean
          multi_pr_requires_status: boolean
          multi_pr_title_hidden: boolean
          redacted_at: string | null
          redactor_id: string | null
          ref_ext: string | null
          ref_int: string | null
          revision: number | null
          state: Database["public"]["Enums"]["block_state"]
          step_id: string
          txt_visibility: Database["public"]["Enums"]["txt_visibility"] | null
          type: Database["public"]["Enums"]["block_type"]
          updated_at: string
          updated_by: string | null
          validated_at: string | null
          validator_id: string | null
          verified_at: string | null
          verifier_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          flow_id: string
          id?: string
          multi_pr_requires_signature?: boolean
          multi_pr_requires_status?: boolean
          multi_pr_title_hidden?: boolean
          redacted_at?: string | null
          redactor_id?: string | null
          ref_ext?: string | null
          ref_int?: string | null
          revision?: number | null
          state?: Database["public"]["Enums"]["block_state"]
          step_id: string
          txt_visibility?: Database["public"]["Enums"]["txt_visibility"] | null
          type: Database["public"]["Enums"]["block_type"]
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validator_id?: string | null
          verified_at?: string | null
          verifier_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          flow_id?: string
          id?: string
          multi_pr_requires_signature?: boolean
          multi_pr_requires_status?: boolean
          multi_pr_title_hidden?: boolean
          redacted_at?: string | null
          redactor_id?: string | null
          ref_ext?: string | null
          ref_int?: string | null
          revision?: number | null
          state?: Database["public"]["Enums"]["block_state"]
          step_id?: string
          txt_visibility?: Database["public"]["Enums"]["txt_visibility"] | null
          type?: Database["public"]["Enums"]["block_type"]
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validator_id?: string | null
          verified_at?: string | null
          verifier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_redactor_id_fkey"
            columns: ["redactor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_validator_id_fkey"
            columns: ["validator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_id: string
          address: string
          address_comp: string | null
          city: string
          country: string | null
          cover_page_enabled: boolean
          cover_page_pdf_path: string | null
          created_at: string
          id: string
          index_max: number | null
          logo_path: string | null
          name: string
          name_2: string | null
          name_3: string | null
          observation: string | null
          page_number_x: number | null
          page_number_y: number | null
          reference: string | null
          updated_at: string
          zip_code: string
        }
        Insert: {
          account_id: string
          address: string
          address_comp?: string | null
          city: string
          country?: string | null
          cover_page_enabled?: boolean
          cover_page_pdf_path?: string | null
          created_at?: string
          id?: string
          index_max?: number | null
          logo_path?: string | null
          name: string
          name_2?: string | null
          name_3?: string | null
          observation?: string | null
          page_number_x?: number | null
          page_number_y?: number | null
          reference?: string | null
          updated_at?: string
          zip_code: string
        }
        Update: {
          account_id?: string
          address?: string
          address_comp?: string | null
          city?: string
          country?: string | null
          cover_page_enabled?: boolean
          cover_page_pdf_path?: string | null
          created_at?: string
          id?: string
          index_max?: number | null
          logo_path?: string | null
          name?: string
          name_2?: string | null
          name_3?: string | null
          observation?: string | null
          page_number_x?: number | null
          page_number_y?: number | null
          reference?: string | null
          updated_at?: string
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_folder_templates: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_folder_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_section_items: {
        Row: {
          added_at: string
          document_id: string | null
          emm_element_id: string | null
          id: string
          position: number
          section_id: string
          version_id: string | null
        }
        Insert: {
          added_at?: string
          document_id?: string | null
          emm_element_id?: string | null
          id?: string
          position?: number
          section_id: string
          version_id?: string | null
        }
        Update: {
          added_at?: string
          document_id?: string | null
          emm_element_id?: string | null
          id?: string
          position?: number
          section_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closing_section_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_section_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "closing_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_section_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_section_templates: {
        Row: {
          all_emm_elements: boolean
          category_id: string | null
          description: string | null
          folder_template_id: string
          id: string
          include_previous_versions: boolean
          name: string
          position: number
          type: Database["public"]["Enums"]["closing_section_type"]
        }
        Insert: {
          all_emm_elements?: boolean
          category_id?: string | null
          description?: string | null
          folder_template_id: string
          id?: string
          include_previous_versions?: boolean
          name: string
          position?: number
          type: Database["public"]["Enums"]["closing_section_type"]
        }
        Update: {
          all_emm_elements?: boolean
          category_id?: string | null
          description?: string | null
          folder_template_id?: string
          id?: string
          include_previous_versions?: boolean
          name?: string
          position?: number
          type?: Database["public"]["Enums"]["closing_section_type"]
        }
        Relationships: [
          {
            foreignKeyName: "closing_section_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_section_templates_folder_template_id_fkey"
            columns: ["folder_template_id"]
            isOneToOne: false
            referencedRelation: "closing_folder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_sections: {
        Row: {
          all_emm_elements: boolean
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          disabled: boolean
          flow_id: string | null
          folder_document_id: string
          id: string
          include_previous_versions: boolean
          last_generated_at: string | null
          name: string
          observation: string | null
          position: number
          sort_mode: number | null
          type: Database["public"]["Enums"]["closing_section_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          all_emm_elements?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled?: boolean
          flow_id?: string | null
          folder_document_id: string
          id?: string
          include_previous_versions?: boolean
          last_generated_at?: string | null
          name: string
          observation?: string | null
          position?: number
          sort_mode?: number | null
          type: Database["public"]["Enums"]["closing_section_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          all_emm_elements?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled?: boolean
          flow_id?: string | null
          folder_document_id?: string
          id?: string
          include_previous_versions?: boolean
          last_generated_at?: string | null
          name?: string
          observation?: string | null
          position?: number
          sort_mode?: number | null
          type?: Database["public"]["Enums"]["closing_section_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closing_sections_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_sections_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_sections_folder_document_id_fkey"
            columns: ["folder_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_default_hierarchies: {
        Row: {
          collaborator_id: string
          hierarchy_id: string
        }
        Insert: {
          collaborator_id: string
          hierarchy_id: string
        }
        Update: {
          collaborator_id?: string
          hierarchy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_default_hierarchies_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_default_hierarchies_hierarchy_id_fkey"
            columns: ["hierarchy_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_skills: {
        Row: {
          activity_domain_id: string | null
          archived: boolean
          business_updated_at: string | null
          collaborator_id: string
          comment: string | null
          created_at: string
          description: string | null
          ended_at: string | null
          expertise: number | null
          file_paths: string[]
          id: string
          skill_id: string
          sort_order: number
          started_at: string | null
          updated_at: string
        }
        Insert: {
          activity_domain_id?: string | null
          archived?: boolean
          business_updated_at?: string | null
          collaborator_id: string
          comment?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          expertise?: number | null
          file_paths?: string[]
          id?: string
          skill_id: string
          sort_order?: number
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          activity_domain_id?: string | null
          archived?: boolean
          business_updated_at?: string | null
          collaborator_id?: string
          comment?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          expertise?: number | null
          file_paths?: string[]
          id?: string
          skill_id?: string
          sort_order?: number
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_skills_activity_domain_id_fkey"
            columns: ["activity_domain_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_skills_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          account_id: string
          additional_rights: Database["public"]["Enums"]["additional_right"][]
          auth_user_id: string | null
          authority: Database["public"]["Enums"]["authority"] | null
          avatar_path: string | null
          company_id: string | null
          complement: string | null
          contract_type_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          function_id: string | null
          group_id: string | null
          id: string
          kind: Database["public"]["Enums"]["collaborator_kind"]
          language: Database["public"]["Enums"]["ui_language"]
          last_name: string
          last_sign_in_at: string | null
          legal_id: string | null
          organization_id: string
          privacy_accepted_at: string | null
          profession: string | null
          register_number: string | null
          signature_path: string | null
          sso_identifier: string | null
          status: Database["public"]["Enums"]["collaborator_status"]
          trigram: string
          updated_at: string
        }
        Insert: {
          account_id: string
          additional_rights?: Database["public"]["Enums"]["additional_right"][]
          auth_user_id?: string | null
          authority?: Database["public"]["Enums"]["authority"] | null
          avatar_path?: string | null
          company_id?: string | null
          complement?: string | null
          contract_type_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          function_id?: string | null
          group_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["collaborator_kind"]
          language?: Database["public"]["Enums"]["ui_language"]
          last_name: string
          last_sign_in_at?: string | null
          legal_id?: string | null
          organization_id: string
          privacy_accepted_at?: string | null
          profession?: string | null
          register_number?: string | null
          signature_path?: string | null
          sso_identifier?: string | null
          status?: Database["public"]["Enums"]["collaborator_status"]
          trigram: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          additional_rights?: Database["public"]["Enums"]["additional_right"][]
          auth_user_id?: string | null
          authority?: Database["public"]["Enums"]["authority"] | null
          avatar_path?: string | null
          company_id?: string | null
          complement?: string | null
          contract_type_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          function_id?: string | null
          group_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["collaborator_kind"]
          language?: Database["public"]["Enums"]["ui_language"]
          last_name?: string
          last_sign_in_at?: string | null
          legal_id?: string | null
          organization_id?: string
          privacy_accepted_at?: string | null
          profession?: string | null
          register_number?: string | null
          signature_path?: string | null
          sso_identifier?: string | null
          status?: Database["public"]["Enums"]["collaborator_status"]
          trigram?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_legal_id_fkey"
            columns: ["legal_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          account_id: string | null
          activity_area: string | null
          comment: string | null
          created_at: string
          id: string
          is_parent_company: boolean
          logo_path: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          activity_area?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_parent_company?: boolean
          logo_path?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          activity_area?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_parent_company?: boolean
          logo_path?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_value_history: {
        Row: {
          account_id: string
          business_class: Database["public"]["Enums"]["business_class"]
          changed_at: string
          changed_by: string | null
          custom_field_id: string
          id: string
          new_value_json: Json | null
          new_value_text: string | null
          object_id: string
          old_value_json: Json | null
          old_value_text: string | null
          response_id: string | null
          source: string
        }
        Insert: {
          account_id: string
          business_class: Database["public"]["Enums"]["business_class"]
          changed_at?: string
          changed_by?: string | null
          custom_field_id: string
          id?: string
          new_value_json?: Json | null
          new_value_text?: string | null
          object_id: string
          old_value_json?: Json | null
          old_value_text?: string | null
          response_id?: string | null
          source?: string
        }
        Update: {
          account_id?: string
          business_class?: Database["public"]["Enums"]["business_class"]
          changed_at?: string
          changed_by?: string | null
          custom_field_id?: string
          id?: string
          new_value_json?: Json | null
          new_value_text?: string | null
          object_id?: string
          old_value_json?: Json | null
          old_value_text?: string | null
          response_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_value_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_value_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_value_history_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_value_history_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          account_id: string
          business_class: Database["public"]["Enums"]["business_class"]
          custom_field_id: string
          flow_id: string | null
          object_id: string
          project_id: string | null
          updated_at: string
          updated_by: string | null
          value_json: Json | null
          value_text: string | null
        }
        Insert: {
          account_id: string
          business_class: Database["public"]["Enums"]["business_class"]
          custom_field_id: string
          flow_id?: string | null
          object_id: string
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
          value_text?: string | null
        }
        Update: {
          account_id?: string
          business_class?: Database["public"]["Enums"]["business_class"]
          custom_field_id?: string
          flow_id?: string | null
          object_id?: string
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          account_id: string
          active: boolean
          choices: string[]
          created_at: string
          default_value: string | null
          deleted_at: string | null
          description: string | null
          display_in_flow_banner: boolean
          display_in_flow_card: boolean
          display_on_flow_opening: boolean
          id: string
          label_family_id: string | null
          link_type: Database["public"]["Enums"]["link_type"]
          name: string
          nature: Database["public"]["Enums"]["business_class"]
          pdf_field_name: string | null
          placeholder: string | null
          read_only: boolean
          required: boolean
          sort_order: number
          text_display: string | null
          tooltip: string | null
          type: Database["public"]["Enums"]["custom_field_type"]
          updated_at: string
          variable_name: string | null
        }
        Insert: {
          account_id: string
          active?: boolean
          choices?: string[]
          created_at?: string
          default_value?: string | null
          deleted_at?: string | null
          description?: string | null
          display_in_flow_banner?: boolean
          display_in_flow_card?: boolean
          display_on_flow_opening?: boolean
          id?: string
          label_family_id?: string | null
          link_type?: Database["public"]["Enums"]["link_type"]
          name: string
          nature: Database["public"]["Enums"]["business_class"]
          pdf_field_name?: string | null
          placeholder?: string | null
          read_only?: boolean
          required?: boolean
          sort_order?: number
          text_display?: string | null
          tooltip?: string | null
          type: Database["public"]["Enums"]["custom_field_type"]
          updated_at?: string
          variable_name?: string | null
        }
        Update: {
          account_id?: string
          active?: boolean
          choices?: string[]
          created_at?: string
          default_value?: string | null
          deleted_at?: string | null
          description?: string | null
          display_in_flow_banner?: boolean
          display_in_flow_card?: boolean
          display_on_flow_opening?: boolean
          id?: string
          label_family_id?: string | null
          link_type?: Database["public"]["Enums"]["link_type"]
          name?: string
          nature?: Database["public"]["Enums"]["business_class"]
          pdf_field_name?: string | null
          placeholder?: string | null
          read_only?: boolean
          required?: boolean
          sort_order?: number
          text_display?: string | null
          tooltip?: string | null
          type?: Database["public"]["Enums"]["custom_field_type"]
          updated_at?: string
          variable_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_fields_label_family_id_fkey"
            columns: ["label_family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_statuses: {
        Row: {
          account_id: string | null
          active: boolean
          category: Database["public"]["Enums"]["status_category"]
          color: string
          created_at: string
          description: string | null
          downloadable: boolean
          exportable: boolean
          hide_entity: boolean
          id: string
          importable: boolean
          is_default: boolean
          label_family_id: string | null
          link_type: Database["public"]["Enums"]["link_type"]
          name: string
          nature: Database["public"]["Enums"]["business_class"]
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          category?: Database["public"]["Enums"]["status_category"]
          color?: string
          created_at?: string
          description?: string | null
          downloadable?: boolean
          exportable?: boolean
          hide_entity?: boolean
          id?: string
          importable?: boolean
          is_default?: boolean
          label_family_id?: string | null
          link_type?: Database["public"]["Enums"]["link_type"]
          name: string
          nature: Database["public"]["Enums"]["business_class"]
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          category?: Database["public"]["Enums"]["status_category"]
          color?: string
          created_at?: string
          description?: string | null
          downloadable?: boolean
          exportable?: boolean
          hide_entity?: boolean
          id?: string
          importable?: boolean
          is_default?: boolean
          label_family_id?: string | null
          link_type?: Database["public"]["Enums"]["link_type"]
          name?: string
          nature?: Database["public"]["Enums"]["business_class"]
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_statuses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_statuses_label_family_id_fkey"
            columns: ["label_family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      diagram_flows: {
        Row: {
          diagram_id: string
          flow_id: string
        }
        Insert: {
          diagram_id: string
          flow_id: string
        }
        Update: {
          diagram_id?: string
          flow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagram_flows_diagram_id_fkey"
            columns: ["diagram_id"]
            isOneToOne: false
            referencedRelation: "diagrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagram_flows_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      diagrams: {
        Row: {
          config: Json
          created_at: string
          document_id: string | null
          id: string
          kind: string
          name: string
          project_id: string
          read_only: boolean
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          document_id?: string | null
          id?: string
          kind?: string
          name: string
          project_id: string
          read_only?: boolean
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          document_id?: string | null
          id?: string
          kind?: string
          name?: string
          project_id?: string
          read_only?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagrams_document_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagrams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_files: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          name: string
          position: number
          size: number
          storage_path: string
          version_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          name: string
          position?: number
          size: number
          storage_path: string
          version_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          name?: string
          position?: number
          size?: number
          storage_path?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_selections: {
        Row: {
          document_id: string
          kind: Database["public"]["Enums"]["document_selection_kind"]
          position: number
          ref_id: string
        }
        Insert: {
          document_id: string
          kind: Database["public"]["Enums"]["document_selection_kind"]
          position?: number
          ref_id: string
        }
        Update: {
          document_id?: string
          kind?: Database["public"]["Enums"]["document_selection_kind"]
          position?: number
          ref_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_selections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_shares: {
        Row: {
          blocked: boolean
          code_attempts: number
          code_expires_at: string | null
          code_hash: string | null
          code_sent_at: string | null
          comment: string | null
          contributor: Json | null
          created_at: string
          document_id: string
          downloaded_at: string | null
          email: string
          expires_at: string
          external_user_id: string | null
          id: string
          language: Database["public"]["Enums"]["ui_language"]
          last_access_at: string | null
          organization_id: string
          project_id: string
          revoked_at: string | null
          sent_at: string | null
          sent_by: string | null
          token_hash: string
          version_id: string | null
        }
        Insert: {
          blocked?: boolean
          code_attempts?: number
          code_expires_at?: string | null
          code_hash?: string | null
          code_sent_at?: string | null
          comment?: string | null
          contributor?: Json | null
          created_at?: string
          document_id: string
          downloaded_at?: string | null
          email: string
          expires_at: string
          external_user_id?: string | null
          id?: string
          language?: Database["public"]["Enums"]["ui_language"]
          last_access_at?: string | null
          organization_id: string
          project_id: string
          revoked_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          token_hash: string
          version_id?: string | null
        }
        Update: {
          blocked?: boolean
          code_attempts?: number
          code_expires_at?: string | null
          code_hash?: string | null
          code_sent_at?: string | null
          comment?: string | null
          contributor?: Json | null
          created_at?: string
          document_id?: string
          downloaded_at?: string | null
          email?: string
          expires_at?: string
          external_user_id?: string | null
          id?: string
          language?: Database["public"]["Enums"]["ui_language"]
          last_access_at?: string | null
          organization_id?: string
          project_id?: string
          revoked_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          token_hash?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_external_user_id_fkey"
            columns: ["external_user_id"]
            isOneToOne: false
            referencedRelation: "external_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          client_id: string | null
          created_at: string
          family_id: string | null
          id: string
          index_max: number | null
          link_type: string
          margin_bottom: number
          margin_left: number
          margin_right: number
          margin_top: number
          organization_id: string
          page_number_x: number | null
          page_number_y: number | null
          page_type: string
          pdf_path: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          family_id?: string | null
          id?: string
          index_max?: number | null
          link_type: string
          margin_bottom: number
          margin_left: number
          margin_right: number
          margin_top: number
          organization_id: string
          page_number_x?: number | null
          page_number_y?: number | null
          page_type: string
          pdf_path: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          family_id?: string | null
          id?: string
          index_max?: number | null
          link_type?: string
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          organization_id?: string
          page_number_x?: number | null
          page_number_y?: number | null
          page_type?: string
          pdf_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_version_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          from_state: Database["public"]["Enums"]["document_state"] | null
          from_step: Database["public"]["Enums"]["document_step"] | null
          id: number
          payload: Json
          to_state: Database["public"]["Enums"]["document_state"] | null
          to_step: Database["public"]["Enums"]["document_step"] | null
          version_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          from_state?: Database["public"]["Enums"]["document_state"] | null
          from_step?: Database["public"]["Enums"]["document_step"] | null
          id?: never
          payload?: Json
          to_state?: Database["public"]["Enums"]["document_state"] | null
          to_step?: Database["public"]["Enums"]["document_step"] | null
          version_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          from_state?: Database["public"]["Enums"]["document_state"] | null
          from_step?: Database["public"]["Enums"]["document_step"] | null
          id?: never
          payload?: Json
          to_state?: Database["public"]["Enums"]["document_state"] | null
          to_step?: Database["public"]["Enums"]["document_step"] | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_version_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_version_events_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          approver_date: string | null
          approver_id: string | null
          bpa_user_id: string | null
          bpe_comment: string | null
          bpe_date: string | null
          bpe_user_id: string | null
          checker_date: string | null
          checker_id: string | null
          client_cover_page_path: string | null
          complement_ref_ext: string | null
          complement_ref_int: string | null
          created_at: string
          created_by: string | null
          diffused_by: string | null
          diffusion_comment: string | null
          diffusion_date: string | null
          document_id: string
          id: string
          index_label: string
          is_last: boolean
          is_sub_index: boolean
          pdf_name: string | null
          pdf_path: string | null
          pdf_size: number | null
          quality_date: string | null
          quality_supervisor_id: string | null
          redactor_date: string | null
          redactor_id: string | null
          response_comment: string | null
          response_date: string | null
          response_file_path: string | null
          response_label: string | null
          response_ref: string | null
          safety_date: string | null
          safety_supervisor_id: string | null
          seq: number
          state: Database["public"]["Enums"]["document_state"]
          step: Database["public"]["Enums"]["document_step"] | null
          template_snapshot: Json | null
          updated_at: string
          visa: Database["public"]["Enums"]["document_visa"] | null
          wording_snapshot: Json | null
        }
        Insert: {
          approver_date?: string | null
          approver_id?: string | null
          bpa_user_id?: string | null
          bpe_comment?: string | null
          bpe_date?: string | null
          bpe_user_id?: string | null
          checker_date?: string | null
          checker_id?: string | null
          client_cover_page_path?: string | null
          complement_ref_ext?: string | null
          complement_ref_int?: string | null
          created_at?: string
          created_by?: string | null
          diffused_by?: string | null
          diffusion_comment?: string | null
          diffusion_date?: string | null
          document_id: string
          id?: string
          index_label: string
          is_last?: boolean
          is_sub_index?: boolean
          pdf_name?: string | null
          pdf_path?: string | null
          pdf_size?: number | null
          quality_date?: string | null
          quality_supervisor_id?: string | null
          redactor_date?: string | null
          redactor_id?: string | null
          response_comment?: string | null
          response_date?: string | null
          response_file_path?: string | null
          response_label?: string | null
          response_ref?: string | null
          safety_date?: string | null
          safety_supervisor_id?: string | null
          seq: number
          state: Database["public"]["Enums"]["document_state"]
          step?: Database["public"]["Enums"]["document_step"] | null
          template_snapshot?: Json | null
          updated_at?: string
          visa?: Database["public"]["Enums"]["document_visa"] | null
          wording_snapshot?: Json | null
        }
        Update: {
          approver_date?: string | null
          approver_id?: string | null
          bpa_user_id?: string | null
          bpe_comment?: string | null
          bpe_date?: string | null
          bpe_user_id?: string | null
          checker_date?: string | null
          checker_id?: string | null
          client_cover_page_path?: string | null
          complement_ref_ext?: string | null
          complement_ref_int?: string | null
          created_at?: string
          created_by?: string | null
          diffused_by?: string | null
          diffusion_comment?: string | null
          diffusion_date?: string | null
          document_id?: string
          id?: string
          index_label?: string
          is_last?: boolean
          is_sub_index?: boolean
          pdf_name?: string | null
          pdf_path?: string | null
          pdf_size?: number | null
          quality_date?: string | null
          quality_supervisor_id?: string | null
          redactor_date?: string | null
          redactor_id?: string | null
          response_comment?: string | null
          response_date?: string | null
          response_file_path?: string | null
          response_label?: string | null
          response_ref?: string | null
          safety_date?: string | null
          safety_supervisor_id?: string | null
          seq?: number
          state?: Database["public"]["Enums"]["document_state"]
          step?: Database["public"]["Enums"]["document_step"] | null
          template_snapshot?: Json | null
          updated_at?: string
          visa?: Database["public"]["Enums"]["document_visa"] | null
          wording_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_bpa_user_id_fkey"
            columns: ["bpa_user_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_bpe_user_id_fkey"
            columns: ["bpe_user_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_checker_id_fkey"
            columns: ["checker_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_diffused_by_fkey"
            columns: ["diffused_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_quality_supervisor_id_fkey"
            columns: ["quality_supervisor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_redactor_id_fkey"
            columns: ["redactor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_safety_supervisor_id_fkey"
            columns: ["safety_supervisor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string
          actions_disabled: boolean
          category_id: string | null
          client_cover_page: boolean
          closing_category_id: string | null
          complement_ref_ext: string | null
          complement_ref_int: string | null
          content_disabled: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          family_id: string
          folder_template_id: string | null
          form_content_location: Database["public"]["Enums"]["form_content_location"]
          glossary: string | null
          highlight_changes: boolean
          id: string
          index_format: Database["public"]["Enums"]["index_format"]
          is_large_file: boolean
          language_1: Database["public"]["Enums"]["export_language"]
          language_2: Database["public"]["Enums"]["export_language"]
          library_source_id: string | null
          library_update_available: boolean
          linked_diagram_id: string | null
          linked_flow_id: string | null
          linked_form_id: string | null
          linked_list_id: string | null
          linked_response_id: string | null
          name: string
          nature: Database["public"]["Enums"]["document_nature"]
          options: Json
          organization_id: string
          origin: Database["public"]["Enums"]["document_origin"]
          position: number
          preamble: string | null
          project_id: string | null
          ref_ext: string | null
          ref_int: string | null
          responses_strategy:
            | Database["public"]["Enums"]["selection_strategy"]
            | null
          scope: Database["public"]["Enums"]["document_scope"]
          selection_query: Json | null
          source: Database["public"]["Enums"]["document_source"]
          standard_source_id: string | null
          start_index: string | null
          subject: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          actions_disabled?: boolean
          category_id?: string | null
          client_cover_page?: boolean
          closing_category_id?: string | null
          complement_ref_ext?: string | null
          complement_ref_int?: string | null
          content_disabled?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          family_id: string
          folder_template_id?: string | null
          form_content_location?: Database["public"]["Enums"]["form_content_location"]
          glossary?: string | null
          highlight_changes?: boolean
          id?: string
          index_format: Database["public"]["Enums"]["index_format"]
          is_large_file?: boolean
          language_1?: Database["public"]["Enums"]["export_language"]
          language_2?: Database["public"]["Enums"]["export_language"]
          library_source_id?: string | null
          library_update_available?: boolean
          linked_diagram_id?: string | null
          linked_flow_id?: string | null
          linked_form_id?: string | null
          linked_list_id?: string | null
          linked_response_id?: string | null
          name: string
          nature: Database["public"]["Enums"]["document_nature"]
          options?: Json
          organization_id: string
          origin?: Database["public"]["Enums"]["document_origin"]
          position?: number
          preamble?: string | null
          project_id?: string | null
          ref_ext?: string | null
          ref_int?: string | null
          responses_strategy?:
            | Database["public"]["Enums"]["selection_strategy"]
            | null
          scope: Database["public"]["Enums"]["document_scope"]
          selection_query?: Json | null
          source: Database["public"]["Enums"]["document_source"]
          standard_source_id?: string | null
          start_index?: string | null
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          actions_disabled?: boolean
          category_id?: string | null
          client_cover_page?: boolean
          closing_category_id?: string | null
          complement_ref_ext?: string | null
          complement_ref_int?: string | null
          content_disabled?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          family_id?: string
          folder_template_id?: string | null
          form_content_location?: Database["public"]["Enums"]["form_content_location"]
          glossary?: string | null
          highlight_changes?: boolean
          id?: string
          index_format?: Database["public"]["Enums"]["index_format"]
          is_large_file?: boolean
          language_1?: Database["public"]["Enums"]["export_language"]
          language_2?: Database["public"]["Enums"]["export_language"]
          library_source_id?: string | null
          library_update_available?: boolean
          linked_diagram_id?: string | null
          linked_flow_id?: string | null
          linked_form_id?: string | null
          linked_list_id?: string | null
          linked_response_id?: string | null
          name?: string
          nature?: Database["public"]["Enums"]["document_nature"]
          options?: Json
          organization_id?: string
          origin?: Database["public"]["Enums"]["document_origin"]
          position?: number
          preamble?: string | null
          project_id?: string | null
          ref_ext?: string | null
          ref_int?: string | null
          responses_strategy?:
            | Database["public"]["Enums"]["selection_strategy"]
            | null
          scope?: Database["public"]["Enums"]["document_scope"]
          selection_query?: Json | null
          source?: Database["public"]["Enums"]["document_source"]
          standard_source_id?: string | null
          start_index?: string | null
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_closing_category_id_fkey"
            columns: ["closing_category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_template_id_fkey"
            columns: ["folder_template_id"]
            isOneToOne: false
            referencedRelation: "closing_folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_library_source_id_fkey"
            columns: ["library_source_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_diagram_id_fkey"
            columns: ["linked_diagram_id"]
            isOneToOne: false
            referencedRelation: "diagrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_flow_id_fkey"
            columns: ["linked_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_form_id_fkey"
            columns: ["linked_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_list_id_fkey"
            columns: ["linked_list_id"]
            isOneToOne: false
            referencedRelation: "project_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_response_id_fkey"
            columns: ["linked_response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_standard_source_id_fkey"
            columns: ["standard_source_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      export_keys: {
        Row: {
          code: string
          data_type: string | null
          id: string
          label: string
          organization_id: string
          out_code: string | null
        }
        Insert: {
          code: string
          data_type?: string | null
          id?: string
          label: string
          organization_id: string
          out_code?: string | null
        }
        Update: {
          code?: string
          data_type?: string | null
          id?: string
          label?: string
          organization_id?: string
          out_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_users: {
        Row: {
          company_name: string
          converted_to: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          organization_id: string
          profession: string
          status: Database["public"]["Enums"]["collaborator_status"]
          updated_at: string
        }
        Insert: {
          company_name: string
          converted_to?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          organization_id: string
          profession: string
          status?: Database["public"]["Enums"]["collaborator_status"]
          updated_at?: string
        }
        Update: {
          company_name?: string
          converted_to?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          organization_id?: string
          profession?: string
          status?: Database["public"]["Enums"]["collaborator_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_users_converted_to_fkey"
            columns: ["converted_to"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_assignees: {
        Row: {
          collaborator_id: string
          flow_id: string
        }
        Insert: {
          collaborator_id: string
          flow_id: string
        }
        Update: {
          collaborator_id?: string
          flow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_assignees_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_assignees_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_collaborator_hierarchies: {
        Row: {
          collaborator_id: string
          flow_id: string
          hierarchy_id: string
        }
        Insert: {
          collaborator_id: string
          flow_id: string
          hierarchy_id: string
        }
        Update: {
          collaborator_id?: string
          flow_id?: string
          hierarchy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_collaborator_hierarchies_flow_id_collaborator_id_fkey"
            columns: ["flow_id", "collaborator_id"]
            isOneToOne: false
            referencedRelation: "flow_collaborators"
            referencedColumns: ["flow_id", "collaborator_id"]
          },
          {
            foreignKeyName: "flow_collaborator_hierarchies_hierarchy_id_fkey"
            columns: ["hierarchy_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_collaborators: {
        Row: {
          collaborator_id: string
          flow_id: string
        }
        Insert: {
          collaborator_id: string
          flow_id: string
        }
        Update: {
          collaborator_id?: string
          flow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_collaborators_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_collaborators_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_content_imports: {
        Row: {
          after_phase_id: string | null
          flow_id: string
          id: string
          imported_at: string
          imported_by: string | null
          kind: string
          source_flow_id: string | null
        }
        Insert: {
          after_phase_id?: string | null
          flow_id: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          kind: string
          source_flow_id?: string | null
        }
        Update: {
          after_phase_id?: string | null
          flow_id?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          kind?: string
          source_flow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_content_imports_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_content_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_content_imports_source_flow_id_fkey"
            columns: ["source_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_events: {
        Row: {
          actor_id: string | null
          comment: string | null
          event_type: Database["public"]["Enums"]["flow_event_type"]
          flow_id: string
          id: number
          occurred_at: string
          payload: Json
          phase_id: string | null
          source: Database["public"]["Enums"]["event_source"]
          step_id: string | null
        }
        Insert: {
          actor_id?: string | null
          comment?: string | null
          event_type: Database["public"]["Enums"]["flow_event_type"]
          flow_id: string
          id?: never
          occurred_at?: string
          payload?: Json
          phase_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          step_id?: string | null
        }
        Update: {
          actor_id?: string | null
          comment?: string | null
          event_type?: Database["public"]["Enums"]["flow_event_type"]
          flow_id?: string
          id?: never
          occurred_at?: string
          payload?: Json
          phase_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_events_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_fill_unlocks: {
        Row: {
          comment: string
          created_at: string
          flow_id: string
          id: string
          sign_with_qr_code: boolean
          signature_path: string | null
          signed_at: string
          source: Database["public"]["Enums"]["event_source"]
          unlocked_by: string | null
        }
        Insert: {
          comment: string
          created_at?: string
          flow_id: string
          id?: string
          sign_with_qr_code?: boolean
          signature_path?: string | null
          signed_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          unlocked_by?: string | null
        }
        Update: {
          comment?: string
          created_at?: string
          flow_id?: string
          id?: string
          sign_with_qr_code?: boolean
          signature_path?: string | null
          signed_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          unlocked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_fill_unlocks_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_fill_unlocks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_geometries: {
        Row: {
          altitude: number | null
          color: string | null
          created_at: string
          flow_id: string | null
          geojson: Json
          icon: Database["public"]["Enums"]["geometry_icon"]
          id: string
          kind: Database["public"]["Enums"]["geometry_kind"]
          label: string | null
          project_id: string
          radius_m: number | null
        }
        Insert: {
          altitude?: number | null
          color?: string | null
          created_at?: string
          flow_id?: string | null
          geojson: Json
          icon?: Database["public"]["Enums"]["geometry_icon"]
          id?: string
          kind: Database["public"]["Enums"]["geometry_kind"]
          label?: string | null
          project_id: string
          radius_m?: number | null
        }
        Update: {
          altitude?: number | null
          color?: string | null
          created_at?: string
          flow_id?: string | null
          geojson?: Json
          icon?: Database["public"]["Enums"]["geometry_icon"]
          id?: string
          kind?: Database["public"]["Enums"]["geometry_kind"]
          label?: string | null
          project_id?: string
          radius_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_geometries_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_geometries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_revisions: {
        Row: {
          closed_at: string | null
          comment: string | null
          created_by: string | null
          enabled: boolean
          flow_id: string
          id: string
          is_open: boolean
          opened_at: string
          reference: string
        }
        Insert: {
          closed_at?: string | null
          comment?: string | null
          created_by?: string | null
          enabled?: boolean
          flow_id: string
          id?: string
          is_open?: boolean
          opened_at?: string
          reference: string
        }
        Update: {
          closed_at?: string | null
          comment?: string | null
          created_by?: string | null
          enabled?: boolean
          flow_id?: string
          id?: string
          is_open?: boolean
          opened_at?: string
          reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_revisions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_secondary_categories: {
        Row: {
          category_id: string
          flow_id: string
        }
        Insert: {
          category_id: string
          flow_id: string
        }
        Update: {
          category_id?: string
          flow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_secondary_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_secondary_categories_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_status_history: {
        Row: {
          actor_id: string | null
          comment: string | null
          flow_id: string
          from_status_id: string | null
          id: number
          occurred_at: string
          source: Database["public"]["Enums"]["event_source"]
          to_status_id: string | null
        }
        Insert: {
          actor_id?: string | null
          comment?: string | null
          flow_id: string
          from_status_id?: string | null
          id?: never
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_status_id?: string | null
        }
        Update: {
          actor_id?: string | null
          comment?: string | null
          flow_id?: string
          from_status_id?: string | null
          id?: never
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_status_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_status_history_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_status_history_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_status_history_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_tags: {
        Row: {
          flow_id: string
          tag_id: string
        }
        Insert: {
          flow_id: string
          tag_id: string
        }
        Update: {
          flow_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_tags_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          account_id: string
          achieved_end_date: string | null
          achieved_start_date: string | null
          bar_color: string | null
          category_id: string | null
          content_updated_at: string | null
          created_at: string
          created_by: string | null
          custom_status_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          elementary_system: string | null
          estimated_end_date: string | null
          estimated_start_date: string | null
          executed_from_flow_id: string | null
          external_supervisor_name_1: string | null
          external_supervisor_name_2: string | null
          external_supervisor_name_3: string | null
          family_id: string | null
          fill_restrictions_skipped: boolean
          finish_date: string | null
          flow_type: Database["public"]["Enums"]["flow_type"]
          functional_marker: string | null
          id: string
          internal_supervisor_name_1: string | null
          internal_supervisor_name_2: string | null
          internal_supervisor_name_3: string | null
          location_activated: boolean
          location_area: string | null
          location_local: string | null
          location_site: string | null
          name: string
          organization_id: string
          origin: Database["public"]["Enums"]["flow_origin"]
          project_id: string
          ref_ext: string | null
          ref_int: string | null
          reporter_id: string | null
          simplified_signature_mode: boolean
          sourced_from_flow_id: string | null
          sourced_from_index: string | null
          start_date: string | null
          supervision_extern_1: boolean
          supervision_extern_2: boolean
          supervision_extern_3: boolean
          supervision_intern_1: boolean
          supervision_intern_2: boolean
          supervision_intern_3: boolean
          tablet_1_id: string | null
          tablet_2_id: string | null
          tablet_3_id: string | null
          technical_object_id: string | null
          technical_object_label: string | null
          unlocked: boolean
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          account_id: string
          achieved_end_date?: string | null
          achieved_start_date?: string | null
          bar_color?: string | null
          category_id?: string | null
          content_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          elementary_system?: string | null
          estimated_end_date?: string | null
          estimated_start_date?: string | null
          executed_from_flow_id?: string | null
          external_supervisor_name_1?: string | null
          external_supervisor_name_2?: string | null
          external_supervisor_name_3?: string | null
          family_id?: string | null
          fill_restrictions_skipped?: boolean
          finish_date?: string | null
          flow_type: Database["public"]["Enums"]["flow_type"]
          functional_marker?: string | null
          id?: string
          internal_supervisor_name_1?: string | null
          internal_supervisor_name_2?: string | null
          internal_supervisor_name_3?: string | null
          location_activated?: boolean
          location_area?: string | null
          location_local?: string | null
          location_site?: string | null
          name: string
          organization_id: string
          origin?: Database["public"]["Enums"]["flow_origin"]
          project_id: string
          ref_ext?: string | null
          ref_int?: string | null
          reporter_id?: string | null
          simplified_signature_mode?: boolean
          sourced_from_flow_id?: string | null
          sourced_from_index?: string | null
          start_date?: string | null
          supervision_extern_1?: boolean
          supervision_extern_2?: boolean
          supervision_extern_3?: boolean
          supervision_intern_1?: boolean
          supervision_intern_2?: boolean
          supervision_intern_3?: boolean
          tablet_1_id?: string | null
          tablet_2_id?: string | null
          tablet_3_id?: string | null
          technical_object_id?: string | null
          technical_object_label?: string | null
          unlocked?: boolean
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          achieved_end_date?: string | null
          achieved_start_date?: string | null
          bar_color?: string | null
          category_id?: string | null
          content_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          elementary_system?: string | null
          estimated_end_date?: string | null
          estimated_start_date?: string | null
          executed_from_flow_id?: string | null
          external_supervisor_name_1?: string | null
          external_supervisor_name_2?: string | null
          external_supervisor_name_3?: string | null
          family_id?: string | null
          fill_restrictions_skipped?: boolean
          finish_date?: string | null
          flow_type?: Database["public"]["Enums"]["flow_type"]
          functional_marker?: string | null
          id?: string
          internal_supervisor_name_1?: string | null
          internal_supervisor_name_2?: string | null
          internal_supervisor_name_3?: string | null
          location_activated?: boolean
          location_area?: string | null
          location_local?: string | null
          location_site?: string | null
          name?: string
          organization_id?: string
          origin?: Database["public"]["Enums"]["flow_origin"]
          project_id?: string
          ref_ext?: string | null
          ref_int?: string | null
          reporter_id?: string | null
          simplified_signature_mode?: boolean
          sourced_from_flow_id?: string | null
          sourced_from_index?: string | null
          start_date?: string | null
          supervision_extern_1?: boolean
          supervision_extern_2?: boolean
          supervision_extern_3?: boolean
          supervision_intern_1?: boolean
          supervision_intern_2?: boolean
          supervision_intern_3?: boolean
          tablet_1_id?: string | null
          tablet_2_id?: string | null
          tablet_3_id?: string | null
          technical_object_id?: string | null
          technical_object_label?: string | null
          unlocked?: boolean
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flows_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_executed_from_flow_id_fkey"
            columns: ["executed_from_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_sourced_from_flow_id_fkey"
            columns: ["sourced_from_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_tablet_1_id_fkey"
            columns: ["tablet_1_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_tablet_2_id_fkey"
            columns: ["tablet_2_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_tablet_3_id_fkey"
            columns: ["tablet_3_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_technical_object_id_fkey"
            columns: ["technical_object_id"]
            isOneToOne: false
            referencedRelation: "technical_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      form_block_links: {
        Row: {
          additional_comment: string | null
          block_id: string
          created_at: string
          enabled: boolean
          fillable_rubric_lineage_ids: string[] | null
          flow_id: string
          form_id: string
          id: string
          initial_rubric_lineage_id: string | null
          mandatory: boolean
          pinned_version_id: string | null
          position: number
          step_id: string
          technical_object_id: string | null
          unique_mode: Database["public"]["Enums"]["unique_mode"]
          unique_response: boolean
        }
        Insert: {
          additional_comment?: string | null
          block_id: string
          created_at?: string
          enabled?: boolean
          fillable_rubric_lineage_ids?: string[] | null
          flow_id: string
          form_id: string
          id?: string
          initial_rubric_lineage_id?: string | null
          mandatory?: boolean
          pinned_version_id?: string | null
          position?: number
          step_id: string
          technical_object_id?: string | null
          unique_mode?: Database["public"]["Enums"]["unique_mode"]
          unique_response?: boolean
        }
        Update: {
          additional_comment?: string | null
          block_id?: string
          created_at?: string
          enabled?: boolean
          fillable_rubric_lineage_ids?: string[] | null
          flow_id?: string
          form_id?: string
          id?: string
          initial_rubric_lineage_id?: string | null
          mandatory?: boolean
          pinned_version_id?: string | null
          position?: number
          step_id?: string
          technical_object_id?: string | null
          unique_mode?: Database["public"]["Enums"]["unique_mode"]
          unique_response?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "form_block_links_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_block_links_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_block_links_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_block_links_pinned_version_id_fkey"
            columns: ["pinned_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_block_links_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_block_links_technical_object_id_fkey"
            columns: ["technical_object_id"]
            isOneToOne: false
            referencedRelation: "technical_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      form_companies: {
        Row: {
          company_id: string
          form_id: string
        }
        Insert: {
          company_id: string
          form_id: string
        }
        Update: {
          company_id?: string
          form_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_companies_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_files: {
        Row: {
          form_id: string
          id: string
          name: string | null
          owner_id: string
          owner_kind: string
          position: number
          storage_path: string
        }
        Insert: {
          form_id: string
          id?: string
          name?: string | null
          owner_id: string
          owner_kind: string
          position?: number
          storage_path: string
        }
        Update: {
          form_id?: string
          id?: string
          name?: string | null
          owner_id?: string
          owner_kind?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_files_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_options: {
        Row: {
          alert: Json | null
          choices: string[]
          code: string | null
          description: string | null
          export_key: string | null
          form_id: string
          formula: string | null
          formula_refs: string[]
          frozen: boolean
          id: string
          lineage_id: string
          name: string | null
          option_name: string | null
          pdf_field_name: string | null
          photo_size: Database["public"]["Enums"]["size_enum"] | null
          placeholder: string | null
          position: number
          prefill: Json | null
          question_id: string
          redirect_question_id: string | null
          redirect_rubric_id: string | null
          unit: string | null
          validation: Json | null
          value_hint: string | null
          xls_export: boolean
          xls_label: string | null
        }
        Insert: {
          alert?: Json | null
          choices?: string[]
          code?: string | null
          description?: string | null
          export_key?: string | null
          form_id: string
          formula?: string | null
          formula_refs?: string[]
          frozen?: boolean
          id?: string
          lineage_id: string
          name?: string | null
          option_name?: string | null
          pdf_field_name?: string | null
          photo_size?: Database["public"]["Enums"]["size_enum"] | null
          placeholder?: string | null
          position: number
          prefill?: Json | null
          question_id: string
          redirect_question_id?: string | null
          redirect_rubric_id?: string | null
          unit?: string | null
          validation?: Json | null
          value_hint?: string | null
          xls_export?: boolean
          xls_label?: string | null
        }
        Update: {
          alert?: Json | null
          choices?: string[]
          code?: string | null
          description?: string | null
          export_key?: string | null
          form_id?: string
          formula?: string | null
          formula_refs?: string[]
          frozen?: boolean
          id?: string
          lineage_id?: string
          name?: string | null
          option_name?: string | null
          pdf_field_name?: string | null
          photo_size?: Database["public"]["Enums"]["size_enum"] | null
          placeholder?: string | null
          position?: number
          prefill?: Json | null
          question_id?: string
          redirect_question_id?: string | null
          redirect_rubric_id?: string | null
          unit?: string | null
          validation?: Json | null
          value_hint?: string | null
          xls_export?: boolean
          xls_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_options_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_options_redirect_question_id_fkey"
            columns: ["redirect_question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_options_redirect_rubric_id_fkey"
            columns: ["redirect_rubric_id"]
            isOneToOne: false
            referencedRelation: "form_rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      form_questions: {
        Row: {
          additional_comment: string | null
          additional_observation: string | null
          allow_backdating: boolean
          background_color: string | null
          description: string | null
          form_id: string
          hide_images_below_table: boolean
          hide_in_pdf: boolean
          icon: Database["public"]["Enums"]["question_icon"] | null
          id: string
          lineage_id: string
          lockable: boolean
          mandatory: boolean
          name: string
          object_attribute_id: string | null
          photo_size: Database["public"]["Enums"]["size_enum"] | null
          position: number
          rubric_id: string
          shared: boolean
          type: Database["public"]["Enums"]["question_type"]
          unify_cells: boolean
          with_observation: boolean
        }
        Insert: {
          additional_comment?: string | null
          additional_observation?: string | null
          allow_backdating?: boolean
          background_color?: string | null
          description?: string | null
          form_id: string
          hide_images_below_table?: boolean
          hide_in_pdf?: boolean
          icon?: Database["public"]["Enums"]["question_icon"] | null
          id?: string
          lineage_id: string
          lockable?: boolean
          mandatory?: boolean
          name: string
          object_attribute_id?: string | null
          photo_size?: Database["public"]["Enums"]["size_enum"] | null
          position: number
          rubric_id: string
          shared?: boolean
          type?: Database["public"]["Enums"]["question_type"]
          unify_cells?: boolean
          with_observation?: boolean
        }
        Update: {
          additional_comment?: string | null
          additional_observation?: string | null
          allow_backdating?: boolean
          background_color?: string | null
          description?: string | null
          form_id?: string
          hide_images_below_table?: boolean
          hide_in_pdf?: boolean
          icon?: Database["public"]["Enums"]["question_icon"] | null
          id?: string
          lineage_id?: string
          lockable?: boolean
          mandatory?: boolean
          name?: string
          object_attribute_id?: string | null
          photo_size?: Database["public"]["Enums"]["size_enum"] | null
          position?: number
          rubric_id?: string
          shared?: boolean
          type?: Database["public"]["Enums"]["question_type"]
          unify_cells?: boolean
          with_observation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_questions_object_attribute_id_fkey"
            columns: ["object_attribute_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_questions_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "form_rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_dynamic_items: {
        Row: {
          id: string
          kind: string
          lineage_id: string
          name: string | null
          parent_lineage_id: string | null
          position: number
          response_id: string
          rubric_lineage_id: string
          template_lineage_id: string
        }
        Insert: {
          id?: string
          kind: string
          lineage_id?: string
          name?: string | null
          parent_lineage_id?: string | null
          position: number
          response_id: string
          rubric_lineage_id: string
          template_lineage_id: string
        }
        Update: {
          id?: string
          kind?: string
          lineage_id?: string
          name?: string | null
          parent_lineage_id?: string | null
          position?: number
          response_id?: string
          rubric_lineage_id?: string
          template_lineage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_response_dynamic_items_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_events: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          id: number
          payload: Json
          provenance: Database["public"]["Enums"]["event_source"]
          response_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          id?: never
          payload?: Json
          provenance?: Database["public"]["Enums"]["event_source"]
          response_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          id?: never
          payload?: Json
          provenance?: Database["public"]["Enums"]["event_source"]
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_response_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_events_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_value_history: {
        Row: {
          change_signature: Json | null
          changed_at: string
          changed_by: string | null
          files_added: Json | null
          files_removed: Json | null
          id: number
          new_value: Json | null
          old_value: Json | null
          option_lineage_id: string
          provenance: Database["public"]["Enums"]["event_source"]
          reason: string | null
          response_id: string
          value_id: string | null
        }
        Insert: {
          change_signature?: Json | null
          changed_at?: string
          changed_by?: string | null
          files_added?: Json | null
          files_removed?: Json | null
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          option_lineage_id: string
          provenance?: Database["public"]["Enums"]["event_source"]
          reason?: string | null
          response_id: string
          value_id?: string | null
        }
        Update: {
          change_signature?: Json | null
          changed_at?: string
          changed_by?: string | null
          files_added?: Json | null
          files_removed?: Json | null
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          option_lineage_id?: string
          provenance?: Database["public"]["Enums"]["event_source"]
          reason?: string | null
          response_id?: string
          value_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_response_value_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_value_history_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_value_history_value_id_fkey"
            columns: ["value_id"]
            isOneToOne: false
            referencedRelation: "form_response_values"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_values: {
        Row: {
          coord: string
          flow_id: string | null
          id: string
          is_valid: boolean | null
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          observation: string | null
          option_code: string | null
          option_lineage_id: string
          organization_id: string
          project_id: string | null
          provenance: Database["public"]["Enums"]["event_source"]
          question_lineage_id: string
          question_type: Database["public"]["Enums"]["question_type"]
          response_id: string
          rubric_lineage_id: string
          updated_at: string
          updated_by: string | null
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
          value_ts: string | null
          value_type: Database["public"]["Enums"]["value_type"]
        }
        Insert: {
          coord: string
          flow_id?: string | null
          id?: string
          is_valid?: boolean | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          observation?: string | null
          option_code?: string | null
          option_lineage_id: string
          organization_id: string
          project_id?: string | null
          provenance?: Database["public"]["Enums"]["event_source"]
          question_lineage_id: string
          question_type: Database["public"]["Enums"]["question_type"]
          response_id: string
          rubric_lineage_id: string
          updated_at?: string
          updated_by?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
          value_ts?: string | null
          value_type: Database["public"]["Enums"]["value_type"]
        }
        Update: {
          coord?: string
          flow_id?: string | null
          id?: string
          is_valid?: boolean | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          observation?: string | null
          option_code?: string | null
          option_lineage_id?: string
          organization_id?: string
          project_id?: string | null
          provenance?: Database["public"]["Enums"]["event_source"]
          question_lineage_id?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          response_id?: string
          rubric_lineage_id?: string
          updated_at?: string
          updated_by?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
          value_ts?: string | null
          value_type?: Database["public"]["Enums"]["value_type"]
        }
        Relationships: [
          {
            foreignKeyName: "form_response_values_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_values_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          account_id: string
          active_redirect: Json | null
          block_link_id: string | null
          context: Database["public"]["Enums"]["response_context"]
          created_at: string
          created_by: string | null
          created_by_external: Json | null
          custom_status_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          done_at: string | null
          done_by: string | null
          dynamic_context: Json
          flow_id: string | null
          form_id: string
          form_index_label: string | null
          form_lineage_id: string
          form_reference: string | null
          form_version_id: string
          id: string
          last_rubric_lineage_id: string | null
          mobile_visible: boolean
          organization_id: string
          phase_id: string | null
          project_id: string
          provenance: Database["public"]["Enums"]["event_source"]
          reference: string
          state: Database["public"]["Enums"]["response_state"]
          step_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          active_redirect?: Json | null
          block_link_id?: string | null
          context: Database["public"]["Enums"]["response_context"]
          created_at?: string
          created_by?: string | null
          created_by_external?: Json | null
          custom_status_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          done_at?: string | null
          done_by?: string | null
          dynamic_context?: Json
          flow_id?: string | null
          form_id: string
          form_index_label?: string | null
          form_lineage_id: string
          form_reference?: string | null
          form_version_id: string
          id?: string
          last_rubric_lineage_id?: string | null
          mobile_visible?: boolean
          organization_id: string
          phase_id?: string | null
          project_id: string
          provenance?: Database["public"]["Enums"]["event_source"]
          reference: string
          state?: Database["public"]["Enums"]["response_state"]
          step_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          active_redirect?: Json | null
          block_link_id?: string | null
          context?: Database["public"]["Enums"]["response_context"]
          created_at?: string
          created_by?: string | null
          created_by_external?: Json | null
          custom_status_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          done_at?: string | null
          done_by?: string | null
          dynamic_context?: Json
          flow_id?: string | null
          form_id?: string
          form_index_label?: string | null
          form_lineage_id?: string
          form_reference?: string | null
          form_version_id?: string
          id?: string
          last_rubric_lineage_id?: string | null
          mobile_visible?: boolean
          organization_id?: string
          phase_id?: string | null
          project_id?: string
          provenance?: Database["public"]["Enums"]["event_source"]
          reference?: string
          state?: Database["public"]["Enums"]["response_state"]
          step_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_block_link_id_fkey"
            columns: ["block_link_id"]
            isOneToOne: false
            referencedRelation: "form_block_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      form_rubrics: {
        Row: {
          additional_comment: string | null
          additional_observation: string | null
          allow_add_column: boolean
          allow_add_row: boolean
          attachment_height: Database["public"]["Enums"]["size_enum"] | null
          attachment_width: Database["public"]["Enums"]["size_enum"] | null
          description: string | null
          export_images_in_appendix: boolean
          first_column_hidden: boolean
          form_id: string
          hidden_in_mobile: boolean
          hide_in_pdf: boolean
          id: string
          import_xlsx_enabled: boolean
          lineage_id: string
          name: string
          pdf_landscape: boolean
          position: number
          type: Database["public"]["Enums"]["rubric_type"]
        }
        Insert: {
          additional_comment?: string | null
          additional_observation?: string | null
          allow_add_column?: boolean
          allow_add_row?: boolean
          attachment_height?: Database["public"]["Enums"]["size_enum"] | null
          attachment_width?: Database["public"]["Enums"]["size_enum"] | null
          description?: string | null
          export_images_in_appendix?: boolean
          first_column_hidden?: boolean
          form_id: string
          hidden_in_mobile?: boolean
          hide_in_pdf?: boolean
          id?: string
          import_xlsx_enabled?: boolean
          lineage_id: string
          name: string
          pdf_landscape?: boolean
          position: number
          type: Database["public"]["Enums"]["rubric_type"]
        }
        Update: {
          additional_comment?: string | null
          additional_observation?: string | null
          allow_add_column?: boolean
          allow_add_row?: boolean
          attachment_height?: Database["public"]["Enums"]["size_enum"] | null
          attachment_width?: Database["public"]["Enums"]["size_enum"] | null
          description?: string | null
          export_images_in_appendix?: boolean
          first_column_hidden?: boolean
          form_id?: string
          hidden_in_mobile?: boolean
          hide_in_pdf?: boolean
          id?: string
          import_xlsx_enabled?: boolean
          lineage_id?: string
          name?: string
          pdf_landscape?: boolean
          position?: number
          type?: Database["public"]["Enums"]["rubric_type"]
        }
        Relationships: [
          {
            foreignKeyName: "form_rubrics_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_shares: {
        Row: {
          blocked: boolean
          code_attempts: number
          code_expires_at: string | null
          code_hash: string | null
          code_sent_at: string | null
          comment: string | null
          contribution_response_id: string | null
          contributor: Json | null
          created_at: string
          email: string
          expires_at: string
          external_user_id: string | null
          form_id: string | null
          id: string
          language: Database["public"]["Enums"]["ui_language"]
          last_access_at: string | null
          organization_id: string
          project_id: string
          responded_at: string | null
          response_id: string | null
          revoked_at: string | null
          sent_at: string | null
          sent_by: string | null
          token_hash: string
        }
        Insert: {
          blocked?: boolean
          code_attempts?: number
          code_expires_at?: string | null
          code_hash?: string | null
          code_sent_at?: string | null
          comment?: string | null
          contribution_response_id?: string | null
          contributor?: Json | null
          created_at?: string
          email: string
          expires_at: string
          external_user_id?: string | null
          form_id?: string | null
          id?: string
          language?: Database["public"]["Enums"]["ui_language"]
          last_access_at?: string | null
          organization_id: string
          project_id: string
          responded_at?: string | null
          response_id?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          token_hash: string
        }
        Update: {
          blocked?: boolean
          code_attempts?: number
          code_expires_at?: string | null
          code_hash?: string | null
          code_sent_at?: string | null
          comment?: string | null
          contribution_response_id?: string | null
          contributor?: Json | null
          created_at?: string
          email?: string
          expires_at?: string
          external_user_id?: string | null
          form_id?: string | null
          id?: string
          language?: Database["public"]["Enums"]["ui_language"]
          last_access_at?: string | null
          organization_id?: string
          project_id?: string
          responded_at?: string | null
          response_id?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_shares_contribution_response_id_fkey"
            columns: ["contribution_response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_shares_external_user_id_fkey"
            columns: ["external_user_id"]
            isOneToOne: false
            referencedRelation: "external_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_shares_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_shares_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_shares_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      form_signatory_slots: {
        Row: {
          description: string | null
          disable_signature: boolean
          form_id: string
          id: string
          lineage_id: string
          name: string | null
          pdf_field_name: string | null
          position: number
          question_id: string
          xls_export: boolean
          xls_label: string | null
        }
        Insert: {
          description?: string | null
          disable_signature?: boolean
          form_id: string
          id?: string
          lineage_id: string
          name?: string | null
          pdf_field_name?: string | null
          position: number
          question_id: string
          xls_export?: boolean
          xls_label?: string | null
        }
        Update: {
          description?: string | null
          disable_signature?: boolean
          form_id?: string
          id?: string
          lineage_id?: string
          name?: string | null
          pdf_field_name?: string | null
          position?: number
          question_id?: string
          xls_export?: boolean
          xls_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_signatory_slots_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_signatory_slots_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_versions: {
        Row: {
          created_at: string
          created_by: string | null
          form_id: string
          id: string
          index_label: string | null
          library_form_id: string | null
          reference: string | null
          structure: Json
          structure_rev: number
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          form_id: string
          id?: string
          index_label?: string | null
          library_form_id?: string | null
          reference?: string | null
          structure: Json
          structure_rev: number
          version_no: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          form_id?: string
          id?: string
          index_label?: string | null
          library_form_id?: string | null
          reference?: string | null
          structure?: Json
          structure_rev?: number
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          account_id: string
          additional_comment: string | null
          additional_observation: string | null
          archived: boolean
          created_at: string
          created_by: string | null
          current_version_id: string | null
          custom_status_id: string | null
          deleted_at: string | null
          description: string | null
          enabled: boolean
          family_id: string | null
          hide_in_exports: Json
          id: string
          index_label: string | null
          lineage_id: string
          location: Database["public"]["Enums"]["form_location"]
          lock_responses: boolean
          name: string
          nature: Database["public"]["Enums"]["form_nature"]
          object_attributes_link: Database["public"]["Enums"]["object_attr_link"]
          object_family_id: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["form_origin"] | null
          pdf_template: Json | null
          project_id: string | null
          reference: string | null
          sourced_from_form_id: string | null
          sourced_from_version_id: string | null
          structure_rev: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          additional_comment?: string | null
          additional_observation?: string | null
          archived?: boolean
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          description?: string | null
          enabled?: boolean
          family_id?: string | null
          hide_in_exports?: Json
          id?: string
          index_label?: string | null
          lineage_id: string
          location: Database["public"]["Enums"]["form_location"]
          lock_responses?: boolean
          name: string
          nature: Database["public"]["Enums"]["form_nature"]
          object_attributes_link?: Database["public"]["Enums"]["object_attr_link"]
          object_family_id?: string | null
          organization_id: string
          origin?: Database["public"]["Enums"]["form_origin"] | null
          pdf_template?: Json | null
          project_id?: string | null
          reference?: string | null
          sourced_from_form_id?: string | null
          sourced_from_version_id?: string | null
          structure_rev?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          additional_comment?: string | null
          additional_observation?: string | null
          archived?: boolean
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          description?: string | null
          enabled?: boolean
          family_id?: string | null
          hide_in_exports?: Json
          id?: string
          index_label?: string | null
          lineage_id?: string
          location?: Database["public"]["Enums"]["form_location"]
          lock_responses?: boolean
          name?: string
          nature?: Database["public"]["Enums"]["form_nature"]
          object_attributes_link?: Database["public"]["Enums"]["object_attr_link"]
          object_family_id?: string | null
          organization_id?: string
          origin?: Database["public"]["Enums"]["form_origin"] | null
          pdf_template?: Json | null
          project_id?: string | null
          reference?: string | null
          sourced_from_form_id?: string | null
          sourced_from_version_id?: string | null
          structure_rev?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forms_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_object_family_id_fkey"
            columns: ["object_family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_sourced_from_form_id_fkey"
            columns: ["sourced_from_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      label_families: {
        Row: {
          account_id: string | null
          active: boolean
          client_supervision: boolean
          client_supervision_sub_index: boolean
          code: string | null
          color: string
          created_at: string
          default_source_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          kind: Database["public"]["Enums"]["label_family_kind"]
          logo_path: string | null
          long_name: string | null
          nature: Database["public"]["Enums"]["label_family_nature"]
          organization_id: string
          parent_id: string | null
          priority: number
          project_id: string | null
          provenance: Database["public"]["Enums"]["label_provenance"] | null
          quality_reference: string | null
          relative_nature: Database["public"]["Enums"]["relative_nature"]
          short_name: string
          updated_at: string
          wording_configuration_id: string | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          client_supervision?: boolean
          client_supervision_sub_index?: boolean
          code?: string | null
          color?: string
          created_at?: string
          default_source_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["label_family_kind"]
          logo_path?: string | null
          long_name?: string | null
          nature: Database["public"]["Enums"]["label_family_nature"]
          organization_id: string
          parent_id?: string | null
          priority?: number
          project_id?: string | null
          provenance?: Database["public"]["Enums"]["label_provenance"] | null
          quality_reference?: string | null
          relative_nature: Database["public"]["Enums"]["relative_nature"]
          short_name: string
          updated_at?: string
          wording_configuration_id?: string | null
        }
        Update: {
          account_id?: string | null
          active?: boolean
          client_supervision?: boolean
          client_supervision_sub_index?: boolean
          code?: string | null
          color?: string
          created_at?: string
          default_source_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["label_family_kind"]
          logo_path?: string | null
          long_name?: string | null
          nature?: Database["public"]["Enums"]["label_family_nature"]
          organization_id?: string
          parent_id?: string | null
          priority?: number
          project_id?: string | null
          provenance?: Database["public"]["Enums"]["label_provenance"] | null
          quality_reference?: string | null
          relative_nature?: Database["public"]["Enums"]["relative_nature"]
          short_name?: string
          updated_at?: string
          wording_configuration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "label_families_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_families_default_source_id_fkey"
            columns: ["default_source_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_families_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_families_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_families_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_families_wording_configuration_id_fkey"
            columns: ["wording_configuration_id"]
            isOneToOne: false
            referencedRelation: "wording_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      library_equipments: {
        Row: {
          account_id: string
          active: boolean
          certificate_document_path: string | null
          consumable: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          family_id: string
          id: string
          name: string
          organization_id: string
          photo_path: string | null
          provider: string | null
          quantity_unit: string | null
          reference: string | null
          reference_document_path: string | null
          subject_to_verification: boolean
          updated_at: string
          updated_by: string | null
          validity_date: string | null
          verification_body: string | null
        }
        Insert: {
          account_id: string
          active?: boolean
          certificate_document_path?: string | null
          consumable?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          family_id: string
          id?: string
          name: string
          organization_id: string
          photo_path?: string | null
          provider?: string | null
          quantity_unit?: string | null
          reference?: string | null
          reference_document_path?: string | null
          subject_to_verification?: boolean
          updated_at?: string
          updated_by?: string | null
          validity_date?: string | null
          verification_body?: string | null
        }
        Update: {
          account_id?: string
          active?: boolean
          certificate_document_path?: string | null
          consumable?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          family_id?: string
          id?: string
          name?: string
          organization_id?: string
          photo_path?: string | null
          provider?: string | null
          quantity_unit?: string | null
          reference?: string | null
          reference_document_path?: string | null
          subject_to_verification?: boolean
          updated_at?: string
          updated_by?: string | null
          validity_date?: string | null
          verification_body?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_equipments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_equipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_equipments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_equipments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_equipments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      library_risk_parades: {
        Row: {
          created_at: string
          description: string | null
          file_path: string | null
          id: string
          name: string
          pictogram: number | null
          position: number
          risk_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_path?: string | null
          id?: string
          name: string
          pictogram?: number | null
          position?: number
          risk_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_path?: string | null
          id?: string
          name?: string
          pictogram?: number | null
          position?: number
          risk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_risk_parades_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "library_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      library_risks: {
        Row: {
          account_id: string
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          family_id: string
          frequency: number | null
          id: string
          landmark: string | null
          major: boolean
          name: string
          occurrence: number | null
          organization_id: string
          pictogram: number | null
          reference: string | null
          severity: number | null
          source: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          family_id: string
          frequency?: number | null
          id?: string
          landmark?: string | null
          major?: boolean
          name: string
          occurrence?: number | null
          organization_id: string
          pictogram?: number | null
          reference?: string | null
          severity?: number | null
          source?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          family_id?: string
          frequency?: number | null
          id?: string
          landmark?: string | null
          major?: boolean
          name?: string
          occurrence?: number | null
          organization_id?: string
          pictogram?: number | null
          reference?: string | null
          severity?: number | null
          source?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_risks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_risks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_risks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_risks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_device_bindings: {
        Row: {
          bound_at: string
          device_id: string
          last_seen_at: string
          principal_id: string
        }
        Insert: {
          bound_at?: string
          device_id: string
          last_seen_at?: string
          principal_id: string
        }
        Update: {
          bound_at?: string
          device_id?: string
          last_seen_at?: string
          principal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_device_bindings_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: true
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_flow_access: {
        Row: {
          auth_user_id: string | null
          flow_id: string
          principal_id: string
          project_id: string
        }
        Insert: {
          auth_user_id?: string | null
          flow_id: string
          principal_id: string
          project_id: string
        }
        Update: {
          auth_user_id?: string | null
          flow_id?: string
          principal_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_flow_access_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_flow_access_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_project_access: {
        Row: {
          auth_user_id: string | null
          principal_id: string
          project_id: string
        }
        Insert: {
          auth_user_id?: string | null
          principal_id: string
          project_id: string
        }
        Update: {
          auth_user_id?: string | null
          principal_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_project_access_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allowed_download_response: number | null
          auth_mode: Database["public"]["Enums"]["auth_mode"]
          block_form_response_edition: boolean
          created_at: string
          diagram_enabled: boolean
          id: string
          link_expiration_days: number
          links_form_attributes_enabled: boolean
          local_form_allowed: boolean
          map_config: Json | null
          name: string
          number_format: Database["public"]["Enums"]["number_format"]
          rubric_permissions_enabled: boolean
          subdomain: string | null
          support_chat_enabled: boolean
          updated_at: string
        }
        Insert: {
          allowed_download_response?: number | null
          auth_mode?: Database["public"]["Enums"]["auth_mode"]
          block_form_response_edition?: boolean
          created_at?: string
          diagram_enabled?: boolean
          id?: string
          link_expiration_days?: number
          links_form_attributes_enabled?: boolean
          local_form_allowed?: boolean
          map_config?: Json | null
          name: string
          number_format?: Database["public"]["Enums"]["number_format"]
          rubric_permissions_enabled?: boolean
          subdomain?: string | null
          support_chat_enabled?: boolean
          updated_at?: string
        }
        Update: {
          allowed_download_response?: number | null
          auth_mode?: Database["public"]["Enums"]["auth_mode"]
          block_form_response_edition?: boolean
          created_at?: string
          diagram_enabled?: boolean
          id?: string
          link_expiration_days?: number
          links_form_attributes_enabled?: boolean
          local_form_allowed?: boolean
          map_config?: Json | null
          name?: string
          number_format?: Database["public"]["Enums"]["number_format"]
          rubric_permissions_enabled?: boolean
          subdomain?: string | null
          support_chat_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      outbound_emails: {
        Row: {
          created_at: string
          error: string | null
          html: string
          id: string
          kind: string
          organization_id: string | null
          redacted: boolean
          sent_at: string | null
          status: string
          subject: string
          text_body: string
          to_email: string
          transport: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          html: string
          id?: string
          kind: string
          organization_id?: string | null
          redacted?: boolean
          sent_at?: string | null
          status?: string
          subject: string
          text_body: string
          to_email: string
          transport?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          html?: string
          id?: string
          kind?: string
          organization_id?: string | null
          redacted?: boolean
          sent_at?: string | null
          status?: string
          subject?: string
          text_body?: string
          to_email?: string
          transport?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_tags: {
        Row: {
          phase_id: string
          tag_id: string
        }
        Insert: {
          phase_id: string
          tag_id: string
        }
        Update: {
          phase_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_tags_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          additional_comment: string | null
          created_at: string
          custom_number: string | null
          description: string | null
          disabled: boolean
          disabled_comment: string | null
          exclude_numbering: boolean
          flow_id: string
          hide_title_pdf: boolean
          id: string
          mandatory: boolean
          name: string
          position: number
          read_only_on_mobile_app: boolean
          sequence_id: string | null
          sequence_type: Database["public"]["Enums"]["sequencing_type"]
          updated_at: string
        }
        Insert: {
          additional_comment?: string | null
          created_at?: string
          custom_number?: string | null
          description?: string | null
          disabled?: boolean
          disabled_comment?: string | null
          exclude_numbering?: boolean
          flow_id: string
          hide_title_pdf?: boolean
          id?: string
          mandatory?: boolean
          name: string
          position: number
          read_only_on_mobile_app?: boolean
          sequence_id?: string | null
          sequence_type?: Database["public"]["Enums"]["sequencing_type"]
          updated_at?: string
        }
        Update: {
          additional_comment?: string | null
          created_at?: string
          custom_number?: string | null
          description?: string | null
          disabled?: boolean
          disabled_comment?: string | null
          exclude_numbering?: boolean
          flow_id?: string
          hide_title_pdf?: boolean
          id?: string
          mandatory?: boolean
          name?: string
          position?: number
          read_only_on_mobile_app?: boolean
          sequence_id?: string | null
          sequence_type?: Database["public"]["Enums"]["sequencing_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phases_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_element_links: {
        Row: {
          created_at: string
          dependency_type: string
          from_element_id: string
          id: string
          plan_id: string
          project_id: string
          to_element_id: string
        }
        Insert: {
          created_at?: string
          dependency_type: string
          from_element_id: string
          id?: string
          plan_id: string
          project_id: string
          to_element_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          from_element_id?: string
          id?: string
          plan_id?: string
          project_id?: string
          to_element_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_element_links_from_element_id_fkey"
            columns: ["from_element_id"]
            isOneToOne: false
            referencedRelation: "plan_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_element_links_plan_id_project_id_fkey"
            columns: ["plan_id", "project_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "plan_element_links_to_element_id_fkey"
            columns: ["to_element_id"]
            isOneToOne: false
            referencedRelation: "plan_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_elements: {
        Row: {
          collaborator_id: string | null
          color: string | null
          created_at: string
          end_at: string | null
          flow_id: string | null
          id: string
          plan_id: string
          project_id: string
          start_at: string | null
          tablet_id: string | null
        }
        Insert: {
          collaborator_id?: string | null
          color?: string | null
          created_at?: string
          end_at?: string | null
          flow_id?: string | null
          id?: string
          plan_id: string
          project_id: string
          start_at?: string | null
          tablet_id?: string | null
        }
        Update: {
          collaborator_id?: string | null
          color?: string | null
          created_at?: string
          end_at?: string | null
          flow_id?: string | null
          id?: string
          plan_id?: string
          project_id?: string
          start_at?: string | null
          tablet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_elements_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_elements_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_elements_plan_id_project_id_fkey"
            columns: ["plan_id", "project_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "plan_elements_tablet_id_fkey"
            columns: ["tablet_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_milestones: {
        Row: {
          color: string
          created_at: string
          date: string
          description: string | null
          id: string
          name: string
          plan_id: string
          project_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          name: string
          plan_id: string
          project_id: string
        }
        Update: {
          color?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          name?: string
          plan_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_milestones_plan_id_project_id_fkey"
            columns: ["plan_id", "project_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          scale: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          scale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          scale?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_access_history: {
        Row: {
          accessed_at: string
          collaborator_id: string
          flow_filters: Json | null
          project_id: string
        }
        Insert: {
          accessed_at?: string
          collaborator_id: string
          flow_filters?: Json | null
          project_id: string
        }
        Update: {
          accessed_at?: string
          collaborator_id?: string
          flow_filters?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_access_history_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_access_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_geojson_layers: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          data: Json
          file_name: string | null
          id: string
          locked: boolean
          name: string
          project_id: string
          visible: boolean
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          data: Json
          file_name?: string | null
          id?: string
          locked?: boolean
          name: string
          project_id: string
          visible?: boolean
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          file_name?: string | null
          id?: string
          locked?: boolean
          name?: string
          project_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_geojson_layers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_geojson_layers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_list_items: {
        Row: {
          comment: string | null
          consumable: boolean
          display_comment: boolean
          equipment_id: string | null
          id: string
          list_id: string
          position: number
          quantity: number | null
          risk_id: string | null
          unit: string | null
        }
        Insert: {
          comment?: string | null
          consumable?: boolean
          display_comment?: boolean
          equipment_id?: string | null
          id?: string
          list_id: string
          position?: number
          quantity?: number | null
          risk_id?: string | null
          unit?: string | null
        }
        Update: {
          comment?: string | null
          consumable?: boolean
          display_comment?: boolean
          equipment_id?: string | null
          id?: string
          list_id?: string
          position?: number
          quantity?: number | null
          risk_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_list_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "library_equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "project_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_list_items_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "library_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_lists: {
        Row: {
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          reference: string | null
          type: Database["public"]["Enums"]["project_list_type"]
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          reference?: string | null
          type: Database["public"]["Enums"]["project_list_type"]
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          reference?: string | null
          type?: Database["public"]["Enums"]["project_list_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_lists_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_lists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_member_hierarchies: {
        Row: {
          collaborator_id: string
          hierarchy_id: string
          project_id: string
        }
        Insert: {
          collaborator_id: string
          hierarchy_id: string
          project_id: string
        }
        Update: {
          collaborator_id?: string
          hierarchy_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_member_hierarchies_hierarchy_id_fkey"
            columns: ["hierarchy_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_member_hierarchies_project_id_collaborator_id_fkey"
            columns: ["project_id", "collaborator_id"]
            isOneToOne: false
            referencedRelation: "project_members"
            referencedColumns: ["project_id", "collaborator_id"]
          },
        ]
      }
      project_members: {
        Row: {
          collaborator_id: string
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["team_role"]
          sort_order: number
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          project_id: string
          role: Database["public"]["Enums"]["team_role"]
          sort_order?: number
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["team_role"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_members_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_history: {
        Row: {
          actor_id: string | null
          comment: string | null
          created_at: string
          from_status_id: string | null
          id: number
          project_id: string
          source: Database["public"]["Enums"]["event_source"]
          to_status_id: string | null
        }
        Insert: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          from_status_id?: string | null
          id?: never
          project_id: string
          source?: Database["public"]["Enums"]["event_source"]
          to_status_id?: string | null
        }
        Update: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          from_status_id?: string | null
          id?: never
          project_id?: string
          source?: Database["public"]["Enums"]["event_source"]
          to_status_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_history_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_history_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tablets: {
        Row: {
          created_at: string
          project_id: string
          tablet_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          tablet_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          tablet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tablets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tablets_tablet_id_fkey"
            columns: ["tablet_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: string
          archived: boolean
          business_domain: string | null
          business_ref: string | null
          client_id: string
          code_project: string | null
          complement_ref_1: string | null
          complement_ref_2: string | null
          contract_ref: string | null
          created_at: string
          created_by: string | null
          custom_status_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          designation: string
          end_date: string | null
          export_language_1: Database["public"]["Enums"]["export_language"]
          export_language_2: Database["public"]["Enums"]["export_language"]
          external_command: string | null
          family_id: string
          folder_id: string | null
          id: string
          internal_command: string | null
          is_contractual: boolean
          is_intern_supervised: boolean
          is_sub_folder: boolean
          is_supervised: boolean
          keywords: string | null
          location_label: string | null
          market_number: string | null
          national_program: string | null
          organization_id: string
          pgac_activities: string[]
          project_index: string | null
          published: boolean
          start_date: string | null
          supervision_1: string | null
          supervision_2: string | null
          supervision_3: string | null
          supervision_intern_1: string | null
          supervision_intern_2: string | null
          supervision_intern_3: string | null
          technical_deal: string | null
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          archived?: boolean
          business_domain?: string | null
          business_ref?: string | null
          client_id: string
          code_project?: string | null
          complement_ref_1?: string | null
          complement_ref_2?: string | null
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          designation: string
          end_date?: string | null
          export_language_1?: Database["public"]["Enums"]["export_language"]
          export_language_2?: Database["public"]["Enums"]["export_language"]
          external_command?: string | null
          family_id: string
          folder_id?: string | null
          id?: string
          internal_command?: string | null
          is_contractual?: boolean
          is_intern_supervised?: boolean
          is_sub_folder?: boolean
          is_supervised?: boolean
          keywords?: string | null
          location_label?: string | null
          market_number?: string | null
          national_program?: string | null
          organization_id: string
          pgac_activities?: string[]
          project_index?: string | null
          published?: boolean
          start_date?: string | null
          supervision_1?: string | null
          supervision_2?: string | null
          supervision_3?: string | null
          supervision_intern_1?: string | null
          supervision_intern_2?: string | null
          supervision_intern_3?: string | null
          technical_deal?: string | null
          type: Database["public"]["Enums"]["project_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          archived?: boolean
          business_domain?: string | null
          business_ref?: string | null
          client_id?: string
          code_project?: string | null
          complement_ref_1?: string | null
          complement_ref_2?: string | null
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          designation?: string
          end_date?: string | null
          export_language_1?: Database["public"]["Enums"]["export_language"]
          export_language_2?: Database["public"]["Enums"]["export_language"]
          external_command?: string | null
          family_id?: string
          folder_id?: string | null
          id?: string
          internal_command?: string | null
          is_contractual?: boolean
          is_intern_supervised?: boolean
          is_sub_folder?: boolean
          is_supervised?: boolean
          keywords?: string | null
          location_label?: string | null
          market_number?: string | null
          national_program?: string | null
          organization_id?: string
          pgac_activities?: string[]
          project_index?: string | null
          published?: boolean
          start_date?: string | null
          supervision_1?: string | null
          supervision_2?: string | null
          supervision_3?: string | null
          supervision_intern_1?: string | null
          supervision_intern_2?: string | null
          supervision_intern_3?: string | null
          technical_deal?: string | null
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_connection_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          device_id: string | null
          expires_at: string
          id: string
          principal_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          expires_at: string
          id?: string
          principal_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          expires_at?: string
          id?: string
          principal_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_connection_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_connection_tokens_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_counters: {
        Row: {
          current_value: number
          id: string
          project_id: string | null
          reference_rule_id: string
        }
        Insert: {
          current_value: number
          id?: string
          project_id?: string | null
          reference_rule_id: string
        }
        Update: {
          current_value?: number
          id?: string
          project_id?: string | null
          reference_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_counters_reference_rule_id_fkey"
            columns: ["reference_rule_id"]
            isOneToOne: false
            referencedRelation: "reference_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_rules: {
        Row: {
          account_id: string
          active: boolean
          counter_format: number
          counter_type: Database["public"]["Enums"]["counter_type"]
          created_at: string
          field: Database["public"]["Enums"]["reference_field"]
          id: string
          label_family_id: string | null
          link_type: Database["public"]["Enums"]["link_type"]
          nature: Database["public"]["Enums"]["business_class"]
          nomenclature: string
          start_value: number
          updated_at: string
        }
        Insert: {
          account_id: string
          active?: boolean
          counter_format?: number
          counter_type?: Database["public"]["Enums"]["counter_type"]
          created_at?: string
          field: Database["public"]["Enums"]["reference_field"]
          id?: string
          label_family_id?: string | null
          link_type?: Database["public"]["Enums"]["link_type"]
          nature: Database["public"]["Enums"]["business_class"]
          nomenclature: string
          start_value?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          counter_format?: number
          counter_type?: Database["public"]["Enums"]["counter_type"]
          created_at?: string
          field?: Database["public"]["Enums"]["reference_field"]
          id?: string
          label_family_id?: string | null
          link_type?: Database["public"]["Enums"]["link_type"]
          nature?: Database["public"]["Enums"]["business_class"]
          nomenclature?: string
          start_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_rules_label_family_id_fkey"
            columns: ["label_family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          flow_id: string
          id: string
          position: number
          type: Database["public"]["Enums"]["sequencing_type"]
        }
        Insert: {
          flow_id: string
          id?: string
          position: number
          type?: Database["public"]["Enums"]["sequencing_type"]
        }
        Update: {
          flow_id?: string
          id?: string
          position?: number
          type?: Database["public"]["Enums"]["sequencing_type"]
        }
        Relationships: [
          {
            foreignKeyName: "sequences_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_events: {
        Row: {
          action: string
          actor_id: string | null
          block_id: string
          client_event_id: string
          event_sequence: number | null
          flow_id: string
          from_state: Database["public"]["Enums"]["signature_state"] | null
          id: number
          nature: Database["public"]["Enums"]["signature_nature"] | null
          occurred_at: string
          payload_path: string | null
          reason: string | null
          signature_id: string | null
          source: Database["public"]["Enums"]["event_source"]
          supervisor_name: string | null
          to_state: Database["public"]["Enums"]["signature_state"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          block_id: string
          client_event_id?: string
          event_sequence?: number | null
          flow_id: string
          from_state?: Database["public"]["Enums"]["signature_state"] | null
          id?: never
          nature?: Database["public"]["Enums"]["signature_nature"] | null
          occurred_at?: string
          payload_path?: string | null
          reason?: string | null
          signature_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          supervisor_name?: string | null
          to_state?: Database["public"]["Enums"]["signature_state"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          block_id?: string
          client_event_id?: string
          event_sequence?: number | null
          flow_id?: string
          from_state?: Database["public"]["Enums"]["signature_state"] | null
          id?: never
          nature?: Database["public"]["Enums"]["signature_nature"] | null
          occurred_at?: string
          payload_path?: string | null
          reason?: string | null
          signature_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          supervisor_name?: string | null
          to_state?: Database["public"]["Enums"]["signature_state"] | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          block_id: string
          comment: string | null
          company_name: string | null
          connection_mode: string | null
          contributor_type: Database["public"]["Enums"]["contributor_type"]
          created_at: string
          created_by: string | null
          device_id: string | null
          disabled: boolean
          email: string | null
          first_name: string | null
          flow_id: string
          hash: string | null
          id: string
          last_name: string | null
          latitude: number | null
          local_created_at: string | null
          longitude: number | null
          nature: Database["public"]["Enums"]["signature_nature"]
          profession: string | null
          proxied: boolean
          proxy_date: string | null
          proxy_holder_name: string | null
          proxy_principal_first_name: string | null
          proxy_principal_last_name: string | null
          proxy_principal_name: string | null
          sign_with_qr_code: boolean
          signatory_id: string | null
          signature_path: string | null
          signed_at: string
          source: Database["public"]["Enums"]["event_source"]
          state: Database["public"]["Enums"]["signature_state"]
          step_id: string
        }
        Insert: {
          block_id: string
          comment?: string | null
          company_name?: string | null
          connection_mode?: string | null
          contributor_type: Database["public"]["Enums"]["contributor_type"]
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          disabled?: boolean
          email?: string | null
          first_name?: string | null
          flow_id: string
          hash?: string | null
          id?: string
          last_name?: string | null
          latitude?: number | null
          local_created_at?: string | null
          longitude?: number | null
          nature: Database["public"]["Enums"]["signature_nature"]
          profession?: string | null
          proxied?: boolean
          proxy_date?: string | null
          proxy_holder_name?: string | null
          proxy_principal_first_name?: string | null
          proxy_principal_last_name?: string | null
          proxy_principal_name?: string | null
          sign_with_qr_code?: boolean
          signatory_id?: string | null
          signature_path?: string | null
          signed_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          state?: Database["public"]["Enums"]["signature_state"]
          step_id: string
        }
        Update: {
          block_id?: string
          comment?: string | null
          company_name?: string | null
          connection_mode?: string | null
          contributor_type?: Database["public"]["Enums"]["contributor_type"]
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          disabled?: boolean
          email?: string | null
          first_name?: string | null
          flow_id?: string
          hash?: string | null
          id?: string
          last_name?: string | null
          latitude?: number | null
          local_created_at?: string | null
          longitude?: number | null
          nature?: Database["public"]["Enums"]["signature_nature"]
          profession?: string | null
          proxied?: boolean
          proxy_date?: string | null
          proxy_holder_name?: string | null
          proxy_principal_first_name?: string | null
          proxy_principal_last_name?: string | null
          proxy_principal_name?: string | null
          sign_with_qr_code?: boolean
          signatory_id?: string | null
          signature_path?: string | null
          signed_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          state?: Database["public"]["Enums"]["signature_state"]
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_signatory_id_fkey"
            columns: ["signatory_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
        ]
      }
      step_fill_unlocks: {
        Row: {
          flow_id: string
          id: string
          occurred_at: string
          reason: string | null
          source: Database["public"]["Enums"]["event_source"]
          step_id: string
          unlocked_by: string | null
        }
        Insert: {
          flow_id: string
          id?: string
          occurred_at?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          step_id: string
          unlocked_by?: string | null
        }
        Update: {
          flow_id?: string
          id?: string
          occurred_at?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          step_id?: string
          unlocked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_fill_unlocks_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_fill_unlocks_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_fill_unlocks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      step_navigation_events: {
        Row: {
          action: string
          actor_id: string | null
          comment: string | null
          flow_id: string
          id: string
          occurred_at: string
          source: Database["public"]["Enums"]["event_source"]
          step_id: string
          step_navigation_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          comment?: string | null
          flow_id: string
          id?: string
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          step_id: string
          step_navigation_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          comment?: string | null
          flow_id?: string
          id?: string
          occurred_at?: string
          source?: Database["public"]["Enums"]["event_source"]
          step_id?: string
          step_navigation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_navigation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_navigation_events_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_navigation_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_navigation_events_step_navigation_id_fkey"
            columns: ["step_navigation_id"]
            isOneToOne: false
            referencedRelation: "step_navigations"
            referencedColumns: ["id"]
          },
        ]
      }
      step_navigations: {
        Row: {
          flow_id: string
          id: string
          message: string | null
          position: number
          step_id: string
          style: Database["public"]["Enums"]["navigation_style"]
          target_phase_id: string | null
          target_step_id: string | null
        }
        Insert: {
          flow_id: string
          id?: string
          message?: string | null
          position?: number
          step_id: string
          style?: Database["public"]["Enums"]["navigation_style"]
          target_phase_id?: string | null
          target_step_id?: string | null
        }
        Update: {
          flow_id?: string
          id?: string
          message?: string | null
          position?: number
          step_id?: string
          style?: Database["public"]["Enums"]["navigation_style"]
          target_phase_id?: string | null
          target_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_navigations_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_navigations_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_navigations_target_phase_id_fkey"
            columns: ["target_phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_navigations_target_step_id_fkey"
            columns: ["target_step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
        ]
      }
      step_tags: {
        Row: {
          step_id: string
          tag_id: string
        }
        Insert: {
          step_id: string
          tag_id: string
        }
        Update: {
          step_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_tags_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      steps: {
        Row: {
          additional_comment: string | null
          created_at: string
          custom_number: string | null
          description: string | null
          disabled: boolean
          disabled_comment: string | null
          exclude_numbering: boolean
          first_opened_at: string | null
          flow_id: string
          hide_title_pdf: boolean
          id: string
          linked_flow_id: string | null
          name: string
          phase_id: string
          position: number
          read_only_on_mobile_app: boolean
          revision_number: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation_source: Database["public"]["Enums"]["event_source"] | null
        }
        Insert: {
          additional_comment?: string | null
          created_at?: string
          custom_number?: string | null
          description?: string | null
          disabled?: boolean
          disabled_comment?: string | null
          exclude_numbering?: boolean
          first_opened_at?: string | null
          flow_id: string
          hide_title_pdf?: boolean
          id?: string
          linked_flow_id?: string | null
          name: string
          phase_id: string
          position: number
          read_only_on_mobile_app?: boolean
          revision_number?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_source?: Database["public"]["Enums"]["event_source"] | null
        }
        Update: {
          additional_comment?: string | null
          created_at?: string
          custom_number?: string | null
          description?: string | null
          disabled?: boolean
          disabled_comment?: string | null
          exclude_numbering?: boolean
          first_opened_at?: string | null
          flow_id?: string
          hide_title_pdf?: boolean
          id?: string
          linked_flow_id?: string | null
          name?: string
          phase_id?: string
          position?: number
          read_only_on_mobile_app?: boolean
          revision_number?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_source?: Database["public"]["Enums"]["event_source"] | null
        }
        Relationships: [
          {
            foreignKeyName: "steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_linked_flow_id_fkey"
            columns: ["linked_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      tablets: {
        Row: {
          account_id: string
          android_version: string | null
          app_version: string | null
          battery_level: number | null
          collaborator_id: string | null
          comment: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          device_model: string | null
          family_id: string
          id: string
          last_latitude: number | null
          last_longitude: number | null
          last_push_at: string | null
          mac_address: string | null
          name: string
          nature: Database["public"]["Enums"]["tablet_nature"]
          notify_email: string
          profile_status: Database["public"]["Enums"]["collaborator_status"]
          screen_size: string | null
          status: Database["public"]["Enums"]["tablet_status"]
          unique_device_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          android_version?: string | null
          app_version?: string | null
          battery_level?: number | null
          collaborator_id?: string | null
          comment?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          device_model?: string | null
          family_id: string
          id?: string
          last_latitude?: number | null
          last_longitude?: number | null
          last_push_at?: string | null
          mac_address?: string | null
          name: string
          nature?: Database["public"]["Enums"]["tablet_nature"]
          notify_email: string
          profile_status?: Database["public"]["Enums"]["collaborator_status"]
          screen_size?: string | null
          status?: Database["public"]["Enums"]["tablet_status"]
          unique_device_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          android_version?: string | null
          app_version?: string | null
          battery_level?: number | null
          collaborator_id?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          device_model?: string | null
          family_id?: string
          id?: string
          last_latitude?: number | null
          last_longitude?: number | null
          last_push_at?: string | null
          mac_address?: string | null
          name?: string
          nature?: Database["public"]["Enums"]["tablet_nature"]
          notify_email?: string
          profile_status?: Database["public"]["Enums"]["collaborator_status"]
          screen_size?: string | null
          status?: Database["public"]["Enums"]["tablet_status"]
          unique_device_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tablets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tablets_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: true
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tablets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tablets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          account_id: string | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          position: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_objects: {
        Row: {
          account_id: string
          certificate_document_id: string | null
          created_at: string
          created_by: string | null
          custom_status_id: string | null
          deleted_at: string | null
          description: string | null
          external_reference: string | null
          family_id: string
          id: string
          identification_number: string | null
          item_code: string | null
          name: string
          object_index: string | null
          organization_id: string
          parent_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          certificate_document_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          description?: string | null
          external_reference?: string | null
          family_id: string
          id?: string
          identification_number?: string | null
          item_code?: string | null
          name: string
          object_index?: string | null
          organization_id: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          certificate_document_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_status_id?: string | null
          deleted_at?: string | null
          description?: string | null
          external_reference?: string | null
          family_id?: string
          id?: string
          identification_number?: string | null
          item_code?: string | null
          name?: string
          object_index?: string | null
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_objects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_certificate_document_id_fkey"
            columns: ["certificate_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "label_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "technical_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_objects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      wording_configuration_languages: {
        Row: {
          fields: Json
          id: string
          language: Database["public"]["Enums"]["ui_language"]
          wording_configuration_id: string
        }
        Insert: {
          fields?: Json
          id?: string
          language: Database["public"]["Enums"]["ui_language"]
          wording_configuration_id: string
        }
        Update: {
          fields?: Json
          id?: string
          language?: Database["public"]["Enums"]["ui_language"]
          wording_configuration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wording_configuration_languages_wording_configuration_id_fkey"
            columns: ["wording_configuration_id"]
            isOneToOne: false
            referencedRelation: "wording_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      wording_configurations: {
        Row: {
          created_at: string
          description: string | null
          hide_bpa: boolean
          hide_bpe_valid: boolean
          hide_vso_sr: boolean
          id: string
          is_default: boolean
          name: string
          organization_id: string
          read_only: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hide_bpa?: boolean
          hide_bpe_valid?: boolean
          hide_vso_sr?: boolean
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          read_only?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hide_bpa?: boolean
          hide_bpe_valid?: boolean
          hide_vso_sr?: boolean
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          read_only?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wording_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      convert_referential_to_folder: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      document_complete_generation: {
        Args: {
          p_error?: string
          p_path: string
          p_size: number
          p_task_id: string
        }
        Returns: undefined
      }
      document_enqueue_generation: {
        Args: { p_action?: string; p_extra?: Json; p_version_id: string }
        Returns: string
      }
      document_import_from_library: {
        Args: { p_ids: string[]; p_project_id: string }
        Returns: number
      }
      document_refresh_from_library: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      document_version_action: {
        Args: { p_action: string; p_payload?: Json; p_version_id: string }
        Returns: Json
      }
      duplicate_flow: {
        Args: {
          p_flow_id: string
          p_name: string
          p_project_id?: string
          p_ref_int?: string
        }
        Returns: string
      }
      duplicate_phase: {
        Args: { p_before_phase_id?: string; p_phase_id: string }
        Returns: string
      }
      duplicate_step: {
        Args: {
          p_before_step_id?: string
          p_step_id: string
          p_target_phase_id: string
        }
        Returns: string
      }
      ensure_sequences: { Args: { p_flow_id: string }; Returns: undefined }
      execute_referential_flow: {
        Args: {
          p_copies?: number
          p_flow_id: string
          p_reset_internal?: boolean
        }
        Returns: string
      }
      form_reorder: {
        Args: { p_ids: string[]; p_table: string }
        Returns: undefined
      }
      import_referential_flows: {
        Args: {
          p_flow_ids: string[]
          p_project_id: string
          p_update_existing?: boolean
        }
        Returns: string
      }
      library_item_usage: {
        Args: { p_id: string; p_kind: string }
        Returns: Json
      }
      mark_step_opened: { Args: { p_step_id: string }; Returns: undefined }
      merge_sequence: { Args: { p_sequence_id: string }; Returns: undefined }
      mobile_complete_signature: {
        Args: {
          p_comment?: string
          p_id: string
          p_signature_path: string
          p_signed_at: string
        }
        Returns: undefined
      }
      mobile_create_form_response: { Args: { p: Json }; Returns: undefined }
      mobile_mark_step_opened: {
        Args: { p_opened_at?: string; p_step_id: string }
        Returns: undefined
      }
      mobile_set_flow_status: {
        Args: { p_comment?: string; p_flow_id: string; p_status_id: string }
        Returns: undefined
      }
      mobile_sign: { Args: { p: Json }; Returns: undefined }
      mobile_sign_multi_pr: { Args: { p: Json }; Returns: undefined }
      mobile_unlock_flow: { Args: { p: Json }; Returns: undefined }
      mobile_update_form_response: {
        Args: { p: Json; p_id: string }
        Returns: undefined
      }
      mobile_update_multi_pr_item: {
        Args: { p: Json; p_id: string }
        Returns: undefined
      }
      mobile_validate_step: {
        Args: { p_step_id: string; p_validated_at?: string }
        Returns: string[]
      }
      move_step: {
        Args: { p_index: number; p_step_id: string; p_target_phase_id: string }
        Returns: undefined
      }
      refresh_referential_flow: { Args: { p_flow_id: string }; Returns: string }
      reorder_phases: {
        Args: { p_flow_id: string; p_ids: string[] }
        Returns: undefined
      }
      reset_flow: { Args: { p_flow_id: string }; Returns: undefined }
      run_async_job: { Args: { p_job_id: string }; Returns: Json }
      save_rubric_values: {
        Args: {
          p_options?: Json
          p_response_id: string
          p_rubric_lineage_id: string
          p_values: Json
        }
        Returns: number
      }
      set_flow_status: {
        Args: { p_comment?: string; p_flow_id: string; p_status_id: string }
        Returns: undefined
      }
      set_step_validation: {
        Args: { p_step_id: string; p_validate: boolean }
        Returns: string[]
      }
      share_code_attempt: {
        Args: { p_id: string; p_kind: string; p_max: number }
        Returns: number
      }
      split_sequence: { Args: { p_phase_id: string }; Returns: string }
      step_sequence_blockers: { Args: { p_step_id: string }; Returns: string[] }
      technical_object_write_attributes: {
        Args: { p_object_id: string; p_response_id: string; p_values: Json }
        Returns: number
      }
      unlock_referential_flow: {
        Args: { p_flow_id: string; p_reset_internal?: boolean }
        Returns: undefined
      }
      unlock_step_fill: {
        Args: { p_reason?: string; p_step_id: string }
        Returns: undefined
      }
    }
    Enums: {
      additional_right: "generic_form" | "model_form" | "manage_diffusion"
      api_key_type: "account" | "organization"
      api_service_class: "L1" | "L2" | "L3"
      auth_mode: "basic" | "sso" | "basic_sso" | "sso_webapp"
      authority:
        | "simple"
        | "normal"
        | "advanced"
        | "admin"
        | "global_admin"
        | "siteflow_admin"
        | "co_contractor_user"
        | "co_contractor_operator"
        | "co_contractor_device"
      bg_task_status:
        | "acknowledged"
        | "in_progress"
        | "done"
        | "error"
        | "to_retry"
      block_state: "redaction" | "verification" | "approbation" | "validated"
      block_type:
        | "pr"
        | "emm"
        | "adr"
        | "dsi"
        | "form"
        | "txt"
        | "rhp"
        | "multi_pr"
        | "object"
      block_validation_action:
        | "create"
        | "to_verification"
        | "to_approbation"
        | "to_validated"
        | "retry"
        | "reject"
        | "reset"
      business_class:
        | "project"
        | "flow"
        | "phase"
        | "step"
        | "document"
        | "form"
        | "form_response"
        | "technical_object"
        | "multi_pr"
      closing_section_type:
        | "document"
        | "report"
        | "certificate"
        | "reference"
        | "client_response"
        | "document_large_file"
        | "closing_folder"
      collaborator_kind: "user" | "operator" | "device"
      collaborator_status:
        | "active"
        | "inactive"
        | "onboarding"
        | "blocked"
        | "deleted"
      contributor_type: "intern" | "extern" | "not_listed_intern"
      counter_type: "global" | "local"
      custom_field_type:
        | "text"
        | "textarea"
        | "label"
        | "integer"
        | "double"
        | "boolean"
        | "date"
        | "datetime"
        | "select"
        | "multiselect"
        | "file"
        | "image"
        | "metadata"
        | "link"
      document_nature:
        | "pr"
        | "emm"
        | "adr"
        | "dsi"
        | "multi_pr"
        | "flow_form"
        | "object"
        | "project_form"
        | "block_form"
        | "multi_flow_form"
        | "lfa"
        | "lda"
        | "list_emm"
        | "list_emm_flow"
        | "list_adr"
        | "list_adr_flow"
        | "lca"
        | "field_feedback"
        | "diagram"
        | "pdf_versioned"
        | "pdf_unversioned"
        | "rfi"
      document_origin:
        | "local"
        | "imported_from_library"
        | "derived_from_standard"
      document_scope: "library" | "project"
      document_selection_kind:
        | "flow"
        | "document"
        | "skill"
        | "technical_object_attribute"
        | "form_response"
        | "emm_element"
      document_source: "flow" | "form" | "module" | "extern" | "closing_folder"
      document_state: "prel" | "bpo" | "bpe" | "temp" | "bpa" | "none"
      document_step:
        | "diffusion"
        | "client_res"
        | "bpe"
        | "bpe_valid"
        | "diffusion_bpa"
        | "client_res_bpa"
        | "bpa"
        | "bpa_refused"
        | "upload_file"
      document_visa:
        | "diffusion"
        | "diffusion_bpa"
        | "modification"
        | "modification_bpa"
        | "vso"
        | "vso_sr"
        | "vao"
        | "vso_bpa"
        | "vao_bpa"
        | "bpe_valid"
      dsi_signatories_status: "enabled" | "disabled" | "required" | "optional"
      event_source: "mobile" | "webapp" | "api"
      export_language: "none" | "fr" | "en" | "de" | "it"
      flow_event_type:
        | "create"
        | "delete"
        | "import_content_referential"
        | "import_content_template"
        | "reset_flow"
        | "delete_and_re_import_content"
        | "update_library"
        | "detach_fbl"
        | "activate_phase"
        | "activate_step"
        | "activate_form"
        | "deactivate_phase"
        | "deactivate_step"
        | "deactivate_form"
        | "deactivate_and_link_new_form"
        | "detach_and_link_new_form"
        | "add_user_hierarchy_in_flow"
        | "delete_user_hierarchy_from_flow"
        | "deactivate_signature"
        | "skip_fill_restriction"
        | "validate_step"
        | "devalidate_step"
      flow_origin: "local" | "derived_from_standard"
      flow_type:
        | "specific"
        | "generic"
        | "group"
        | "flow_form"
        | "template"
        | "referential"
        | "referential_generic"
        | "group_referential"
        | "referential_intervention"
        | "local_referential"
      form_content_location: "none" | "content" | "appendix"
      form_location: "library" | "project"
      form_nature: "model" | "generic" | "other" | "local" | "archived"
      form_origin: "imported" | "local"
      geometry_icon:
        | "default"
        | "without_icon"
        | "truck"
        | "snowplow"
        | "warehouse"
        | "archive"
        | "hard_hat"
        | "toolbox"
        | "rocket"
        | "caravan"
      geometry_kind:
        | "point"
        | "polygon"
        | "polyline"
        | "circle"
        | "multi_line_string"
      index_format:
        | "numeric_zero"
        | "numeric"
        | "alpha"
        | "numeric_all_zero"
        | "numeric_all_zero_start_zero"
        | "numeric_decimal"
        | "numeric_decimal_start_zero"
      job_status: "to_do" | "in_progress" | "done" | "failed"
      label_family_kind: "family" | "category"
      label_family_nature:
        | "project"
        | "flow"
        | "document"
        | "form"
        | "risk"
        | "equipment"
        | "device"
        | "team"
        | "function"
        | "legal"
        | "skill"
        | "contract"
        | "technical_object"
        | "activity_domain"
        | "list"
        | "hierarchy"
      label_provenance: "default" | "entity"
      link_type:
        | "default"
        | "entity_family_parent"
        | "entity_family"
        | "entity_parent_family_parent"
        | "entity_parent_family"
      navigation_style: "default" | "info" | "warning" | "error" | "success"
      number_format: "fr" | "en"
      object_attr_link: "disabled" | "default_family" | "other_family"
      project_list_type: "emm" | "adr"
      project_type: "project" | "referential" | "template" | "pgac" | "folder"
      question_icon:
        | "question"
        | "clock"
        | "exclamation_triangle"
        | "wrench"
        | "flag"
        | "info_circle"
        | "bell"
        | "key"
        | "hand_paper"
        | "lightbulb"
        | "calendar"
        | "eye"
      question_type:
        | "short_answer"
        | "long_answer"
        | "multiple_answers"
        | "unique_choice"
        | "multiple_choices"
        | "single_choice_list"
        | "multiple_choice_list"
        | "date"
        | "datetime"
        | "duration"
        | "value_unit"
        | "photo"
        | "collaborator"
        | "location"
        | "formula"
        | "file"
        | "text_editor"
      reference_field:
        | "ref_ext"
        | "ref_int"
        | "complement_ref_int"
        | "complement_ref_ext"
      relative_nature: "parent" | "child"
      response_context: "project" | "flow" | "share"
      response_state: "in_progress" | "done"
      rubric_type: "question" | "table_row" | "table_column"
      selection_strategy: "all" | "selected" | "none"
      sequencing_type: "linear" | "parallel"
      signature_nature:
        | "realisation"
        | "tech_control"
        | "breakpoint_int_1"
        | "breakpoint_int_2"
        | "breakpoint_int_3"
        | "convocation_int_1"
        | "convocation_int_2"
        | "convocation_int_3"
        | "breakpoint_ext_1"
        | "breakpoint_ext_2"
        | "breakpoint_ext_3"
        | "convocation_ext_1"
        | "convocation_ext_2"
        | "convocation_ext_3"
      signature_state: "signed" | "waiting" | "free" | "not_possible"
      size_enum: "xs" | "s" | "m" | "l" | "xl"
      status_category:
        | "todo"
        | "in_preparation"
        | "in_operation"
        | "in_progress"
        | "done"
      tablet_nature: "internal" | "external"
      tablet_status: "active" | "disabled" | "broken" | "down" | "maintenance"
      team_role: "readonly" | "operator" | "writer" | "expert" | "responsible"
      txt_visibility: "mobile_app" | "document"
      ui_language: "fr" | "en" | "de" | "it"
      unique_mode: "new_or_resume" | "new_response" | "resume_response"
      value_type:
        | "string"
        | "text"
        | "boolean"
        | "string_list"
        | "date"
        | "datetime"
        | "duration"
        | "number"
        | "value_and_unit"
        | "coordinates"
        | "file_list"
        | "rich_text"
        | "signature"
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
    Enums: {
      additional_right: ["generic_form", "model_form", "manage_diffusion"],
      api_key_type: ["account", "organization"],
      api_service_class: ["L1", "L2", "L3"],
      auth_mode: ["basic", "sso", "basic_sso", "sso_webapp"],
      authority: [
        "simple",
        "normal",
        "advanced",
        "admin",
        "global_admin",
        "siteflow_admin",
        "co_contractor_user",
        "co_contractor_operator",
        "co_contractor_device",
      ],
      bg_task_status: [
        "acknowledged",
        "in_progress",
        "done",
        "error",
        "to_retry",
      ],
      block_state: ["redaction", "verification", "approbation", "validated"],
      block_type: [
        "pr",
        "emm",
        "adr",
        "dsi",
        "form",
        "txt",
        "rhp",
        "multi_pr",
        "object",
      ],
      block_validation_action: [
        "create",
        "to_verification",
        "to_approbation",
        "to_validated",
        "retry",
        "reject",
        "reset",
      ],
      business_class: [
        "project",
        "flow",
        "phase",
        "step",
        "document",
        "form",
        "form_response",
        "technical_object",
        "multi_pr",
      ],
      closing_section_type: [
        "document",
        "report",
        "certificate",
        "reference",
        "client_response",
        "document_large_file",
        "closing_folder",
      ],
      collaborator_kind: ["user", "operator", "device"],
      collaborator_status: [
        "active",
        "inactive",
        "onboarding",
        "blocked",
        "deleted",
      ],
      contributor_type: ["intern", "extern", "not_listed_intern"],
      counter_type: ["global", "local"],
      custom_field_type: [
        "text",
        "textarea",
        "label",
        "integer",
        "double",
        "boolean",
        "date",
        "datetime",
        "select",
        "multiselect",
        "file",
        "image",
        "metadata",
        "link",
      ],
      document_nature: [
        "pr",
        "emm",
        "adr",
        "dsi",
        "multi_pr",
        "flow_form",
        "object",
        "project_form",
        "block_form",
        "multi_flow_form",
        "lfa",
        "lda",
        "list_emm",
        "list_emm_flow",
        "list_adr",
        "list_adr_flow",
        "lca",
        "field_feedback",
        "diagram",
        "pdf_versioned",
        "pdf_unversioned",
        "rfi",
      ],
      document_origin: [
        "local",
        "imported_from_library",
        "derived_from_standard",
      ],
      document_scope: ["library", "project"],
      document_selection_kind: [
        "flow",
        "document",
        "skill",
        "technical_object_attribute",
        "form_response",
        "emm_element",
      ],
      document_source: ["flow", "form", "module", "extern", "closing_folder"],
      document_state: ["prel", "bpo", "bpe", "temp", "bpa", "none"],
      document_step: [
        "diffusion",
        "client_res",
        "bpe",
        "bpe_valid",
        "diffusion_bpa",
        "client_res_bpa",
        "bpa",
        "bpa_refused",
        "upload_file",
      ],
      document_visa: [
        "diffusion",
        "diffusion_bpa",
        "modification",
        "modification_bpa",
        "vso",
        "vso_sr",
        "vao",
        "vso_bpa",
        "vao_bpa",
        "bpe_valid",
      ],
      dsi_signatories_status: ["enabled", "disabled", "required", "optional"],
      event_source: ["mobile", "webapp", "api"],
      export_language: ["none", "fr", "en", "de", "it"],
      flow_event_type: [
        "create",
        "delete",
        "import_content_referential",
        "import_content_template",
        "reset_flow",
        "delete_and_re_import_content",
        "update_library",
        "detach_fbl",
        "activate_phase",
        "activate_step",
        "activate_form",
        "deactivate_phase",
        "deactivate_step",
        "deactivate_form",
        "deactivate_and_link_new_form",
        "detach_and_link_new_form",
        "add_user_hierarchy_in_flow",
        "delete_user_hierarchy_from_flow",
        "deactivate_signature",
        "skip_fill_restriction",
        "validate_step",
        "devalidate_step",
      ],
      flow_origin: ["local", "derived_from_standard"],
      flow_type: [
        "specific",
        "generic",
        "group",
        "flow_form",
        "template",
        "referential",
        "referential_generic",
        "group_referential",
        "referential_intervention",
        "local_referential",
      ],
      form_content_location: ["none", "content", "appendix"],
      form_location: ["library", "project"],
      form_nature: ["model", "generic", "other", "local", "archived"],
      form_origin: ["imported", "local"],
      geometry_icon: [
        "default",
        "without_icon",
        "truck",
        "snowplow",
        "warehouse",
        "archive",
        "hard_hat",
        "toolbox",
        "rocket",
        "caravan",
      ],
      geometry_kind: [
        "point",
        "polygon",
        "polyline",
        "circle",
        "multi_line_string",
      ],
      index_format: [
        "numeric_zero",
        "numeric",
        "alpha",
        "numeric_all_zero",
        "numeric_all_zero_start_zero",
        "numeric_decimal",
        "numeric_decimal_start_zero",
      ],
      job_status: ["to_do", "in_progress", "done", "failed"],
      label_family_kind: ["family", "category"],
      label_family_nature: [
        "project",
        "flow",
        "document",
        "form",
        "risk",
        "equipment",
        "device",
        "team",
        "function",
        "legal",
        "skill",
        "contract",
        "technical_object",
        "activity_domain",
        "list",
        "hierarchy",
      ],
      label_provenance: ["default", "entity"],
      link_type: [
        "default",
        "entity_family_parent",
        "entity_family",
        "entity_parent_family_parent",
        "entity_parent_family",
      ],
      navigation_style: ["default", "info", "warning", "error", "success"],
      number_format: ["fr", "en"],
      object_attr_link: ["disabled", "default_family", "other_family"],
      project_list_type: ["emm", "adr"],
      project_type: ["project", "referential", "template", "pgac", "folder"],
      question_icon: [
        "question",
        "clock",
        "exclamation_triangle",
        "wrench",
        "flag",
        "info_circle",
        "bell",
        "key",
        "hand_paper",
        "lightbulb",
        "calendar",
        "eye",
      ],
      question_type: [
        "short_answer",
        "long_answer",
        "multiple_answers",
        "unique_choice",
        "multiple_choices",
        "single_choice_list",
        "multiple_choice_list",
        "date",
        "datetime",
        "duration",
        "value_unit",
        "photo",
        "collaborator",
        "location",
        "formula",
        "file",
        "text_editor",
      ],
      reference_field: [
        "ref_ext",
        "ref_int",
        "complement_ref_int",
        "complement_ref_ext",
      ],
      relative_nature: ["parent", "child"],
      response_context: ["project", "flow", "share"],
      response_state: ["in_progress", "done"],
      rubric_type: ["question", "table_row", "table_column"],
      selection_strategy: ["all", "selected", "none"],
      sequencing_type: ["linear", "parallel"],
      signature_nature: [
        "realisation",
        "tech_control",
        "breakpoint_int_1",
        "breakpoint_int_2",
        "breakpoint_int_3",
        "convocation_int_1",
        "convocation_int_2",
        "convocation_int_3",
        "breakpoint_ext_1",
        "breakpoint_ext_2",
        "breakpoint_ext_3",
        "convocation_ext_1",
        "convocation_ext_2",
        "convocation_ext_3",
      ],
      signature_state: ["signed", "waiting", "free", "not_possible"],
      size_enum: ["xs", "s", "m", "l", "xl"],
      status_category: [
        "todo",
        "in_preparation",
        "in_operation",
        "in_progress",
        "done",
      ],
      tablet_nature: ["internal", "external"],
      tablet_status: ["active", "disabled", "broken", "down", "maintenance"],
      team_role: ["readonly", "operator", "writer", "expert", "responsible"],
      txt_visibility: ["mobile_app", "document"],
      ui_language: ["fr", "en", "de", "it"],
      unique_mode: ["new_or_resume", "new_response", "resume_response"],
      value_type: [
        "string",
        "text",
        "boolean",
        "string_list",
        "date",
        "datetime",
        "duration",
        "number",
        "value_and_unit",
        "coordinates",
        "file_list",
        "rich_text",
        "signature",
      ],
    },
  },
} as const

