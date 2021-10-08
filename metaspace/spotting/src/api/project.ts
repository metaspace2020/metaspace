import gql from 'graphql-tag'

export type ProjectRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'MANAGER';
export const ProjectRoleOptions: {[R in ProjectRole]: R} = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  MEMBER: 'MEMBER',
  MANAGER: 'MANAGER',
}
export const getRoleName = (role: ProjectRole | null | undefined) => {
  switch (role) {
    case 'INVITED': return 'Invited'
    case 'PENDING': return 'Requesting access'
    case 'MEMBER': return 'Member'
    case 'MANAGER': return 'Project manager'
    case null: return ''
    case undefined: return ''
  }
}

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
  }`

export interface UpdateProjectMutation {
  data: {
    id: string;
    name: string;
    urlSlug: string | null;
    isPublic: boolean;
    currentUserRole: ProjectRole | null;
  }
}
export const updateProjectMutation =
  gql`mutation updateProject($projectId: ID!, $projectDetails: UpdateProjectInput!) {
    updateProject(projectId: $projectId, projectDetails: $projectDetails) {
      id
      name
      urlSlug
      isPublic
      currentUserRole
    }
  }`

export const deleteProjectMutation =
  gql`mutation deleteProject($projectId: ID!) {
    deleteProject(projectId: $projectId)
  }`

export const removeUserFromProjectMutation =
  gql`mutation removeUserFromProject($projectId: ID!, $userId: ID!) {
    removeUserFromProject(projectId: $projectId, userId: $userId)
  }`

export const requestAccessToProjectMutation =
  gql`mutation requestAccessToProject($projectId: ID!) {
    requestAccessToProject(projectId: $projectId) {
      role
    }
  }`

export const acceptRequestToJoinProjectMutation =
  gql`mutation acceptRequestToJoinProject($projectId: ID!, $userId: ID!) {
    acceptRequestToJoinProject(projectId: $projectId, userId: $userId) {
      role
    }
  }`

export const inviteUserToProjectMutation =
  gql`mutation inviteUserToProject($projectId: ID!, $email: String!) {
    inviteUserToProject(projectId: $projectId, email: $email) {
      role
    }
  }`

export const acceptProjectInvitationMutation =
  gql`mutation acceptProjectInvitation($projectId: ID!) {
    acceptProjectInvitation(projectId: $projectId) {
      role
    }
  }`

export const leaveProjectMutation =
  gql`mutation leaveProject($projectId: ID!) {
    leaveProject(projectId: $projectId)
  }`

export const updateUserProjectMutation =
  gql`mutation updateUserProject($projectId: ID!, $userId: ID!, $update: UpdateUserProjectInput!) {
    updateUserProject(projectId: $projectId, userId: $userId, update: $update)
  }`

export const importDatasetsIntoProjectMutation =
  gql`mutation($projectId: ID!, $datasetIds: [ID!], $removedDatasetIds: [ID!]) {
    importDatasetsIntoProject(projectId: $projectId, datasetIds: $datasetIds, removedDatasetIds: $removedDatasetIds)
  }`

export const createReviewLinkMutation =
  gql`mutation createReviewLinkMutation($projectId: ID!) {
    createReviewLink(projectId: $projectId) {
      reviewToken
      publicationStatus
    }
  }`

export const deleteReviewLinkMutation =
  gql`mutation deleteReviewLinkMutation($projectId: ID!) {
    deleteReviewLink(projectId: $projectId)
  }`

export const updateProjectDOIMutation =
  gql`mutation updateProjectDOIMutation($projectId: ID!, $link: String!) {
    addProjectExternalLink(
      projectId: $projectId,
      provider: "DOI",
      link: $link,
      replaceExisting: true
    ) {
      id
      externalLinks {
        provider
        link
      }
    }
  }`

export const removeProjectDOIMutation =
  gql`mutation removeProjectDOIMutation($projectId: ID!) {
    removeProjectExternalLink(
      projectId: $projectId,
      provider: "DOI",
    ) {
      id
      externalLinks {
        provider
        link
      }
    }
  }`

export const publishProjectMutation =
  gql`mutation publishProjectMutation($projectId: ID!) {
    publishProject(projectId: $projectId) {
      publicationStatus
    }
  }`

export const editProjectQuery =
  gql`query EditProjectQuery($projectId: ID!) {
    project(projectId: $projectId) {
      id
      name
      urlSlug
      isPublic
      currentUserRole
      publicationStatus
      externalLinks {
        provider
        link
      }
    }
  }`

export interface EditProjectQuery {
  id: string;
  name: string;
  urlSlug: string | null;
  isPublic: boolean;
  currentUserRole: ProjectRole | null;
  publicationStatus: string;
  externalLinks: ExternalLink[];
}

const projectsListItemFragment =
  gql`fragment ProjectsListItem on Project {
      id
      name
      urlSlug
      isPublic
      currentUserRole
      numMembers
      numDatasets
      createdDT
      latestUploadDT
      publicationStatus
      publishedDT
      members {
        user {
          name
          primaryGroup {
            group {
              id
              shortName
            }
          }
        }
        role
      }
    }`

export const projectsListQuery =
  gql`query ProjectsListQuery($query: String!, $offset: Int = 0, $limit: Int = 10,
    $orderBy: ProjectOrderBy = ORDER_BY_POPULARITY, $sortingOrder: SortingOrder = DESCENDING) {
    allProjects(orderBy: $orderBy, sortingOrder: $sortingOrder, query: $query,
      offset: $offset, limit: $limit) {
      ...ProjectsListItem
    }
  }
  ${projectsListItemFragment}`

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
  ${projectsListItemFragment}`

export const projectsCountQuery =
  gql`query ProjectsCountQuery($query: String!) {
    projectsCount(query: $query)
  }`

export interface ProjectsListQuery {
  allProjects: ProjectsListProject[];
}

export interface MyProjectsListQuery {
  myProjects: {
    id: String;
    projects: MyProjectsListItem[] | null;
  } | null;
}

export interface ProjectsListProject {
  id: string;
  name: string;
  urlSlug: string | null;
  isPublic: boolean;
  currentUserRole: ProjectRole | null;
  numMembers: number;
  numDatasets: number;
  createdDT: string;
  members: {
    user: {
      name: string;
    },
    role: string
  }[];
  latestUploadDT: string | null;
  publicationStatus: string;
  publishedDT: string | null;
}

export interface MyProjectsListItem {
  project: ProjectsListProject
}

interface ExternalLink {
  provider: string;
  link: string
}

export interface ViewProjectResult {
  id: string;
  name: string;
  urlSlug: string | null;
  currentUserRole: ProjectRole | null;
  numMembers: number;
  members: ViewProjectMember[] | null;
  projectDescription: string | null;
  reviewToken: string | null;
  reviewTokenCreatedDT: string | null;
  publicationStatus: string
  externalLinks: ExternalLink[]
}

export const ViewProjectFragment = gql`fragment ViewProjectFragment on Project {
  id
  name
  urlSlug
  currentUserRole
  numMembers
  members {
    role
    numDatasets
    user { id name email }
  }
  projectDescription
  reviewToken
  # reviewTokenCreatedDT
  publicationStatus
  externalLinks {
    provider
    link
  }
}`

export interface ViewProjectMember {
  role: ProjectRole,
  numDatasets: number,
  user: {
    id: string;
    name: string | null;
    email: string | null;
  }
}
