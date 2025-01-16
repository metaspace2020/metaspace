declare module 'element-plus' {
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  import { ElInput } from 'element-plus'
  
  // Relax type checking for ElInput
  export interface ElInputProps {
    [key: string]: any
  }
} 