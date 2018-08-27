import { UserGroupRole } from './group';
import gql from 'graphql-tag';
import { ProjectRole } from './project';

export type UserRole = 'admin' | 'user' | 'anonymous';

export interface UserProfileQueryGroup {
  role: UserGroupRole;
  numDatasets: number;
  group: {
    id: string,
    name: string
  };
}
export interface UserProfileQueryProject {
  role: ProjectRole;
  numDatasets: number;
  project: {
    id: string,
    name: string
  };
}

export interface UserProfileQuery {
  id: string;
  name: string;
  role: string;
  email: string | null;
  groups: UserProfileQueryGroup[] | null;
  primaryGroup: UserProfileQueryGroup | null;
  projects: UserProfileQueryProject[] | null;
}

export const userProfileQuery =
  gql`query {
  currentUser {
    id
    name
    role
    email
    primaryGroup {
      ...UserProfileQueryGroup
    }
    groups {
      ...UserProfileQueryGroup
    }
    projects {
      role
      numDatasets
      project {
        id
        name
      }
    }
  }
}
fragment UserProfileQueryGroup on UserGroup {
  role
  numDatasets
  group {
    id
    name
  }
}
`;

export interface DatasetSubmitterFragment {
  id: string;
  name: string;
  primaryGroup: {
    group: {
      id: string;
      name: string;
    }
  } | null;
  groups: {
    group: {
      id: string;
      name: string;
    }
  }[] | null;
  projects: {
    project: {
      id: string;
      name: string;
    }
  }[] | null;
}

export const datasetSubmitterFragment =
  gql`fragment DatasetSubmitterFragment on User {
    id
    name
    primaryGroup {
      group {
        id
        name
      }
    }
    groups {
      group {
        id
        name
      }
    }
    projects {
      project {
        id
        name
      }
    }
  }`;

export const updateUserMutation =
  gql`mutation ($userId: ID!, $update: UpdateUserInput!) {
  updateUser(userId: $userId, update: $update) {
    id
    name
    email
  }
}`;

export const deleteUserMutation =
  gql`mutation ($userId: ID!, $deleteDatasets: Boolean!) {
  deleteUser(userId: $userId, deleteDatasets: $deleteDatasets)
}`;
