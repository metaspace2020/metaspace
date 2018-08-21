import {createConnection} from '../../utils';
import {User} from './model';
import {Connection, getRepository, Repository} from 'typeorm';

let connection: Connection;
let userRepo: Repository<User>;

// let selectFromUserTable: (user: Partial<DbUser>) => Promise<DbUser>
// let insertIntoUserTable: (row: DbUserInput) => Promise<any>
// let updateUserTable: (row: DbRow & Partial<DbUser>) => Promise<any>
// let deleteUserFromTable: (uuid: ID_Output) => Promise<any>

export const initOperation = async (typeOrmConn?: Connection) => {
  connection = typeOrmConn || await createConnection();
  userRepo = getRepository(User);
};

// export const findUser = async (uuid: ID_Output): Promise<DbUser> => {
//   return knex('user').where('uuid', uuid).select()
// };

export const findUserById = async (id: string) => {
  return await userRepo.findOne({
    relations: ['credentials'],
    where: { 'id': id }
  });
};

export const findUserByEmail = async (email: string) => {
  return await userRepo.findOne({
    relations: ['credentials'],
    where: { 'LOWER(email) = ?': email }
  });
};

export const findUserByGoogleId = async (googleId: string|undefined) => {
  return await userRepo.findOne({
    relations: ['credentials'],
    where: { 'googleId': googleId }
  });
};


// export const createUser = async (user: User): Promise<User> => {
//
//   return await userRepo.findOne({
//     relations: ['credentials'],
//     where: { 'id': user.id }
//   });
// };
//
// export const updateUser = async (user: DbRow & User) => {
//   await knex('user').where('id', user.id).update(user)
// };
//
// export const deleteUser = async (id: string, deleteDatasets: boolean) => {
//   await knex('user').where('id', id).delete()
//   // TODO: delete user datasets
// };

// export const Resolvers = {
//   Query: {
//     // currentUser(_, {}, {}) {
//     //
//     // }
//   },
//   Mutation: {
//
//   }
// }

