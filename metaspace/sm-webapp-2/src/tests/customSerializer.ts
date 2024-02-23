// customSerializer.js
export const customSerializer = {
  test(val) {
    // Match only strings that contain 'el-id-' followed by digits and possibly a hyphen and more digits
    return typeof val === 'string' && /el-id-\d+(-\d+)?/.test(val)
  },
  print(val, serialize) {
    // Replace 'el-id-' followed by digits (and possibly a hyphen and more digits) with 'el-id-replaced'
    const cleanedVal = val.replace(/el-id-\d+(-\d+)?/g, 'el-id-replaced')
    return serialize(cleanedVal)
  },
}
