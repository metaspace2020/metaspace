// @ts-ignore
import { fromArrayBuffer } from 'numpy-parser'

export const readNpy = async(npyFile: string) => {
  try {
    const response = await fetch(npyFile)
    const arrayBuffer = await response.arrayBuffer()
    const { data, shape } = fromArrayBuffer(arrayBuffer)
    return { data, shape }
  } catch (e) {
    throw Error("Couldn't parse file")
  }
}
