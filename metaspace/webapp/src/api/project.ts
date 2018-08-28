import gql from 'graphql-tag';

export type ProjectRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'MANAGER';
export const getRoleName = (role: ProjectRole | null | undefined) => {
  switch (role) {
    case 'INVITED': return 'Invited';
    case 'PENDING': return 'Requesting access';
    case 'MEMBER': return 'Member';
    case 'MANAGER': return 'Project manager';
    case null: return '';
    case undefined: return '';
  }
};

export interface CreateProjectMutation {
  createProject: {
    id: string;
  };
}
export const createProjectMutation =
  gql`mutation createProject($projectDetails: CreateProjectInput!) {
    createProject(projectDetails: $projectDetails) {
      id
    }
  }`;

export interface UpdateProjectMutation {
  data: {
    id: string;
    name: string;
    isPublic: boolean;
    currentUserRole: ProjectRole | null;
  }
}
export const updateProjectMutation =
  gql`mutation updateProject($projectId: ID!, $projectDetails: UpdateProjectInput!) {
    updateProject(projectId: $projectId, projectDetails: $projectDetails) {
      id
      name
      isPublic
      currentUserRole
    }
  }`;

export const deleteProjectMutation =
  gql`mutation deleteProject($projectId: ID!) {
    deleteProject(projectId: $projectId)
  }`;

export const removeUserFromProjectMutation =
  gql`mutation removeUserFromProject($projectId: ID!, $userId: ID!) {
    removeUserFromProject(projectId: $projectId, userId: $userId)
  }`;

export const requestAccessToProjectMutation =
  gql`mutation requestAccessToProject($projectId: ID!) { 
    requestAccessToProject(projectId: $projectId) {
      role
    }
  }`;

export const acceptRequestToJoinProjectMutation =
  gql`mutation acceptRequestToJoinProject($projectId: ID!, $userId: ID!) {
    acceptRequestToJoinProject(projectId: $projectId, userId: $userId) {
      role
    }
  }`;

export const inviteUserToProjectMutation =
  gql`mutation inviteUserToProject($projectId: ID!, $email: String!) {
    inviteUserToProject(projectId: $projectId, email: $email) {
      role
    }
  }`;

export const acceptProjectInvitationMutation =
  gql`mutation acceptProjectInvitation($projectId: ID!) { 
    acceptProjectInvitation(projectId: $projectId) {
      role
    }
  }`;

export const leaveProjectMutation =
  gql`mutation leaveProject($projectId: ID!) { 
    leaveProject(projectId: $projectId)
  }`;

export const importDatasetsIntoProjectMutation =
  gql`mutation($projectId: ID!, $datasetIds: [ID!]!) {
  importDatasetsIntoProject(projectId: $projectId, datasetIds: $datasetIds)
  }`;


export const editProjectQuery =
  gql`query EditProjectQuery($projectId: ID!) {
    project(projectId: $projectId) {
      id
      name
      isPublic
      currentUserRole
      members {
        role
        numDatasets
        user {
          id
          name
          email
        }
      }
    }
  }`;

export interface EditProjectQuery {
  id: string;
  name: string;
  isPublic: boolean;
  currentUserRole: ProjectRole | null;
  members: EditProjectQueryMember[] | null;
}
export interface EditProjectQueryMember {
  role: ProjectRole,
  numDatasets: number,
  user: EditProjectQueryUser
}
export interface EditProjectQueryUser {
  id: string;
  name: string;
  email: string | null;
}

const projectsListItemFragment =
  gql`fragment ProjectsListItem on Project {
      id
      name
      isPublic
      currentUserRole
      numMembers
      numDatasets
      createdDT
      latestUploadDT
    }`;

export const projectsListQuery =
  gql`query ProjectsListQuery($query: String!, $offset: Int = 0, $limit: Int = 10) {
    projects: allProjects(query: $query, offset: $offset, limit: $limit) {
      ...ProjectsListItem
    }
  }
  ${projectsListItemFragment}`;
export const myProjectsListQuery =
  gql`query MyProjectsListQuery {
    myProjects: currentUser {
      id
      projects {
        project {
          ...ProjectsListItem
        }
      }
    }
  }
  ${projectsListItemFragment}`;
export const projectsCountQuery =
  gql`query ProjectsCountQuery($query: String!) {
    projectsCount(query: $query)
  }`;

export interface ProjectsListQuery {
  projects: ProjectsListItem[];
}
export interface MyProjectsListQuery {
  myProjects: {
    projects: MyProjectsListItem[] | null;
  } | null;
}

export interface ProjectsListItem {
  id: string;
  name: string;
  isPublic: boolean;
  currentUserRole: ProjectRole | null;
  numMembers: number;
  numDatasets: number;
  createdDT: string;
  latestUploadDT: string | null;
}

export interface MyProjectsListItem {
  project: ProjectsListItem
}
