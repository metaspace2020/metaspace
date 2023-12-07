import { AssertContext } from 'vitest';

declare module 'vitest' {
  interface AssertContext {
    toMatchSnapshot(): void;
  }
}
