import * as vscode from 'vscode';
import { JwtHttpClient } from '../http/JwtHttpClient';
import { ComputorAuthenticationProvider } from '../authentication/ComputorAuthenticationProvider';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import {
  OrganizationList,
  CourseFamilyList,
  CourseList,
  CourseGet,
  CourseUpdate,
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
  ExampleRepositoryList,
  ExampleRepositoryGet,
  ExampleGet,
  ExampleDownloadResponse,
  CourseGroupList,
  CourseGroupGet,
  CourseMemberList,
  CourseMemberGet
} from '../types/generated';

// Query interface for examples (not generated yet)
interface ExampleQuery {
  repository_id?: string;
  identifier?: string;
  title?: string;
  category?: string;
  tags?: string[];
  search?: string;
  directory?: string;
}

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

  async updateOrganization(organizationId: string, updates: any): Promise<any> {
    const client = await this.getHttpClient();
    const response = await client.patch(`/organizations/${organizationId}`, updates);
    return response.data;
  }

  async getCourseFamilies(organizationId: string): Promise<CourseFamilyList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseFamilyList[]>('/course-families', {
      organization_id: organizationId
    });
    return response.data;
  }

  async updateCourseFamily(familyId: string, updates: any): Promise<any> {
    const client = await this.getHttpClient();
    const response = await client.patch(`/course-families/${familyId}`, updates);
    return response.data;
  }

  async getCourses(courseFamilyId: string): Promise<CourseList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseList[]>('/courses', {
      course_family_id: courseFamilyId
    });
    return response.data;
  }

  async getCourse(courseId: string): Promise<CourseGet | undefined> {
    try {
      const client = await this.getHttpClient();
      const response = await client.get<CourseGet>(`/courses/${courseId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get course:', error);
      return undefined;
    }
  }

  async updateCourse(courseId: string, updates: CourseUpdate): Promise<CourseGet> {
    const client = await this.getHttpClient();
    const response = await client.patch<CourseGet>(`/courses/${courseId}`, updates);
    return response.data;
  }

  async getCourseContents(courseId: string): Promise<CourseContentList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseContentList[]>(`/course-contents?course_id=${courseId}`);
    return response.data;
  }

  async createCourseContent(courseId: string, content: CourseContentCreate): Promise<CourseContentGet> {
    const client = await this.getHttpClient();
    const response = await client.post<CourseContentGet>('/course-contents', content);
    return response.data;
  }

  async updateCourseContent(courseId: string, contentId: string, content: CourseContentUpdate): Promise<CourseContentGet> {
    const client = await this.getHttpClient();
    const response = await client.patch<CourseContentGet>(`/course-contents/${contentId}`, content);
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
    const response = await client.get<CourseContentTypeList[]>(`/course-content-types?course_id=${courseId}`);
    return response.data;
  }

  async createCourseContentType(contentType: CourseContentTypeCreate): Promise<CourseContentTypeGet> {
    const client = await this.getHttpClient();
    const response = await client.post<CourseContentTypeGet>('/course-content-types', contentType);
    return response.data;
  }

  async updateCourseContentType(typeId: string, contentType: CourseContentTypeUpdate): Promise<CourseContentTypeGet> {
    const client = await this.getHttpClient();
    const response = await client.patch<CourseContentTypeGet>(`/course-content-types/${typeId}`, contentType);
    return response.data;
  }

  async deleteCourseContentType(typeId: string): Promise<void> {
    const client = await this.getHttpClient();
    await client.delete(`/course-content-types/${typeId}`);
  }

  async getExampleRepositories(): Promise<ExampleRepositoryList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<ExampleRepositoryList[]>('/example-repositories');
    return response.data;
  }

  async getExampleRepository(repositoryId: string): Promise<ExampleRepositoryGet | undefined> {
    try {
      const client = await this.getHttpClient();
      const response = await client.get<ExampleRepositoryGet>(`/example-repositories/${repositoryId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get example repository:', error);
      return undefined;
    }
  }

  async getExamples(query?: ExampleQuery): Promise<ExampleList[] | undefined> {
    try {
      const client = await this.getHttpClient();
      const params = new URLSearchParams();
      
      if (query?.repository_id) {
        params.append('repository_id', query.repository_id);
      }
      if (query?.identifier) {
        params.append('identifier', query.identifier);
      }
      if (query?.title) {
        params.append('title', query.title);
      }
      if (query?.category) {
        params.append('category', query.category);
      }
      if (query?.tags && query.tags.length > 0) {
        query.tags.forEach(tag => params.append('tags', tag));
      }
      if (query?.search) {
        params.append('search', query.search);
      }
      if (query?.directory) {
        params.append('directory', query.directory);
      }
      
      const url = params.toString() ? `/examples?${params.toString()}` : '/examples';
      const response = await client.get<ExampleList[]>(url);
      return response.data;
    } catch (error) {
      console.error('Failed to get examples:', error);
      return undefined;
    }
  }

  async getExample(exampleId: string): Promise<ExampleGet | undefined> {
    try {
      const client = await this.getHttpClient();
      const response = await client.get<ExampleGet>(`/examples/${exampleId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get example:', error);
      return undefined;
    }
  }

  async downloadExample(exampleId: string, withDependencies: boolean = false): Promise<ExampleDownloadResponse | undefined> {
    try {
      const client = await this.getHttpClient();
      const params = withDependencies ? '?with_dependencies=true' : '';
      const response = await client.get<ExampleDownloadResponse>(`/examples/${exampleId}/download${params}`);
      return response.data;
    } catch (error) {
      console.error('Failed to download example:', error);
      return undefined;
    }
  }

  async uploadExample(uploadRequest: { repository_id: string; directory: string; files: { [key: string]: string } }): Promise<any> {
    try {
      const client = await this.getHttpClient();
      const response = await client.post('/examples/upload', uploadRequest);
      return response.data;
    } catch (error) {
      console.error('Failed to upload example:', error);
      return undefined;
    }
  }

  async assignExampleToCourseContent(
    courseId: string, 
    contentId: string, 
    exampleId: string, 
    exampleVersion?: string
  ): Promise<any> {
    const client = await this.getHttpClient();
    const response = await client.post(
      `/course-contents/${contentId}/assign-example`,
      {
        example_id: exampleId,
        example_version: exampleVersion || 'latest'
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

  async generateStudentTemplate(courseId: string): Promise<{ task_id: string }> {
    const client = await this.getHttpClient();
    const response = await client.post<{ task_id: string }>(
      `/system/courses/${courseId}/generate-student-template`,
      {}
    );
    return response.data;
  }

  async getTaskStatus(taskId: string): Promise<any> {
    const client = await this.getHttpClient();
    const response = await client.get(`/tasks/${taskId}/status`);
    return response.data;
  }

  async getAvailableExamples(courseId: string, params?: {
    search?: string;
    category?: string;
    language?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const client = await this.getHttpClient();
    const queryParams = new URLSearchParams();
    
    if (params?.search) queryParams.append('search', params.search);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.language) queryParams.append('language', params.language);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    
    const url = queryParams.toString() 
      ? `/examples?${queryParams.toString()}`
      : '/examples';
    
    const response = await client.get(url);
    return response.data;
  }

  // Course Groups API methods
  async getCourseGroups(courseId: string): Promise<CourseGroupList[]> {
    const client = await this.getHttpClient();
    const response = await client.get<CourseGroupList[]>(`/course-groups?course_id=${courseId}`);
    return response.data;
  }

  async getCourseGroup(groupId: string): Promise<CourseGroupGet | undefined> {
    try {
      const client = await this.getHttpClient();
      const response = await client.get<CourseGroupGet>(`/course-groups/${groupId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get course group:', error);
      return undefined;
    }
  }

  // Course Members API methods
  async getCourseMembers(courseId: string, groupId?: string): Promise<CourseMemberList[]> {
    const client = await this.getHttpClient();
    const queryParams = new URLSearchParams();
    queryParams.append('course_id', courseId);
    if (groupId) {
      queryParams.append('course_group_id', groupId);
    }
    
    const response = await client.get<CourseMemberList[]>(`/course-members?${queryParams.toString()}`);
    return response.data;
  }

  async getCourseMember(memberId: string): Promise<CourseMemberGet | undefined> {
    try {
      const client = await this.getHttpClient();
      const response = await client.get<CourseMemberGet>(`/course-members/${memberId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get course member:', error);
      return undefined;
    }
  }
}