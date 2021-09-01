// @ts-ignore
import { fromArrayBuffer } from 'numpy-parser'

export const readNpy = async(npyFile: string) => {
  try {
    const response = await fetch(npyFile)
    const arrayBuffer = await response.arrayBuffer()
    const { data, shape } = fromArrayBuffer(arrayBuffer)
    return { data, shape }
  } catch (e) {
    return new Promise<any>((resolve, reject) => reject(Error("Couldn't parse file")))
  }
}
