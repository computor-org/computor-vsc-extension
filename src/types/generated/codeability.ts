/**
 * This file is auto-generated from Pydantic models.
 * CodeAbility Meta Models for Assignment/Example Metadata
 */

export interface TestDependency {
  /** Hierarchical slug of the dependency example (e.g., 'physics.math.vectors') */
  slug: string;
  /** Version constraint (e.g., '>=1.2.0', '^2.1.0', '1.0.0'). If not specified, uses latest version. */
  version?: string | null;
}

export interface CodeAbilityLink {
  /** Description of the link */
  description: string;
  /** URL of the link */
  url: string;
}

export interface CodeAbilityPerson {
  /** Full name */
  name?: string | null;
  /** Email address */
  email?: string | null;
  /** Institutional affiliation */
  affiliation?: string | null;
}

export interface CourseExecutionBackendConfig {
  /** Unique identifier for the execution backend */
  slug: string;
  /** Version of the execution backend (e.g., 'r2024b', 'v1.0') */
  version: string;
  /** Backend-specific settings */
  settings?: Record<string, any> | null;
}

export interface CodeAbilityMetaProperties {
  /** Files that students must submit */
  studentSubmissionFiles?: string[];
  /** Additional files provided to students */
  additionalFiles?: string[];
  /** Test files for automated grading */
  testFiles?: string[];
  /** Template files for student projects */
  studentTemplates?: string[];
  /** List of example dependencies. Can be simple strings (slugs) or objects with slug and version constraints */
  testDependencies?: (string | TestDependency)[];
  /** Execution backend configuration for this assignment */
  executionBackend?: CourseExecutionBackendConfig | null;
}

export interface CodeAbilityMeta {
  /** Version of the meta format */
  version?: string;
  /** Unique identifier for the assignment */
  slug?: string | null;
  /** Human-readable title */
  title?: string | null;
  /** Detailed description of the content */
  description?: string | null;
  /** Primary language of the content (e.g., 'en', 'de', 'fr', etc.) */
  language?: string;
  /** License information */
  license?: string;
  /** Content authors */
  authors?: CodeAbilityPerson[];
  /** Content maintainers */
  maintainers?: CodeAbilityPerson[];
  /** Related links */
  links?: CodeAbilityLink[];
  /** Supporting material links */
  supportingMaterial?: CodeAbilityLink[];
  /** Keywords for categorization */
  keywords?: string[];
  /** Assignment-specific properties */
  properties?: CodeAbilityMetaProperties;
}

// Helper type for creating new meta.yaml files with required fields
export type CodeAbilityMetaRequired = Required<Pick<CodeAbilityMeta, 'slug' | 'title'>> & 
  Partial<Omit<CodeAbilityMeta, 'slug' | 'title'>>;

// Default values for creating new meta.yaml
export const DEFAULT_CODE_ABILITY_META: Partial<CodeAbilityMeta> = {
  version: '1.0',
  language: 'en',
  license: 'Not specified',
  authors: [],
  maintainers: [],
  links: [],
  supportingMaterial: [],
  keywords: [],
  properties: {
    studentSubmissionFiles: [],
    additionalFiles: [],
    testFiles: [],
    studentTemplates: [],
    testDependencies: [],
    executionBackend: null
  }
};