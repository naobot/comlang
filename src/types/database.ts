// PLACEHOLDER — hand-written to match supabase/migrations/, so the app type-checks
// before a Supabase project exists.
//
// Once the project is linked, replace this file wholesale:
//     pnpm gen:types
//
// After that it is generated output: never hand-edit it, and regenerate it in the same
// commit as any migration that changes these tables.

export type ProjectRole = "owner" | "collaborator";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      project_members: {
        Row: ProjectMember;
        Insert: Omit<ProjectMember, "created_at"> & { created_at?: string };
        Update: Partial<ProjectMember>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_project: {
        Args: { p_name: string; p_description?: string | null };
        Returns: Project;
      };
      is_project_member: { Args: { p_project_id: string }; Returns: boolean };
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean };
    };
    Enums: { project_role: ProjectRole };
    CompositeTypes: Record<never, never>;
  };
};
