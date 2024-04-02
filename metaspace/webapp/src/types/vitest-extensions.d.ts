/*
/!* eslint-disable *!/
import { expect } from 'vitest';

declare module 'vitest' {
  interface Assertion {
    // Example extension using Jest's matcher types
    toMatchSnapshot(): void;
    // Add any other matchers you need to extend here
  }
}
*/
declare const expect: (name: string, fn: () => void) => { toMatchSnapshot: () => void }
