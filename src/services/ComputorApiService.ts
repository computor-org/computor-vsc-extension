import * as vscode from 'vscode';
import { JwtHttpClient } from '../http/JwtHttpClient';
import { ComputorAuthenticationProvider } from '../authentication/ComputorAuthenticationProvider';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import {
  OrganizationList,
  CourseFamilyList,
  CourseList,
  CourseContentList,
  CourseContentGet,
  CourseContentCreate,
  CourseContentUpdate,
  CourseContentKindList,
  CourseContentTypeList,
  CourseContentTypeGet,
  CourseContentTypeCreate,
  CourseContentTypeUpdate,
  ExampleList,
  ExampleRepositoryList
} from '../types/generated';

export class ComputorApiService {
  private httpClient?: JwtHttpClient;
  private settingsManager: ComputorSettingsManager;

  constructor(context: vscode.ExtensionContext) {
    this.settingsManager = new ComputorSettingsManager(context);
  }

  private async getHttpClient(): Promise<JwtHttpClient> {
    if (!this.httpClient) {
      const settings = await this.settingsManager.getSettings();
      const sessions = await vscode.authentication.getSession('computor', [], { createIfNone: false });
      
      if (!sessions) {
        throw new Error('Not authenticated. Please sign in first.');
      }

      const authHeaders = ComputorAuthenticationProvider.getAuthHeaders(sessions as any);
      
      // For now, use a dummy Keycloak config since we're using token auth
      const keycloakConfig = {
        serverUrl: '',
        realm: '',
        clientId: '',
        redirectUri: ''
      };
      
      this.httpClient = new JwtHttpClient(
        settings.authentication.baseUrl,
        keycloakConfig,
        5000
      );
      
      // Set the auth headers directly
      this.httpClient.setDefaultHeaders(authHeaders);
      
      // If we have a Bearer token, set it directly
      const authHeader = authHeaders['Authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        this.httpClient.setTokens(token);
      }
    }
    return this.httpClient;
  }

  async getOrganizations(): Promise<OrganizationList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<OrganizationList[]>('/organizations');
    return response.data;
  }

  async getCourseFamilies(organizationId: string): Promise<CourseFamilyList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseFamilyList[]>('/course-families', {
      organization_id: organizationId
    });
    return response.data;
  }

  async getCourses(courseFamilyId: string): Promise<CourseList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseList[]>('/courses', {
      course_family_id: courseFamilyId
    });
    return response.data;
  }

  async getCourseContents(courseId: string): Promise<CourseContentList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseContentList[]>('/course-contents', {
      course_id: courseId
    });
    return response.data;
  }

  async createCourseContent(courseId: string, content: CourseContentCreate): Promise<CourseContentGet> {
    const client = await this.getHttpClient();
    const response = await client.post<CourseContentGet>('/course-contents', content);
    return response.data;
  }

  async updateCourseContent(courseId: string, contentId: string, content: CourseContentUpdate): Promise<CourseContentGet> {
    const client = await this.getHttpClient();
    const response = await client.put<CourseContentGet>(`/course-contents/${contentId}`, content);
    return response.data;
  }

  async deleteCourseContent(courseId: string, contentId: string): Promise<void> {
    const client = await this.getHttpClient();
    await client.delete(`/course-contents/${contentId}`);
  }

  async getCourseContentKinds(): Promise<CourseContentKindList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseContentKindList[]>('/course-content-kinds');
    return response.data;
  }

  async getCourseContentTypes(courseId: string): Promise<CourseContentTypeList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseContentTypeList[]>('/course-content-types', {
      course_id: courseId
    });
    return response.data;
  }

  async createCourseContentType(contentType: CourseContentTypeCreate): Promise<CourseContentTypeGet> {
    const client = await this.getHttpClient();
    const response = await client.post<CourseContentTypeGet>('/course-content-types', contentType);
    return response.data;
  }

  async updateCourseContentType(typeId: string, contentType: CourseContentTypeUpdate): Promise<CourseContentTypeGet> {
    const client = await this.getHttpClient();
    const response = await client.put<CourseContentTypeGet>(`/course-content-types/${typeId}`, contentType);
    return response.data;
  }

  async deleteCourseContentType(typeId: string): Promise<void> {
    const client = await this.getHttpClient();
    await client.delete(`/course-content-types/${typeId}`);
  }

  async getExamples(repositoryId?: string): Promise<ExampleList[]> {
    const client = await this.getHttpClient();
    const params = repositoryId ? { repository_id: repositoryId } : undefined;
    const response = await client.get<ExampleList[]>('/examples', params);
    return response.data;
  }

  async getExampleRepositories(): Promise<ExampleRepositoryList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<ExampleRepositoryList[]>('/example-repositories');
    return response.data;
  }

  async assignExampleToCourseContent(
    courseId: string, 
    contentId: string, 
    exampleId: string, 
    exampleVersion?: string
  ): Promise<CourseContentGet> {
    const client = await this.getHttpClient();
    const response = await client.patch<CourseContentGet>(
      `/course-contents/${contentId}`,
      {
        example_id: exampleId,
        example_version: exampleVersion
      }
    );
    return response.data;
  }

  async unassignExampleFromCourseContent(courseId: string, contentId: string): Promise<CourseContentGet> {
    const client = await this.getHttpClient();
    const response = await client.patch<CourseContentGet>(
      `/course-contents/${contentId}`,
      {
        example_id: null,
        example_version: null
      }
    );
    return response.data;
  }
}