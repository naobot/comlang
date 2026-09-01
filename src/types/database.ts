// GENERATED FILE — do not hand-edit.
//
// Regenerate with `pnpm gen:types` in the same commit as any migration that changes
// these tables. Readable aliases (Project, ProjectMember, ProjectRole) live in
// ./models.ts; import from there.
//
// Note what is absent: private.is_project_member / is_project_owner. They live in the
// `private` schema precisely so PostgREST does not expose them, and their absence here
// is the confirmation of that.

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
      phoneme_class_members: {
        Row: { class_id: string; ipa: string; project_id: string }
        Insert: { class_id: string; ipa: string; project_id: string }
        Update: { class_id?: string; ipa?: string; project_id?: string }
        Relationships: [
          {
            foreignKeyName: "phoneme_class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "phoneme_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phoneme_class_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      phoneme_classes: {
        Row: {
          created_at: string
          id: string
          label: string | null
          project_id: string
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          project_id: string
          sort_order?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          project_id?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phoneme_classes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      phonemes: {
        Row: {
          created_at: string
          id: string
          ipa: string
          kind: Database["public"]["Enums"]["phoneme_kind"]
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ipa: string
          kind: Database["public"]["Enums"]["phoneme_kind"]
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ipa?: string
          kind?: Database["public"]["Enums"]["phoneme_kind"]
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phonemes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      phonotactic_constraints: {
        Row: {
          a_class_id: string | null
          a_phoneme_ipa: string | null
          b_class_id: string | null
          b_phoneme_ipa: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["constraint_kind"]
          note: string | null
          project_id: string
          role: Database["public"]["Enums"]["slot_role"] | null
          seq_position: Database["public"]["Enums"]["sequence_position"] | null
        }
        Insert: {
          a_class_id?: string | null
          a_phoneme_ipa?: string | null
          b_class_id?: string | null
          b_phoneme_ipa?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["constraint_kind"]
          note?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["slot_role"] | null
          seq_position?: Database["public"]["Enums"]["sequence_position"] | null
        }
        Update: {
          a_class_id?: string | null
          a_phoneme_ipa?: string | null
          b_class_id?: string | null
          b_phoneme_ipa?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["constraint_kind"]
          note?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["slot_role"] | null
          seq_position?: Database["public"]["Enums"]["sequence_position"] | null
        }
        Relationships: [
          {
            foreignKeyName: "phonotactic_constraints_a_class_id_fkey"
            columns: ["a_class_id"]
            isOneToOne: false
            referencedRelation: "phoneme_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phonotactic_constraints_b_class_id_fkey"
            columns: ["b_class_id"]
            isOneToOne: false
            referencedRelation: "phoneme_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phonotactic_constraints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      grammar_rules: {
        Row: {
          created_at: string
          effect: string | null
          environment: string | null
          examples: string | null
          id: string
          name: string
          notes: string | null
          project_id: string
          rule_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          effect?: string | null
          environment?: string | null
          examples?: string | null
          id?: string
          name: string
          notes?: string | null
          project_id: string
          rule_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          effect?: string | null
          environment?: string | null
          examples?: string | null
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          rule_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grammar_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lexicon_entries: {
        Row: {
          created_at: string
          entry_key: string | null
          gloss: string | null
          id: string
          lemma: string
          notes: string | null
          project_id: string
          updated_at: string
          word_class: string | null
        }
        Insert: {
          created_at?: string
          entry_key?: string | null
          gloss?: string | null
          id?: string
          lemma: string
          notes?: string | null
          project_id: string
          updated_at?: string
          word_class?: string | null
        }
        Update: {
          created_at?: string
          entry_key?: string | null
          gloss?: string | null
          id?: string
          lemma?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
          word_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lexicon_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      syllable_slots: {
        Row: {
          class_id: string
          id: string
          optional: boolean
          project_id: string
          role: Database["public"]["Enums"]["slot_role"]
          slot_index: number
          template_id: string
        }
        Insert: {
          class_id: string
          id?: string
          optional?: boolean
          project_id: string
          role: Database["public"]["Enums"]["slot_role"]
          slot_index: number
          template_id: string
        }
        Update: {
          class_id?: string
          id?: string
          optional?: boolean
          project_id?: string
          role?: Database["public"]["Enums"]["slot_role"]
          slot_index?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "phoneme_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllable_slots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllable_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "syllable_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      syllable_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          project_id: string
          sort_order: number
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          project_id: string
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "syllable_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_project_member: {
        Args: {
          p_email: string
          p_project_id: string
          p_role?: Database["public"]["Enums"]["project_role"]
        }
        Returns: {
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "project_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_project: {
        Args: { p_description?: string; p_name: string }
        Returns: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_grammar_rules: {
        Args: { p_project_id: string; p_rules: Json }
        Returns: undefined
      }
      save_phoneme_inventory: {
        Args: { p_phonemes: Json; p_project_id: string }
        Returns: {
          created_at: string
          id: string
          ipa: string
          kind: Database["public"]["Enums"]["phoneme_kind"]
          project_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "phonemes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_phonotactics: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: undefined
      }
    }
    Enums: {
      constraint_kind:
        | "forbid_in_role"
        | "forbid_sequence"
        | "no_identical_adjacent"
      phoneme_kind: "consonant" | "vowel"
      project_role: "owner" | "collaborator"
      sequence_position: "anywhere" | "word_initial" | "word_final"
      slot_role: "onset" | "nucleus" | "coda"
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
      constraint_kind: [
        "forbid_in_role",
        "forbid_sequence",
        "no_identical_adjacent",
      ],
      phoneme_kind: ["consonant", "vowel"],
      project_role: ["owner", "collaborator"],
      sequence_position: ["anywhere", "word_initial", "word_final"],
      slot_role: ["onset", "nucleus", "coda"],
    },
  },
} as const
