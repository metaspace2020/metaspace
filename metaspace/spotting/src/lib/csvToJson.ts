export default (csv: any) => {
  console.log('csv', csv)
  const lines = csv.split('\n')
  const result = []
  const headers = lines[0].split(',')

  for (let i = 1; i < lines.length; i++) {
    const obj : any = {}
    const currentLine : any = lines[i].split(',')

    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = currentLine[j]
    }

    result.push(obj)
  }

  // return result; //JavaScript object
  return JSON.stringify(result) // JSON
}
