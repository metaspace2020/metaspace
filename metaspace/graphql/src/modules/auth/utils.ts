export const DbSchemaName = 'auth';

export const createExpiry = (minutes: number=10) => {
  const now = new Date().valueOf();
  return new Date( now + minutes * 60 * 1000);
};