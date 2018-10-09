import {
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLObjectType, GraphQLType,
  isEnumType, isNonNullType,
  isScalarType,
} from 'graphql';

jest.mock('../../utils/smAPI');
import * as _mockSmApi from '../../utils/smAPI';
const mockSmApi = _mockSmApi as jest.Mocked<typeof _mockSmApi>;

import {Connection, EntityManager} from 'typeorm';
import {createConnection} from '../../utils';
import {initOperation} from '../auth/operation';
import {Context} from '../../context';
import {User} from '../user/model';
import getContext from '../../getContext';
import {Request} from 'express';
import {runQuery} from 'apollo-server-core';
import {QueryOptions} from 'apollo-server-core/dist/runQuery';
import {makeNewExecutableSchema} from '../../../executableSchema';
import {Credentials} from '../auth/model';
import {Project as ProjectType} from '../../binding';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions} from './model';
import _ = require('lodash');


describe('modules/project/controller', () => {
  const schema = makeNewExecutableSchema();
  let outsideOfTransactionConn: Connection;
  let manager: EntityManager;
  let txn: Promise<any>;
  let rejectTxn: () => void;
  let user: User;
  let context: Context;
  let anonContext: Context;
  let adminContext: Context;


  // Lists of fields so that it's easy to select all non-nested return values from a GraphQL operation
  const shallowFieldsOfSchemaType = (typeName: string) => {
    const type = schema.getType(typeName) as GraphQLObjectType | GraphQLInputObjectType;
    const isAnyScalarType = (type: GraphQLType): Boolean =>
      isScalarType(type) || isEnumType(type) || (isNonNullType(type) && isAnyScalarType(type.ofType));

    return (Object.values(type.getFields()) as (GraphQLField<any,any> | GraphQLInputField)[])
      .filter(field => isAnyScalarType(field.type))
      .map(field => field.name)
      .join(' ');
  };
  const projectFields = shallowFieldsOfSchemaType('Project');
  const userProjectFields = shallowFieldsOfSchemaType('UserProject');

  beforeAll(async () => {
    outsideOfTransactionConn = await createConnection();
  });

  afterAll(async () => {
    await outsideOfTransactionConn.close();
  });

  beforeEach(async () => {
    manager = await new Promise<EntityManager>((resolveManager) => {
      txn = outsideOfTransactionConn.transaction(txnManager => {
        resolveManager(txnManager);
        // Return a pending promise to allow the transaction be held open until `afterEach` rejects it
        return new Promise((resolve, reject) => {
          rejectTxn = reject;
        });
      });
    });

    const creds = manager.create(Credentials, {});
    await manager.insert(Credentials, creds);
    user = manager.create(User, { name: 'tester', role: 'user', credentialsId: creds.id });
    await manager.insert(User, user);
    await initOperation(manager);
    context = getContext({user: {user}} as any as Request, manager);
    anonContext = {...context, user: {role: 'anonymous'}};
    adminContext = {...context, user: {...context.user, role: 'admin'}, isAdmin: true};
  });

  afterEach(async () => {
    console.log('reject')
    rejectTxn();
    try { await txn; } catch {}

    // Workaround to jest overwriting the last few lines of logs
    console.log();
  });

  const doQuery = async <T = any>(query: string, variables?: object, options?: Partial<QueryOptions>): Promise<T> => {
    const {data, errors} = await runQuery({
      schema,
      context,
      queryString: query,
      variables,
      request: {} as any,
      ...options,
    });
    if (errors != null && errors.length > 0) {
      // If there's more than one error, log the rest
      for (let i = 1; i < errors.length; i++) {
        console.error(`errors[${i}]: `, errors[i]);
      }
      throw errors[0];
    }
    return Object.values(data || {})[0] as T;
  };

  describe('Mutation.createProject', () => {
    const projectDetails = {
      name: 'foo',
      isPublic: false,
    };
    const projectDetailsWithSlug = {
      ...projectDetails,
      urlSlug: 'foo',
    };
    const createProject = `mutation ($projectDetails: CreateProjectInput!) {
      createProject(projectDetails: $projectDetails) { ${projectFields} }
    }`;

    it('should create a project when run as a user', async () => {
      // Act
      const result = await doQuery<ProjectType>(createProject, {projectDetails});

      // Assert
      const project = await manager.findOneOrFail(ProjectModel, result.id, {relations: ['members']});
      expect(result).toEqual(expect.objectContaining({
        ...projectDetails,
        currentUserRole: 'MANAGER',
        numDatasets: 0,
        numMembers: 1,
      }));
      expect(project).toEqual(expect.objectContaining({
        ...projectDetails,
        urlSlug: null,
        members: [
          expect.objectContaining({
            userId: user.id,
            role: UserProjectRoleOptions.MANAGER,
          }),
        ],
      }));
    });
    it('should not work when logged out', async () => {
      // Act
      const promise = doQuery<ProjectType>(createProject, { projectDetails }, { context: anonContext });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
    });
    it('should reject a urlSlug from a user', async () => {
      // Act
      const promise = doQuery<ProjectType>(createProject, { projectDetails: projectDetailsWithSlug });

      // Assert
      await expect(promise).rejects.toThrow();
    });
    it('should not reject a urlSlug from an admin', async () => {
      // Act
      const result = await doQuery<ProjectType>(createProject,
        { projectDetails: projectDetailsWithSlug }, { context: adminContext });

      // Assert
      const project = await manager.findOneOrFail(ProjectModel, result.id);
      expect(result.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
      expect(project.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
    });
  });

  describe('Mutation.updateProject', () => {
    let projectId: string;
    let initialProject: Pick<ProjectType, 'name' | 'isPublic' | 'urlSlug'>;
    const projectDetails = {
      name: 'bar',
      isPublic: false,
    };
    const projectDetailsWithSlug = {
      ...projectDetails,
      urlSlug: 'bar',
    };
    const updateProject = `mutation ($projectId: ID!, $projectDetails: UpdateProjectInput!) {
      updateProject(projectId: $projectId, projectDetails: $projectDetails) { ${projectFields} }
    }`;
    
    beforeEach(async () => {
      initialProject = { // reinitialize every time because manager.insert modifies it
        name: 'foo',
        isPublic: true,
        urlSlug: 'foo',
      };
      const insertResult = await manager.insert(ProjectModel, initialProject);
      projectId = insertResult.identifiers[0].id;
    });
    
    it('should update a project when run as a MANAGER of the project', async () => {
      // Arrange
      await manager.insert(UserProjectModel, {userId: user.id, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      const result = await doQuery<ProjectType>(updateProject, {projectId, projectDetails});

      // Assert
      const project = await manager.findOneOrFail(ProjectModel, projectId, {relations: ['members']});
      expect(result).toEqual(expect.objectContaining(projectDetails));
      expect(project).toEqual(expect.objectContaining(projectDetails));
      expect(project.urlSlug).toEqual(initialProject.urlSlug);
    });
    it('should fail when run as a MEMBER of the project', async () => {
      // Arrange
      await manager.insert(UserProjectModel, {userId: user.id, projectId, role: UserProjectRoleOptions.MEMBER});

      // Act
      const promise = doQuery(updateProject, { projectId, projectDetails });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
    });
    it('should fail when not in the project', async () => {
      // Act
      const promise = doQuery(updateProject, { projectId, projectDetails });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
    });
    it('should reject a urlSlug change from a user', async () => {
      // Arrange
      await manager.insert(UserProjectModel, {userId: user.id, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      const promise = doQuery<ProjectType>(updateProject, {projectId, projectDetails: projectDetailsWithSlug});

      // Assert
      await expect(promise).rejects.toThrow();
    });
    it('should not reject a urlSlug from an admin', async () => {
      // Act
      const result = await doQuery<ProjectType>(updateProject,
        { projectId, projectDetails: projectDetailsWithSlug }, { context: adminContext });

      // Assert
      const project = await manager.findOneOrFail(ProjectModel, projectId);
      expect(result.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
      expect(project.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
    });
  });

  describe('Mutation.deleteProject', () => {
    let projectId: string;
    const deleteProject = `mutation ($projectId: ID!) {
      deleteProject(projectId: $projectId)
    }`;

    beforeEach(async () => {
      const insertResult = await manager.insert(ProjectModel, { name: 'foo' });
      projectId = insertResult.identifiers[0].id;
    });

    it('should delete a project when run as a MANAGER of the project', async () => {
      // Arrange
      await manager.insert(UserProjectModel, {userId: user.id, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      await doQuery(deleteProject, {projectId});

      // Assert
      const project = await manager.findOne(ProjectModel, projectId);
      expect(project).toEqual(undefined);
    });
    it('should delete a project when run as an admin', async () => {
      // Arrange
      await manager.insert(UserProjectModel, {userId: user.id, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      await doQuery(deleteProject, {projectId});

      // Assert
      const project = await manager.findOne(ProjectModel, projectId);
      expect(project).toEqual(undefined);
    });
    it('should fail when run as a MEMBER of the project', async () => {
      // Arrange
      await manager.insert(UserProjectModel, {userId: user.id, projectId, role: UserProjectRoleOptions.MEMBER});

      // Act
      const promise = doQuery(deleteProject, { projectId });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
      const project = await manager.findOne(ProjectModel, projectId);
      await expect(project).toEqual(expect.anything());
    });
  });

// ## Managing project users
//   leaveProject(projectId: ID!): Boolean!
//   removeUserFromProject(projectId: ID!, userId: ID!): Boolean!
//
// ## User requests access
//   requestAccessToProject(projectId: ID!): UserProject!
//   acceptRequestToJoinProject(projectId: ID!, userId: ID!): UserProject!
// # User can reject request with `leaveProject`
//
//     ## Project invites user
//   inviteUserToProject(projectId: ID!, email: String!): UserProject!
//   acceptProjectInvitation(projectId: ID!): UserProject!
// # Project can reject user with `removeUserFromProject`
//
//     importDatasetsIntoProject(projectId: ID!, datasetIds: [ID!]!): Boolean!

});
