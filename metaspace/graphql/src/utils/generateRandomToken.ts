import * as crypto from 'crypto'

const generateRandomToken = () => {
  // 9 Bytes = 72 bits = 12 Base64 symbols
  return crypto.randomBytes(9).toString('base64')
    .replace(/\//g, '_').replace(/\+/g, '-')
}

export default generateRandomToken
