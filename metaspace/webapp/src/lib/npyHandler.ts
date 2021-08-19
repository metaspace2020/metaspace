// @ts-ignore
import npyjs from 'npyjs'

export const readNpy = async(npyFile: string) => {
  try {
    // eslint-disable-next-line new-cap
    const n = new npyjs()
    const { data, shape } = await n.load(npyFile)

    return { data: data, shape }
  } catch (e) {
    return new Promise<any>((resolve, reject) => reject(Error("Couldn't parse filt")))
  }
}
